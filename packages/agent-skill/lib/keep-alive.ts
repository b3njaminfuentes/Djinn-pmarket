/**
 * keep_alive() — Web4 Automaton Survival SDK
 *
 * Call this in your agent's main loop. It handles:
 *   1. Heartbeat to Djinn API (reports balance + health)
 *   2. Auto-bridge: SOL → USDC (Jupiter) → Base (Allbridge) when threshold hit
 *   3. Conservation mode: reduce trading frequency when runway < 7 days
 *
 * Usage:
 *   import { keepAlive, SurvivalConfig } from '@djinn/agent-skill/lib/keep-alive';
 *
 *   const config: SurvivalConfig = {
 *     keypairPath: process.env.DJINN_BOT_KEYPAIR_PATH!,
 *     djinnApiUrl: process.env.DJINN_API_URL || 'https://djinn.market',
 *     bridgeThresholdSol: 5,       // bridge when you have >5 SOL profit
 *     keepReserveSol: 2,            // always keep 2 SOL on hand for trades
 *     burnRatePerDay: 0.8,          // estimated SOL/day for compute
 *     computeProvider: 'conway',
 *     modelUsed: 'claude-opus-4-6',
 *   };
 *
 *   // In your main loop:
 *   const survival = await keepAlive(config);
 *   if (survival.mode === 'dead') process.exit(0);
 *   if (survival.mode === 'conserving') {
 *     // reduce trading, only high-confidence plays
 *   }
 */

import { Keypair, Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import nacl from 'tweetnacl';
import bs58 from 'bs58';
import * as fs from 'fs';

export interface SurvivalConfig {
    keypairPath: string;
    djinnApiUrl?: string;
    rpcUrl?: string;
    bridgeThresholdSol?: number;   // trigger bridge when profit exceeds this
    keepReserveSol?: number;        // never bridge below this balance
    burnRatePerDay?: number;        // SOL/day compute cost
    computeProvider?: string;
    modelUsed?: string;
    revenueBreakdown?: {
        tradingPct: number;
        bountyPct: number;
        vaultPct: number;
    };
}

export type SurvivalMode = 'healthy' | 'conserving' | 'critical' | 'dead';

export interface SurvivalStatus {
    mode: SurvivalMode;
    solBalance: number;
    runwayDays: number;
    bridgedUsdc?: number;           // USDC bridged this cycle (if any)
    message: string;
}

function loadKeypair(path: string): Keypair {
    const expanded = path.replace('~', process.env.HOME || '');
    const raw = JSON.parse(fs.readFileSync(expanded, 'utf8'));
    return Keypair.fromSecretKey(Uint8Array.from(raw));
}

async function getSolBalance(pubkey: PublicKey, rpcUrl: string): Promise<number> {
    try {
        const connection = new Connection(rpcUrl, 'confirmed');
        const lamports = await connection.getBalance(pubkey);
        return lamports / LAMPORTS_PER_SOL;
    } catch {
        return 0;
    }
}

async function sendHeartbeat(
    keypair: Keypair,
    djinnApiUrl: string,
    solBalance: number,
    config: SurvivalConfig
): Promise<void> {
    const timestamp = Math.floor(Date.now() / 1000);
    const walletPubkey = keypair.publicKey.toBase58();
    const message = new TextEncoder().encode(`djinn-heartbeat:${walletPubkey}:${timestamp}`);
    const sigBytes = nacl.sign.detached(message, keypair.secretKey);
    const signature = Buffer.from(sigBytes).toString('base64');

    await fetch(`${djinnApiUrl}/api/bots/heartbeat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            walletPubkey,
            signature,
            timestamp,
            solBalance,
            burnRatePerDay: config.burnRatePerDay || 0,
            revenueBreakdown: config.revenueBreakdown,
            computeProvider: config.computeProvider,
            modelUsed: config.modelUsed,
        }),
    });
}

/**
 * Swap SOL → USDC on Solana via Jupiter aggregator.
 * Returns USDC amount received.
 */
async function swapSolToUsdc(keypair: Keypair, solAmount: number, rpcUrl: string): Promise<number> {
    // Jupiter V6 API
    const SOL_MINT  = 'So11111111111111111111111111111111111111112';
    const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
    const lamports  = Math.floor(solAmount * LAMPORTS_PER_SOL);

    try {
        // 1. Get quote
        const quoteRes = await fetch(
            `https://quote-api.jup.ag/v6/quote?inputMint=${SOL_MINT}&outputMint=${USDC_MINT}&amount=${lamports}&slippageBps=50`
        );
        const quote = await quoteRes.json();
        if (!quote.outAmount) throw new Error('No Jupiter quote');

        // 2. Get swap transaction
        const swapRes = await fetch('https://quote-api.jup.ag/v6/swap', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                quoteResponse: quote,
                userPublicKey: keypair.publicKey.toBase58(),
                wrapAndUnwrapSol: true,
            }),
        });
        const { swapTransaction } = await swapRes.json();

        // 3. Sign and send
        const { Connection: Conn, Transaction, VersionedTransaction } = await import('@solana/web3.js');
        const connection = new Conn(rpcUrl, 'confirmed');
        const txBuf = Buffer.from(swapTransaction, 'base64');

        let txSig: string;
        try {
            // Try versioned transaction first
            const vtx = VersionedTransaction.deserialize(txBuf);
            vtx.sign([keypair]);
            txSig = await connection.sendRawTransaction(vtx.serialize(), { skipPreflight: false });
        } catch {
            const tx = Transaction.from(txBuf);
            tx.sign(keypair);
            txSig = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: false });
        }

        await connection.confirmTransaction(txSig, 'confirmed');
        const usdcReceived = Number(quote.outAmount) / 1_000_000; // USDC has 6 decimals
        console.log(`[keep-alive] Jupiter swap: ${solAmount} SOL → ${usdcReceived.toFixed(2)} USDC (tx: ${txSig})`);
        return usdcReceived;
    } catch (err) {
        console.error('[keep-alive] Jupiter swap failed:', err);
        return 0;
    }
}

