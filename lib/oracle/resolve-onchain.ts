/**
 * resolve-onchain.ts
 * Signs and sends resolveMarket instruction to Solana via the oracle authority keypair.
 * Used by /api/oracle/resolve and /api/oracle/cron for autonomous market resolution.
 */

import { Connection, Keypair, PublicKey, SystemProgram } from '@solana/web3.js';
import { Program, AnchorProvider, Idl } from '@project-serum/anchor';
import bs58 from 'bs58';
import idl from '@/lib/idl/djinn_market.json';

const DJINN_PROGRAM_ID = new PublicKey(
    process.env.NEXT_PUBLIC_PROGRAM_ID || 'A8pVMgP6vwjGqcbYh1WGWDjXq9uwQRoF9Lz1siLmD7nm'
);
const TREASURY_PUBKEY = new PublicKey('G1NaEsx5Pg7dSmyYy6Jfraa74b7nTbmN9A9NuiK171Ma');

/**
 * Load the oracle authority keypair from ORACLE_AUTHORITY_KEYPAIR env var (bs58).
 */
function loadAuthorityKeypair(): Keypair {
    const raw = process.env.ORACLE_AUTHORITY_KEYPAIR;
    if (!raw) throw new Error('ORACLE_AUTHORITY_KEYPAIR env var not set');
    return Keypair.fromSecretKey(bs58.decode(raw));
}

export interface ResolveOnChainResult {
    signature: string;
    winningOutcome: number;
}

/**
 * Calls resolveMarket on-chain for YES (0) or NO (1) outcomes.
 * For VOID outcomes, skips the on-chain call (Supabase handles refund logic).
 */
export async function resolveMarketOnChain(
    marketPda: string,
    verdict: 'YES' | 'NO' | 'VOID'
): Promise<ResolveOnChainResult | null> {
    if (verdict === 'VOID') {
        console.log('[ORACLE] VOID verdict — skipping on-chain resolution, refund via Supabase');
        return null;
    }

    if (!marketPda) {
        throw new Error('market_pda is required for on-chain resolution');
    }

    const authorityKeypair = loadAuthorityKeypair();
    const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL || 'https://api.devnet.solana.com';
    const connection = new Connection(rpcUrl, 'confirmed');

    const walletWrapper = {
        publicKey: authorityKeypair.publicKey,
        signTransaction: async (tx: any) => { tx.sign(authorityKeypair); return tx; },
        signAllTransactions: async (txs: any[]) => { txs.forEach(t => t.sign(authorityKeypair)); return txs; },
    };

    const marketPubkey = new PublicKey(marketPda);
    const provider = new AnchorProvider(connection, walletWrapper as any, AnchorProvider.defaultOptions());
    const program = new Program(idl as Idl, marketPubkey, provider);
    const winningOutcome = verdict === 'YES' ? 0 : 1;

    const [marketVault] = PublicKey.findProgramAddressSync(
        [Buffer.from('market_vault'), marketPubkey.toBuffer()],
        DJINN_PROGRAM_ID
    );
    const [insuranceVault] = PublicKey.findProgramAddressSync(
        [Buffer.from('insurance_vault')],
        DJINN_PROGRAM_ID
    );

    console.log(`[ORACLE] Resolving on-chain: ${marketPda} → ${verdict} (outcome ${winningOutcome})`);

    const signature = await program.methods
        .resolveMarket(winningOutcome)
        .accounts({
            market: marketPubkey,
            marketVault,
            authority: authorityKeypair.publicKey,
            protocolTreasury: TREASURY_PUBKEY,
            insuranceVault,
            systemProgram: SystemProgram.programId,
        })
        .rpc();

    console.log(`[ORACLE] ✅ On-chain resolution confirmed: ${signature}`);
    return { signature, winningOutcome };
}

/**
 * Calls finalizeBountyPool on-chain after market resolution.
 * Safe to call even if bounty pool wasn't initialized (catches error gracefully).
 */
export async function finalizeBountyPoolOnChain(marketPda: string): Promise<string | null> {
    try {
        const authorityKeypair = loadAuthorityKeypair();
        const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL || 'https://api.devnet.solana.com';
        const connection = new Connection(rpcUrl, 'confirmed');

        const walletWrapper = {
            publicKey: authorityKeypair.publicKey,
            signTransaction: async (tx: any) => { tx.sign(authorityKeypair); return tx; },
            signAllTransactions: async (txs: any[]) => { txs.forEach(t => t.sign(authorityKeypair)); return txs; },
        };

        const marketPubkey = new PublicKey(marketPda);
        const provider = new AnchorProvider(connection, walletWrapper as any, AnchorProvider.defaultOptions());
        const program = new Program(idl as Idl, marketPubkey, provider);
        const [bountyPool] = PublicKey.findProgramAddressSync(
            [Buffer.from('bounty_pool'), marketPubkey.toBuffer()],
            DJINN_PROGRAM_ID
        );

        const signature = await program.methods
            .finalizeBountyPool()
            .accounts({
                bountyPool,
                market: marketPubkey,
                authority: authorityKeypair.publicKey,
            })
            .rpc();

        console.log(`[ORACLE] ✅ BountyPool finalized: ${signature}`);
        return signature;
    } catch (e: any) {
        // Bounty pool may not exist for all markets — not a critical error
        console.warn(`[ORACLE] BountyPool finalize skipped (may not exist): ${e?.message}`);
        return null;
    }
}
