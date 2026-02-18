/**
 * market-sources.ts
 * Detects and parses market source URLs.
 * Supports Kalshi, Polymarket, Twitter/X, and general credible domains.
 */

export type MarketPlatform = 'kalshi' | 'polymarket' | 'twitter' | 'general' | 'unknown';

export interface MarketSourceAnalysis {
    platform: MarketPlatform;
    platformLabel: string;
    platformIcon: string;
    isCredible: boolean;
    credibleDomain: boolean;
    suggestedCategory: string;
    extractedQuestion: string | null;   // Auto-imported from Kalshi/Polymarket slug
    suggestedEndDate: string | null;    // ISO string, extracted from Kalshi ticker codes
}

const CREDIBLE_DOMAINS = [
    'reuters.com', 'bloomberg.com', 'apnews.com', 'bbc.com',
    'coindesk.com', 'cointelegraph.com', 'coingecko.com', 'binance.com',
    'nytimes.com', 'wsj.com', 'ft.com', 'theguardian.com',
    'espn.com', 'nba.com', 'nfl.com', 'fifa.com',
    'tradingview.com', 'investing.com', 'politico.com',
    'usgs.gov', 'weather.com', 'imdb.com',
    'kalshi.com', 'polymarket.com',
];

export function parseMarketSource(url: string): MarketSourceAnalysis {
    if (!url || !url.trim()) {
        return unknown('');
    }

    let hostname = '';
    let pathname = '';
    try {
        const parsed = new URL(url.startsWith('http') ? url : `https://${url}`);
        hostname = parsed.hostname.replace('www.', '');
        pathname = parsed.pathname;
    } catch {
        return {
            platform: 'unknown',
            platformLabel: 'Invalid URL',
            platformIcon: '⚠️',
            isCredible: false,
            credibleDomain: false,
            suggestedCategory: 'Other',
            extractedQuestion: null,
            suggestedEndDate: null,
        };
    }

    const credibleDomain = CREDIBLE_DOMAINS.some(d => hostname.endsWith(d));

    // ── KALSHI ─────────────────────────────────────────────────────────────────
    if (hostname.includes('kalshi.com')) {
        // e.g. kalshi.com/markets/KXBTCD-24DEC31-B100000
        // e.g. kalshi.com/markets/will-ethereum-etf-launch-in-2024
        const slugMatch = pathname.match(/\/markets\/([^\/\?#]+)/);
        const rawSlug = slugMatch?.[1] || '';
        return {
            platform: 'kalshi',
            platformLabel: 'Kalshi',
            platformIcon: '🟢',
            isCredible: true,
            credibleDomain: true,
            suggestedCategory: detectCategoryFromSlug(rawSlug),
            extractedQuestion: rawSlug ? kalshiSlugToQuestion(rawSlug) : null,
            suggestedEndDate: extractKalshiDate(rawSlug),
        };
    }

    // ── POLYMARKET ─────────────────────────────────────────────────────────────
    if (hostname.includes('polymarket.com')) {
        // e.g. polymarket.com/event/will-btc-hit-100k-before-2025
        const slugMatch = pathname.match(/\/event\/([^\/\?#]+)/);
        const rawSlug = slugMatch?.[1] || '';
        return {
            platform: 'polymarket',
            platformLabel: 'Polymarket',
            platformIcon: '🔵',
            isCredible: true,
            credibleDomain: true,
            suggestedCategory: detectCategoryFromSlug(rawSlug),
            extractedQuestion: rawSlug ? slugToQuestion(rawSlug) : null,
            suggestedEndDate: null,
        };
    }

    // ── TWITTER / X ────────────────────────────────────────────────────────────
    if (hostname.includes('twitter.com') || hostname.includes('x.com')) {
        return {
            platform: 'twitter',
            platformLabel: 'X / Twitter',
            platformIcon: '🐦',
            isCredible: true,
            credibleDomain: true,
            suggestedCategory: 'Twitter',
            extractedQuestion: null,
            suggestedEndDate: null,
        };
    }

    // ── GENERAL CREDIBLE DOMAIN ─────────────────────────────────────────────────
    if (credibleDomain) {
        return {
            platform: 'general',
            platformLabel: hostname,
            platformIcon: '✅',
            isCredible: true,
            credibleDomain: true,
            suggestedCategory: detectCategoryFromHostname(hostname),
            extractedQuestion: null,
            suggestedEndDate: null,
        };
    }

    // ── UNRECOGNIZED SOURCE ─────────────────────────────────────────────────────
    return {
        platform: 'general',
        platformLabel: hostname || 'Unknown',
        platformIcon: '⚠️',
        isCredible: false,
        credibleDomain: false,
        suggestedCategory: 'Other',
        extractedQuestion: null,
        suggestedEndDate: null,
    };
}

function unknown(label: string): MarketSourceAnalysis {
    return {
        platform: 'unknown',
        platformLabel: label,
        platformIcon: '❓',
        isCredible: false,
        credibleDomain: false,
        suggestedCategory: 'Other',
        extractedQuestion: null,
        suggestedEndDate: null,
    };
}

/**
 * Convert Kalshi market slug to a readable question.
 * Handles both readable slugs ("will-eth-etf-launch") and ticker codes ("KXBTCD-24DEC31-B100000").
 */
function kalshiSlugToQuestion(slug: string): string {
    // Check if it looks like a ticker code (all caps, dashes, numbers)
    if (/^[A-Z0-9]+-\d{2}[A-Z]{3}\d{2}/i.test(slug)) {
        // It's a ticker: extract the base symbol
        const parts = slug.split('-');
        const symbol = parts[0].replace(/^KX/i, '');
        return `Will ${symbol} hit its target?`;
    }
    return slugToQuestion(slug);
}

/** Convert a URL slug to a human-readable question. */
function slugToQuestion(slug: string): string {
    const clean = slug
        .toLowerCase()
        .replace(/[-_]/g, ' ')
        .trim();
    if (!clean) return '';
    const q = clean.charAt(0).toUpperCase() + clean.slice(1);
    return q.endsWith('?') ? q : q + '?';
}

/**
 * Try to extract a date from Kalshi ticker codes.
 * Example: KXBTCD-24DEC31-B100000 → Dec 31, 2024
 */
function extractKalshiDate(slug: string): string | null {
    const match = slug.match(/(\d{2})(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)(\d{2})/i);
    if (!match) return null;

    const [, day, month, year] = match;
    const monthMap: Record<string, number> = {
        JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5,
        JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11,
    };

    try {
        const date = new Date(2000 + parseInt(year), monthMap[month.toUpperCase()], parseInt(day), 23, 59, 0);
        return date.toISOString();
    } catch {
        return null;
    }
}

function detectCategoryFromSlug(slug: string): string {
    const s = slug.toLowerCase();
    if (/btc|eth|sol|crypto|bitcoin|ethereum|solana|defi|nft/.test(s)) return 'Crypto';
    if (/nba|nfl|fifa|soccer|football|basketball|world.cup|super.bowl|tennis/.test(s)) return 'Sports';
    if (/president|election|congress|trump|biden|harris|senate|vote|poll/.test(s)) return 'Politics';
    if (/ai|openai|gpt|anthropic|tech|apple|google|meta|microsoft|llm/.test(s)) return 'Tech/AI';
    return 'Other';
}

function detectCategoryFromHostname(hostname: string): string {
    if (/coindesk|cointelegraph|coingecko|binance/.test(hostname)) return 'Crypto';
    if (/espn|nba|nfl|fifa/.test(hostname)) return 'Sports';
    if (/politico/.test(hostname)) return 'Politics';
    if (/techcrunch|verge|wired/.test(hostname)) return 'Tech/AI';
    return 'Other';
}
