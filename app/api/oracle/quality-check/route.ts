/**
 * POST /api/oracle/quality-check
 *
 * Called when a market is created. Validates that the market:
 * 1. Has a clear binary YES/NO outcome
 * 2. Has a credible, verifiable source URL
 * 3. Has a reasonable resolution timeframe
 * 4. Is not a meme/trash/unresolvable question
 *
 * If approved: market gets verified=true checkmark + BountyPool initialized
 * If rejected: market stays hidden (no trading), creator loses 0.01 SOL creation fee
 *
 * Also kicks off Cerberus 3-Dogs deep analysis for further verification.
 */

import { NextResponse } from 'next/server';
import { runQualityGate } from '@/lib/oracle/market-lifecycle';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { title, description, sourceUrl, endDate, category, market_slug } = body;

        if (!title || !endDate) {
            return NextResponse.json(
                { error: 'title and endDate are required' },
                { status: 400 }
            );
        }

        // ─── STEP 1: Fast local quality gate (no LLM, instant) ───────────────
        const qualityResult = runQualityGate({ title, description, sourceUrl, endDate, category });

        const { logOracleEvent, getOracleConfig } = await import('@/lib/oracle');
        await logOracleEvent('system',
            `📋 Quality check for "${title}": score=${qualityResult.score} approved=${qualityResult.approved}`
        );

        if (!qualityResult.approved) {
            await logOracleEvent('system',
                `❌ Market rejected: ${qualityResult.reason}`
            );
            return NextResponse.json({
                approved: false,
                score: qualityResult.score,
                reason: qualityResult.reason,
                flags: qualityResult.flags,
            }, { status: 200 });
        }

        // ─── STEP 2: If slug provided, kick off Cerberus 3-Dogs in background ─
        if (market_slug) {
            const config = await getOracleConfig();
            if (config.bot_enabled) {
                const { OracleBot } = await import('@/lib/oracle/bot');
                const bot = new OracleBot();
                await bot.init();
                // Runs asynchronously — doesn't block the response
                bot.analyzeMarket(market_slug, title).catch((err: Error) => {
                    console.error(`[QUALITY] 3-Dogs analysis failed for ${market_slug}:`, err);
                });
                await logOracleEvent('system',
                    `🐕 3-Dogs analysis triggered for "${title}" (${market_slug})`
                );
            }
        }

        return NextResponse.json({
            approved: true,
            score: qualityResult.score,
            reason: qualityResult.reason,
            flags: qualityResult.flags,
            suggestedCategory: qualityResult.suggestedCategory,
        });

    } catch (error: any) {
        console.error('[QUALITY-CHECK] Error:', error);
        return NextResponse.json(
            { error: 'Quality check failed', details: error?.message },
            { status: 500 }
        );
    }
}