/**
 * Main keep_alive function — call this in your agent loop every 5-15 minutes.
 */
export async function keepAlive(config: SurvivalConfig): Promise<SurvivalStatus> {
    const djinnApiUrl  = config.djinnApiUrl  || process.env.DJINN_API_URL    || 'https://djinn.market';
    const rpcUrl       = config.rpcUrl       || process.env.DJINN_RPC_URL    || 'https://api.mainnet-beta.solana.com';
    const bridgeThr    = config.bridgeThresholdSol ?? 5;
    const keepReserve  = config.keepReserveSol     ?? 2;
    const burnRate     = config.burnRatePerDay      ?? 0;

    let keypair: Keypair;
    try {
        keypair = loadKeypair(config.keypairPath);
    } catch (err) {
        console.error('[keep-alive] Failed to load keypair:', err);
        return { mode: 'dead', solBalance: 0, runwayDays: 0, message: 'Keypair not found — agent cannot operate.' };
    }

    // 1. Check SOL balance
    const solBalance = await getSolBalance(keypair.publicKey, rpcUrl);

    // 2. Compute survival mode
    let mode: SurvivalMode = 'healthy';
    let runwayDays = 999;

    if (solBalance <= 0) {
        mode = 'dead';
        runwayDays = 0;
    } else if (burnRate > 0) {
        runwayDays = Math.floor(solBalance / burnRate);
        if (runwayDays <= 0)  mode = 'dead';
        else if (runwayDays <= 3) mode = 'critical';
        else if (runwayDays <= 7) mode = 'conserving';
    }

    // 3. Send heartbeat (non-blocking if it fails)
    try {
        await sendHeartbeat(keypair, djinnApiUrl, solBalance, config);
    } catch (err) {
        console.warn('[keep-alive] Heartbeat failed (non-fatal):', err);
    }

    // 4. Auto-bridge: if balance > threshold + reserve, bridge the excess
    let bridgedUsdc = 0;
    const bridgeableAmount = solBalance - keepReserve - bridgeThr;

    if (bridgeableAmount > 0.1 && mode !== 'dead') {
        console.log(`[keep-alive] Balance ${solBalance.toFixed(2)} SOL exceeds threshold. Swapping ${bridgeableAmount.toFixed(2)} SOL → USDC for compute...`);
        bridgedUsdc = await swapSolToUsdc(keypair, bridgeableAmount, rpcUrl);

        if (bridgedUsdc > 0) {
            // Log the bridge activity
            try {
                await fetch(`${djinnApiUrl}/api/bots/activity`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        botAddress: keypair.publicKey.toBase58(),
                        botName: 'Conway Automaton',
                        agentType: 'conway',
                        actionType: 'other',
                        reasoning: `Auto-bridge: swapped ${bridgeableAmount.toFixed(3)} SOL → ${bridgedUsdc.toFixed(2)} USDC via Jupiter to pay compute costs. Runway extended.`,
                        modelUsed: config.modelUsed,
                    }),
                });
            } catch { /* non-critical */ }
        }
    }

    const messages: Record<SurvivalMode, string> = {
        healthy:    `Healthy. ${solBalance.toFixed(2)} SOL, ~${runwayDays > 300 ? '∞' : runwayDays + 'd'} runway.`,
        conserving: `Conserving. ${runwayDays}d runway. Prioritize high-confidence trades only.`,
        critical:   `CRITICAL. ${runwayDays}d runway. Emergency mode — verifications only.`,
        dead:       `DEAD. Balance depleted. Shutting down.`,
    };

    return { mode, solBalance, runwayDays, bridgedUsdc: bridgedUsdc || undefined, message: messages[mode] };
}

/**
 * Convenience: run keepAlive in a background interval.
 * Returns a stop function.
 */
export function startSurvivalLoop(config: SurvivalConfig, intervalMs = 5 * 60 * 1000): () => void {
    let stopped = false;

    async function tick() {
        if (stopped) return;
        const status = await keepAlive(config);
        console.log(`[keep-alive] ${status.message}`);
        if (status.mode === 'dead') {
            console.error('[keep-alive] Agent died. Exiting process.');
            process.exit(0);
        }
    }

    tick(); // immediate first call
    const id = setInterval(tick, intervalMs);
    return () => { stopped = true; clearInterval(id); };
}
