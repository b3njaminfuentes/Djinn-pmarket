import { PublicKey } from '@solana/web3.js';

// Djinn Prediction Market - Program ID
export const PROGRAM_ID = new PublicKey(process.env.NEXT_PUBLIC_PROGRAM_ID || "A8pVMgP6vwjGqcbYh1WGWDjXq9uwQRoF9Lz1siLmD7nm");

// Fee constants (Matches V3 Verified Smart Contract)
export const MARKET_CREATION_FEE = 30_000_000; // ~0.03 SOL ($3 USD approx)
export const TRADING_FEE_BPS = 100; // 1.0% Total
export const TRADING_FEE_CREATOR_BPS = 50; // 0.5% (Half of trading fee)
export const RESOLUTION_FEE_BPS = 200; // 2.0%

export const BPS_DENOMINATOR = 10_000;

// Protocol authority (your wallet address)
export const PROTOCOL_AUTHORITY = new PublicKey(process.env.NEXT_PUBLIC_PROTOCOL_AUTHORITY || 'G1NaEsx5Pg7dSmyYy6Jfraa74b7nTbmN9A9NuiK171Ma');

// Network configuration
export const NETWORK = process.env.NEXT_PUBLIC_SOLANA_NETWORK || 'devnet';
export const RPC_ENDPOINT = process.env.NEXT_PUBLIC_RPC_ENDPOINT || 'https://api.devnet.solana.com';

// Calculate fees
export function calculateTradingFee(amount: number): number {
    return Math.floor((amount * TRADING_FEE_BPS) / BPS_DENOMINATOR);
}

export function calculateResolutionFee(totalPool: number): number {
    return Math.floor((totalPool * RESOLUTION_FEE_BPS) / BPS_DENOMINATOR);
}

export function splitTradingFee(fee: number): { creatorFee: number; protocolFee: number } {
    // 50/50 Split logic
    const creatorShare = Math.floor(fee / 2);
    const protocolShare = fee - creatorShare;
    return { creatorFee: creatorShare, protocolFee: protocolShare };
}
