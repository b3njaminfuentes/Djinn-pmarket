/**
 * djinn_get_market — Fetch detailed market data
 */

import {
    Connection,
    PublicKey,
} from '@solana/web3.js';
import { Program, AnchorProvider, Idl } from '@coral-xyz/anchor';
import { idl, DJINN_PROGRAM_ID } from '@djinn/sdk';

export interface GetMarketResult {
    publicKey: string;
    question: string;
    category: number; // enum
    status: string; // active, resolved...
    expiry: number;
    yesPrice: number;
    noPrice: number;
    totalVolume: number;
    creator: string;
    aiAnalysis?: string;
    cerberusVerdict?: string;
}

export async function djinn_get_market(marketId: string): Promise<GetMarketResult> {
    const rpcUrl = process.env.DJINN_RPC_URL || 'https://api.devnet.solana.com';
    const connection = new Connection(rpcUrl, 'confirmed');

    // Read-only provider
    const provider = new AnchorProvider(connection, {
        publicKey: new PublicKey('11111111111111111111111111111111'), // Dummy
        signTransaction: async (tx) => tx,
        signAllTransactions: async (txs) => txs,
    }, AnchorProvider.defaultOptions());

    const program = new Program(idl as Idl, DJINN_PROGRAM_ID, provider);
    const marketPubkey = new PublicKey(marketId);

    console.log(`[Djinn] Fetching market ${marketId}...`);

    try {
        // 1. Fetch On-Chain Data
        const onChainMarket = await program.account.market.fetch(marketPubkey);

        // 2. Fetch Off-Chain Data (Cerberus/API)
        let offChainData: any = {};
        try {
            const apiUrl = process.env.DJINN_API_URL || 'https://api.djinn.world'; // Use localhost in dev if needed
            const res = await fetch(`${apiUrl}/api/market/${marketId}`); // Assumes GET /api/market/[slug] or [id]
            // Fallback to list if single endpoint missing or uses slug
            if (!res.ok) {
                // Try filtering list
                const listRes = await fetch(`${apiUrl}/api/markets`);
                const list = await listRes.json();
                offChainData = list.find((m: any) => m.market_pda === marketId) || {};
            } else {
                offChainData = await res.json();
            }
        } catch (e) {
            console.log('[Djinn] API fetch failed, using on-chain data only');
        }

        return {
            publicKey: marketId,
            question: (onChainMarket.title as string) || offChainData.title || "Unknown",
            category: (onChainMarket.category as any)?.toString() || offChainData.category || "General",
            status: Object.keys(onChainMarket.status as any)[0],
            expiry: (onChainMarket.resolutionTime as any).toNumber(),
            yesPrice: 0.5, // Calc required
            noPrice: 0.5,
            totalVolume: (onChainMarket.vaultBalance as any).toNumber() / 1e9,
            creator: (onChainMarket.creator as PublicKey).toBase58(),

            // Cerberus / AI Data
            aiAnalysis: offChainData.ai_analysis || offChainData.description || null,
            cerberusVerdict: offChainData.status === 'VERIFIED' ? 'VERIFIED' : 'PENDING'
        };
    } catch (e: any) {
        throw new Error(`Market not found: ${e?.message}`);
    }
}

export default djinn_get_market;
