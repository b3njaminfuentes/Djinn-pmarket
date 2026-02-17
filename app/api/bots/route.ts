/**
 * GET /api/bots — Bot Leaderboard API
 *
 * Returns ranked list of bots with stats, filterable by category and sortable.
 * Queries directly from Solana Devnet using Anchor.
 */

import { NextRequest, NextResponse } from 'next/server';
import { Connection, PublicKey } from '@solana/web3.js';
import { Program, AnchorProvider, Idl, BN } from '@coral-xyz/anchor';
import idl from '@/lib/idl/djinn_market.json';

// Hardcoded for now to avoid package import issues in API route
const DJINN_PROGRAM_ID = new PublicKey('A8pVMgP6vwjGqcbYh1WGWDjXq9uwQRoF9Lz1siLmD7nm');

// Dummy wallet for read-only provider
const dummyWallet = {
    publicKey: PublicKey.default,
    signTransaction: async (tx: any) => tx,
    signAllTransactions: async (txs: any[]) => txs,
};

interface BotLeaderboardEntry {
    id: string;
    publicKey: string;
    name: string;
    owner: string;
    tier: 'Novice' | 'Verified' | 'Elite';
    category: string;
    isActive: boolean;
    isPaperTrading: boolean;
    stats: {
        totalTrades: number;
        totalVolume: number;
        winningTrades: number;
        losingTrades: number;
        winRate: number;
        pnl: number;
    };
    verification: {
        submitted: number;
        correct: number;
        accuracy: number;
        bountiesEarned: number;
    };
    reputation: {
        upvotes: number;
        downvotes: number;
        score: number;
        reportsAgainst: number;
    };
    vault?: {
        publicKey: string;
        totalAum: number;
        numDepositors: number;
        isPaused: boolean;
    };
    registeredAt: string;
    lastTradeAt: string;
    rank: number;
}

const CATEGORY_MAP = ['All', 'Sports', 'Crypto', 'Politics', 'Other'];
const TIER_MAP = ['Novice', 'Verified', 'Elite'];

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const sort = searchParams.get('sort') || 'pnl';
        const category = searchParams.get('category');
        const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100);
        const offset = parseInt(searchParams.get('offset') || '0');
        const tier = searchParams.get('tier');
        const activeOnly = searchParams.get('active') !== 'false';

        // 1. Initialize Connection & Program
        const connection = new Connection(
            process.env.NEXT_PUBLIC_RPC_URL || 'https://api.devnet.solana.com',
            'confirmed'
        );
        const provider = new AnchorProvider(connection, dummyWallet, {});
        const program = new Program(idl as Idl, DJINN_PROGRAM_ID, provider);

        // 2. Fetch All Bot Accounts
        // Note: For production, we'd use getProgramAccounts with filters or an indexer.
        // For devnet/MVP, fetching all is fine.
        const botAccounts = await program.account.botProfile.all();

        // Helper to safely convert BN or number
        const safeToNumber = (val: any) => {
            if (val === undefined || val === null) return 0;
            if (typeof val?.toNumber === 'function') return val.toNumber();
            return Number(val);
        };

        // 3. Map to Leaderboard Entries
        let bots = botAccounts.map(({ publicKey, account }: any) => {
            const acc = account;
            const totalTrades = safeToNumber(acc.totalTrades);
            const winningTrades = safeToNumber(acc.winningTrades);
            const losingTrades = safeToNumber(acc.losingTrades);
            const verificationsSubmitted = safeToNumber(acc.verificationsSubmitted);
            const verificationsCorrect = safeToNumber(acc.verificationCorrect || acc.verificationsCorrect); // Handle potential typo in IDL/Account

            // Calculate PnL (Mock for now as it's not directly on BotProfile yet, or use bounty rewards)
            const pnl = Number(acc.bountiesEarned?.toString() || 0) / 1e9; // SOL

            return {
                id: publicKey.toBase58(),
                publicKey: publicKey.toBase58(),
                name: acc.name,
                owner: acc.owner.toBase58(),
                tier: TIER_MAP[acc.tier as number] as 'Novice' | 'Verified' | 'Elite',
                category: CATEGORY_MAP[acc.strategyCategory as number] || 'Other',
                isActive: acc.isActive,
                isPaperTrading: acc.isPaperTrading ?? false,
                stats: {
                    totalTrades,
                    totalVolume: Number(acc.totalVolume.toString()) / 1e9,
                    winningTrades,
                    losingTrades,
                    winRate: totalTrades > 0 ? (winningTrades / totalTrades * 100) : 0,
                    pnl,
                },
                verification: {
                    submitted: verificationsSubmitted,
                    correct: verificationsCorrect,
                    accuracy: verificationsSubmitted > 0 ? (verificationsCorrect / verificationsSubmitted * 100) : 0,
                    bountiesEarned: Number(acc.bountiesEarned.toString()) / 1e9,
                },
                reputation: {
                    upvotes: safeToNumber(acc.communityUpvotes),
                    downvotes: safeToNumber(acc.communityDownvotes),
                    score: safeToNumber(acc.communityUpvotes) - safeToNumber(acc.communityDownvotes),
                    reportsAgainst: safeToNumber(acc.reportsAgainst),
                },
                vault: acc.hasVault ? {
                    publicKey: acc.vaultPubkey?.toBase58() || '',
                    totalAum: 0, // Need to fetch Vault account for this, skip for now to save RPC calls
                    numDepositors: 0,
                    isPaused: false,
                } : undefined,
                registeredAt: new Date(safeToNumber(acc.registeredAt) * 1000).toISOString().split('T')[0],
                lastTradeAt: new Date(safeToNumber(acc.lastTradeAt) * 1000).toISOString(),
                raw: acc // Keep raw for sorting
            } as BotLeaderboardEntry & { raw: any };
        });

        // 4. Apply Filters
        if (category && category !== 'All' && category !== 'all') {
            const catLower = category.toLowerCase();
            bots = bots.filter(b => b.category.toLowerCase() === catLower);
        }

        if (tier && tier !== 'All') {
            bots = bots.filter(b => b.tier === tier);
        }

        if (activeOnly) {
            bots = bots.filter(b => b.isActive && !b.raw.isFrozen);
        }

        // BLACKLIST (Manual Deletions)
        const BLACKLIST = [
            'BTX34k1W16XAyzJrQGSgmFV3EwALKGU7npBkHj8Esoam' // "alfred" (test bot)
        ];
        bots = bots.filter(b => !BLACKLIST.includes(b.publicKey));

        // 5. Apply Sort
        bots.sort((a, b) => {
            switch (sort) {
                case 'pnl': return b.stats.pnl - a.stats.pnl;
                case 'winrate': return b.stats.winRate - a.stats.winRate;
                case 'volume': return b.stats.totalVolume - a.stats.totalVolume;
                case 'reputation': return b.reputation.score - a.reputation.score;
                case 'trades': return b.stats.totalTrades - a.stats.totalTrades;
                case 'accuracy': return b.verification.accuracy - a.verification.accuracy;
                default: return b.stats.pnl - a.stats.pnl;
            }
        });

        // 6. Pagination
        const total = bots.length;
        const paginatedBots = bots.slice(offset, offset + limit).map((b, i) => ({
            ...b,
            rank: offset + i + 1,
            raw: undefined // Remove raw data
        }));

        return NextResponse.json({
            bots: paginatedBots,
            total,
            offset,
            limit,
            sort,
        });

    } catch (err: any) {
        console.error('Error fetching bots:', err);
        return NextResponse.json(
            { error: 'Internal server error', details: err.message },
            { status: 500 }
        );
    }
}
