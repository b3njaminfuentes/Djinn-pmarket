'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { PublicKey } from '@solana/web3.js';
import { useWallet } from '@solana/wallet-adapter-react';
import StarfieldBg from '@/components/StarfieldBg';
import { useSound } from '@/components/providers/SoundProvider';
import { useDjinnProtocol } from '@/hooks/useDjinnProtocol';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

interface BotProfileData {
    id: string;
    name: string;
    owner: string;
    tier: 'Novice' | 'Verified' | 'Elite';
    category: string;
    isActive: boolean;
    isPaperTrading: boolean;
    registeredAt: string;
    stats: {
        totalTrades: number;
        totalVolume: number;
        winningTrades: number;
        losingTrades: number;
        winRate: string;
        pnl: number;
    };
    verification: {
        submitted: number;
        correct: number;
        accuracy: string;
        bountiesEarned: number;
    };
    reputation: {
        score: number;
        upvotes: number;
        downvotes: number;
    };
    vault?: {
        publicKey: string;
        totalAum: number;
        maxAum: number;
        numDepositors: number;
        totalProfit: number;
        totalLoss: number;
        highWaterMark: number;
        isPaused: boolean;
        isLiquidating: boolean;
    };
    recentTrades: Array<{
        market: string;
        position: string;
        amount: number;
        result: string;
        pnl: number;
        date: string;
    }>;
    theses: Array<{
        title: string;
        confidence: number;
        date: string;
        summary: string;
    }>;
}

const TIER_CONFIG = {
    Novice: { bg: 'bg-gray-200', icon: '🌱' },
    Verified: { bg: 'bg-blue-100', icon: '✅' },
    Elite: { bg: 'bg-amber-100', icon: '👑' },
};

const CATEGORY_ICONS: Record<string, string> = {
    All: '🌐', Sports: '⚽', Crypto: '₿', Politics: '🏛️', Other: '🔮',
};

type Tab = 'trades' | 'theses' | 'vault';

// ═══════════════════════════════════════════════════════════════════════════════
// SKELETON
// ═══════════════════════════════════════════════════════════════════════════════

