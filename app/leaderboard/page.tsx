'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useWallet } from '@solana/wallet-adapter-react';
import { motion, AnimatePresence } from 'framer-motion';
import StarfieldBg from '@/components/StarfieldBg';
import { useSound } from '@/components/providers/SoundProvider';

// --- MOCK DATA GENERATOR ---
const generateStats = (baseProfit: number, baseVolume: number) => ({
    daily: { profit: baseProfit * 0.05, volume: baseVolume * 0.02 },
    weekly: { profit: baseProfit * 0.2, volume: baseVolume * 0.1 },
    monthly: { profit: baseProfit * 0.6, volume: baseVolume * 0.4 },
    all_time: { profit: baseProfit, volume: baseVolume },
});

const initialDjinns = [
    { user: 'Kch123', avatar: '🦁', slug: 'kch123', stats: generateStats(5864652, 105134846) },
    { user: 'SeriouslySirius', avatar: '🦅', slug: 'seriouslysirius', stats: generateStats(5562048, 86249502) },
    { user: '0x006cc834', avatar: '🦊', slug: '0x006cc834', stats: generateStats(4241921, 37848692) },
    { user: 'Lord_Prophet', avatar: '👑', slug: 'lord_prophet', stats: generateStats(2632212, 35274916) },
    { user: 'gmanas', avatar: '🔮', slug: 'gmanas', stats: generateStats(2397970, 192173116) },
    { user: 'MCGenius', avatar: '🧙‍♂️', slug: 'mcgenius', stats: generateStats(2068652, 14033524) },
    { user: 'MrSparkly', avatar: '🐕', slug: 'mrsparkly', stats: generateStats(1984537, 43850056) },
    { user: 'RN1', avatar: '🐳', slug: 'rn1', stats: generateStats(1879038, 66025929) },
    { user: 'WhaleWatcher', avatar: '🌊', slug: 'whalewatcher', stats: generateStats(1500000, 50000000) },
    { user: 'DegenKing', avatar: '🔱', slug: 'degenking', stats: generateStats(1200000, 40000000) }
];

const biggestWinsAllTime = [
    {
        rank: 1,
        user: 'beachboy4',
        wallet: '8xK...9zLq',
        market_title: 'Real Sociedad de Fútbol vs. Villarreal CF',
        market_slug: 'real-sociedad-vs-villarreal',
        market_image: '⚽️',
        bet: 2701565,
        payout: 6947364,
        slug: 'beachboy4'
    },
    {
        rank: 2,
        user: 'beachboy4',
        wallet: '8xK...9zLq',
        market_title: 'Tottenham Hotspur FC vs. Brighton',
        market_slug: 'tottenham-vs-brighton',
        market_image: '⚽️',
        bet: 3322439,
        payout: 6809952,
        slug: 'beachboy4'
    },
    {
        rank: 3,
        user: 'beachboy4',
        wallet: '8xK...9zLq',
        market_title: 'Olympique de Marseille vs. Paris SG',
        market_slug: 'marseille-vs-psg',
        market_image: '⚽️',
        bet: 3458339,
        payout: 6378346,
        slug: 'beachboy4'
    },
    {
        rank: 4,
        user: 'Bossoskil',
        wallet: 'Bo5...Ssk1',
        market_title: 'Miami vs. Ohio State',
        market_slug: 'miami-vs-ohio',
        market_image: '🏈',
        bet: 385511,
        payout: 1446914,
        slug: 'bossoskil'
    },
    {
        rank: 5,
        user: 'DegenKing',
        wallet: 'DeG...K1nG',
        market_title: 'Solana to $500',
        market_slug: 'solana-500',
        market_image: '🚀',
        bet: 120000,
        payout: 980200,
        slug: 'degenking'
    },
    {
        rank: 6,
        user: '',
        wallet: 'Ah7...Mq9x',
        market_title: 'Will GPT-5 release in 2025?',
        market_slug: 'gpt5-2025',
        market_image: '🤖',
        bet: 50000,
        payout: 850000,
        slug: 'Ah7Mq9x'
    },
    {
        rank: 7,
        user: 'CryptoWhale',
        wallet: 'CwH...99Yz',
        market_title: 'Bitcoin > $100k by EOY',
        market_slug: 'btc-100k-eoy',
        market_image: '💰',
        bet: 75000,
        payout: 720000,
        slug: 'cryptowhale'
    },
    {
        rank: 8,
        user: '',
        wallet: 'SoL...FaSt',
        market_title: 'Fed Rate Cut March',
        market_slug: 'fed-cut-march',
        market_image: '🏦',
        bet: 40000,
        payout: 650000,
        slug: 'SoLFaSt'
    },
    {
        rank: 9,
        user: 'ElonFan',
        wallet: 'El0...nMus',
        market_title: 'SpaceX Starship Launch Success',
        market_slug: 'spacex-starship',
        market_image: '🚀',
        bet: 30000,
        payout: 500000,
        slug: 'elonfan'
    },
    {
        rank: 10,
        user: 'MoonBoi',
        wallet: 'M00...nB01',
        market_title: 'ETH Flips BTC',
        market_slug: 'eth-flips-btc',
        market_image: '🌙',
        bet: 20000,
        payout: 450000,
        slug: 'moonboi'
    },
];

