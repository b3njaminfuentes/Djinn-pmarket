import { NextResponse } from 'next/server';

// Dynamic imports
async function getOracleModule() {
    return await import('../../../../lib/oracle');
}

async function getSupabaseModule() {
    return await import('../../../../lib/supabase-db');
}

/**
 * POST /api/oracle/resolve
 * Execute resolution for a market with an approved Cerberus verdict
 *
 * Body:
 * - market_slug: string (required)
 * - verdict: 'YES' | 'NO' | 'VOID' (optional - uses cerberus verdict if not provided)
 * - force?: boolean - Force resolution even if not expired
 */
export async function POST(request: Request) {
    try {
        // --- SECURITY CHECK ---
        const adminSecret = request.headers.get('x-admin-secret');
        if (!adminSecret || adminSecret !== process.env.ADMIN_SECRET) {
            console.warn('[API] Unauthorized oracle resolution attempt');
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const { market_slug, verdict: overrideVerdict, force = false } = body;

        if (!market_slug) {
            return NextResponse.json(
                { error: 'Missing required field: market_slug' },
                { status: 400 }
            );
        }

        const { logOracleEvent } = await getOracleModule();
        const {
            getMarketBySlug,
            resolveMarket,
            updateMarketVerificationStatus
        } = await getSupabaseModule();

        // 1. Get market data
        const market = await getMarketBySlug(market_slug);
        if (!market) {
            return NextResponse.json(
                { error: 'Market not found' },
                { status: 404 }
            );
        }

        // 2. Check if already resolved
        if (market.resolved) {
            return NextResponse.json({
                resolved: false,
                reason: 'Market already resolved',
                winning_outcome: market.winning_outcome
            });
        }

        // 3. Check if expired (unless force)
        const now = new Date();
        const endDate = new Date(market.end_date);
        if (!force && now < endDate) {
            return NextResponse.json({
                resolved: false,
                reason: 'Market has not expired yet',
                end_date: market.end_date,
                time_remaining_hours: Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60))
            });
        }

        // 4. Determine verdict
        let finalVerdict: 'YES' | 'NO' | 'VOID' = overrideVerdict;

        if (!finalVerdict) {
            // Try to get from cerberus_verdict or resolution_suggestions
            if (market.cerberus_verdict) {
                finalVerdict = market.cerberus_verdict as 'YES' | 'NO' | 'VOID';
            } else {
                // Check resolution_suggestions table
                const { supabase } = await import('../../../../lib/supabase');
                const { data: suggestion } = await supabase
                    .from('resolution_suggestions')
                    .select('*')
                    .eq('market_slug', market_slug)
                    .eq('status', 'approved')
                    .order('created_at', { ascending: false })
                    .limit(1)
                    .single();

                if (suggestion) {
                    finalVerdict = suggestion.suggested_outcome as 'YES' | 'NO' | 'VOID';
                }
            }
        }

        if (!finalVerdict) {
            return NextResponse.json({
                resolved: false,
                reason: 'No verdict available - market needs Cerberus verification or manual verdict',
                verification_status: market.verification_status
            });
        }

        // 5. Execute resolution in Supabase
        await logOracleEvent('system', `🎯 Resolving market: ${market_slug} → ${finalVerdict}`);

        const result = await resolveMarket(market_slug, finalVerdict);

        if (result.error) {
            await logOracleEvent('error', `Resolution failed for ${market_slug}: ${result.error}`);
            return NextResponse.json(
                { error: 'Resolution failed', details: result.error },
                { status: 500 }
            );
        }

        // 6. Execute resolution ON-CHAIN (Solana)
        let onChainSignature: string | null = null;
        if (market.market_pda) {
            try {
                const { resolveMarketOnChain, finalizeBountyPoolOnChain } = await import('../../../../lib/oracle/resolve-onchain');
                const onChainResult = await resolveMarketOnChain(market.market_pda, finalVerdict);
                onChainSignature = onChainResult?.signature || null;
                // Finalize bounty pool so bots can claim their rewards
                await finalizeBountyPoolOnChain(market.market_pda);
            } catch (onChainErr: any) {
                // Log but don't fail — Supabase is already updated
                await logOracleEvent('error', `On-chain resolve failed for ${market_slug}: ${onChainErr?.message}`);
                console.error('[ORACLE] On-chain resolution error:', onChainErr);
            }
        }

        // 7. Update verification status
        await updateMarketVerificationStatus(market_slug, 'verified', {
            cerberus_verdict: finalVerdict
        });

        await logOracleEvent('system', `✅ Market resolved: ${market_slug} → ${finalVerdict} | On-chain: ${onChainSignature || 'N/A'} | Winners: ${result.winningBets}, Pool: ${result.totalPool} SOL`);

        return NextResponse.json({
            resolved: true,
            market_slug,
            winning_outcome: finalVerdict,
            on_chain_signature: onChainSignature,
            total_pool: result.totalPool,
            winning_bets: result.winningBets,
            losing_bets: result.losingBets
        });

    } catch (error) {
        console.error('Error in oracle resolve:', error);
        return NextResponse.json(
            { error: 'Failed to resolve market', details: String(error) },
            { status: 500 }
        );
    }
}

/**
 * GET /api/oracle/resolve
 * Check markets pending resolution
 */
export async function GET() {
    try {
        const { getMarketsPendingResolution, getApprovedSuggestions } = await getSupabaseModule();

        const [pendingMarkets, approvedSuggestions] = await Promise.all([
            getMarketsPendingResolution(),
            getApprovedSuggestions()
        ]);

        // Match markets with their approved suggestions
        const marketsWithVerdicts = pendingMarkets.map(market => {
            const suggestion = approvedSuggestions.find(s => s.market_slug === market.slug);
            return {
                slug: market.slug,
                title: market.title,
                end_date: market.end_date,
                verification_status: market.verification_status,
                cerberus_verdict: market.cerberus_verdict || suggestion?.suggested_outcome || null,
                cerberus_confidence: market.cerberus_confidence || suggestion?.confidence || null,
                ready_to_resolve: !!(market.cerberus_verdict || suggestion),
                total_pool: (market.total_yes_pool || 0) + (market.total_no_pool || 0)
            };
        });

        return NextResponse.json({
            pending_count: marketsWithVerdicts.length,
            ready_to_resolve: marketsWithVerdicts.filter(m => m.ready_to_resolve).length,
            markets: marketsWithVerdicts
        });

    } catch (error) {
        console.error('Error checking pending resolutions:', error);
        return NextResponse.json(
            { error: 'Failed to check pending resolutions', details: String(error) },
            { status: 500 }
        );
    }
}
