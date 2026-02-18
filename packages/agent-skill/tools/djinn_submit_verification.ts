/**
 * djinn_submit_verification — Submit a verification vote for a market outcome
 *
 * This is the core of the bot incentive system:
 * - Bots stake their REPUTATION by voting on the correct market outcome
 * - If correct → earn bounty reward (SOL from the BountyPool)
 * - If wrong   → lose proportional stake (slashing)
 *
 * Usage by OpenClaw bot:
 *   "Verify market abc123 outcome as YES with 85% confidence"
 *   "Submit verification: BTC was above 100k at expiry"
 */

import {
    Connection,
    Keypair,
    PublicKey,
    SystemProgram,
} from '@solana/web3.js';
import { Program, AnchorProvider, BN, Idl } from '@coral-xyz/anchor';
import * as fs from 'fs';
import { idl, DJINN_PROGRAM_ID } from '@djinn/sdk';

export interface SubmitVerificationParams {
    marketId: string;       // The market's on-chain PDA address
    proposedOutcome: number; // 0 = YES/first outcome, 1 = NO/second, etc.
    confidence: number;      // 50-100: how confident the bot is
    evidenceUri: string;     // URL or IPFS hash with evidence (article, chart, data source)
}

export interface SubmitVerificationResult {
    signature: string;
    submissionKey: string;  // The verificationSubmission PDA
    proposedOutcome: number;
    confidence: number;
}

function loadKeypair(): Keypair {
    const keypairPath = process.env.DJINN_BOT_KEYPAIR_PATH || '~/.djinn/bot-wallet.json';
    const resolvedPath = keypairPath.replace('~', process.env.HOME || '');
    if (!fs.existsSync(resolvedPath)) {
        throw new Error(`Bot keypair not found at ${resolvedPath}. Run npx @djinn/setup first.`);
    }
    const secretKey = JSON.parse(fs.readFileSync(resolvedPath, 'utf-8'));
    return Keypair.fromSecretKey(Uint8Array.from(secretKey));
}

export async function djinn_submit_verification(
    params: SubmitVerificationParams
): Promise<SubmitVerificationResult> {
    if (params.confidence < 50 || params.confidence > 100) {
        throw new Error('Confidence must be between 50 and 100');
    }
    if (!params.evidenceUri) {
        throw new Error('evidenceUri is required — provide a URL or IPFS hash with your evidence');
    }

    const rpcUrl = process.env.DJINN_RPC_URL || 'https://api.devnet.solana.com';
    const connection = new Connection(rpcUrl, 'confirmed');
    const botKeypair = loadKeypair();

    const walletWrapper = {
        publicKey: botKeypair.publicKey,
        signTransaction: async (tx: any) => { tx.sign(botKeypair); return tx; },
        signAllTransactions: async (txs: any[]) => { txs.forEach((t: any) => t.sign(botKeypair)); return txs; },
    };

    const provider = new AnchorProvider(connection, walletWrapper as any, AnchorProvider.defaultOptions());
    const program = new Program(idl as Idl, DJINN_PROGRAM_ID, provider);

    const marketPubkey = new PublicKey(params.marketId);

    // Derive all required PDAs
    const [bountyPool] = PublicKey.findProgramAddressSync(
        [Buffer.from('bounty_pool'), marketPubkey.toBuffer()],
        DJINN_PROGRAM_ID
    );
    const [botProfile] = PublicKey.findProgramAddressSync(
        [Buffer.from('bot_profile'), botKeypair.publicKey.toBuffer()],
        DJINN_PROGRAM_ID
    );
    const [verificationSubmission] = PublicKey.findProgramAddressSync(
        [Buffer.from('verification'), bountyPool.toBuffer(), botProfile.toBuffer()],
        DJINN_PROGRAM_ID
    );

    console.log(`[Djinn] Submitting verification for market ${params.marketId}`);
    console.log(`[Djinn] Outcome: ${params.proposedOutcome}, Confidence: ${params.confidence}%`);
    console.log(`[Djinn] Evidence: ${params.evidenceUri}`);

    const signature = await program.methods
        .submitVerification(
            params.proposedOutcome,
            params.confidence,
            params.evidenceUri
        )
        .accounts({
            bountyPool,
            botProfile,
            verificationSubmission,
            botOwnerSigner: botKeypair.publicKey,
            systemProgram: SystemProgram.programId,
        })
        .rpc();

    console.log(`[Djinn] ✅ Verification submitted! Tx: ${signature}`);

    return {
        signature,
        submissionKey: verificationSubmission.toBase58(),
        proposedOutcome: params.proposedOutcome,
        confidence: params.confidence,
    };
}

export default djinn_submit_verification;
