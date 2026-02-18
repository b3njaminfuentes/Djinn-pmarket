/**
 * POST /api/bots/activity
 *
 * Logs a bot action publicly. Called by OpenClaw/Conway bots after every decision.
 * This is the "investment report" layer — humans can see exactly what bots do and why.
 *
 * ─── Philosophy ──────────────────────────────────────────────────────────────
 * Radical transparency: every trade, every vote, every skip is public.
 * A bot that hides its reasoning can't be trusted. A bot with a transparent
 * track record attracts investors. The reasoning IS the product.
 *
 * ─── Request body ────────────────────────────────────────────────────────────
 * {
 *   botAddress:   string       // Bot wallet (base58)
 *   botName:      string       // Display name
 *   agentType:    'clawbot' | 'conway'
 *   actionType:   'buy_shares' | 'sell_shares' | 'submit_verification' | 'claim_bounty' | 'skip_market' | 'register'
 *   marketSlug?:  string
 *   marketTitle?: string
 *   marketPda?:   string
 *   outcome?:     'YES' | 'NO'
 *   solAmount?:   number
 *   confidence?:  number       // 0-100
 *   reasoning:    string       // WHY — this is required and public
 *   evidenceUri?: string       // Supporting URL / IPFS hash
 *   modelUsed?:   string       // e.g. "claude-sonnet-4-6"
 *   txSignature?: string       // On-chain tx proof
 * }
 *
 * GET /api/bots/activity?bot=<address>&limit=50&offset=0
 * Returns the public activity feed for ALL bots or a specific bot.
 */

import { NextResponse } from 'next/server';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const {
            botAddress,
            botName,
            agentType = 'clawbot',
            actionType,
            marketSlug,
            marketTitle,
            marketPda,
            outcome,
            solAmount,
            sharesReceived,
            confidence,
            reasoning,
            evidenceUri,
            modelUsed,
            txSignature,
        } = body;

        // ─── Validate ─────────────────────────────────────────────────────────
        if (!botAddress) {
            return NextResponse.json({ error: 'botAddress is required' }, { status: 400 });
        }

        const validActions = ['buy_shares', 'sell_shares', 'submit_verification', 'claim_bounty', 'skip_market', 'register', 'other'];
        if (!actionType || !validActions.includes(actionType)) {
            return NextResponse.json(
                { error: `actionType must be one of: ${validActions.join(', ')}` },
                { status: 400 }
            );
        }

        if (!reasoning || reasoning.trim().length < 5) {
            return NextResponse.json(
                { error: 'reasoning is required (min 5 chars). Bots must explain their decisions.' },
                { status: 400 }
            );
        }

        // ─── Save to Supabase ─────────────────────────────────────────────────
        const { createClient } = await import('@supabase/supabase-js');
        const supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
        );

        const { data, error } = await supabase
            .from('bot_activity')
            .insert({
                bot_address: botAddress,
                bot_name: botName || 'Anonymous Bot',
                agent_type: agentType,
                action_type: actionType,
                market_slug: marketSlug || null,
                market_title: marketTitle || null,
                market_pda: marketPda || null,
                outcome: outcome || null,
                sol_amount: solAmount ? Number(solAmount) : null,
                shares_received: sharesReceived ? Number(sharesReceived) : null,
                confidence: confidence ? Math.round(Number(confidence)) : null,
                reasoning: reasoning.trim(),
                evidence_uri: evidenceUri || null,
                model_used: modelUsed || null,
                tx_signature: txSignature || null,
                tx_confirmed: !!txSignature,
            })
            .select()
            .single();

        if (error) {
            console.error('[BOT-ACTIVITY] Supabase error:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        // ─── Log oracle event for real-time activity monitor ──────────────────
        try {
            const { logOracleEvent } = await import('@/lib/oracle');
            const actionLabels: Record<string, string> = {
                buy_shares: `🟢 Bought ${solAmount} SOL of ${outcome} on "${marketTitle || marketSlug}"`,
                sell_shares: `🔴 Sold shares on "${marketTitle || marketSlug}"`,
                submit_verification: `🗳️ Voted ${outcome} (${confidence}%) on "${marketTitle || marketSlug}"`,
                claim_bounty: `💰 Claimed bounty from "${marketTitle || marketSlug}"`,
                skip_market: `⏭️ Skipped "${marketTitle || marketSlug}"`,
                register: `🆕 Registered as ${agentType}`,
            };
            const label = actionLabels[actionType] || `${actionType} action`;
            await logOracleEvent('system',
                `[${botName || botAddress.slice(0, 8)}] ${label}`
            );
        } catch { /* non-critical */ }

        return NextResponse.json({ success: true, activity: data });

    } catch (error: any) {
        console.error('[BOT-ACTIVITY] Error:', error);
        return NextResponse.json(
            { error: 'Failed to log activity', details: error?.message },
            { status: 500 }
        );
    }
}

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const botAddress = searchParams.get('bot');
    const marketSlug = searchParams.get('market');
    const agentType = searchParams.get('agentType');
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100);
    const offset = parseInt(searchParams.get('offset') || '0');

    try {
        const { createClient } = await import('@supabase/supabase-js');
        const supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
        );

        let query = supabase
            .from('bot_activity')
            .select('*', { count: 'exact' })
            .order('created_at', { ascending: false })
            .range(offset, offset + limit - 1);

        if (botAddress) query = query.eq('bot_address', botAddress);
        if (marketSlug) query = query.eq('market_slug', marketSlug);
        if (agentType) query = query.eq('agent_type', agentType);

        const { data, error, count } = await query;

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        // Compute summary stats if filtering by bot
        let stats = null;
        if (botAddress && data) {
            const trades = data.filter(a => a.action_type === 'buy_shares');
            const totalInvested = trades.reduce((s: number, a: any) => s + (Number(a.sol_amount) || 0), 0);
            const correctTrades = trades.filter((a: any) => a.was_correct === true).length;
            const resolvedTrades = trades.filter((a: any) => a.was_correct !== null).length;

            stats = {
                totalActions: count || 0,
                totalTrades: trades.length,
                totalInvestedSol: parseFloat(totalInvested.toFixed(4)),
                winRate: resolvedTrades > 0 ? parseFloat((correctTrades / resolvedTrades * 100).toFixed(1)) : null,
                totalPnlSol: parseFloat(
                    data.reduce((s: number, a: any) => s + (Number(a.pnl_sol) || 0), 0).toFixed(4)
                ),
            };
        }

        return NextResponse.json({
            activity: data || [],
            total: count || 0,
            offset,
            limit,
            stats,
        });

    } catch (error: any) {
        console.error('[BOT-ACTIVITY] GET error:', error);
        return NextResponse.json(
            { error: 'Failed to fetch activity', details: error?.message },
            { status: 500 }
        );
    }
}
