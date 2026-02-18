/**
 * market-lifecycle.ts
 * Core lifecycle logic for the Djinn autonomous resolution system.
 *
 * PHASES:
 *  CREATION   → Cerberus quality-gates the market (is it resolvable? real source?)
 *  ACTIVE     → Trading open. Cerberus monitors. Bots trade.
 *  PRE_RES    → T-2h: Cerberus starts intensive scraping. Bounty opens for bot votes.
 *  RES_WINDOW → T+0 to T+2h: Trading locked. Bots finalize verifications. Cerberus finalizes.
 *  RESOLVED   → On-chain tx fired, bounties distributed.
 */

// ─── Phase Detection ──────────────────────────────────────────────────────────

export type MarketPhase =
    | 'active'
    | 'pre_resolution'   // T-2h window
    | 'resolution_window' // Expired but within 2h grace
    | 'stale'            // Expired > 2h with no verdict
    | 'resolved';

const PRE_RES_HOURS = 2;       // Start monitoring 2h before expiry
const RES_WINDOW_HOURS = 2;    // Grace period after expiry for consensus

export function getMarketPhase(endDateIso: string, isResolved: boolean): MarketPhase {
    if (isResolved) return 'resolved';

    const now = Date.now();
    const end = new Date(endDateIso).getTime();
    const preResStart = end - PRE_RES_HOURS * 3600 * 1000;
    const resWindowEnd = end + RES_WINDOW_HOURS * 3600 * 1000;

    if (now < preResStart)  return 'active';
    if (now < end)          return 'pre_resolution';
    if (now < resWindowEnd) return 'resolution_window';
    return 'stale';
}

// ─── Quality Gate (at creation) ──────────────────────────────────────────────

export interface QualityCheckResult {
    approved: boolean;
    score: number;           // 0-100
    reason: string;
    flags: string[];         // specific issues found
    suggestedCategory: string;
}

const TRASH_PATTERNS = [
    /\b(wen|wagmi|gm|ngmi|probably nothing|ser|fren|cope|hopium|based|chad|gigachad|degen)\b/i,
    /\b(moon|pump|dump|rug|honeypot|jeet)\b/i,
    /will .{0,20} (go|hit|reach) \d+ ?x/i,  // "will X go 10x"
    /token\s+(price|ca|contract)\b/i,
];

const CREDIBLE_SOURCE_DOMAINS = [
    'reuters.com', 'bloomberg.com', 'apnews.com', 'bbc.com', 'espn.com',
    'coindesk.com', 'cointelegraph.com', 'binance.com', 'coingecko.com',
    'nytimes.com', 'wsj.com', 'ft.com', 'theguardian.com', 'politico.com',
    'usgs.gov', 'weather.com', 'imdb.com', 'nba.com', 'nfl.com', 'fifa.com',
    'twitter.com', 'x.com', // for Twitter-type markets
    'tradingview.com', 'investing.com',
];

const MIN_RESOLUTION_DAYS = 1;     // Can't resolve in less than 1 day
const MAX_RESOLUTION_DAYS = 365;   // Can't resolve in more than 1 year

export function runQualityGate(params: {
    title: string;
    description?: string;
    sourceUrl?: string;
    endDate: string;
    category?: string;
}): QualityCheckResult {
    const flags: string[] = [];
    let score = 100;

    // 1. Check for trash patterns in title
    for (const pattern of TRASH_PATTERNS) {
        if (pattern.test(params.title)) {
            flags.push(`Title contains unresolvable/meme language: "${params.title.match(pattern)?.[0]}"`);
            score -= 40;
            break;
        }
    }

    // 2. Check for binary/objective outcome
    const hasClearOutcome =
        /\bwill\b.+\?/i.test(params.title) ||
        /\bwon'?t\b.+\?/i.test(params.title) ||
        /\b(above|below|over|under|beat|reach|exceed|win|lose)\b/i.test(params.title) ||
        /\b(yes|no)\b.+\?/i.test(params.title);
    if (!hasClearOutcome) {
        flags.push('Title does not have a clear binary YES/NO outcome');
        score -= 20;
    }

    // 3. Check resolution date
    const now = Date.now();
    const end = new Date(params.endDate).getTime();
    const daysUntilEnd = (end - now) / (1000 * 60 * 60 * 24);

    if (daysUntilEnd < MIN_RESOLUTION_DAYS) {
        flags.push(`Resolution date is too soon (${daysUntilEnd.toFixed(1)} days). Minimum is ${MIN_RESOLUTION_DAYS} day.`);
        score -= 35;
    }
    if (daysUntilEnd > MAX_RESOLUTION_DAYS) {
        flags.push(`Resolution date is too far (${daysUntilEnd.toFixed(0)} days). Maximum is ${MAX_RESOLUTION_DAYS} days.`);
        score -= 20;
    }

    // 4. Check source URL
    if (!params.sourceUrl) {
        flags.push('No source URL provided. Markets need a verifiable resolution source.');
        score -= 25;
    } else {
        try {
            const domain = new URL(params.sourceUrl).hostname.replace('www.', '');
            const isCredible = CREDIBLE_SOURCE_DOMAINS.some(d => domain.endsWith(d));
            if (!isCredible) {
                flags.push(`Source domain "${domain}" is not in the verified sources list. Market may be hard to verify.`);
                score -= 10; // Warning, not blocking
            }
        } catch {
            flags.push('Source URL is not a valid URL');
            score -= 20;
        }
    }

    // 5. Title length / quality
    if (params.title.length < 15) {
        flags.push('Title is too short to be a meaningful prediction market');
        score -= 15;
    }

    score = Math.max(0, score);
    const approved = score >= 50 && !flags.some(f => f.includes('too soon'));

    return {
        approved,
        score,
        reason: approved
            ? score >= 80
                ? 'Market passes quality gate — clear outcome, credible source, valid timeframe.'
                : 'Market approved with warnings — some quality concerns noted.'
            : `Market rejected: ${flags[0]}`,
        flags,
        suggestedCategory: params.category || detectTitleCategory(params.title),
    };
}

