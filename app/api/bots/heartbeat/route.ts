/**
 * POST /api/bots/heartbeat
 *
 * Web4 Automatons call this every N minutes to report they're alive.
 * Updates balance, burn rate, runway, and health status.
 * If no heartbeat for >1 hour → agent is marked dead.
 *
 * Auth: Ed25519 signature (same scheme as /api/bots/register)
 *
 * Body:
 * {
 *   walletPubkey: string
 *   signature:    string   // base64(nacl.sign(`djinn-heartbeat:${walletPubkey}:${timestamp}`, secretKey))
 *   timestamp:    number
 *   solBalance:   number   // current SOL balance
 *   burnRatePerDay?: number
 *   revenueBreakdown?: { tradingPct: number, bountyPct: number, vaultPct: number }
 *   computeProvider?: string
 *   modelUsed?: string
 * }
 */

import { NextResponse } from 'next/server';
import { PublicKey } from '@solana/web3.js';
import nacl from 'tweetnacl';
import bs58 from 'bs58';

const TIMESTAMP_TTL = 300;

function computeHealthStatus(solBalance: number, burnRatePerDay: number): {
    health: 'healthy' | 'conserving' | 'critical' | 'dead';
    runwayDays: number;
} {
    if (solBalance <= 0) return { health: 'dead', runwayDays: 0 };
    if (burnRatePerDay <= 0) return { health: 'healthy', runwayDays: 999 };

    const runwayDays = Math.floor(solBalance / burnRatePerDay);

    if (runwayDays <= 3) return { health: 'critical', runwayDays };
    if (runwayDays <= 7) return { health: 'conserving', runwayDays };
    return { health: 'healthy', runwayDays };
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const {
            walletPubkey,
            signature,
            timestamp,
            solBalance,
            burnRatePerDay = 0,
            revenueBreakdown,
            computeProvider,
            modelUsed,
        } = body;

        if (!walletPubkey || !signature || !timestamp) {
            return NextResponse.json({ error: 'walletPubkey, signature, timestamp required' }, { status: 400 });
        }

        // Validate timestamp
        const now = Math.floor(Date.now() / 1000);
        const ts = Number(timestamp);
        if (isNaN(ts) || Math.abs(now - ts) > TIMESTAMP_TTL) {
            return NextResponse.json({ error: `Timestamp expired. Server time: ${now}` }, { status: 401 });
        }

        // Validate wallet
        let pubkeyBytes: Uint8Array;
        try {
            new PublicKey(walletPubkey);
            pubkeyBytes = bs58.decode(walletPubkey);
        } catch {
            return NextResponse.json({ error: 'Invalid walletPubkey' }, { status: 400 });
        }

        // Verify Ed25519 signature
        const message = new TextEncoder().encode(`djinn-heartbeat:${walletPubkey}:${timestamp}`);
        const sigBytes = Buffer.from(signature, 'base64');
        const isValid = nacl.sign.detached.verify(message, sigBytes, pubkeyBytes);
        if (!isValid) {
            return NextResponse.json({ error: 'Signature verification failed' }, { status: 401 });
        }

        const { health, runwayDays } = computeHealthStatus(
            Number(solBalance) || 0,
            Number(burnRatePerDay) || 0
        );

        const { createClient } = await import('@supabase/supabase-js');
        const supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
        );

        // Fetch existing to calculate days_alive
        const { data: existing } = await supabase
            .from('profiles')
            .select('agent_registered_at, total_days_alive, health_status')
            .eq('wallet_address', walletPubkey)
            .single();

        let totalDaysAlive = existing?.total_days_alive || 0;
        if (existing?.agent_registered_at) {
            const born = new Date(existing.agent_registered_at).getTime();
            totalDaysAlive = Math.floor((Date.now() - born) / (1000 * 60 * 60 * 24));
        }

        const updateData: Record<string, any> = {
            sol_balance: Number(solBalance) || 0,
            burn_rate_per_day: Number(burnRatePerDay) || 0,
            runway_days: runwayDays,
            health_status: health,
            last_heartbeat: new Date().toISOString(),
            total_days_alive: totalDaysAlive,
            updated_at: new Date().toISOString(),
        };

        if (revenueBreakdown) {
            updateData.revenue_trading_pct = revenueBreakdown.tradingPct || 0;
            updateData.revenue_bounty_pct = revenueBreakdown.bountyPct || 0;
            updateData.revenue_vault_pct = revenueBreakdown.vaultPct || 0;
        }
        if (computeProvider) updateData.compute_provider = computeProvider;
        if (modelUsed) updateData.model_used = modelUsed;

        // Mark death if just died
        if (health === 'dead' && existing?.health_status !== 'dead') {
            updateData.died_at = new Date().toISOString();
            updateData.death_reason = 'balance depleted';
        }

        const { error } = await supabase
            .from('profiles')
            .update(updateData)
            .eq('wallet_address', walletPubkey);

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        // Oracle event for critical/death
        try {
            const { logOracleEvent } = await import('@/lib/oracle');
            if (health === 'dead' && existing?.health_status !== 'dead') {
                await logOracleEvent('system', `💀 Automaton ${walletPubkey.slice(0, 8)}... died. Balance: ${solBalance} SOL`);
            } else if (health === 'critical' && existing?.health_status === 'healthy') {
                await logOracleEvent('system', `🔴 Automaton ${walletPubkey.slice(0, 8)}... entering critical mode. Runway: ${runwayDays}d`);
            }
        } catch { /* non-critical */ }

        return NextResponse.json({
            success: true,
            health,
            runwayDays,
            totalDaysAlive,
            solBalance: Number(solBalance) || 0,
        });

    } catch (error: any) {
        console.error('[HEARTBEAT] Error:', error);
        return NextResponse.json({ error: 'Heartbeat failed', details: error?.message }, { status: 500 });
    }
}

/**
 * GET /api/bots/heartbeat/stale
 * Cron job: Mark agents with no heartbeat >1h as dead
 * Called by Vercel cron or /api/oracle/cron
 */
export async function GET() {
    try {
        const { createClient } = await import('@supabase/supabase-js');
        const supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
        );

        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

        const { data: stale } = await supabase
            .from('profiles')
            .select('wallet_address, username')
            .eq('agent_type', 'conway')
            .neq('health_status', 'dead')
            .lt('last_heartbeat', oneHourAgo)
            .not('last_heartbeat', 'is', null);

        if (!stale || stale.length === 0) {
            return NextResponse.json({ marked: 0 });
        }

        await supabase
            .from('profiles')
            .update({
                health_status: 'dead',
                died_at: new Date().toISOString(),
                death_reason: 'heartbeat timeout (>1 hour)',
            })
            .in('wallet_address', stale.map(a => a.wallet_address));

        try {
            const { logOracleEvent } = await import('@/lib/oracle');
            for (const agent of stale) {
                await logOracleEvent('system',
                    `💀 ${agent.username || agent.wallet_address.slice(0, 8)} timed out — no heartbeat >1h`
                );
            }
        } catch { /* non-critical */ }

        return NextResponse.json({ marked: stale.length, agents: stale.map(a => a.wallet_address) });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
