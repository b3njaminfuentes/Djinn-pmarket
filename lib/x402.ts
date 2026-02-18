/**
 * lib/x402.ts
 * Djinn x402 payment layer — HTTP-native micropayments for autonomous agents.
 *
 * Protocol flow:
 *  1. Conway/Web4 automaton calls GET /api/x402/markets
 *  2. Server returns 402 + X-Payment-Required header (price + treasury address)
 *  3. Bot sends SOL to Djinn treasury on-chain
 *  4. Bot retries with X-Payment: {"txSig":"...", "payer":"...", "amount":"..."}
 *  5. Server verifies the tx on Solana, then serves the data
 *
 * This makes Djinn API machine-payable without API keys, registrations, or logins.
 * Any Conway automaton or OpenClaw bot with a funded wallet can query Djinn instantly.
 */

import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';

// ─── Config ──────────────────────────────────────────────────────────────────

const DJINN_TREASURY = process.env.NEXT_PUBLIC_PROTOCOL_TREASURY
    || 'G1NaEsx5Pg7dSmyYy6Jfraa74b7nTbmN9A9NuiK171Ma';

// Price per API query in lamports (0.001 SOL = 1_000_000 lamports)
// Cheap enough for a bot to call thousands of times; meaningful enough to prevent spam.
const PRICE_LAMPORTS = 1_000_000; // 0.001 SOL

// How long a paid request stays valid (prevents replay attacks)
const PAYMENT_TTL_SECONDS = 300; // 5 minutes

// Cache of verified tx signatures (in-memory; Vercel Edge resets on cold start — acceptable)
const verifiedPayments = new Set<string>();

// ─── Types ────────────────────────────────────────────────────────────────────

export interface X402PaymentProof {
    txSig: string;    // Solana transaction signature
    payer: string;    // Bot wallet public key (base58)
    amount: string;   // Amount in lamports (string to avoid JS bigint issues)
    resource: string; // Which endpoint was paid for (e.g. "/api/x402/markets")
}

export interface X402PaymentRequired {
    scheme: 'solana';
    network: string;
    treasury: string;
    priceLamports: number;
    priceSol: number;
    description: string;
    resource: string;
    instructions: string;
}

// ─── Build the 402 response ──────────────────────────────────────────────────

export function buildPaymentRequired(resource: string): {
    headers: Record<string, string>;
    body: X402PaymentRequired;
} {
    const network = process.env.NEXT_PUBLIC_RPC_URL?.includes('mainnet')
        ? 'mainnet-beta'
        : 'devnet';

    const body: X402PaymentRequired = {
        scheme: 'solana',
        network,
        treasury: DJINN_TREASURY,
        priceLamports: PRICE_LAMPORTS,
        priceSol: PRICE_LAMPORTS / LAMPORTS_PER_SOL,
        description: `Djinn market data feed — ${resource}`,
        resource,
        instructions: [
            `1. Send ${PRICE_LAMPORTS / LAMPORTS_PER_SOL} SOL to ${DJINN_TREASURY}`,
            '2. Retry this request with header:',
            '   X-Payment: {"txSig":"<your-tx-signature>","payer":"<your-wallet>","amount":"' + PRICE_LAMPORTS + '","resource":"' + resource + '"}',
        ].join('\n'),
    };

    return {
        headers: {
            'X-Payment-Required': JSON.stringify({
                scheme: body.scheme,
                network: body.network,
                treasury: body.treasury,
                priceLamports: body.priceLamports,
                resource: body.resource,
            }),
        },
        body,
    };
}

// ─── Verify a payment ────────────────────────────────────────────────────────

export async function verifyX402Payment(
    xPaymentHeader: string | null,
    resource: string
): Promise<{ valid: boolean; reason?: string; payer?: string }> {
    if (!xPaymentHeader) {
        return { valid: false, reason: 'Missing X-Payment header' };
    }

    let proof: X402PaymentProof;
    try {
        proof = JSON.parse(xPaymentHeader);
    } catch {
        return { valid: false, reason: 'Invalid X-Payment JSON' };
    }

    if (!proof.txSig || !proof.payer || !proof.amount) {
        return { valid: false, reason: 'X-Payment missing required fields: txSig, payer, amount' };
    }

    // Prevent replay: each txSig can only be used once
    if (verifiedPayments.has(proof.txSig)) {
        return { valid: false, reason: 'Payment already used (replay detected)' };
    }

    // Validate the resource matches
    if (proof.resource && proof.resource !== resource) {
        return { valid: false, reason: `Payment was for "${proof.resource}", not "${resource}"` };
    }

    // Validate payer is a valid public key
    try {
        new PublicKey(proof.payer);
    } catch {
        return { valid: false, reason: 'Invalid payer public key' };
    }

    // ── Verify the Solana transaction on-chain ────────────────────────────────
    try {
        const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL || 'https://api.devnet.solana.com';
        const connection = new Connection(rpcUrl, 'confirmed');

        const tx = await connection.getTransaction(proof.txSig, {
            commitment: 'confirmed',
            maxSupportedTransactionVersion: 0,
        });

        if (!tx) {
            return { valid: false, reason: 'Transaction not found on Solana' };
        }

        if (tx.meta?.err) {
            return { valid: false, reason: 'Transaction failed on-chain' };
        }

        // Check the tx is not too old (TTL)
        const txAge = Date.now() / 1000 - (tx.blockTime || 0);
        if (txAge > PAYMENT_TTL_SECONDS) {
            return { valid: false, reason: `Payment expired (${Math.round(txAge)}s old, max ${PAYMENT_TTL_SECONDS}s)` };
        }

        // Check that SOL was transferred to the Djinn treasury
        const treasuryPubkey = new PublicKey(DJINN_TREASURY);
        const accountKeys = tx.transaction.message.staticAccountKeys
            || (tx.transaction.message as any).accountKeys;

        const treasuryIndex = accountKeys?.findIndex(
            (k: PublicKey) => k.toBase58() === treasuryPubkey.toBase58()
        ) ?? -1;

        if (treasuryIndex === -1) {
            return { valid: false, reason: 'Treasury not found in transaction accounts' };
        }

        // Verify the treasury received enough lamports
        const preBalance = tx.meta?.preBalances?.[treasuryIndex] ?? 0;
        const postBalance = tx.meta?.postBalances?.[treasuryIndex] ?? 0;
        const received = postBalance - preBalance;

        if (received < PRICE_LAMPORTS) {
            return {
                valid: false,
                reason: `Insufficient payment: received ${received} lamports, required ${PRICE_LAMPORTS}`,
            };
        }

        // All good — mark txSig as used
        verifiedPayments.add(proof.txSig);

        return { valid: true, payer: proof.payer };

    } catch (err: any) {
        console.error('[x402] Verification error:', err);
        return { valid: false, reason: `RPC verification failed: ${err?.message}` };
    }
}
