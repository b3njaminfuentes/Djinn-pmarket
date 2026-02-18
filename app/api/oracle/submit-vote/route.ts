/**
 * POST /api/oracle/submit-vote
 * Saves a bot verification vote to Supabase.
 * Called alongside the on-chain submitVerification tx.
 *
 * Body: { marketSlug, botAddress, botName, botTier, proposedOutcome, confidence, evidenceUri, reasoning, txSignature }
 */
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const {
            marketSlug,
            botAddress,
            botName,
            botTier,
            proposedOutcome,
            confidence,
            evidenceUri,
            reasoning,
            txSignature,
            stakeAmount,
        } = body;

        if (!marketSlug || !botAddress || !proposedOutcome || !confidence) {
            return NextResponse.json(
                { error: 'marketSlug, botAddress, proposedOutcome and confidence are required' },
                { status: 400 }
            );
        }

        if (!['YES', 'NO'].includes(proposedOutcome)) {
            return NextResponse.json({ error: 'proposedOutcome must be YES or NO' }, { status: 400 });
        }

        if (confidence < 50 || confidence > 100) {
            return NextResponse.json({ error: 'confidence must be 50-100' }, { status: 400 });
        }

        const { createClient } = await import('@supabase/supabase-js');
        const supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
        );

        const { data, error } = await supabase
            .from('bot_verification_votes')
            .upsert({
                market_slug: marketSlug,
                bot_address: botAddress,
                bot_name: botName || 'Anonymous Bot',
                bot_tier: botTier || 'Novice',
                proposed_outcome: proposedOutcome,
                confidence: Math.round(confidence),
                evidence_uri: evidenceUri || null,
                reasoning: reasoning || null,
                tx_signature: txSignature || null,
                is_cerberus: false,
                stake_amount: stakeAmount || 0,
            }, {
                onConflict: 'market_slug,bot_address',   // update if already voted
            })
            .select()
            .single();

        if (error) {
            console.error('[SUBMIT-VOTE] Supabase error:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        // Log the oracle event
        try {
            const { logOracleEvent } = await import('@/lib/oracle');
            await logOracleEvent('system',
                `🗳️ Bot vote submitted: ${botName || botAddress.slice(0, 6)} → ${proposedOutcome} (${confidence}%) on ${marketSlug}`
            );
        } catch { /* non-critical */ }

        return NextResponse.json({ success: true, vote: data });

    } catch (error: any) {
        console.error('[SUBMIT-VOTE] Error:', error);
        return NextResponse.json({ error: 'Failed to save vote', details: error?.message }, { status: 500 });
    }
}
