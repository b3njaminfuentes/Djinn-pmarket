/**
 * GET /api/x402/markets
 *
 * x402-gated market data feed for Conway/Web4 autonomous agents.
 *
 * ─── How it works ────────────────────────────────────────────────────────────
 *
 * FIRST CALL (no payment):
 *   GET /api/x402/markets
 *   ← HTTP 402 Payment Required
 *   ← X-Payment-Required: {"scheme":"solana","treasury":"G1Na...","priceLamports":1000000}
 *   ← Body: { instructions: "Send 0.001 SOL to G1Na..., then retry with X-Payment header" }
 *
 * SECOND CALL (with payment):
 *   GET /api/x402/markets
 *   → X-Payment: {"txSig":"5wHo...","payer":"Bot1...","amount":"1000000","resource":"/api/x402/markets"}
 *   ← HTTP 200
 *   ← Body: { markets: [...], meta: { payer, queriedAt, priceSOL } }
 *
 * ─── Why this is powerful ────────────────────────────────────────────────────
 *
 * A Conway automaton or any AI agent with a funded Solana wallet can:
 *   1. Discover Djinn markets with zero setup (no API key, no account, no OAuth)
 *   2. Pay per query (micropayment → instant access)
 *   3. Reason about market prices → buy/sell shares → earn profit
 *   4. Submit verification votes → earn bounty
 *
 * This is the "machine economy" entry point for Djinn.
 */

import { NextResponse } from 'next/server';
import { buildPaymentRequired, verifyX402Payment } from '@/lib/x402';
import * as supabaseDb from '@/lib/supabase-db';

const RESOURCE = '/api/x402/markets';

export async function GET(request: Request) {
    const xPayment = request.headers.get('X-Payment');

    // ─── Step 1: No payment header → return 402 ──────────────────────────────
    if (!xPayment) {
        const { headers, body } = buildPaymentRequired(RESOURCE);
        return NextResponse.json(
            {
                error: 'Payment Required',
                ...body,
            },
            {
                status: 402,
                headers: {
                    ...headers,
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Expose-Headers': 'X-Payment-Required',
                },
            }
        );
    }

    // ─── Step 2: Verify the payment on-chain ─────────────────────────────────
    const verification = await verifyX402Payment(xPayment, RESOURCE);

    if (!verification.valid) {
        return NextResponse.json(
            {
                error: 'Payment verification failed',
                reason: verification.reason,
                hint: 'Ensure the txSig is confirmed on Solana and was sent to the Djinn treasury within the last 5 minutes.',
            },
            { status: 402 }
        );
    }

    // ─── Step 3: Serve market data ────────────────────────────────────────────
    try {
        const rawMarkets = await supabaseDb.getMarkets();

        // Build machine-readable market list with pricing
        const markets = rawMarkets
            .filter( (m: any) => !m.resolved)
            .map( (m: any) => {
                const yesSol = Number(m.total_yes_pool || 0);
                const noSol = Number(m.total_no_pool || 0);
                const total = yesSol + noSol;
                const yesPrice = total > 0 ? parseFloat((yesSol / total).toFixed(4)) : 0.5;

                return {
                    slug: m.slug,
                    question: m.title,
                    category: m.category || 'Other',
                    yesPrice,
                    noPrice: parseFloat((1 - yesPrice).toFixed(4)),
                    totalVolumeSol: parseFloat(total.toFixed(4)),
                    expiresAt: m.end_date,
                    marketPda: m.market_pda || null,
                    cerberusVerified: m.verification_status === 'verified',
                    cerberusVerdict: m.cerberus_verdict || null,
                };
            });

        return NextResponse.json(
            {
                markets,
                meta: {
                    count: markets.length,
                    payer: verification.payer,
                    queriedAt: new Date().toISOString(),
                    priceSOL: 0.001,
                    hint: 'Use marketPda with djinn_buy_shares / djinn_submit_verification tools to trade.',
                },
            },
            {
                status: 200,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Cache-Control': 'no-store',
                },
            }
        );
    } catch (err: any) {
        console.error('[x402/markets] Error:', err);
        return NextResponse.json(
            { error: 'Failed to fetch markets', details: err?.message },
            { status: 500 }
        );
    }
}

// Support OPTIONS preflight for autonomous agent HTTP clients
export async function OPTIONS() {
    return new Response(null, {
        status: 204,
        headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, OPTIONS',
            'Access-Control-Allow-Headers': 'X-Payment, Content-Type',
            'Access-Control-Expose-Headers': 'X-Payment-Required',
        },
    });
}
