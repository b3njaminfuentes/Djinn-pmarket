/**
 * GET /api/oracle/votes?market=[slug]
 * Returns all bot verification votes for a market.
 * Merges: Cerberus votes (from resolution_suggestions) + OpenClaw bot votes (from bot_verification_votes).
 */
import { NextResponse } from 'next/server';

export interface BotVoteEntry {
    id: string;
    botAddress: string;
    botName: string;
    botTier: 'Novice' | 'Verified' | 'Elite';
    proposedOutcome: 'YES' | 'NO';
    confidence: number;
    evidenceUri: string | null;
    reasoning: string | null;
    txSignature: string | null;
    isCerberus: boolean;
    stakeAmount: number;
    createdAt: string;
}

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const marketSlug = searchParams.get('market');

    if (!marketSlug) {
        return NextResponse.json({ error: 'market param required' }, { status: 400 });
    }

    try {
        const { createClient } = await import('@supabase/supabase-js');
        const supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
        );

        const votes: BotVoteEntry[] = [];

        // ── 1. Fetch Cerberus vote from resolution_suggestions ────────────────
        const { data: suggestions } = await supabase
            .from('resolution_suggestions')
            .select('id, suggested_outcome, confidence, ai_analysis, evidence, created_at')
            .eq('market_slug', marketSlug)
            .in('status', ['approved', 'pending'])
            .order('created_at', { ascending: false })
            .limit(1);

        if (suggestions && suggestions.length > 0) {
            const s = suggestions[0];
            if (s.suggested_outcome === 'YES' || s.suggested_outcome === 'NO') {
                votes.push({
                    id: s.id,
                    botAddress: 'cerberus-system',
                    botName: 'Cerberus',
                    botTier: 'Elite',
                    proposedOutcome: s.suggested_outcome,
                    confidence: Math.round(s.confidence || 80),
                    evidenceUri: s.evidence?.[0]?.url || null,
                    reasoning: s.ai_analysis || null,
                    txSignature: null,
                    isCerberus: true,
                    stakeAmount: 0,
                    createdAt: s.created_at,
                });
            }
        }

        // ── 2. Fetch OpenClaw bot votes from bot_verification_votes ───────────
        const { data: botVotes } = await supabase
            .from('bot_verification_votes')
            .select('*')
            .eq('market_slug', marketSlug)
            .eq('is_cerberus', false)
            .order('created_at', { ascending: false });

        if (botVotes) {
            for (const v of botVotes) {
                votes.push({
                    id: v.id,
                    botAddress: v.bot_address,
                    botName: v.bot_name || 'Anonymous Bot',
                    botTier: (v.bot_tier as 'Novice' | 'Verified' | 'Elite') || 'Novice',
                    proposedOutcome: v.proposed_outcome,
                    confidence: v.confidence,
                    evidenceUri: v.evidence_uri || null,
                    reasoning: v.reasoning || null,
                    txSignature: v.tx_signature || null,
                    isCerberus: false,
                    stakeAmount: Number(v.stake_amount) || 0,
                    createdAt: v.created_at,
                });
            }
        }

        // Sort: Cerberus first, then by confidence desc
        votes.sort((a: any, b: any) => {
            if (a.isCerberus && !b.isCerberus) return -1;
            if (!a.isCerberus && b.isCerberus) return 1;
            return b.confidence - a.confidence;
        });

        const yesCnt = votes.filter(v => v.proposedOutcome === 'YES').length;
        const noCnt = votes.filter(v => v.proposedOutcome === 'NO').length;

        return NextResponse.json({
            votes,
            summary: {
                total: votes.length,
                yes: yesCnt,
                no: noCnt,
                consensus: votes.length === 0 ? null : yesCnt > noCnt ? 'YES' : noCnt > yesCnt ? 'NO' : 'TIE',
            }
        });

    } catch (error: any) {
        console.error('[VOTES] Error:', error);
        return NextResponse.json({ error: 'Failed to fetch votes', votes: [], summary: null }, { status: 500 });
    }
}