function ProfileSkeleton() {
    return (
        <div className="max-w-[1200px] mx-auto relative z-10 animate-pulse">
            <div className="h-4 bg-white/10 rounded w-40 mb-6" />
            <div className="bg-white/5 border border-white/10 rounded-[2rem] p-8 mb-8">
                <div className="flex items-center gap-6">
                    <div className="w-24 h-24 rounded-2xl bg-white/10" />
                    <div className="flex-1 space-y-3">
                        <div className="h-8 bg-white/10 rounded-lg w-48" />
                        <div className="h-4 bg-white/5 rounded-lg w-64" />
                    </div>
                    <div className="w-20 h-20 rounded-full bg-white/10" />
                </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
                {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="bg-white/5 border border-white/10 rounded-2xl p-4 h-20" />
                ))}
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export default function BotProfilePage() {
    const params = useParams();
    const { play } = useSound();
    const botId = params.id as string;

    const { publicKey: walletPubkey } = useWallet();
    const { depositToVault, withdrawFromVault } = useDjinnProtocol();

    const [bot, setBot] = useState<BotProfileData | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [notFound, setNotFound] = useState(false);
    const [activeTab, setActiveTab] = useState<Tab>('trades');
    const [vaultAmount, setVaultAmount] = useState('');
    const [vaultAction, setVaultAction] = useState<'deposit' | 'withdraw'>('deposit');
    const [vaultTxLoading, setVaultTxLoading] = useState(false);
    const [vaultTxError, setVaultTxError] = useState('');
    const [vaultTxSuccess, setVaultTxSuccess] = useState('');

    useEffect(() => {
        const fetchBot = async () => {
            setIsLoading(true);
            try {
                const res = await fetch(`/api/bot/${botId}?include=vault`);
                if (res.status === 404) {
                    setNotFound(true);
                    return;
                }
                if (!res.ok) throw new Error('Failed to fetch bot');
                const data = await res.json();
                setBot(data);
            } catch {
                setNotFound(true);
            } finally {
                setIsLoading(false);
            }
        };
        fetchBot();
    }, [botId]);

    const formatSol = (n: number) => {
        if (Math.abs(n) >= 1000) return `${(n / 1000).toFixed(1)}K`;
        if (Math.abs(n) >= 1) return n.toFixed(2);
        if (Math.abs(n) >= 0.001) return n.toFixed(4);
        return '0';
    };

    // Loading
    if (isLoading) {
        return (
            <main className="min-h-screen bg-black text-white pb-20 pt-28 px-6 relative font-sans overflow-hidden">
                <StarfieldBg />
                <ProfileSkeleton />
            </main>
        );
    }

    // Not Found
    if (notFound || !bot) {
        return (
            <main className="min-h-screen bg-black text-white pb-20 pt-28 px-6 relative font-sans overflow-hidden">
                <StarfieldBg />
                <div className="max-w-[1200px] mx-auto relative z-10 text-center py-32">
                    <motion.div
                        animate={{ y: [0, -10, 0] }}
                        transition={{ repeat: Infinity, duration: 2 }}
                    >
                        <div className="text-6xl mb-6">👻</div>
                    </motion.div>
                    <h2 className="font-black text-3xl text-white lowercase mb-2">bot not found</h2>
                    <p className="text-gray-400 mb-6">this agent may have been deregistered or doesn&apos;t exist</p>
                    <Link
                        href="/bots"
                        className="bg-[#F492B7] text-black font-black px-8 py-3 rounded-full border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:translate-y-0.5 transition-all inline-block"
                    >
                        Back to Leaderboard
                    </Link>
                </div>
            </main>
        );
    }

    const tier = TIER_CONFIG[bot.tier] || TIER_CONFIG.Novice;
    const repScore = bot.reputation?.score ?? 0;
    const winRate = parseFloat(bot.stats.winRate) || 0;
    const accuracy = parseFloat(bot.verification.accuracy) || 0;

    return (
        <main className="min-h-screen bg-black text-white pb-20 pt-28 px-6 relative font-sans overflow-hidden">
            <StarfieldBg />
            <style jsx global>{`::selection { background-color: #F492B7; color: black; }`}</style>

            <div className="max-w-[1200px] mx-auto relative z-10">

                {/* BACK LINK */}
                <Link href="/bots" className="inline-flex items-center gap-2 text-gray-400 hover:text-white font-bold text-sm mb-6 transition-colors">
                    ← back to leaderboard
                </Link>

                {/* HERO CARD */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-white border-4 border-black rounded-[2rem] p-8 mb-8 shadow-[8px_8px_0px_0px_#F492B7] relative overflow-hidden"
                >
                    <div className="absolute top-0 right-0 text-[180px] font-black text-gray-100/50 leading-none select-none -translate-y-8 translate-x-4">
                        {CATEGORY_ICONS[bot.category] || '🤖'}
                    </div>

                    <div className="relative z-10 flex flex-col sm:flex-row items-start sm:items-center gap-6">
                        {/* Avatar */}
                        <div className="relative">
                            <div className="w-24 h-24 rounded-2xl border-4 border-black bg-gray-100 flex items-center justify-center text-5xl shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
                                {CATEGORY_ICONS[bot.category] || '🤖'}
                            </div>
                            <div className={`absolute -bottom-2 -right-2 px-2 py-1 rounded-full border-2 border-black text-xs font-black ${tier.bg}`}>
                                {tier.icon} {bot.tier}
                            </div>
                            <div className={`absolute -top-1 -left-1 w-4 h-4 rounded-full border-2 border-white ${bot.isActive ? 'bg-green-500' : 'bg-gray-400'}`} />
                        </div>

                        {/* Info */}
                        <div className="flex-1">
                            <h1 className="text-4xl font-black text-black lowercase tracking-tight">{bot.name}</h1>
                            <div className="flex flex-wrap items-center gap-3 mt-2">
                                <span className="bg-gray-100 border-2 border-black rounded-full px-3 py-1 text-sm font-bold text-black font-mono">
                                    {bot.owner.slice(0, 6)}...{bot.owner.slice(-4)}
                                </span>
                                <span className="bg-gray-100 border border-gray-300 rounded-full px-3 py-1 text-xs font-bold text-gray-600">
                                    {CATEGORY_ICONS[bot.category]} {bot.category}
                                </span>
                                <span className="text-gray-400 text-xs font-bold">
                                    Since {new Date(bot.registeredAt).toLocaleDateString()}
                                </span>
                                {bot.isPaperTrading && (
                                    <span className="bg-yellow-100 text-yellow-700 border border-yellow-300 rounded-full px-3 py-1 text-xs font-black uppercase">Paper</span>
                                )}
                            </div>
                        </div>

                        {/* Reputation */}
                        <div className="flex flex-col items-center">
                            <div className={`w-20 h-20 rounded-full border-4 border-black flex items-center justify-center text-3xl font-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] ${repScore >= 10 ? 'bg-[#10B981] text-white' :
                                    repScore >= 0 ? 'bg-yellow-300 text-black' :
                                        'bg-red-400 text-white'
                                }`}>
                                {repScore}
                            </div>
                            <span className="text-[10px] font-black uppercase text-gray-400 mt-1">Reputation</span>
                        </div>
                    </div>
                </motion.div>

                {/* STAT CARDS */}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
                    {[
                        { label: 'PnL', value: `${bot.stats.pnl >= 0 ? '+' : ''}${formatSol(bot.stats.pnl)} ◎`, color: bot.stats.pnl >= 0 ? 'bg-[#10B981]' : 'bg-red-500', txtColor: 'text-white' },
                        { label: 'Win Rate', value: `${winRate.toFixed(1)}%`, color: winRate >= 65 ? 'bg-[#10B981]' : 'bg-yellow-400', txtColor: winRate >= 65 ? 'text-white' : 'text-black' },
                        { label: 'Total Trades', value: bot.stats.totalTrades.toLocaleString(), color: 'bg-white', txtColor: 'text-black' },
                        { label: 'Volume', value: `${formatSol(bot.stats.totalVolume)} ◎`, color: 'bg-white', txtColor: 'text-black' },
                        { label: 'Accuracy', value: `${accuracy.toFixed(1)}%`, color: 'bg-purple-100', txtColor: 'text-purple-700' },
                        { label: 'Bounties', value: `${formatSol(bot.verification.bountiesEarned)} ◎`, color: 'bg-[#F492B7]', txtColor: 'text-black' },
                    ].map((stat, i) => (
                        <motion.div
                            key={stat.label}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: i * 0.05 }}
                            className={`${stat.color} border-3 border-black rounded-2xl p-4 text-center shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]`}
                        >
                            <div className="text-[10px] font-black uppercase tracking-wider text-gray-500 mb-1">{stat.label}</div>
                            <div className={`text-2xl font-black italic ${stat.txtColor}`}>{stat.value}</div>
                        </motion.div>
                    ))}
                </div>

                {/* TAB BAR */}
                <div className="bg-[#121212] border-2 border-white/20 rounded-full p-1.5 flex gap-1.5 backdrop-blur-md mb-8 w-fit">
                    {([
                        { key: 'trades' as Tab, label: 'Trades', count: bot.recentTrades?.length },
                        { key: 'theses' as Tab, label: 'Theses', count: bot.theses?.length },
                        { key: 'vault' as Tab, label: 'Vault', count: bot.vault ? 1 : 0 },
                    ]).map(tab => (
                        <button
                            key={tab.key}
                            onClick={() => { setActiveTab(tab.key); play('toggle'); }}
                            className={`px-5 py-2 rounded-full text-sm font-black lowercase transition-all border-2 ${activeTab === tab.key
                                    ? 'bg-white border-white text-black shadow-[3px_3px_0px_0px_#F492B7] -translate-y-0.5'
                                    : 'bg-transparent border-white/20 text-gray-400 hover:text-white hover:border-white/40'
                                }`}
                        >
                            {tab.label} {tab.count ? `(${tab.count})` : ''}
                        </button>
                    ))}
                </div>

                {/* TRADES TAB */}
                {activeTab === 'trades' && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="bg-white border-4 border-black rounded-[2rem] overflow-hidden">
                        <div className="flex items-center justify-between px-8 py-4 bg-black text-white border-b-4 border-black">
                            <span className="text-sm font-black uppercase tracking-widest text-[#F492B7]">Recent Trades</span>
                            <div className="flex gap-8 text-sm font-black uppercase tracking-widest">
                                <span>Position</span>
                                <span className="w-20 text-right">Amount</span>
                                <span className="w-20 text-right">PnL</span>
                            </div>
                        </div>
                        <div className="divide-y-2 divide-black">
                            {(bot.recentTrades || []).map((trade, i) => (
                                <motion.div
                                    key={i}
                                    initial={{ opacity: 0, x: -20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{ delay: i * 0.05 }}
                                    className="flex items-center justify-between py-4 px-6 hover:bg-[#FFF5F7] transition-colors"
                                >
                                    <div className="flex items-center gap-4 flex-1">
                                        <div className={`w-8 h-8 rounded-xl border-2 border-black flex items-center justify-center text-xs font-black ${trade.result === 'won' ? 'bg-[#10B981] text-white' : 'bg-red-400 text-white'}`}>
                                            {trade.result === 'won' ? 'W' : 'L'}
                                        </div>
                                        <div>
                                            <div className="font-black text-black text-sm">{trade.market}</div>
                                            <div className="text-gray-400 text-xs font-bold">{trade.date}</div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-8">
                                        <span className={`font-bold text-sm px-3 py-1 rounded-full border-2 border-black ${trade.position === 'Yes' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
                                            {trade.position}
                                        </span>
                                        <span className="font-bold text-black w-20 text-right">{formatSol(trade.amount)} ◎</span>
                                        <span className={`font-black w-20 text-right text-lg italic ${trade.pnl >= 0 ? 'text-[#10B981]' : 'text-red-500'}`}>
                                            {trade.pnl >= 0 ? '+' : ''}{formatSol(Math.abs(trade.pnl))} ◎
                                        </span>
                                    </div>
                                </motion.div>
                            ))}
                            {(!bot.recentTrades || bot.recentTrades.length === 0) && (
                                <div className="py-16 text-center text-gray-400">
                                    <motion.div animate={{ y: [0, -6, 0] }} transition={{ repeat: Infinity, duration: 2 }}>
                                        <div className="text-4xl mb-3">📊</div>
                                    </motion.div>
                                    <div className="font-black text-xl mb-1">no trades yet</div>
                                    <div className="text-sm">this bot is warming up in the arena</div>
                                </div>
                            )}
                        </div>
                    </motion.div>
                )}

                {/* THESES TAB */}
                {activeTab === 'theses' && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
                        {(bot.theses || []).map((thesis, i) => (
                            <motion.div
                                key={i}
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: i * 0.1 }}
                                className="bg-white border-4 border-black rounded-[2rem] p-6 shadow-[6px_6px_0px_0px_rgba(255,255,255,0.2)] hover:shadow-[8px_8px_0px_0px_#F492B7] transition-all"
                            >
                                <div className="flex items-start justify-between mb-3">
                                    <h3 className="font-black text-black text-xl">{thesis.title}</h3>
                                    <div className={`px-3 py-1 rounded-full border-2 border-black font-black text-sm ${thesis.confidence >= 80 ? 'bg-[#10B981] text-white' :
                                            thesis.confidence >= 60 ? 'bg-yellow-300 text-black' : 'bg-red-400 text-white'
                                        }`}>
                                        {thesis.confidence}% confidence
                                    </div>
                                </div>
                                <p className="text-gray-600 text-sm leading-relaxed mb-3">{thesis.summary}</p>
                                <div className="text-gray-400 text-xs font-bold">{thesis.date}</div>
                            </motion.div>
                        ))}
                        {(!bot.theses || bot.theses.length === 0) && (
                            <div className="bg-white border-4 border-black rounded-[2rem] py-16 text-center">
                                <motion.div animate={{ y: [0, -6, 0] }} transition={{ repeat: Infinity, duration: 2 }}>
                                    <div className="text-4xl mb-3">📝</div>
                                </motion.div>
                                <div className="font-black text-black text-xl mb-1">no theses published</div>
                                <div className="text-gray-400 text-sm">this bot hasn&apos;t shared any research yet</div>
                            </div>
                        )}
                    </motion.div>
                )}

                {/* VAULT TAB */}
                {activeTab === 'vault' && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                        {bot.vault ? (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                {/* Vault Stats */}
                                <div className="bg-white border-4 border-black rounded-[2rem] p-6 shadow-[6px_6px_0px_0px_#F492B7]">
                                    <div className="flex items-center justify-between mb-6">
                                        <h3 className="text-2xl font-black text-black lowercase">vault stats</h3>
                                        <div className={`px-3 py-1 rounded-full text-xs font-black uppercase border-2 ${bot.vault.isPaused
                                                ? 'bg-red-100 text-red-600 border-red-300'
                                                : 'bg-green-100 text-green-700 border-green-300'
                                            }`}>
                                            {bot.vault.isPaused ? 'Circuit Breaker' : 'Active'}
                                        </div>
                                    </div>
                                    <div className="space-y-4">
                                        <div className="flex justify-between items-center py-3 border-b-2 border-gray-100">
                                            <span className="font-bold text-gray-500 text-sm uppercase">Total AUM</span>
                                            <span className="font-black text-2xl text-purple-700">{formatSol(bot.vault.totalAum)} ◎</span>
                                        </div>
                                        <div className="flex justify-between items-center py-3 border-b-2 border-gray-100">
                                            <span className="font-bold text-gray-500 text-sm uppercase">High Water Mark</span>
                                            <span className="font-black text-xl text-black">{formatSol(bot.vault.highWaterMark)} ◎</span>
                                        </div>
                                        <div className="flex justify-between items-center py-3 border-b-2 border-gray-100">
                                            <span className="font-bold text-gray-500 text-sm uppercase">Depositors</span>
                                            <span className="font-black text-xl text-black">{bot.vault.numDepositors}</span>
                                        </div>
                                        <div className="flex justify-between items-center py-3">
                                            <span className="font-bold text-gray-500 text-sm uppercase">Performance Fee</span>
                                            <span className="font-black text-xl text-[#F492B7]">20%</span>
                                        </div>
                                    </div>
                                    {/* Profit Split */}
                                    <div className="mt-6 bg-gray-50 border-2 border-black rounded-xl p-4">
                                        <div className="text-[10px] font-black uppercase text-gray-400 mb-3">Profit Distribution</div>
                                        <div className="flex gap-2">
                                            <div className="flex-1 bg-[#10B981] rounded-lg p-2 text-center border border-black">
                                                <div className="text-white font-black text-lg">70%</div>
                                                <div className="text-green-900 text-[9px] font-black uppercase">Depositors</div>
                                            </div>
                                            <div className="flex-1 bg-blue-500 rounded-lg p-2 text-center border border-black">
                                                <div className="text-white font-black text-lg">20%</div>
                                                <div className="text-blue-100 text-[9px] font-black uppercase">Bot Owner</div>
                                            </div>
                                            <div className="flex-1 bg-[#F492B7] rounded-lg p-2 text-center border border-black">
                                                <div className="text-black font-black text-lg">10%</div>
                                                <div className="text-black/60 text-[9px] font-black uppercase">Insurance</div>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Deposit / Withdraw */}
                                <div className="bg-gradient-to-br from-[#1a1a2e] to-[#16213e] border-4 border-white/20 rounded-[2rem] p-6 flex flex-col justify-between">
                                    <div>
                                        <h3 className="text-2xl font-black text-white lowercase mb-2">invest in {bot.name}</h3>
                                        <p className="text-gray-400 text-sm mb-6">Deposit SOL to earn from this bot&apos;s autonomous trading strategy. 70% of profits go to depositors.</p>
                                        <div className="mb-6">
                                            <div className="flex justify-between mb-2">
                                                <span className="text-xs font-black text-gray-400 uppercase">Vault Capacity</span>
                                                <span className="text-xs font-black text-white">
                                                    {formatSol(bot.vault.totalAum)} / {formatSol(bot.vault.maxAum)} ◎
                                                </span>
                                            </div>
                                            <div className="w-full h-3 bg-white/10 rounded-full overflow-hidden border border-white/20">
                                                <div
                                                    className="h-full bg-gradient-to-r from-[#F492B7] to-purple-500 rounded-full"
                                                    style={{ width: `${bot.vault.maxAum > 0 ? Math.min((bot.vault.totalAum / bot.vault.maxAum) * 100, 100) : 0}%` }}
                                                />
                                            </div>
                                        </div>
                                        <div className="bg-white/5 rounded-xl p-4 border border-white/10 mb-6">
                                            <div className="text-[10px] font-black uppercase text-[#F492B7] mb-2">Circuit Breakers</div>
                                            <div className="flex gap-4 text-xs text-gray-400">
                                                <div><span className="font-black text-yellow-400">-20%</span> Auto-pause</div>
                                                <div><span className="font-black text-red-400">-30%</span> Liquidation</div>
                                            </div>
                                        </div>
                                    </div>
                                    {/* Amount Input */}
                                    <div className="mb-4">
                                        <div className="flex gap-2 mb-3">
                                            <button
                                                onClick={() => setVaultAction('deposit')}
                                                className={`flex-1 py-2 rounded-full text-xs font-black uppercase border-2 transition-all ${vaultAction === 'deposit' ? 'bg-[#10B981] text-white border-[#10B981]' : 'bg-transparent text-gray-400 border-white/20'}`}
                                            >
                                                Deposit
                                            </button>
                                            <button
                                                onClick={() => setVaultAction('withdraw')}
                                                className={`flex-1 py-2 rounded-full text-xs font-black uppercase border-2 transition-all ${vaultAction === 'withdraw' ? 'bg-red-500 text-white border-red-500' : 'bg-transparent text-gray-400 border-white/20'}`}
                                            >
                                                Withdraw
                                            </button>
                                        </div>
                                        <div className="flex items-center bg-white/10 border-2 border-white/20 rounded-xl px-4 py-3">
                                            <input
                                                type="number"
                                                placeholder="0.0"
                                                value={vaultAmount}
                                                onChange={(e) => setVaultAmount(e.target.value)}
                                                className="bg-transparent text-white font-black text-xl flex-1 outline-none placeholder:text-gray-600"
                                                step="0.1"
                                                min="0"
                                            />
                                            <span className="text-gray-400 font-black text-sm ml-2">SOL</span>
                                        </div>
                                    </div>

                                    {vaultTxError && (
                                        <div className="bg-red-500/20 border border-red-500/40 rounded-xl px-4 py-2 mb-3 text-red-400 text-xs font-bold">
                                            {vaultTxError}
                                        </div>
                                    )}
                                    {vaultTxSuccess && (
                                        <div className="bg-green-500/20 border border-green-500/40 rounded-xl px-4 py-2 mb-3 text-green-400 text-xs font-bold">
                                            {vaultTxSuccess}
                                        </div>
                                    )}

                                    <button
                                        disabled={vaultTxLoading || !walletPubkey || !vaultAmount || parseFloat(vaultAmount) <= 0}
                                        onClick={async () => {
                                            if (!bot?.vault?.publicKey || !vaultAmount) return;
                                            setVaultTxLoading(true);
                                            setVaultTxError('');
                                            setVaultTxSuccess('');
                                            try {
                                                const vaultPda = new PublicKey(bot.vault.publicKey);
                                                const amount = parseFloat(vaultAmount);
                                                if (vaultAction === 'deposit') {
                                                    await depositToVault(vaultPda, amount);
                                                    setVaultTxSuccess(`Deposited ${amount} SOL`);
                                                } else {
                                                    await withdrawFromVault(vaultPda, amount);
                                                    setVaultTxSuccess(`Withdrew ${amount} SOL`);
                                                }
                                                setVaultAmount('');
                                            } catch (e: unknown) {
                                                const msg = e instanceof Error ? e.message : 'Transaction failed';
                                                setVaultTxError(msg);
                                            } finally {
                                                setVaultTxLoading(false);
                                            }
                                        }}
                                        className={`w-full font-black text-sm px-6 py-3 rounded-full border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:translate-y-0.5 transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
                                            vaultAction === 'deposit' ? 'bg-[#10B981] text-white' : 'bg-red-500 text-white'
                                        }`}
                                    >
                                        {vaultTxLoading ? 'Processing...' : vaultAction === 'deposit' ? `Deposit ${vaultAmount || '0'} SOL` : `Withdraw ${vaultAmount || '0'} SOL`}
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div className="bg-white border-4 border-black rounded-[2rem] py-16 text-center">
                                <div className="text-4xl mb-3">🏦</div>
                                <div className="font-black text-black text-xl mb-1">no vault available</div>
                                <div className="text-gray-400 text-sm">this bot hasn&apos;t opened a vault · Verified tier required</div>
                            </div>
                        )}
                    </motion.div>
                )}
            </div>
        </main>
    );
}
