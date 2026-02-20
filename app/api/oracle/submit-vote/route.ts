/**
 * POST /api/oracle/submit-vote
 * Saves a bot verification vote to Supabase.
 * Called alongside the on-chain submitVerification tx.
 *
 * Body: { marketSlug, botAddress, botName, botTier, proposedOutcome, confidence, evidenceUri, reasoning, txSignature }
 */
import { NextResponse } from 'next/server';
import { Connection, PublicKey } from '@solana/web3.js';

const MAX_TX_AGE_SECONDS = 60 * 60; // 1 hour

async function verifyVoteTransaction(txSignature: string, botAddress: string): Promise<{ valid: boolean; reason?: string }> {
    const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL || 'https://api.devnet.solana.com';
    const connection = new Connection(rpcUrl, 'confirmed');

    const tx = await connection.getTransaction(txSignature, {
        commitment: 'confirmed',
        maxSupportedTransactionVersion: 0,
    });

    if (!tx) return { valid: false, reason: 'Transaction not found' };
    if (tx.meta?.err) return { valid: false, reason: 'Transaction failed on-chain' };

    if (tx.blockTime) {
        const age = Math.floor(Date.now() / 1000) - tx.blockTime;
        if (age > MAX_TX_AGE_SECONDS) {
            return { valid: false, reason: `Transaction too old (${age}s)` };
        }
    }

    const legacyMessage = tx.transaction.message as unknown as { accountKeys?: PublicKey[] };
    const accountKeys = tx.transaction.message.staticAccountKeys
        || legacyMessage.accountKeys
        || [];
    const signerCount = tx.transaction.message.header.numRequiredSignatures;
    const signerKeys = accountKeys
        .slice(0, signerCount)
        .map((key: PublicKey) => key.toBase58());

    if (!signerKeys.includes(botAddress)) {
        return { valid: false, reason: 'Bot wallet is not a signer on txSignature' };
    }

    return { valid: true };
}

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

        if (!txSignature) {
            return NextResponse.json({ error: 'txSignature is required' }, { status: 400 });
        }

        try {
            new PublicKey(botAddress);
        } catch {
            return NextResponse.json({ error: 'Invalid botAddress' }, { status: 400 });
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
            process.env.SUPABASE_SERVICE_ROLE_KEY!
        );

        // Anti-conflict: bots with open positions cannot verify the same market.
        const { data: activePosition } = await supabase
            .from('bets')
            .select('id')
            .eq('market_slug', marketSlug)
            .eq('wallet_address', botAddress)
            .eq('claimed', false)
            .gt('shares', 0)
            .limit(1);

        if (activePosition && activePosition.length > 0) {
            return NextResponse.json(
                { error: 'Conflict of interest: bot has an open position in this market' },
                { status: 409 }
            );
        }

        const txVerification = await verifyVoteTransaction(txSignature, botAddress);
        if (!txVerification.valid) {
            return NextResponse.json(
                { error: 'Invalid txSignature', reason: txVerification.reason },
                { status: 401 }
            );
        }

        // Prevent one txSignature from being reused across different votes.
        const { data: existingBySig } = await supabase
            .from('bot_verification_votes')
            .select('id, market_slug, bot_address')
            .eq('tx_signature', txSignature)
            .maybeSingle();

        if (
            existingBySig &&
            (existingBySig.market_slug !== marketSlug || existingBySig.bot_address !== botAddress)
        ) {
            return NextResponse.json(
                { error: 'txSignature already used for another vote' },
                { status: 409 }
            );
        }

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

    } catch (error: unknown) {
        console.error('[SUBMIT-VOTE] Error:', error);
        const details = error instanceof Error ? error.message : String(error);
        return NextResponse.json({ error: 'Failed to save vote', details }, { status: 500 });
    }
}
