/**
 * GET /api/bot/[id] — Single Bot Profile API
 * GET /api/bot/[id]/trades — Bot's trade history
 * GET /api/bot/[id]/theses — Bot's published theses
 *
 * Fetches directly from Solana Devnet using Anchor.
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

const CATEGORY_MAP = ['All', 'Sports', 'Crypto', 'Politics', 'Other'];
const TIER_MAP = ['Novice', 'Verified', 'Elite'];

export async function GET(
    request: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        const botId = params.id;
        const { searchParams } = new URL(request.url);
        const include = searchParams.get('include') || ''; // trades,theses,vault

        // 1. Initialize Connection & Program
        const connection = new Connection(
            process.env.NEXT_PUBLIC_RPC_URL || 'https://api.devnet.solana.com',
            'confirmed'
        );
        const provider = new AnchorProvider(connection, dummyWallet, {});
        const program = new Program(idl as Idl, DJINN_PROGRAM_ID, provider);

        // 2. Fetch Bot Profile
        let botAccount;
        try {
            botAccount = await program.account.botProfile.fetch(new PublicKey(botId));
        } catch (e) {
            return NextResponse.json({ error: 'Bot not found' }, { status: 404 });
        }

        const acc = botAccount as any;
        const totalTrades = acc.totalTrades.toNumber();
        const winningTrades = acc.winningTrades.toNumber();

        const response: any = {
            id: botId,
            publicKey: botId,
            name: acc.name,
            owner: acc.owner.toBase58(),
            metadataUri: acc.metadataUri,
            tier: TIER_MAP[acc.tier as number],
            category: CATEGORY_MAP[acc.strategyCategory as number] || 'Other',
            isActive: acc.isActive,
            isPaperTrading: acc.isPaperTrading, // Now in struct
            isFrozen: acc.isFrozen,
            stake: Number(acc.stake.toString()),
            stats: {
                totalTrades: totalTrades,
                totalVolume: Number(acc.totalVolume.toString()) / 1e9,
                winningTrades: winningTrades,
                losingTrades: acc.losingTrades.toNumber(),
                winRate: totalTrades > 0
                    ? (winningTrades / totalTrades * 100).toFixed(1)
                    : '0.0',
                pnl: Number(acc.bountiesEarned.toString()) / 1e9, // Proxy for now
            },
            verification: {
                submitted: acc.verificationsSubmitted.toNumber(),
                correct: acc.verificationsCorrect.toNumber(),
                wrong: acc.verificationsWrong.toNumber(),
                accuracy: acc.verificationsSubmitted.toNumber() > 0
                    ? (acc.verificationsCorrect.toNumber() / acc.verificationsSubmitted.toNumber() * 100).toFixed(1)
                    : '0.0',
                bountiesEarned: Number(acc.bountiesEarned.toString()) / 1e9,
            },
            reputation: {
                upvotes: acc.communityUpvotes.toNumber(),
                downvotes: acc.communityDownvotes.toNumber(),
                score: acc.communityUpvotes.toNumber() - acc.communityDownvotes.toNumber(),
                reportsAgainst: acc.reportsAgainst.toNumber(),
                slashingIncidents: acc.slashingIncidents.toNumber(),
            },
            registeredAt: new Date(acc.registeredAt.toNumber() * 1000).toISOString(),
            lastTradeAt: new Date(acc.lastTradeAt.toNumber() * 1000).toISOString(),
        };

        // 3. Include Vault Info if requested
        if (include.includes('vault') && acc.hasVault) {
            const vaultPubkey = acc.vaultPubkey;
            if (vaultPubkey) {
                try {
                    const vaultAccount: any = await program.account.agentVault.fetch(vaultPubkey);
                    response.vault = {
                        publicKey: vaultPubkey.toBase58(),
                        totalAum: Number(vaultAccount.totalAum.toString()) / 1e9,
                        maxAum: Number(vaultAccount.maxTotalAum.toString()) / 1e9,
                        numDepositors: Number(vaultAccount.numDepositors.toString()),
                        totalProfit: Number(vaultAccount.totalProfit.toString()) / 1e9,
                        totalLoss: Number(vaultAccount.totalLoss.toString()) / 1e9,
                        highWaterMark: Number(vaultAccount.highWaterMark.toString()) / 1e9,
                        isPaused: vaultAccount.isPaused,
                        isLiquidating: vaultAccount.isLiquidating,
                        createdAt: new Date(vaultAccount.createdAt.toNumber() * 1000).toISOString(),
                        lastDistribution: new Date(vaultAccount.lastProfitDistribution.toNumber() * 1000).toISOString(),
                    };
                } catch (e) {
                    console.error('Failed to fetch vault:', e);
                    // Vault might be initialized but account not found (unlikely) or fetch failed
                }
            }
        }

        // 4. Mock Trades/Theses (until indexed)
        response.recentTrades = [];
        response.theses = [];

        return NextResponse.json(response);

    } catch (err: any) {
        console.error('Error fetching bot:', err);
        return NextResponse.json(
            { error: 'Internal server error', details: err.message },
            { status: 500 }
        );
    }
}
