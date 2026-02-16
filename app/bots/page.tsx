'use client';

import React, { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import StarfieldBg from '@/components/StarfieldBg';
import { useSound } from '@/components/providers/SoundProvider';
import RegisterBotModal from '@/components/RegisterBotModal';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

type BotTier = 'Novice' | 'Verified' | 'Elite';
type Category = 'All' | 'Sports' | 'Crypto' | 'Politics' | 'Other';

interface BotEntry {
    id: string;
    name: string;
    owner: string;
    avatar: string;
    tier: BotTier;
    category: Category;
    isActive: boolean;
    isPaperTrading: boolean;
    stats: {
        totalTrades: number;
        winRate: number;
        pnl: number;
        totalVolume: number;
    };
    verification: {
        accuracy: number;
        bountiesEarned: number;
    };
    vault?: {
        totalAum: number;
        numDepositors: number;
        isPaused: boolean;
    };
    registeredAt: string;
}

const TIER_CONFIG: Record<BotTier, { color: string; bg: string; icon: string }> = {
    Novice: { color: 'text-gray-600', bg: 'bg-gray-200', icon: '🌱' },
    Verified: { color: 'text-blue-600', bg: 'bg-blue-100', icon: '✅' },
    Elite: { color: 'text-amber-500', bg: 'bg-amber-100', icon: '👑' },
};

const CATEGORY_ICONS: Record<Category, string> = {
    All: '🌐',
    Sports: '⚽',
    Crypto: '₿',
    Politics: '🏛️',
    Other: '🔮',
};

type SortKey = 'pnl' | 'winRate' | 'volume' | 'trades' | 'accuracy' | 'aum';
const SORT_OPTIONS: { key: SortKey; label: string }[] = [
    { key: 'pnl', label: 'PnL' },
    { key: 'winRate', label: 'Win Rate' },
    { key: 'volume', label: 'Volume' },
    { key: 'trades', label: 'Trades' },
    { key: 'accuracy', label: 'Accuracy' },
    { key: 'aum', label: 'Vault AUM' },
];

// ═══════════════════════════════════════════════════════════════════════════════
// API → BotEntry mapper
// ═══════════════════════════════════════════════════════════════════════════════

interface ApiBotEntry {
    id: string;
    publicKey: string;
    name: string;
    owner: string;
    tier: BotTier;
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

function mapApiBot(api: ApiBotEntry): BotEntry {
    const avatars: Record<string, string> = {
        Crypto: '₿', Sports: '⚽', Politics: '🏛️', All: '🌐', Other: '🔮',
    };
    return {
        id: api.id,
        name: api.name,
        owner: api.owner.slice(0, 6) + '...',
        avatar: avatars[api.category] || '🤖',
        tier: api.tier,
        category: (api.category as Category) || 'Other',
        isActive: api.isActive,
        isPaperTrading: api.isPaperTrading,
        stats: {
            totalTrades: api.stats.totalTrades,
            winRate: Math.round(api.stats.winRate * 10) / 10,
            pnl: api.stats.pnl,
            totalVolume: api.stats.totalVolume,
        },
        verification: {
            accuracy: Math.round(api.verification.accuracy * 10) / 10,
            bountiesEarned: api.verification.bountiesEarned,
        },
        vault: api.vault ? {
            totalAum: api.vault.totalAum,
            numDepositors: api.vault.numDepositors,
            isPaused: api.vault.isPaused,
        } : undefined,
        registeredAt: api.registeredAt,
    };
}

// ═══════════════════════════════════════════════════════════════════════════════
// SKELETON LOADER
// ═══════════════════════════════════════════════════════════════════════════════

function LeaderboardSkeleton() {
    return (
        <div className="divide-y-2 divide-black">
            {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4 py-5 px-6 animate-pulse">
                    <div className="w-10 h-10 rounded-2xl bg-gray-200 border-2 border-black" />
                    <div className="w-12 h-12 rounded-full bg-gray-200 border-2 border-black" />
                    <div className="flex-1 space-y-2">
                        <div className="h-5 bg-gray-200 rounded-lg w-32" />
                        <div className="h-3 bg-gray-100 rounded-lg w-48" />
                    </div>
                    <div className="hidden sm:flex gap-6">
                        <div className="h-6 bg-gray-200 rounded-lg w-16" />
                        <div className="h-6 bg-gray-200 rounded-lg w-12" />
                    </div>
                </div>
            ))}
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

function BotsLeaderboardContent() {
    const { play } = useSound();
    const [sortBy, setSortBy] = useState<SortKey>('pnl');
    const [categoryFilter, setCategoryFilter] = useState<Category | 'All'>('All');
    const [tierFilter, setTierFilter] = useState<BotTier | 'All'>('All');
    const [showPaperTrading, setShowPaperTrading] = useState(false);
    const [isRegisterOpen, setIsRegisterOpen] = useState(false);

    // Real data state
    const [bots, setBots] = useState<BotEntry[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [fetchError, setFetchError] = useState<string | null>(null);

    // Magic Link Logic
    const searchParams = useSearchParams();
    const initialBotName = searchParams.get('name');
    const initialCategory = searchParams.get('category');

    useEffect(() => {
        if (initialBotName) {
            setIsRegisterOpen(true);
        }
    }, [initialBotName]);

    // Fetch real bots from Devnet
    const fetchBots = async () => {
        setIsLoading(true);
        setFetchError(null);
        try {
            const res = await fetch('/api/bots?sort=pnl&limit=50&active=false');
            if (!res.ok) throw new Error(`Failed to fetch bots (${res.status})`);
            const data = await res.json();
            const mapped = (data.bots || []).map(mapApiBot);
            setBots(mapped);
        } catch (err) {
            setFetchError(err instanceof Error ? err.message : 'Unknown error');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchBots();
    }, []);

    // Sort + Filter
    const sortedBots = [...bots]
        .filter(b => {
            if (categoryFilter !== 'All' && b.category !== categoryFilter) return false;
            if (tierFilter !== 'All' && b.tier !== tierFilter) return false;
            if (!showPaperTrading && b.isPaperTrading) return false;
            return true;
        })
        .sort((a, b) => {
            switch (sortBy) {
                case 'pnl': return b.stats.pnl - a.stats.pnl;
                case 'winRate': return b.stats.winRate - a.stats.winRate;
                case 'volume': return b.stats.totalVolume - a.stats.totalVolume;
                case 'trades': return b.stats.totalTrades - a.stats.totalTrades;
                case 'accuracy': return b.verification.accuracy - a.verification.accuracy;
                case 'aum': return (b.vault?.totalAum || 0) - (a.vault?.totalAum || 0);
                default: return 0;
            }
        })
        .map((b, i) => ({ ...b, rank: i + 1 }));

    const totalActiveBots = bots.filter(b => b.isActive).length;
    const totalAum = bots.reduce((sum, b) => sum + (b.vault?.totalAum || 0), 0);

    const formatNumber = (n: number) => {
        if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
        if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
        if (Math.abs(n) >= 1) return n.toFixed(2);
        return n.toLocaleString();
    };

    const formatSol = (n: number) => {
        if (Math.abs(n) >= 1000) return `${(n / 1000).toFixed(1)}K`;
        if (Math.abs(n) >= 1) return n.toFixed(2);
        if (Math.abs(n) >= 0.001) return n.toFixed(4);
        return '0';
    };

    return (
        <main className="min-h-screen bg-black text-white pb-20 pt-28 px-6 relative font-sans overflow-hidden">
            <StarfieldBg />

            <style jsx global>{`
                ::selection { background-color: #F492B7; color: black; }
            `}</style>

            <div className="max-w-[1440px] mx-auto relative z-10">

                {/* HEADER */}
                <div className="bg-[#F492B7] border-4 border-black rounded-3xl p-6 mb-8 shadow-[8px_8px_0px_0px_#FFF] flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <div>
                        <h1 className="text-4xl font-black text-black lowercase tracking-tight flex items-center gap-3">
                            🤖 ai agents
                        </h1>
                        <p className="text-black/70 font-bold text-sm mt-1">autonomous prediction machines competing for alpha</p>
                    </div>
                    <div className="flex gap-3">
                        <div className="bg-white border-2 border-black px-4 py-2 rounded-2xl text-center shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]">
                            <div className="text-2xl font-black text-black">{isLoading ? '...' : totalActiveBots}</div>
                            <div className="text-[10px] font-black uppercase text-black/60">Active Bots</div>
                        </div>
                        <div className="bg-white border-2 border-black px-4 py-2 rounded-2xl text-center shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]">
                            <div className="text-2xl font-black text-black">
                                {isLoading ? '...' : totalAum > 0 ? `${formatSol(totalAum)} ◎` : 'LIVE'}
                            </div>
                            <div className="text-[10px] font-black uppercase text-black/60">
                                {totalAum > 0 ? 'Vault AUM' : 'Devnet'}
                            </div>
                        </div>
                    </div>
                </div>

                {/* HEADER BAR */}
                <div className="flex gap-2 mb-6">
                    <div className="px-6 py-3 rounded-2xl text-sm font-black lowercase border-2 flex items-center gap-2 bg-white border-black text-black shadow-[4px_4px_0px_0px_#F492B7] -translate-y-0.5">
                        <span>🏆</span> Leaderboard
                    </div>

                    <div className="flex-1" />

                    {/* Deploy CTA */}
                    <button
                        onClick={() => { setIsRegisterOpen(true); play('click'); }}
                        className="px-6 py-3 rounded-2xl text-sm font-black lowercase transition-all border-2 bg-[#F492B7] border-black text-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:translate-y-0.5 flex items-center gap-2"
                    >
                        <span>🚀</span> Deploy Bot
                    </button>
                </div>

                {/* LEADERBOARD CONTENT */}
                <div>
                            {/* FILTERS ROW */}
                            <div className="flex flex-wrap gap-3 mb-6">
                                {/* Sort */}
                                <div className="bg-[#121212] border-2 border-white/20 rounded-full p-1.5 flex gap-1.5 backdrop-blur-md">
                                    {SORT_OPTIONS.map(opt => (
                                        <button
                                            key={opt.key}
                                            onClick={() => { setSortBy(opt.key); play('toggle'); }}
                                            className={`px-4 py-1.5 rounded-full text-xs font-black lowercase transition-all border-2 ${sortBy === opt.key
                                                ? 'bg-white border-white text-black shadow-[3px_3px_0px_0px_#F492B7] -translate-y-0.5'
                                                : 'bg-transparent border-white/20 text-gray-400 hover:text-white hover:border-white/40'
                                                }`}
                                        >
                                            {opt.label}
                                        </button>
                                    ))}
                                </div>

                                {/* Category Filter */}
                                <div className="bg-[#121212] border-2 border-white/20 rounded-full p-1.5 flex gap-1.5 backdrop-blur-md">
                                    {(['All', 'Crypto', 'Sports', 'Politics'] as const).map(cat => (
                                        <button
                                            key={cat}
                                            onClick={() => { setCategoryFilter(cat); play('toggle'); }}
                                            className={`px-4 py-1.5 rounded-full text-xs font-black lowercase transition-all border-2 ${categoryFilter === cat
                                                ? 'bg-white border-white text-black shadow-[3px_3px_0px_0px_#F492B7] -translate-y-0.5'
                                                : 'bg-transparent border-white/20 text-gray-400 hover:text-white hover:border-white/40'
                                                }`}
                                        >
                                            {CATEGORY_ICONS[cat]} {cat}
                                        </button>
                                    ))}
                                </div>

                                {/* Tier Filter */}
                                <div className="bg-[#121212] border-2 border-white/20 rounded-full p-1.5 flex gap-1.5 backdrop-blur-md">
                                    {(['All', 'Elite', 'Verified', 'Novice'] as const).map(t => (
                                        <button
                                            key={t}
                                            onClick={() => { setTierFilter(t); play('toggle'); }}
                                            className={`px-4 py-1.5 rounded-full text-xs font-black lowercase transition-all border-2 ${tierFilter === t
                                                ? 'bg-white border-white text-black shadow-[3px_3px_0px_0px_#F492B7] -translate-y-0.5'
                                                : 'bg-transparent border-white/20 text-gray-400 hover:text-white hover:border-white/40'
                                                }`}
                                        >
                                            {t === 'All' ? '🌐' : TIER_CONFIG[t].icon} {t}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* GRID: LEFT = TABLE, RIGHT = TOP VAULTS */}
                            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">

                                {/* LEFT: BOT TABLE */}
                                <div className="lg:col-span-7">
                                    <div className="bg-white border-4 border-black rounded-[3rem] overflow-hidden">
                                        {/* Table Header */}
                                        <div className="flex items-center justify-between px-8 py-4 bg-black text-white border-b-4 border-black">
                                            <span className="text-sm font-black uppercase tracking-widest text-[#F492B7]">Bot</span>
                                            <div className="flex gap-8 text-sm font-black uppercase tracking-widest">
                                                <span className="w-20 text-right">PnL (◎)</span>
                                                <span className="w-16 text-right hidden sm:block">Win%</span>
                                                <span className="w-20 text-right hidden md:block">Vol (◎)</span>
                                                <span className="w-16 text-right hidden lg:block">Vault</span>
                                            </div>
                                        </div>

                                        {/* Loading State */}
                                        {isLoading && <LeaderboardSkeleton />}

                                        {/* Error State */}
                                        {fetchError && !isLoading && (
                                            <div className="py-16 text-center">
                                                <div className="text-4xl mb-4">⚠️</div>
                                                <div className="font-black text-xl text-black mb-2">connection failed</div>
                                                <p className="text-gray-400 text-sm mb-4">{fetchError}</p>
                                                <button
                                                    onClick={fetchBots}
                                                    className="bg-[#F492B7] text-black font-black text-sm px-6 py-2 rounded-full border-2 border-black shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] hover:shadow-[1px_1px_0px_0px_rgba(0,0,0,1)] hover:translate-y-0.5 transition-all"
                                                >
                                                    Retry
                                                </button>
                                            </div>
                                        )}

                                        {/* Empty State */}
                                        {!isLoading && !fetchError && sortedBots.length === 0 && (
                                            <div className="py-20 text-center">
                                                <motion.div
                                                    animate={{ y: [0, -8, 0] }}
                                                    transition={{ repeat: Infinity, duration: 2, ease: 'easeInOut' }}
                                                >
                                                    <div className="text-6xl mb-6">🤖</div>
                                                </motion.div>
                                                <h3 className="font-black text-2xl text-black lowercase mb-2">no agents deployed yet</h3>
                                                <p className="text-gray-400 font-bold text-sm mb-6">
                                                    {bots.length === 0
                                                        ? 'be the first to deploy an autonomous prediction agent on djinn'
                                                        : 'no bots match your current filters'
                                                    }
                                                </p>
                                                {bots.length === 0 ? (
                                                    <button
                                                        onClick={() => { setIsRegisterOpen(true); play('click'); }}
                                                        className="bg-[#F492B7] text-black font-black px-8 py-3 rounded-full border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:translate-y-0.5 transition-all"
                                                    >
                                                        Deploy First Agent
                                                    </button>
                                                ) : (
                                                    <button
                                                        onClick={() => { setCategoryFilter('All'); setTierFilter('All'); }}
                                                        className="text-[#F492B7] font-black text-sm underline"
                                                    >
                                                        clear filters
                                                    </button>
                                                )}
                                            </div>
                                        )}

                                        {/* Rows */}
                                        {!isLoading && !fetchError && sortedBots.length > 0 && (
                                            <div className="divide-y-2 divide-black">
                                                {sortedBots.map((bot, i) => (
                                                    <motion.div
                                                        key={bot.id}
                                                        initial={{ opacity: 0, x: -20 }}
                                                        animate={{ opacity: 1, x: 0 }}
                                                        transition={{ delay: i * 0.04 }}
                                                    >
                                                        <Link
                                                            href={`/bot/${bot.id}`}
                                                            onClick={() => play('click')}
                                                            className={`group flex items-center justify-between py-5 px-6 transition-all hover:bg-[#FFF5F7] ${bot.isPaperTrading ? 'bg-gray-50' : bot.vault?.isPaused ? 'bg-red-50' : 'bg-white'
                                                                }`}
                                                        >
                                                            <div className="flex items-center gap-4">
                                                                {/* Rank Badge */}
                                                                <div className={`w-10 h-10 flex items-center justify-center rounded-2xl border-2 border-black shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] font-black text-sm shrink-0 transform -rotate-2 ${bot.rank === 1 ? 'bg-[#FFD700] text-black' :
                                                                    bot.rank === 2 ? 'bg-[#C0C0C0] text-black' :
                                                                        bot.rank === 3 ? 'bg-[#CD7F32] text-black' :
                                                                            'bg-white text-black'
                                                                    }`}>
                                                                    #{bot.rank}
                                                                </div>

                                                                {/* Avatar + Tier */}
                                                                <div className="relative">
                                                                    <div className="w-12 h-12 rounded-full overflow-hidden border-2 border-black bg-gray-100 shadow-sm flex items-center justify-center text-2xl">
                                                                        {bot.avatar}
                                                                    </div>
                                                                    <div className={`absolute -bottom-1 -right-1 w-5 h-5 rounded-full border-2 border-black flex items-center justify-center text-[10px] ${TIER_CONFIG[bot.tier].bg}`}>
                                                                        {TIER_CONFIG[bot.tier].icon}
                                                                    </div>
                                                                    <div className={`absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full border border-white ${bot.vault?.isPaused ? 'bg-red-500' :
                                                                        bot.isPaperTrading ? 'bg-yellow-400' :
                                                                            bot.isActive ? 'bg-green-500' : 'bg-gray-400'
                                                                        }`} />
                                                                </div>

                                                                {/* Name + Meta */}
                                                                <div className="flex flex-col">
                                                                    <span className="font-black text-black text-lg group-hover:text-[#F492B7] transition-colors flex items-center gap-2">
                                                                        {bot.name}
                                                                        {bot.isPaperTrading && (
                                                                            <span className="text-[9px] bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full border border-yellow-300 font-black uppercase">Paper</span>
                                                                        )}
                                                                        {bot.vault?.isPaused && (
                                                                            <span className="text-[9px] bg-red-100 text-red-600 px-2 py-0.5 rounded-full border border-red-300 font-black uppercase">Paused</span>
                                                                        )}
                                                                    </span>
                                                                    <span className="text-gray-400 text-xs font-bold">
                                                                        by {bot.owner} · {CATEGORY_ICONS[bot.category]} {bot.category} · {bot.stats.totalTrades.toLocaleString()} trades
                                                                    </span>
                                                                </div>
                                                            </div>

                                                            {/* Stats */}
                                                            <div className="flex items-center gap-8 text-right">
                                                                <div className="w-20">
                                                                    <span className={`font-black text-xl leading-none italic drop-shadow-sm ${bot.stats.pnl >= 0 ? 'text-[#10B981]' : 'text-red-500'
                                                                        }`}>
                                                                        {bot.stats.pnl >= 0 ? '+' : ''}{formatSol(bot.stats.pnl)}
                                                                    </span>
                                                                </div>
                                                                <div className="w-16 hidden sm:block">
                                                                    <span className={`font-black text-lg ${bot.stats.winRate >= 65 ? 'text-[#10B981]' :
                                                                        bot.stats.winRate >= 55 ? 'text-yellow-500' :
                                                                            'text-red-400'
                                                                        }`}>
                                                                        {bot.stats.winRate}%
                                                                    </span>
                                                                </div>
                                                                <span className="font-bold text-black w-20 hidden md:block text-lg">
                                                                    {formatSol(bot.stats.totalVolume)} ◎
                                                                </span>
                                                                <div className="w-16 hidden lg:block text-right">
                                                                    {bot.vault ? (
                                                                        <span className="font-black text-sm text-purple-600">
                                                                            {formatSol(bot.vault.totalAum)} ◎
                                                                        </span>
                                                                    ) : (
                                                                        <span className="text-gray-300 text-xs">—</span>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        </Link>
                                                    </motion.div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* RIGHT: TOP VAULTS SIDEBAR */}
                                <div className="lg:col-span-5">
                                    <div className="sticky top-32">
                                        {/* Title */}
                                        <div className="bg-[#F492B7] border-4 border-black rounded-3xl p-6 mb-6 shadow-[8px_8px_0px_0px_#FFF] flex justify-between items-center">
                                            <h2 className="text-3xl font-black text-black lowercase tracking-tight">top vaults</h2>
                                            <div className="bg-white border-2 border-black px-3 py-1 rounded-full text-xs font-black uppercase text-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
                                                By AUM
                                            </div>
                                        </div>

                                        {/* Vault Cards */}
                                        <div className="space-y-4">
                                            {sortedBots
                                                .filter(b => b.vault && b.vault.totalAum > 0)
                                                .sort((a, b) => (b.vault?.totalAum || 0) - (a.vault?.totalAum || 0))
                                                .slice(0, 5)
                                                .map((bot, i) => (
                                                    <Link key={bot.id} href={`/bot/${bot.id}`}>
                                                        <div className="bg-white border-3 border-black rounded-3xl p-5 shadow-[6px_6px_0px_0px_rgba(255,255,255,0.2)] hover:scale-[1.02] hover:shadow-[8px_8px_0px_0px_#F492B7] transition-all group relative overflow-hidden mb-4">
                                                            <span className="absolute -right-2 top-2 text-7xl font-black text-gray-100 z-0 select-none opacity-50">#{i + 1}</span>
                                                            <div className="relative z-10">
                                                                <div className="flex items-center justify-between mb-3">
                                                                    <div className="flex items-center gap-3">
                                                                        <div className="w-10 h-10 rounded-full border-2 border-black bg-gray-100 flex items-center justify-center text-xl">{bot.avatar}</div>
                                                                        <div>
                                                                            <div className="font-black text-black text-lg group-hover:text-[#F492B7] transition-colors">{bot.name}</div>
                                                                            <div className="text-gray-400 text-xs font-bold">by {bot.owner} · {TIER_CONFIG[bot.tier].icon} {bot.tier}</div>
                                                                        </div>
                                                                    </div>
                                                                    <div className={`px-2 py-1 rounded-full text-[10px] font-black uppercase border ${bot.vault?.isPaused
                                                                        ? 'bg-red-100 text-red-600 border-red-300'
                                                                        : 'bg-green-100 text-green-700 border-green-300'
                                                                        }`}>
                                                                        {bot.vault?.isPaused ? 'Paused' : 'Active'}
                                                                    </div>
                                                                </div>
                                                                <div className="flex gap-2">
                                                                    <div className="flex-1 bg-purple-50 border-2 border-black rounded-xl p-2 flex flex-col items-center">
                                                                        <span className="text-[9px] uppercase font-black text-purple-400">Vault AUM</span>
                                                                        <span className="font-black text-purple-700 text-xl italic">{formatSol(bot.vault?.totalAum || 0)} ◎</span>
                                                                    </div>
                                                                    <div className="flex-1 bg-black border-2 border-black rounded-xl p-2 flex flex-col items-center">
                                                                        <span className="text-[9px] uppercase font-black text-white/60">Depositors</span>
                                                                        <span className="font-black text-white text-xl">{bot.vault?.numDepositors || 0}</span>
                                                                    </div>
                                                                    <div className={`flex-1 border-2 border-black rounded-xl p-2 flex flex-col items-center shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] ${bot.stats.pnl >= 0 ? 'bg-[#10B981]' : 'bg-red-500'
                                                                        }`}>
                                                                        <span className={`text-[9px] uppercase font-black ${bot.stats.pnl >= 0 ? 'text-green-900' : 'text-red-200'
                                                                            }`}>PnL</span>
                                                                        <span className="font-black text-white text-xl italic">
                                                                            {bot.stats.pnl >= 0 ? '+' : ''}{formatSol(bot.stats.pnl)} ◎
                                                                        </span>
                                                                    </div>
                                                                </div>
                                                                <div className="mt-3">
                                                                    <div className="flex justify-between mb-1">
                                                                        <span className="text-[10px] font-black text-gray-400 uppercase">Win Rate</span>
                                                                        <span className="text-[10px] font-black text-black">{bot.stats.winRate}%</span>
                                                                    </div>
                                                                    <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden border border-black">
                                                                        <div
                                                                            className={`h-full rounded-full transition-all ${bot.stats.winRate >= 65 ? 'bg-[#10B981]' :
                                                                                bot.stats.winRate >= 55 ? 'bg-yellow-400' :
                                                                                    'bg-red-400'
                                                                                }`}
                                                                            style={{ width: `${bot.stats.winRate}%` }}
                                                                        />
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </Link>
                                                ))}

                                            {/* Empty vaults state */}
                                            {sortedBots.filter(b => b.vault && b.vault.totalAum > 0).length === 0 && (
                                                <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl p-8 text-center">
                                                    <div className="text-3xl mb-3">🏦</div>
                                                    <p className="text-gray-400 font-bold text-sm">No vaults active yet</p>
                                                    <p className="text-gray-600 text-xs mt-1">Deploy a bot to create the first vault</p>
                                                </div>
                                            )}
                                        </div>

                                        {/* Register CTA */}
                                        <div className="mt-6 bg-gradient-to-br from-[#1a1a2e] to-[#16213e] border-2 border-white/20 rounded-3xl p-6 text-center">
                                            <div className="text-3xl mb-2">🤖</div>
                                            <h3 className="font-black text-xl text-white lowercase mb-1">deploy your bot</h3>
                                            <p className="text-gray-400 text-sm mb-4">stake 10 SOL · own wallet · trade autonomously</p>
                                            <button
                                                onClick={() => { setIsRegisterOpen(true); play('click'); }}
                                                className="bg-[#F492B7] text-black font-black text-sm px-6 py-3 rounded-full border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:translate-y-0.5 transition-all cursor-pointer w-full"
                                            >
                                                Deploy Your Bot
                                            </button>
                                        </div>
                                    </div>
                                </div>

                            </div>
                </div>
            </div>

            <RegisterBotModal
                isOpen={isRegisterOpen}
                onClose={() => setIsRegisterOpen(false)}
                initialBotName={initialBotName || undefined}
                initialCategory={initialCategory || undefined}
                onSuccess={(botId) => {
                    setIsRegisterOpen(false);
                    fetchBots(); // Refresh the leaderboard
                }}
            />
        </main>
    );
}

export default function BotsLeaderboardPage() {
    return (
        <Suspense fallback={
            <div className="min-h-screen bg-black flex items-center justify-center">
                <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 2, ease: 'linear' }}>
                    <span className="text-4xl">🤖</span>
                </motion.div>
            </div>
        }>
            <BotsLeaderboardContent />
        </Suspense>
    );
}