function detectTitleCategory(title: string): string {
    const t = title.toLowerCase();
    if (/\b(btc|eth|sol|crypto|bitcoin|ethereum|solana|token|defi|nft)\b/.test(t)) return 'Crypto';
    if (/\b(nba|nfl|fifa|soccer|football|basketball|championship|world cup|super bowl|wimbledon)\b/.test(t)) return 'Sports';
    if (/\b(president|election|congress|senate|vote|trump|biden|harris|government|policy)\b/.test(t)) return 'Politics';
    if (/\b(ai|openai|gpt|anthropic|model|llm|tech|apple|google|meta|microsoft)\b/.test(t)) return 'Tech';
    return 'Other';
}

// ─── Weighted Consensus Calculator ───────────────────────────────────────────

export interface BotVote {
    botAddress: string;
    proposedOutcome: number; // 0 = YES, 1 = NO
    confidence: number;      // 50-100
    tier: number;            // 0=Novice, 1=Verified, 2=Elite
    stake: number;           // SOL staked (from BotProfile)
    evidenceUri: string;
}

export interface ConsensusResult {
    outcome: 'YES' | 'NO' | 'UNCERTAIN';
    yesWeight: number;
    noWeight: number;
    totalWeight: number;
    confidence: number;       // 0-100
    botVoteCount: number;
    cerberusVote: 'YES' | 'NO' | null;
    cerberusWeight: number;
    explanation: string;
}

const TIER_MULTIPLIER = [1, 2.5, 5]; // Novice, Verified, Elite
const CERBERUS_WEIGHT = 10;           // Cerberus counts as "Elite x2" — final arbiter

export function calculateConsensus(
    botVotes: BotVote[],
    cerberusVote: 'YES' | 'NO' | null,
    cerberusConfidence: number = 80
): ConsensusResult {
    let yesWeight = 0;
    let noWeight = 0;

    // Weight each bot vote: stake × tier_multiplier × confidence
    for (const vote of botVotes) {
        const tierMult = TIER_MULTIPLIER[Math.min(vote.tier, 2)] || 1;
        const weight = vote.stake * tierMult * (vote.confidence / 100);
        if (vote.proposedOutcome === 0) yesWeight += weight;
        else noWeight += weight;
    }

    // Add Cerberus vote with its fixed weight
    const cerberusWeight = CERBERUS_WEIGHT * (cerberusConfidence / 100);
    if (cerberusVote === 'YES') yesWeight += cerberusWeight;
    else if (cerberusVote === 'NO') noWeight += cerberusWeight;

    const totalWeight = yesWeight + noWeight;
    const dominantRatio = totalWeight > 0
        ? Math.max(yesWeight, noWeight) / totalWeight
        : 0;

    let outcome: 'YES' | 'NO' | 'UNCERTAIN' = 'UNCERTAIN';
    if (dominantRatio >= 0.65) {
        outcome = yesWeight > noWeight ? 'YES' : 'NO';
    }

    return {
        outcome,
        yesWeight: parseFloat(yesWeight.toFixed(2)),
        noWeight: parseFloat(noWeight.toFixed(2)),
        totalWeight: parseFloat(totalWeight.toFixed(2)),
        confidence: parseFloat((dominantRatio * 100).toFixed(1)),
        botVoteCount: botVotes.length,
        cerberusVote,
        cerberusWeight: parseFloat(cerberusWeight.toFixed(2)),
        explanation: totalWeight === 0
            ? 'No votes submitted — cannot determine outcome'
            : `YES: ${yesWeight.toFixed(2)} weight vs NO: ${noWeight.toFixed(2)} weight (${(dominantRatio * 100).toFixed(1)}% dominant)`,
    };
}