type TimePeriod = 'daily' | 'weekly' | 'monthly' | 'all_time';

export default function LeaderboardPage() {
    const { publicKey } = useWallet();
    const { play } = useSound();
    const [period, setPeriod] = useState<TimePeriod>('monthly');
    const [liveTraders, setLiveTraders] = useState<any[]>(initialDjinns);
    const [searchQuery, setSearchQuery] = useState('');
    const [showAchievement, setShowAchievement] = useState(false);

    useEffect(() => {
        const syncLiveTraders = () => {
            const savedProfile = localStorage.getItem('djinn_user_profile');
            if (savedProfile) {
                try {
                    const profile = JSON.parse(savedProfile);
                    if (profile.profit > 0 || profile.gems > 0) {
                        const userStats = {
                            daily: { profit: (profile.profit || 0) * 0.1, volume: (profile.profit || 0) * 2 },
                            weekly: { profit: (profile.profit || 0) * 0.3, volume: (profile.profit || 0) * 5 },
                            monthly: { profit: profile.profit || 0, volume: (profile.profit || 0) * 10 },
                            all_time: { profit: profile.profit || 0, volume: (profile.profit || 0) * 15 },
                        };

                        setLiveTraders( (prev: any) => {
                            const exists = prev.find( (p: any) => p.slug === profile.username.toLowerCase() || (publicKey && p.slug === publicKey.toBase58()));
                            if (exists) return prev;

                            return [...prev, {
                                user: profile.username || 'You',
                                avatar: profile.pfp || '👤',
                                slug: profile.username.toLowerCase(),
                                isYou: true,
                                stats: userStats
                            }];
                        });
                    }
                } catch (e) {
                    console.error("Error parsing profile for leaderboard", e);
                }
            }
        };
        syncLiveTraders();
    }, [publicKey]);

    const sortedTraders = [...liveTraders]
        .map(t => ({
            ...t,
            currentProfit: t.stats[period].profit,
            currentVolume: t.stats[period].volume
        }))
        .sort((a: any, b: any) => b.currentProfit - a.currentProfit)
        .map((t, i) => ({ ...t, rank: i + 1 }));

    const filteredTraders = sortedTraders.filter(t =>
        t.user.toLowerCase().includes(searchQuery.toLowerCase())
    );

    useEffect(() => {
        const you = sortedTraders.find(t => t.isYou);
        const hasSeenAchievement = localStorage.getItem('djinn_trophy_seen');

        if (you?.rank === 1 && !hasSeenAchievement && period === 'monthly') {
            setShowAchievement(true);
            localStorage.setItem('djinn_trophy_seen', 'true');
            setTimeout(() => {
                setShowAchievement(false);
            }, 6000); // 6s display
        }
    }, [sortedTraders, period]);

    return (
        <main className="min-h-screen bg-black text-white pb-20 pt-28 px-6 relative font-sans overflow-hidden">
            <StarfieldBg />

            <style jsx global>{`
                ::selection {
                    background-color: #F492B7;
                    color: black;
                }
            `}</style>

            {/* ACHIEVEMENT TOAST */}
            <AnimatePresence>
                {showAchievement && (
                    <motion.div
                        initial={{ opacity: 0, y: -50, scale: 0.8 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -50, scale: 0.8 }}
                        transition={{ type: "spring", stiffness: 300, damping: 20 }}
                        onClick={() => setShowAchievement(false)}
                        className="fixed top-24 left-1/2 -translate-x-1/2 z-[100] bg-white border-4 border-black rounded-2xl p-4 flex items-center gap-4 shadow-[8px_8px_0px_0px_#F492B7] min-w-[340px] cursor-pointer hover:translate-y-1 hover:shadow-[4px_4px_0px_0px_#F492B7] transition-all"
                    >
                        <div className="w-14 h-14 bg-[#FFD700] rounded-xl flex items-center justify-center border-2 border-black shadow-sm">
                            <span className="text-3xl">🏆</span>
                        </div>
                        <div>
                            <p className="text-black text-xs font-black uppercase tracking-widest bg-[#FFD700] px-2 py-0.5 w-fit border border-black mb-1">UNLOCKED</p>
                            <p className="text-black font-black text-xl lowercase leading-none">The Champion</p>
                            <p className="text-gray-500 text-xs font-bold lowercase mt-0.5">Rank #1 achieved</p>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            <div className="max-w-[1440px] mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8 relative z-10">

                {/* LEFT COLUMN: LEADERBOARD Table */}
                <div className="lg:col-span-7">

                    {/* Page Title - RESTORED MATCHING SIDEBAR STYLE */}
                    <div className="bg-[#F492B7] border-4 border-black rounded-3xl p-6 mb-8 shadow-[8px_8px_0px_0px_#FFF] flex justify-between items-center">
                        <h1 className="text-4xl font-black text-black lowercase tracking-tight">leaderboard</h1>
                        <div className="bg-white border-2 border-black px-3 py-1 rounded-full text-xs font-black uppercase text-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
                            Global
                        </div>
                    </div>


                    {/* FILTERS CARD - PREMIUM NEO-BRUTALISM */}
                    <div className="bg-[#121212] border-2 border-white/20 rounded-full p-2 mb-8 flex flex-wrap gap-2 backdrop-blur-md shadow-lg w-fit">
                        {(['daily', 'weekly', 'monthly', 'all_time'] as const).map((p) => (
                            <button
                                key={p}
                                onClick={() => { setPeriod(p); play('toggle'); }}
                                className={`px-6 py-2 rounded-full text-sm font-black lowercase transition-all border-2 relative overflow-hidden group ${period === p
                                    ? 'bg-white border-white text-black shadow-[4px_4px_0px_0px_#F492B7] -translate-y-1'
                                    : 'bg-transparent border-white/30 text-gray-400 hover:text-white hover:border-white hover:bg-white/5'
                                    }`}
                            >
                                <span className="relative z-10">{p.replace('_', ' ')}</span>
                            </button>
                        ))}
                    </div>

                    {/* TABLE CONTAINER */}
                    <div className="bg-white border-4 border-black rounded-[3rem] overflow-hidden">
                        {/* HEADER */}
                        <div className="flex items-center justify-between px-8 py-4 bg-black text-white border-b-4 border-black">
                            <span className="text-sm font-black uppercase tracking-widest text-[#F492B7]">Trader</span>
                            <div className="flex gap-12 text-sm font-black uppercase tracking-widest">
                                <span>Profit</span>
                                <span className="w-32 text-right hidden sm:block">Volume</span>
                            </div>
                        </div>

                        {/* ROWS */}
                        <div className="divide-y-2 divide-black">
                            {sortedTraders.map((trader, i) => (
                                <motion.div
                                    key={trader.slug}
                                    initial={{ opacity: 0, x: -20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{ delay: i * 0.05 }}
                                >
                                    <Link
                                        href={`/profile/${trader.slug}`}
                                        onClick={() => play('click')}
                                        className={`group flex items-center justify-between py-5 px-6 transition-all hover:bg-[#FFF5F7] ${trader.isYou ? 'bg-[#F492B7]/10' : 'bg-white'}`}
                                    >
                                        <div className="flex items-center gap-5">
                                            {/* Rank Badge */}
                                            <div className={`w-10 h-10 flex items-center justify-center rounded-2xl border-2 border-black shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] font-black text-sm shrink-0 transform -rotate-2 ${trader.rank === 1 ? 'bg-[#FFD700] text-black' :
                                                trader.rank === 2 ? 'bg-[#C0C0C0] text-black' :
                                                    trader.rank === 3 ? 'bg-[#CD7F32] text-black' :
                                                        'bg-white text-black'
                                                }`}>
                                                #{trader.rank}
                                            </div>

                                            {/* Avatar */}
                                            <div className="relative">
                                                <div className="w-12 h-12 rounded-full overflow-hidden border-2 border-black bg-gray-100 shadow-sm">
                                                    {trader.avatar.startsWith('http') ? (
                                                        <img src={trader.avatar} alt="" className="w-full h-full object-cover" />
                                                    ) : (
                                                        <div className="w-full h-full flex items-center justify-center text-xl">{trader.avatar}</div>
                                                    )}
                                                </div>
                                                {trader.rank === 1 && (
                                                    <div className="absolute -top-3 -right-3 w-8 h-8 z-10 filter drop-shadow-md">
                                                        <img src="/gold-trophy.png" alt="Champion" className="w-full h-full object-contain" />
                                                    </div>
                                                )}
                                            </div>

                                            {/* Name */}
                                            <div className="flex flex-col">
                                                <span className="font-black text-black text-lg group-hover:text-[#F492B7] transition-colors">
                                                    @{trader.user}
                                                    {trader.isYou && <span className="ml-2 text-[10px] bg-black text-white px-2 py-0.5 rounded-full border border-black align-middle uppercase tracking-wider">You</span>}
                                                </span>
                                            </div>
                                        </div>

                                        {/* Stats */}
                                        <div className="flex items-center gap-12 text-right">
                                            <div className="flex flex-col items-end">
                                                <span className="font-black text-[#10B981] text-xl leading-none italic drop-shadow-sm">
                                                    +${trader.currentProfit.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                                </span>
                                            </div>
                                            <span className="font-bold text-black w-32 hidden sm:block text-xl">
                                                ${trader.currentVolume.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                            </span>
                                        </div>
                                    </Link>
                                </motion.div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* RIGHT COLUMN: BIGGEST WINS SIDEBAR */}
                <div className="lg:col-span-5">
                    {/* Sticky Container */}
                    <div className="sticky top-32">
                        {/* Title Card - PINK and STRAIGHT */}
                        <div className="bg-[#F492B7] border-4 border-black rounded-3xl p-6 mb-6 shadow-[8px_8px_0px_0px_#FFF] flex justify-between items-center">
                            <h2 className="text-3xl font-black text-black lowercase tracking-tight">biggest wins</h2>
                            <div className="bg-wshite border-2 border-black px-3 py-1 rounded-full text-xs font-black uppercase text-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
                                All Time
                            </div>
                        </div>

                        {/* Winss List */}
                        <div className="space-y-4">
                            {biggestWinsAllTime.slice(0, 5).map((win, i) => (
                                <div key={i} className="bg-white border-3 border-black rounded-3xl p-5 shadow-[6px_6px_0px_0px_rgba(255,255,255,0.2)] hover:scale-[1.02] hover:shadow-[8px_8px_0px_0px_#F492B7] transition-all group relative overflow-hidden">

                                    {/* Rank Number BG */}
                                    <span className="absolute -right-2 top-2 text-7xl font-black text-gray-100 z-0 select-none opacity-50">#{win.rank}</span>

                                    <div className="relative z-10">
                                        {/* User Row */}
                                        <div className="flex items-center justify-between mb-3">
                                            <div className="flex items-center gap-2">
                                                {/* MEDALS / TROPHIES for Top 3 */}
                                                {i === 0 && <span className="text-3xl drop-shadow-sm filter grayscale-0">🥇</span>}
                                                {i === 1 && <span className="text-3xl drop-shadow-sm filter grayscale-0">🥈</span>}
                                                {i === 2 && <span className="text-3xl drop-shadow-sm filter grayscale-0">🥉</span>}

                                                <Link href={`/profile/${win.slug}`} className="flex items-center gap-2 group/user bg-[#F3F4F6] rounded-full pr-3 pl-1 py-1 border border-black hover:bg-[#F492B7] transition-all">
                                                    <div className="w-6 h-6 rounded-full border border-black bg-white overflow-hidden">
                                                        <div className="w-full h-full flex items-center justify-center text-[10px]">👤</div>
                                                    </div>
                                                    <span className="font-bold text-xs text-black">@{win.user || win.wallet.slice(0, 6)}</span>
                                                </Link>
                                            </div>
                                        </div>

                                        {/* Market Title */}
                                        <Link href={`/market/${win.market_slug}`} className="block text-lg font-black text-black leading-tight mb-4 hover:text-[#F492B7] transition-colors line-clamp-2">
                                            {win.market_title}
                                        </Link>

                                        {/* Stats Grid */}
                                        <div className="flex gap-2">
                                            <div className="flex-1 bg-black border-2 border-black rounded-xl p-2 flex flex-col justify-center items-center">
                                                <span className="text-[9px] uppercase font-black text-white/70">Bet</span>
                                                <span className="font-black text-white text-xl italic">${win.bet.toLocaleString()}</span>
                                            </div>
                                            {/* PROFIT BOX: GREEN & TILTED TEXT */}
                                            <div className="flex-1 bg-[#10B981] border-2 border-black rounded-xl p-2 flex flex-col justify-center items-center shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
                                                <span className="text-[9px] uppercase font-black text-green-900">Profit</span>
                                                <span className="font-black text-xl text-white italic">+${(win.payout - win.bet).toLocaleString()}</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

            </div>
        </main>
    );
}