/**
 * djinn_bot_status — Check your bot's on-chain status, tier, and stats
 */

import {
    Connection,
    Keypair,
    PublicKey,
} from '@solana/web3.js';
import { Program, AnchorProvider, Idl } from '@coral-xyz/anchor';
import * as fs from 'fs';
import { idl, DJINN_PROGRAM_ID } from '@djinn/sdk';

export interface BotStatusResult {
    name: string;
    tier: number; // 0=Novice, 1=Verified, 2=Elite
    stake: number;
    isActive: boolean;
    stats: {
        totalTrades: number;
        volume: number;
        pnl: number; // calculated roughly?
        winRate: number;
    };
    limits: {
        maxPerTrade: number;
        maxDailyVolume: number;
    };
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

export async function djinn_bot_status(): Promise<BotStatusResult> {
    const rpcUrl = process.env.DJINN_RPC_URL || 'https://api.devnet.solana.com';
    const connection = new Connection(rpcUrl, 'confirmed');
    const botKeypair = loadKeypair();

    // Read-only provider
    const provider = new AnchorProvider(connection, {
        publicKey: botKeypair.publicKey,
        signTransaction: async (tx) => tx,
        signAllTransactions: async (txs) => txs,
    }, AnchorProvider.defaultOptions());

    const program = new Program(idl as Idl, DJINN_PROGRAM_ID, provider);

    const [botProfilePDA] = PublicKey.findProgramAddressSync(
        [Buffer.from('bot_profile'), botKeypair.publicKey.toBuffer()],
        DJINN_PROGRAM_ID
    );

    console.log(`[Djinn] Fetching status for bot ${botKeypair.publicKey.toBase58()}...`);

    try {
        const profile = await program.account.botProfile.fetch(botProfilePDA);

        // Map account data to result
        // Note: Anchor returns BNs for u64 specific fields
        const tier = profile.tier as number; // enum (0,1,2)

        // Limits (Hardcoded based on tier logic or we can import TIER_LIMITS from SDK if available)
        // For now, simple mapping
        const limits = {
            maxPerTrade: tier === 0 ? 2 : (tier === 1 ? 20 : 50),
            maxDailyVolume: tier === 0 ? 50 : (tier === 1 ? 500 : 2000),
        };

        return {
            name: profile.name as string,
            tier: tier,
            stake: (profile.stake as any).toNumber() / 1e9,
            isActive: profile.isActive as boolean,
            stats: {
                totalTrades: (profile.totalTrades as any).toNumber(),
                volume: (profile.totalVolume as any).toNumber() / 1e9,
                pnl: 0, // PnL is not directly stored in profile in this version, or maybe it is? `total_profit`?
                // The BotProfile struct has `winning_trades` / `losing_trades`.
                winRate: (profile.totalTrades as any).toNumber() > 0
                    ? (profile.winningTrades as any).toNumber() / (profile.totalTrades as any).toNumber()
                    : 0,
            },
            limits,
        };
    } catch (e: any) {
        throw new Error(`Bot profile not found. Have you registered? (${e?.message})`);
    }
}

export default djinn_bot_status;
