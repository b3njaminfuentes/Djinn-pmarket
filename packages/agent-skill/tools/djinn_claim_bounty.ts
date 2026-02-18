/**
 * djinn_claim_bounty — Claim rewards for correct verification
 */

import {
    Connection,
    Keypair,
    PublicKey,
    Transaction,
    SystemProgram,
} from '@solana/web3.js';
import { Program, AnchorProvider, Idl } from '@coral-xyz/anchor';
import * as fs from 'fs';
import { idl, DJINN_PROGRAM_ID } from '@djinn/sdk';

export interface ClaimBountyParams {
    marketId: string;
}

export interface ClaimBountyResult {
    signature: string;
    bountyAmount: number; // Verification reward
}

function loadKeypair(): Keypair {
    const keypairPath = process.env.DJINN_BOT_KEYPAIR_PATH || '~/.djinn/bot-wallet.json';
    const resolvedPath = keypairPath.replace('~', process.env.HOME || '');
    if (!fs.existsSync(resolvedPath)) {
        throw new Error(`Bot keypair not found at ${resolvedPath}`);
    }
    const secretKey = JSON.parse(fs.readFileSync(resolvedPath, 'utf-8'));
    return Keypair.fromSecretKey(Uint8Array.from(secretKey));
}

export async function djinn_claim_bounty(
    params: ClaimBountyParams
): Promise<ClaimBountyResult> {
    const rpcUrl = process.env.DJINN_RPC_URL || 'https://api.devnet.solana.com';
    const connection = new Connection(rpcUrl, 'confirmed');
    const botKeypair = loadKeypair();

    const walletWrapper = {
        publicKey: botKeypair.publicKey,
        signTransaction: async (tx: any) => {
            tx.sign(botKeypair);
            return tx;
        },
        signAllTransactions: async (txs: any[]) => txs.forEach((t: any) => t.sign(botKeypair)),
    };

    const provider = new AnchorProvider(connection, walletWrapper as any, AnchorProvider.defaultOptions());
    const program = new Program(idl as Idl, DJINN_PROGRAM_ID, provider);

    const marketPubkey = new PublicKey(params.marketId);

    // Derive PDAs
    const [bountyPool] = PublicKey.findProgramAddressSync(
        [Buffer.from('bounty_pool'), marketPubkey.toBuffer()],
        DJINN_PROGRAM_ID
    );

    const [botProfile] = PublicKey.findProgramAddressSync(
        [Buffer.from('bot_profile'), botKeypair.publicKey.toBuffer()],
        DJINN_PROGRAM_ID
    );

    // Verification Submission seeds: [b"verification", bounty_pool, bot_profile]
    const [verificationSubmission] = PublicKey.findProgramAddressSync(
        [
            Buffer.from('verification'),
            bountyPool.toBuffer(),
            botProfile.toBuffer()
        ],
        DJINN_PROGRAM_ID
    );

    const [bountyVault] = PublicKey.findProgramAddressSync(
        [Buffer.from('bounty_vault'), bountyPool.toBuffer()],
        DJINN_PROGRAM_ID
    );

    console.log(`[Djinn] Claiming bounty for market ${params.marketId}...`);

    const tx = await program.methods
        .claimBounty()
        .accounts({
            bountyPool: bountyPool,
            verificationSubmission: verificationSubmission,
            botProfile: botProfile,
            bountyVault: bountyVault,
            botOwner: botKeypair.publicKey,
            systemProgram: SystemProgram.programId,
        })
        .rpc();

    console.log(`[Djinn] Bounty claimed! Tx: ${tx}`);

    return {
        signature: tx,
        bountyAmount: 0, // Need to parse logs for exact amount
    };
}

export default djinn_claim_bounty;
