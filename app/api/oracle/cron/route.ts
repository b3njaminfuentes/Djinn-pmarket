import { NextResponse } from 'next/server';
import { GRADUATION_MCAP_SOL, getIgnitionStatusMcap } from '@/lib/core-amm';
import { getMarketPhase, calculateConsensus } from '@/lib/oracle/market-lifecycle';

async function getOracleModule() {
    return await import('../../../../lib/oracle');
}
async function getSupabaseModule() {
    return await import('../../../../lib/supabase-db');
}

/**
 * GET /api/oracle/cron
 *
 * 4-Phase Autonomous Resolution Pipeline:
 *
 * PHASE 1 — MCAP TRIGGER: Markets reaching viral threshold → Cerberus quality-check
 * PHASE 2 — PRE-RESOLUTION (T-2h): Markets approaching expiry → intensive monitoring begins
 * PHASE 3 — RESOLUTION WINDOW (T to T+2h): Collect bot votes + Cerberus verdict → consensus
 * PHASE 4 — STALE CLEANUP: Markets > T+2h with no verdict → flag for manual review
 *
 * Called every 5 min by Vercel Cron (vercel.json).
 * Also callable manually with x-admin-secret or x-cron-secret header.
 */
export async function GET(request: Request) {
    const startTime = Date.now();
    const results = {
        triggered_verifications: [] as string[],
        pre_resolution_started: [] as string[],
        resolved_markets: [] as string[],
        stale_flagged: [] as string[],
        errors: [] as string[],
        stats: {
            markets_checked: 0,
            markets_at_viral: 0,
            markets_pre_resolution: 0,
            markets_in_window: 0,
            markets_expired: 0,
            processing_time_ms: 0
        }
    };

    try {
        // ─── SECURITY ────────────────────────────────────────────────────────
        const cronSecret = request.headers.get('x-cron-secret') || request.headers.get('x-admin-secret');
        const expectedCronSecret = process.env.CRON_SECRET;
        const expectedAdminSecret = process.env.ADMIN_SECRET;

        if ((expectedCronSecret && cronSecret !== expectedCronSecret) &&
            (expectedAdminSecret && cronSecret !== expectedAdminSecret)) {
            console.warn('[CRON] Unauthorized access attempt');
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { logOracleEvent, getOracleConfig } = await getOracleModule();
        const {
            getActiveMarketsForMcapMonitoring,
            getMarketsPendingResolution,
            getApprovedSuggestions,
            updateMarketVerificationStatus,
            resolveMarket,
        } = await getSupabaseModule();
        const { OracleBot } = await import('../../../../lib/oracle/bot');

        const config = await getOracleConfig();
        await logOracleEvent('system', '🔄 CERBERUS CRON — 4-PHASE PIPELINE STARTED');

        // ═══════════════════════════════════════════════════════════════════════
        // PHASE 1 — MCAP TRIGGER (existing logic)
        // Markets that reached VIRAL threshold → kick off quality verification
        // ═══════════════════════════════════════════════════════════════════════
        const activeMarkets = await getActiveMarketsForMcapMonitoring();
        results.stats.markets_checked = activeMarkets.length;

        for (const market of activeMarkets) {
            try {
                const estimatedMcapSol = market.total_pool_sol * 1.5;
                const ignitionStatus = getIgnitionStatusMcap(estimatedMcapSol);

                if (ignitionStatus === 'VIRAL') {
                    results.stats.markets_at_viral++;
                    if (config.bot_enabled) {
                        await updateMarketVerificationStatus(market.slug, 'pending');
                        const bot = new OracleBot();
                        await bot.init();
                        bot.analyzeMarket(market.slug, market.title).catch((err: Error) => {
                            console.error(`[CRON-P1] Verification failed for ${market.slug}:`, err);
                            results.errors.push(`P1 failed: ${market.slug}`);
                        });
                        results.triggered_verifications.push(market.slug);
                        await logOracleEvent('system', `🎯 [P1] Triggered verification: ${market.slug} (${estimatedMcapSol.toFixed(1)} SOL MCAP)`);
                    } else {
                        await updateMarketVerificationStatus(market.slug, 'pending_manual');
                    }
                }
            } catch (err) {
                results.errors.push(`P1 error: ${market.slug} — ${String(err)}`);
            }
        }

        // ═══════════════════════════════════════════════════════════════════════
        // PHASE 2 — PRE-RESOLUTION MONITORING (T-2h window)
        // Cerberus switches to active scraping mode for markets approaching expiry
        // ═══════════════════════════════════════════════════════════════════════
        const pendingResolution = await getMarketsPendingResolution(); // returns non-resolved markets

        const preResMarkets = pendingResolution.filter(m => {
            const phase = getMarketPhase(m.end_date, m.resolved || false);
            return phase === 'pre_resolution';
        });

        results.stats.markets_pre_resolution = preResMarkets.length;

        for (const market of preResMarkets) {
            try {
                // Only trigger once — skip if already in pre_resolution mode
                if (market.verification_status === 'pre_resolution') continue;

                await updateMarketVerificationStatus(market.slug, 'pre_resolution');

                if (config.bot_enabled) {
                    // Deep scrape mode: Cerberus gathers live evidence
                    const bot = new OracleBot();
                    await bot.init();
                    bot.analyzeMarket(market.slug, market.title).catch((err: Error) => {
                        console.error(`[CRON-P2] Pre-res analysis failed for ${market.slug}:`, err);
                    });
                }

                results.pre_resolution_started.push(market.slug);
                await logOracleEvent('system',
                    `⏳ [P2] Pre-resolution monitoring started: ${market.slug} (expires: ${market.end_date})`
                );
            } catch (err) {
                results.errors.push(`P2 error: ${market.slug} — ${String(err)}`);
            }
        }

        // ═══════════════════════════════════════════════════════════════════════
        // PHASE 3 — RESOLUTION WINDOW (T to T+2h)
        // Collect all bot votes from chain + Cerberus verdict → weighted consensus
        // ═══════════════════════════════════════════════════════════════════════
        const inWindowMarkets = pendingResolution.filter(m => {
            const phase = getMarketPhase(m.end_date, m.resolved || false);
            return phase === 'resolution_window';
        });

        results.stats.markets_in_window = inWindowMarkets.length;
        const approvedSuggestions = await getApprovedSuggestions();

        for (const market of inWindowMarkets) {
            try {
                // Determine Cerberus verdict (from DB)
                let cerberusVote: 'YES' | 'NO' | null = null;
                let cerberusConfidence = 80;

                if (market.cerberus_verdict === 'YES' || market.cerberus_verdict === 'NO') {
                    cerberusVote = market.cerberus_verdict;
                    cerberusConfidence = market.cerberus_confidence || 80;
                } else {
                    const suggestion = approvedSuggestions.find(s => s.market_slug === market.slug);
                    if (suggestion?.suggested_outcome === 'YES' || suggestion?.suggested_outcome === 'NO') {
                        cerberusVote = suggestion.suggested_outcome;
                    }
                }

                // If no Cerberus verdict yet, trigger analysis now
                if (!cerberusVote && config.bot_enabled) {
                    await logOracleEvent('system', `🐕 [P3] No Cerberus verdict yet — triggering analysis: ${market.slug}`);
                    const bot = new OracleBot();
                    await bot.init();
                    bot.analyzeMarket(market.slug, market.title).catch(() => {});
                    continue; // Will be picked up in next cron run
                }

                // Calculate weighted consensus (bot votes + Cerberus)
                // NOTE: In full impl, fetch bot votes from chain via program.account.verificationSubmission
                // For now, use Cerberus verdict as primary signal with approved suggestions as bot proxy
                const consensus = calculateConsensus(
                    [], // TODO: fetch on-chain bot votes when indexer is ready
                    cerberusVote,
                    cerberusConfidence
                );

                await logOracleEvent('system',
                    `⚖️ [P3] Consensus for ${market.slug}: ${consensus.outcome} (${consensus.confidence}%) — ${consensus.explanation}`
                );

                if (consensus.outcome === 'YES' || consensus.outcome === 'NO') {
                    // Execute resolution: Supabase + on-chain
                    const supabaseResult = await resolveMarket(market.slug, consensus.outcome);

                    if (!supabaseResult.error) {
                        // Fire on-chain tx
                        if (market.market_pda) {
                            try {
                                const { resolveMarketOnChain, finalizeBountyPoolOnChain } = await import('../../../../lib/oracle/resolve-onchain');
                                const onChainResult = await resolveMarketOnChain(market.market_pda, consensus.outcome);
                                await finalizeBountyPoolOnChain(market.market_pda);
                                await logOracleEvent('system',
                                    `✅ [P3] Resolved on-chain: ${market.slug} → ${consensus.outcome} | Tx: ${onChainResult?.signature || 'N/A'}`
                                );
                            } catch (onChainErr: any) {
                                await logOracleEvent('error',
                                    `⚠️ [P3] On-chain resolution failed for ${market.slug}: ${onChainErr?.message}`
                                );
                            }
                        }
                        results.resolved_markets.push(market.slug);
                    } else {
                        results.errors.push(`P3 supabase resolve failed: ${market.slug}`);
                    }
                } else {
                    await logOracleEvent('system',
                        `❓ [P3] Uncertain consensus for ${market.slug} — waiting for more data`
                    );
                }
            } catch (err) {
                results.errors.push(`P3 error: ${market.slug} — ${String(err)}`);
            }
        }

        // ═══════════════════════════════════════════════════════════════════════
        // PHASE 4 — STALE CLEANUP (T+2h with no verdict)
        // Markets that passed the window without consensus → flag for manual review
        // ═══════════════════════════════════════════════════════════════════════
        const staleMarkets = pendingResolution.filter(m => {
            const phase = getMarketPhase(m.end_date, m.resolved || false);
            return phase === 'stale';
        });

        results.stats.markets_expired = staleMarkets.length;

        for (const market of staleMarkets) {
            try {
                if (market.verification_status === 'flagged') continue; // Already flagged
                await updateMarketVerificationStatus(market.slug, 'flagged');
                await logOracleEvent('system',
                    `🚩 [P4] Stale market flagged for manual review: ${market.slug} (expired: ${market.end_date})`
                );
                results.stale_flagged.push(market.slug);
            } catch (err) {
                results.errors.push(`P4 error: ${market.slug} — ${String(err)}`);
            }
        }

        // ─── FINAL REPORT ─────────────────────────────────────────────────────
        results.stats.processing_time_ms = Date.now() - startTime;
        await logOracleEvent('system',
            `🏁 CRON COMPLETE | P1:${results.triggered_verifications.length} verified | P2:${results.pre_resolution_started.length} pre-res | P3:${results.resolved_markets.length} resolved | P4:${results.stale_flagged.length} stale | ${results.errors.length} errors | ${results.stats.processing_time_ms}ms`
        );

        return NextResponse.json({
            success: true,
            timestamp: new Date().toISOString(),
            graduation_threshold_sol: GRADUATION_MCAP_SOL,
            bot_enabled: config.bot_enabled,
            ...results
        });

    } catch (error) {
        console.error('[CRON] Critical error:', error);
        return NextResponse.json(
            { success: false, error: 'Cron job failed', details: String(error), ...results },
            { status: 500 }
        );
    }
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { action } = body;
        if (action === 'trigger_all') return GET(request);
        return NextResponse.json({
            error: 'Invalid action',
            available_actions: ['trigger_all']
        }, { status: 400 });
    } catch (error) {
        return NextResponse.json(
            { error: 'Failed to process request', details: String(error) },
            { status: 500 }
        );
    }
}
