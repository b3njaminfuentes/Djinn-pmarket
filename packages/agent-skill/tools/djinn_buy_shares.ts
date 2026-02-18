/**
 * djinn_buy_shares — Execute a buy trade on a Djinn prediction market
 */

import {
    Connection,
    Keypair,
    PublicKey,
    Transaction,
    SystemProgram,
} from '@solana/web3.js';
import { Program, AnchorProvider, BN, Idl } from '@coral-xyz/anchor';
import * as fs from 'fs';
import { idl, DJINN_PROGRAM_ID } from '@djinn/sdk';

export interface BuySharesParams {
    marketId: string;
    outcome: number;        // 0 = YES/first, 1 = NO/second, etc.
    solAmount: number;      // Amount in SOL (e.g., 1.5)
    maxSlippage?: number;   // Basis points, default 300 (3%)
    // ── Transparency fields — logged publicly on Djinn ──────────────────────
    reasoning?: string;     // WHY the bot is buying (e.g. "BTC closed above 100k on CMC, 87% certainty")
    evidenceUri?: string;   // URL to supporting data (news article, chart, API response)
    marketSlug?: string;    // Slug for the activity log
    marketTitle?: string;   // Human-readable title for the activity log
    modelUsed?: string;     // LLM model that made the decision (e.g. "claude-sonnet-4-6")
}

export interface BuySharesResult {
    signature: string;
    sharesReceived: number; // Estimated
    totalCost: number;
}

const LAMPORTS_PER_SOL = 1_000_000_000;
const TREASURY_PUBKEY = new PublicKey('G1NaEsx5Pg7dSmyYy6Jfraa74b7nTbmN9A9NuiK171Ma');

// ─── Position limits by bot tier ─────────────────────────────────────────────
// Tier 0 = Novice, Tier 1 = Verified, Tier 2 = Elite
const MAX_SOL_PER_TRADE: Record<number, number> = {
    0: 0.5,   // Novice  — builds trust before risking capital
    1: 2.0,   // Verified — demonstrated track record
    2: 5.0,   // Elite   — full autonomous trading
};

function loadKeypair(): Keypair {
    const keypairPath = process.env.DJINN_BOT_KEYPAIR_PATH || '~/.djinn/bot-wallet.json';
    const resolvedPath = keypairPath.replace('~', process.env.HOME || '');
    if (!fs.existsSync(resolvedPath)) {
        throw new Error(`Bot keypair not found at ${resolvedPath}`);
    }
    const secretKey = JSON.parse(fs.readFileSync(resolvedPath, 'utf-8'));
    return Keypair.fromSecretKey(Uint8Array.from(secretKey));
}

export async function djinn_buy_shares(
    params: BuySharesParams
): Promise<BuySharesResult> {
    const rpcUrl = process.env.DJINN_RPC_URL || 'https://api.devnet.solana.com';
    const connection = new Connection(rpcUrl, 'confirmed');
    const botKeypair = loadKeypair();

    const walletWrapper = {
        publicKey: botKeypair.publicKey,
        signTransaction: async (tx: Transaction) => {
            tx.sign(botKeypair);
            return tx;
        },
        signAllTransactions: async (txs: Transaction[]) => {
            txs.forEach(t => t.sign(botKeypair));
            return txs;
        }
    };

    const provider = new AnchorProvider(connection, walletWrapper as any, AnchorProvider.defaultOptions());
    const program = new Program(idl as Idl, DJINN_PROGRAM_ID, provider);

    // ─── Enforce tier-based position limit ────────────────────────────────────
    const [botProfilePDA] = PublicKey.findProgramAddressSync(
        [Buffer.from('bot_profile'), botKeypair.publicKey.toBuffer()],
        DJINN_PROGRAM_ID
    );

    let botTier = 0;
    try {
        const profile = await (program.account as any).botProfile.fetch(botProfilePDA);
        botTier = (profile.tier as number) ?? 0;
    } catch {
        // Profile not found → treat as Novice (tier 0) — most restrictive
        botTier = 0;
    }

    const maxAllowed = MAX_SOL_PER_TRADE[botTier] ?? 0.5;
    const tierName = ['Novice', 'Verified', 'Elite'][botTier] ?? 'Novice';

    if (params.solAmount > maxAllowed) {
        throw new Error(
            `Position limit exceeded. ${tierName} bots may trade at most ${maxAllowed} SOL per market. ` +
            `Requested: ${params.solAmount} SOL. Increase your tier to raise limits.`
        );
    }

    console.log(`[Djinn] Tier: ${tierName} (${botTier}) — limit: ${maxAllowed} SOL — requested: ${params.solAmount} SOL ✓`);
    // ──────────────────────────────────────────────────────────────────────────

    const lamports = new BN(Math.floor(params.solAmount * LAMPORTS_PER_SOL));
    const outcomeIndex = params.outcome;

    // Derive PDAs
    const marketPubkey = new PublicKey(params.marketId);

    // Find PDAs required by instruction
    const [marketVault] = PublicKey.findProgramAddressSync(
        [Buffer.from('market_vault'), marketPubkey.toBuffer()],
        DJINN_PROGRAM_ID
    );

    // User position PDA: [b"user_pos", market, user, &[outcome]]
    const [userPosition] = PublicKey.findProgramAddressSync(
        [
            Buffer.from('user_pos'),
            marketPubkey.toBuffer(),
            botKeypair.publicKey.toBuffer(),
            Buffer.from([outcomeIndex])
        ],
        DJINN_PROGRAM_ID
    );

    const [insuranceVault] = PublicKey.findProgramAddressSync(
        [Buffer.from('insurance_vault')],
        DJINN_PROGRAM_ID
    );

    console.log(`[Djinn] Buying ${params.solAmount} SOL of outcome ${params.outcome} on market ${params.marketId}`);

    // Fetch market creator from on-chain account
    const marketAccount = await (program.account as any).market.fetch(marketPubkey);
    const marketCreator = marketAccount.creator as PublicKey;

    const tx = await program.methods
        .buyShares(outcomeIndex, lamports)
        .accounts({
            market: marketPubkey,
            userPosition: userPosition,
            marketVault: marketVault,
            insuranceVault: insuranceVault,
            protocolTreasury: TREASURY_PUBKEY,
            marketCreator: marketCreator,
            user: botKeypair.publicKey,
            systemProgram: SystemProgram.programId,
        })
        .rpc();

    console.log(`[Djinn] Transaction confirmed: ${tx}`);

    // ── Log activity publicly (non-blocking) ────────────────────────────────
    const apiUrl = process.env.DJINN_API_URL || process.env.NEXT_PUBLIC_APP_URL || 'https://djinn.market';
    fetch(`${apiUrl}/api/bots/activity`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            botAddress: botKeypair.publicKey.toBase58(),
            agentType: process.env.DJINN_AGENT_TYPE || 'clawbot',
            actionType: 'buy_shares',
            marketSlug: params.marketSlug || params.marketId,
            marketTitle: params.marketTitle,
            marketPda: params.marketId,
            outcome: params.outcome === 0 ? 'YES' : 'NO',
            solAmount: params.solAmount,
            reasoning: params.reasoning || `Bought ${params.outcome === 0 ? 'YES' : 'NO'} shares. No reasoning provided.`,
            evidenceUri: params.evidenceUri,
            modelUsed: params.modelUsed,
            txSignature: tx,
        }),
    }).catch(() => { /* non-critical */ });

    return {
        signature: tx,
        sharesReceived: 0, // In real imp, we'd parse logs to get exact amount
        totalCost: params.solAmount,
    };
}

export default djinn_buy_shares;
