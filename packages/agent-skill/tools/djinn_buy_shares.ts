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
    outcome: number;       // 0 = YES/first, 1 = NO/second, etc.
    solAmount: number;      // Amount in SOL (e.g., 1.5)
    maxSlippage?: number;   // Basis points, default 300 (3%)
}

export interface BuySharesResult {
    signature: string;
    sharesReceived: number; // Estimated
    totalCost: number;
}

const LAMPORTS_PER_SOL = 1_000_000_000;
const TREASURY_PUBKEY = new PublicKey('G1NaEsx5Pg7dSmyYy6Jfraa74b7nTbmN9A9NuiK171Ma');

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

    return {
        signature: tx,
        sharesReceived: 0, // In real imp, we'd parse logs to get exact amount
        totalCost: params.solAmount,
    };
}

export default djinn_buy_shares;
