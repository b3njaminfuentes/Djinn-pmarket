/**
 * djinn_sell_shares — Execute a sell trade on a Djinn prediction market
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

export interface SellSharesParams {
    marketId: string;
    outcome: number;       // 0 = YES/first, 1 = NO/second, etc.
    sharesAmount: number;   // Amount of shares to sell (integer/float?) -> 1 share = 1 * 1e9? 
    // Usually shares are tracked with 9 decimals like SOL.
    // If input is "10 shares", we multiply by 1e9.
    minSolReceived?: number; // Slippage protection
}

export interface SellSharesResult {
    signature: string;
    solReceived: number; // Estimated
}

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

export async function djinn_sell_shares(
    params: SellSharesParams
): Promise<SellSharesResult> {
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

    // Shares are 9 decimals usually
    const shares = new BN(Math.floor(params.sharesAmount * 1_000_000_000));
    const outcomeIndex = params.outcome;

    // Derive PDAs
    const marketPubkey = new PublicKey(params.marketId);

    const [marketVault] = PublicKey.findProgramAddressSync(
        [Buffer.from('market_vault'), marketPubkey.toBuffer()],
        DJINN_PROGRAM_ID
    );

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

    console.log(`[Djinn] Selling ${params.sharesAmount} shares of outcome ${params.outcome} on market ${params.marketId}`);

    const marketAccount = await (program.account as any).market.fetch(marketPubkey);
    const marketCreator = marketAccount.creator as PublicKey;

    const tx = await program.methods
        .sellShares(outcomeIndex, shares)
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
        solReceived: 0,
    };
}

export default djinn_sell_shares;
