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

/**
 * Cerberus Dog 1 (HUNTER) — Fetch the sourceUrl and verify:
 *  1. Page is accessible (2xx response)
 *  2. Content mentions key terms from the market title (basic relevance check)
 *
 * Returns null if the URL can't be fetched — non-blocking, treated as a warning not a block.
 */
async function verifySourceUrl(
    sourceUrl: string,
    title: string
): Promise<{ accessible: boolean; relevant: boolean; contentPreview: string } | null> {
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 6000); // 6s max

        const response = await fetch(sourceUrl, {
            method: 'GET',
            signal: controller.signal,
            headers: {
                'User-Agent': 'CerberusOracle/1.0 (Djinn market verification)',
                'Accept': 'text/html,application/xhtml+xml,text/plain',
            },
        });
        clearTimeout(timeout);

        if (!response.ok) {
            return { accessible: false, relevant: false, contentPreview: `HTTP ${response.status}` };
        }

        // Read first 8 KB — enough to grab <title> and meta tags
        const reader = response.body?.getReader();
        if (!reader) return { accessible: true, relevant: false, contentPreview: '' };

        let text = '';
        let totalBytes = 0;
        while (totalBytes < 8192) {
            const { done, value } = await reader.read();
            if (done) break;
            text += new TextDecoder().decode(value);
            totalBytes += value.length;
        }
        reader.cancel();

        // Relevance: at least 2 significant keywords from the market title appear in the page
        const stopWords = new Set(['will', 'the', 'a', 'an', 'is', 'be', 'in', 'at', 'to', 'for', 'of', 'and', 'or', 'on', 'by', 'did', 'does', 'was', 'has']);
        const keywords = title
            .toLowerCase()
            .replace(/[^a-z0-9\s]/g, ' ')
            .split(/\s+/)
            .filter(w => w.length > 3 && !stopWords.has(w));

        const textLower = text.toLowerCase();
        const matchCount = keywords.filter(kw => textLower.includes(kw)).length;
        const relevant = matchCount >= Math.min(2, keywords.length);

        // Extract preview from <title> tag or plain text
        const titleMatch = text.match(/<title[^>]*>([^<]+)<\/title>/i);
        const contentPreview = titleMatch
            ? titleMatch[1].trim().slice(0, 120)
            : text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);

        return { accessible: true, relevant, contentPreview };
    } catch {
        return null; // timeout or network error — treat as non-blocking warning
    }
}

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

        // ─── STEP 2: Dog 1 (HUNTER) — Verify sourceUrl is real and accessible ─
        let sourceCheck: { accessible: boolean; relevant: boolean; contentPreview: string } | null = null;
        const sourceWarnings: string[] = [];

        if (sourceUrl) {
            sourceCheck = await verifySourceUrl(sourceUrl, title);

            if (sourceCheck === null) {
                sourceWarnings.push('Source URL could not be fetched (timeout/network) — market approved with warning');
                await logOracleEvent('warning',
                    `⚠️ Dog 1: sourceUrl unreachable for "${title}" — ${sourceUrl}`
                );
            } else if (!sourceCheck.accessible) {
                // Source returned non-200 — flag but don't block (could be paywalled)
                sourceWarnings.push(`Source URL returned ${sourceCheck.contentPreview} — may be paywalled or moved`);
                await logOracleEvent('warning',
                    `⚠️ Dog 1: sourceUrl not accessible for "${title}" — ${sourceCheck.contentPreview}`
                );
            } else if (!sourceCheck.relevant) {
                // Page exists but keywords don't match — could be wrong URL
                sourceWarnings.push(`Source page content does not appear related to market question. Page title: "${sourceCheck.contentPreview}"`);
                await logOracleEvent('warning',
                    `⚠️ Dog 1: sourceUrl content mismatch for "${title}" — page: "${sourceCheck.contentPreview}"`
                );
            } else {
                await logOracleEvent('fetch',
                    `✅ Dog 1: sourceUrl verified for "${title}" — "${sourceCheck.contentPreview}"`
                );
            }
        }

        // ─── STEP 3: If slug provided, kick off Cerberus 3-Dogs in background ─
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
            sourceVerification: sourceCheck
                ? {
                    accessible: sourceCheck.accessible,
                    relevant: sourceCheck.relevant,
                    contentPreview: sourceCheck.contentPreview,
                    warnings: sourceWarnings,
                }
                : { accessible: null, relevant: null, contentPreview: null, warnings: sourceWarnings },
        });

    } catch (error: any) {
        console.error('[QUALITY-CHECK] Error:', error);
        return NextResponse.json(
            { error: 'Quality check failed', details: error?.message },
            { status: 500 }
        );
    }
}
