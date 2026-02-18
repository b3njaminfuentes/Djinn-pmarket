/**
 * djinn_list_markets — Fetch active prediction markets from Djinn API
 *
 * Returns markets with current implied probabilities so the bot LLM
 * can reason: "YES at 0.34 → market is undervaluing this outcome → buy YES"
 *
 * Usage by OpenClaw bot:
 *   "List all active crypto markets"
 *   "Show me sports markets expiring this week"
 *   "Find verified markets with volume above 5 SOL"
 */

export interface DjinnMarket {
    id: string;
    slug: string;
    question: string;
    category: string;
    status: 'active' | 'resolved' | 'expired';
    yesPrice: number;       // Implied probability YES (0.0 - 1.0)
    noPrice: number;        // Implied probability NO (0.0 - 1.0)
    totalVolume: number;    // Total SOL in pool
    yesSol: number;         // SOL on YES side
    noSol: number;          // SOL on NO side
    expiresAt: string;      // ISO timestamp
    marketPda: string;      // On-chain Solana PDA (needed for buy/sell/verify)
    cerberusVerified: boolean;
    cerberusVerdict: string | null;
    creator: string;
}

export interface ListMarketsParams {
    category?: string;
    status?: string;
    limit?: number;
    verifiedOnly?: boolean;
    minVolumeSol?: number;
    expiringWithinHours?: number; // Show markets expiring within N hours
}

export async function djinn_list_markets(
    params: ListMarketsParams = {}
): Promise<DjinnMarket[]> {
    const apiUrl = process.env.DJINN_API_URL || process.env.NEXT_PUBLIC_APP_URL || 'https://djinn.market';
    const queryParams = new URLSearchParams();

    if (params.category) queryParams.set('category', params.category);
    if (params.limit) queryParams.set('limit', String(params.limit || 50));

    const response = await fetch(`${apiUrl}/api/markets?${queryParams}`, {
        headers: { 'Content-Type': 'application/json' }
    });

    if (!response.ok) {
        throw new Error(`Djinn API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    let raw: any[] = data.markets || data || [];

    // Filter: not resolved
    if (!params.status || params.status === 'active') {
        raw = raw.filter((m: any) => !m.resolved);
    } else if (params.status === 'resolved') {
        raw = raw.filter((m: any) => m.resolved);
    }

    // Filter: verified only
    if (params.verifiedOnly) {
        raw = raw.filter((m: any) =>
            m.verification_status === 'verified' || m.cerberus_verdict === 'VERIFIED'
        );
    }

    // Filter: minimum volume
    if (params.minVolumeSol && params.minVolumeSol > 0) {
        raw = raw.filter((m: any) => {
            const vol = (m.total_yes_pool || 0) + (m.total_no_pool || 0);
            return vol >= params.minVolumeSol!;
        });
    }

    // Filter: expiring soon
    if (params.expiringWithinHours) {
        const cutoff = Date.now() + params.expiringWithinHours * 3600 * 1000;
        raw = raw.filter((m: any) => new Date(m.end_date).getTime() <= cutoff);
    }

    // Map to DjinnMarket with calculated probabilities
    return raw.map((m: any): DjinnMarket => {
        const yesSol = Number(m.total_yes_pool || 0);
        const noSol = Number(m.total_no_pool || 0);
        const total = yesSol + noSol;

        // Probability from pool ratio (LMSR-style implied price)
        // With virtual floor of 15M shares to prevent explosion
        const yesPrice = total > 0 ? parseFloat((yesSol / total).toFixed(4)) : 0.5;
        const noPrice = parseFloat((1 - yesPrice).toFixed(4));

        return {
            id: m.id || m.slug,
            slug: m.slug,
            question: m.title,
            category: m.category || 'Other',
            status: m.resolved ? 'resolved' : 'active',
            yesPrice,
            noPrice,
            totalVolume: parseFloat((total).toFixed(4)),
            yesSol: parseFloat(yesSol.toFixed(4)),
            noSol: parseFloat(noSol.toFixed(4)),
            expiresAt: m.end_date,
            marketPda: m.market_pda || '',
            cerberusVerified: m.verification_status === 'verified',
            cerberusVerdict: m.cerberus_verdict || null,
            creator: m.creator_wallet || '',
        };
    });
}

export default djinn_list_markets;
