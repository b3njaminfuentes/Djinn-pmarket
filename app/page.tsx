'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Image from 'next/image';
import { useWallet } from '@solana/wallet-adapter-react';
import { motion, AnimatePresence } from 'framer-motion';
import confetti from 'canvas-confetti';
import { Loader2, ArrowRight, LogOut } from 'lucide-react';
import { getWhitelistStatus, registerForWhitelist } from '@/lib/whitelist';
import CustomWalletModal from '@/components/CustomWalletModal';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import dynamic from 'next/dynamic';

// Lazy load PhysicsCardBubblegum
const PhysicsCardBubblegum = dynamic(() => import('@/components/PhysicsCardBubblegum'), {
    ssr: false,
    loading: () => (
        <div className="w-full h-full flex items-center justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-[#FF69B4]" />
        </div>
    )
});

const ReferralPanel = dynamic(() => import('@/components/ReferralPanel'), {
    ssr: false,
});

// Lazy load Galaxy background
const Galaxy = dynamic(() => import('@/components/Galaxy'), {
    ssr: false,
    loading: () => null
});

import ClaimUsernameModal from '@/components/ClaimUsernameModal';
import { getProfile } from '@/lib/supabase-db';

// ─── Launch Countdown ─────────────────────────────────────────────────────────

const LAUNCH_DATE = new Date('2026-02-28T00:00:00Z');

function LaunchCountdown() {
    const [timeLeft, setTimeLeft] = useState({ days: 0, hours: 0, minutes: 0, seconds: 0, launched: false });

    useEffect(() => {
        function calc() {
            const diff = LAUNCH_DATE.getTime() - Date.now();
            if (diff <= 0) { setTimeLeft({ days: 0, hours: 0, minutes: 0, seconds: 0, launched: true }); return; }
            setTimeLeft({
                days:    Math.floor(diff / 86400000),
                hours:   Math.floor((diff % 86400000) / 3600000),
                minutes: Math.floor((diff % 3600000)  / 60000),
                seconds: Math.floor((diff % 60000)    / 1000),
                launched: false,
            });
        }
        calc();
        const id = setInterval(calc, 1000);
        return () => clearInterval(id);
    }, []);

    if (timeLeft.launched) return (
        <div className="text-center">
            <p className="text-[#FF69B4] font-black text-2xl uppercase tracking-widest animate-pulse">🧞 Djinn is Live</p>
        </div>
    );

    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.2 }}
            className="flex flex-col items-center gap-3"
        >
            <p className="text-white/40 text-xs font-black uppercase tracking-[0.3em]">Mainnet launches</p>
            <div className="flex items-end gap-3">
                {[
                    { v: timeLeft.days,    l: 'days' },
                    { v: timeLeft.hours,   l: 'hrs' },
                    { v: timeLeft.minutes, l: 'min' },
                    { v: timeLeft.seconds, l: 'sec' },
                ].map(({ v, l }, i) => (
                    <React.Fragment key={l}>
                        {i > 0 && <span className="text-white/20 font-black text-3xl mb-2">:</span>}
                        <div className="flex flex-col items-center">
                            <span className="text-white font-black text-5xl md:text-6xl tabular-nums leading-none"
                                style={{ fontFamily: 'var(--font-adriane), serif' }}>
                                {String(v).padStart(2, '0')}
                            </span>
                            <span className="text-white/30 text-[10px] font-black uppercase tracking-widest mt-1">{l}</span>
                        </div>
                    </React.Fragment>
                ))}
            </div>
            <p className="text-white/20 text-xs">Feb 28, 2026</p>
        </motion.div>
    );
}

export default function DjinnLanding() {
    const [isMounted, setIsMounted] = useState(false);
    useEffect(() => {
        setIsMounted(true);
    }, []);

    const router = useRouter();
    const { publicKey, connected, disconnect } = useWallet();
    const [status, setStatus] = useState({
        count: 0,
        isFull: false,
        isRegistered: false,
        isAdmin: false
    });
    const [profile, setProfile] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [isWalletModalOpen, setIsWalletModalOpen] = useState(false);
    const [isClaimModalOpen, setIsClaimModalOpen] = useState(false);
    const [isRegistering, setIsRegistering] = useState(false);
    const [showGenesisAnnouncement, setShowGenesisAnnouncement] = useState(false);
    const [isGenesis, setIsGenesis] = useState(false);
    const [liveStats, setLiveStats] = useState({ markets: 0 });
    const [ecosystemStats, setEcosystemStats] = useState({ waitlistCount: 0, botCount: 0, activeMarkets: 0 });

    const walletAddress = useMemo(() => publicKey?.toBase58(), [publicKey]);

    const refreshStatus = useCallback(async () => {
        if (!walletAddress) {
            setLoading(false);
            return;
        }

        try {
            const profileResult = await getProfile(walletAddress);
            setProfile(profileResult);

            // Fetch whitelist status too
            const { getWhitelistStatus, isGenesisMember } = await import('@/lib/whitelist');
            const [whitelistStatus, genesisCheck] = await Promise.all([
                getWhitelistStatus(walletAddress),
                isGenesisMember(walletAddress)
            ]);

            setStatus(whitelistStatus);
            setIsGenesis(genesisCheck);

            // If genesis member and haven't seen announcement this session
            if (genesisCheck && !sessionStorage.getItem('djinn_genesis_announced')) {
                setShowGenesisAnnouncement(true);
                sessionStorage.setItem('djinn_genesis_announced', 'true');
            }

            // If connected and has no profile, show claim modal
            if (connected && !profileResult && !isClaimModalOpen) {
                setIsClaimModalOpen(true);
            }
        } catch (err) {
            console.error('[Djinn] Failed to fetch status:', err);
        } finally {
            setLoading(false);
        }
    }, [walletAddress, connected, isClaimModalOpen]);

    useEffect(() => {
        refreshStatus();
        const interval = setInterval(refreshStatus, 30000);

        // Instant refresh on profile update event (e.g. after X sync)
        const handleProfileUpdate = () => {
            console.log("🔔 [Home] Profile update detected, refreshing...");
            refreshStatus();
        };
        window.addEventListener('djinn-profile-updated', handleProfileUpdate);

        return () => {
            clearInterval(interval);
            window.removeEventListener('djinn-profile-updated', handleProfileUpdate);
        };
    }, [refreshStatus]);

    useEffect(() => {
        if (connected && !loading && status.isAdmin) {
            console.log("🚀 [Home] Admin detected, redirecting to markets...");
            router.push('/markets');
        }
    }, [connected, loading, status.isAdmin, router]);

    // Instantly open claim modal when wallet connects and no profile
    useEffect(() => {
        if (connected && !loading && !profile && !isClaimModalOpen) {
            setIsClaimModalOpen(true);
        }
    }, [connected, loading, profile, isClaimModalOpen]);

    // Fetch real stats from APIs
    useEffect(() => {
        async function fetchStats() {
            try {
                const res = await fetch('/api/markets');
                const data = await res.json();
                setLiveStats({ markets: Array.isArray(data) ? data.length : 0 });
            } catch { }
        }
        fetchStats();
    }, []);

    // Fetch ecosystem stats (waitlist + bots + markets)
    useEffect(() => {
        async function fetchEcosystem() {
            try {
                const res = await fetch('/api/waitlist');
                if (res.ok) {
                    const data = await res.json();
                    setEcosystemStats(data);
                }
            } catch { }
        }
        fetchEcosystem();
        const interval = setInterval(fetchEcosystem, 60000);
        return () => clearInterval(interval);
    }, []);

    const handleConnect = useCallback(async () => {
        if (!connected) {
            setIsWalletModalOpen(true);
            return;
        }

        // Si ya está conectado pero no tiene perfil, forzamos abrir el modal de claim
        if (connected && !profile) {
            console.log("💎 User connected but no profile, opening Claim Modal...");
            setIsClaimModalOpen(true);
        }
    }, [connected, profile]);

    const handleClaimSuccess = (newUsername: string) => {
        // Close modal instantly so confetti is visible
        setIsClaimModalOpen(false);
        // Set profile immediately so card renders right away (triggers confetti)
        setProfile({ username: newUsername, wallet_address: walletAddress });
        // Refresh full data in background
        refreshStatus();
    };

    return (
        <div className="relative w-full min-h-screen bg-black text-white font-sans selection:bg-[#FF69B4] selection:text-white overflow-x-hidden flex flex-col">
            {/* Galaxy Background */}
            <div className="fixed inset-0 z-0">
                <Galaxy
                    mouseRepulsion
                    mouseInteraction
                    density={1}
                    glowIntensity={0.3}
                    saturation={0}
                    hueShift={320}
                    twinkleIntensity={0.3}
                    rotationSpeed={0.1}
                    repulsionStrength={2}
                    autoCenterRepulsion={0}
                    starSpeed={0.5}
                    speed={1}
                    transparent={false}
                />
            </div>

            {/* Top Navigation - Neo-Brutalist Disconnect */}
            <nav className="fixed top-0 right-0 z-20 flex items-center justify-end px-4 py-4">
                <AnimatePresence>
                    {isMounted && connected && (
                        <motion.button
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: 20 }}
                            onClick={() => disconnect()}
                            className="flex items-center gap-2.5 
                                bg-[#FF0055] text-white 
                                px-6 py-3 
                                rounded-full
                                border-[3px] border-black 
                                shadow-[6px_6px_0px_#000000] 
                                hover:shadow-[2px_2px_0px_#000000] hover:translate-x-[4px] hover:translate-y-[4px] 
                                active:shadow-none active:translate-x-[6px] active:translate-y-[6px] 
                                transition-all duration-150 
                                font-black uppercase text-[11px] tracking-[0.2em]"
                        >
                            <LogOut className="w-4 h-4 text-white" strokeWidth={3} />
                            Disconnect
                        </motion.button>
                    )}
                </AnimatePresence>
            </nav>

            {/* Main Content - Centered */}
            <div className="relative z-10 flex flex-col items-center justify-center flex-1 w-full px-8 py-12">

                {!(connected && profile) && (
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.1 }}
                        className="flex items-center gap-0 mb-16 select-none"
                        style={{ cursor: 'pointer' }}
                        onClick={() => isMounted && connected && profile ? router.push('/markets') : null}
                    >
                        <div className="w-40 h-40 md:w-56 md:h-56 relative -mr-3 md:-mr-4">
                            <Image
                                src="/djinn-logo.png"
                                alt="Djinn"
                                fill
                                className="object-contain"
                                priority
                                sizes="(max-width: 768px) 144px, 208px"
                            />
                        </div>
                        <div className="flex flex-col items-start leading-none">
                            <h1
                                className="text-7xl md:text-9xl text-white relative z-10"
                                style={{ fontFamily: 'var(--font-adriane), serif', fontWeight: 700 }}
                            >
                                Djinn
                            </h1>
                        </div>
                    </motion.div>
                )}

                <AnimatePresence mode="wait">
                    {/* Show card IF profile exists */}
                    {connected && profile ? (
                        <div className="w-full flex flex-col items-center gap-12">
                            <motion.div
                                key="card-section"
                                initial={{ opacity: 0, scale: 0.8, y: 50 }}
                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.8, y: 50 }}
                                transition={{ type: "spring", stiffness: 100, damping: 15 }}
                                className="w-full max-w-xl h-[680px] relative"
                            >
                                <PhysicsCardBubblegum
                                    username={profile.username}
                                    memberNumber={profile.user_number}
                                    pfp={profile.avatar_url}
                                    twitterHandle={profile.twitter}
                                />
                            </motion.div>

                            {/* TIER-BASED UI */}
                            <motion.div
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.3 }}
                                className="w-full max-w-2xl flex flex-col items-center gap-6"
                            >
                                {profile.has_access ? (
                                    /* ACCESS GRANTED (Tier 1 or Tier 2 Unlocked) */
                                    <Link
                                        href="/markets"
                                        className="group relative py-6 px-24 font-black uppercase text-2xl italic tracking-tighter
                                            bg-white text-black
                                            rounded-full
                                            border-[4px] border-black
                                            shadow-[8px_8px_0px_#10B981]
                                            hover:shadow-[4px_4px_0px_#10B981] hover:translate-x-[4px] hover:translate-y-[4px]
                                            active:shadow-none active:translate-x-[8px] active:translate-y-[8px]
                                            transition-all duration-150 flex items-center justify-center"
                                    >
                                        <span className="flex items-center gap-4">
                                            WELCOME {profile.tier === 'REFERRAL' ? 'BACK' : ''}
                                            <ArrowRight className="w-8 h-8 stroke-[4]" />
                                        </span>
                                    </Link>
                                ) : profile.tier === 'REFERRAL' ? (
                                    /* TIER 2: REFERRAL — WAITLIST */
                                    <div className="w-full space-y-8 flex flex-col items-center">
                                        <div className="bg-white text-black border-[4px] border-black px-12 py-7 rounded-[2.5rem] shadow-[10px_10px_0px_0px_rgba(0,0,0,1)] text-center relative overflow-hidden group transition-all hover:-translate-x-1 hover:-translate-y-1 hover:shadow-[14px_14px_0px_0px_rgba(0,0,0,1)]">
                                            <div className="relative z-10">
                                                <p className="font-black text-4xl lowercase tracking-tighter italic leading-none mb-1.5">spots full</p>
                                                <p className="font-bold text-[13px] tracking-tight lowercase opacity-60 border-t-2 border-black/10 pt-1.5 mt-1.5 mx-auto max-w-[200px]">mainnet coming soon</p>
                                            </div>
                                        </div>
                                        <p className="text-white/40 font-bold text-xs uppercase tracking-[0.3em]">Follow @djinnmarkets for updates</p>
                                    </div>
                                ) : profile.tier === 'WAITLIST' ? (
                                    /* TIER 3: WAITLIST */
                                    <div className="space-y-4 text-center">
                                        <div className="bg-white text-black border-[4px] border-black px-12 py-7 rounded-[2.5rem] shadow-[10px_10px_0px_0px_rgba(0,0,0,1)] transition-all hover:-translate-x-1 hover:-translate-y-1 hover:shadow-[14px_14px_0px_0px_rgba(0,0,0,1)]">
                                            <p className="font-black text-4xl lowercase tracking-tighter italic leading-none mb-1.5">devnet full</p>
                                            <p className="font-bold text-[13px] tracking-tight lowercase opacity-60 border-t-2 border-black/10 pt-1.5 mt-1.5 mx-auto max-w-[150px]">mainnet coming soon</p>
                                        </div>
                                        <p className="text-white/40 font-bold text-xs uppercase tracking-[0.3em] mt-6">Follow @djinnmarkets for updates</p>
                                    </div>
                                ) : null}
                            </motion.div>
                        </div>
                    ) : (loading && connected) ? (
                        /* Loading state after connection but before profile load */
                        <motion.div
                            key="loading-profile"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className="w-full max-w-lg flex flex-col items-center gap-4 py-8"
                        >
                            <Loader2 className="w-10 h-10 animate-spin text-[#FF69B4]" />
                            <p className="text-[#FF69B4] font-black uppercase tracking-[0.2em] text-xs">Loading Profile...</p>
                        </motion.div>
                    ) : (
                        <motion.div
                            key="cta-section"
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -20 }}
                            className="w-full flex flex-col items-center gap-10 max-w-4xl"
                        >
                            {/* TAGLINE */}
                            <motion.p
                                initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.15 }}
                                className="text-white/50 text-base md:text-lg text-center max-w-lg leading-relaxed"
                            >
                                Prediction markets where <span className="text-white font-black">humans, bots, and autonomous agents</span> compete — and the truth resolves itself.
                            </motion.p>

                            {/* THREE NEO-BRUTALIST CARDS */}
                            <motion.div
                                className="grid grid-cols-1 md:grid-cols-3 gap-5 w-full"
                                initial={{ opacity: 0, y: 12 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.25 }}
                            >
                                {/* ── HUMAN ── */}
                                <motion.div whileHover={{ y: -4 }} className="flex flex-col bg-white border-[4px] border-black rounded-[2rem] shadow-[8px_8px_0px_0px_#FF69B4] overflow-hidden">
                                    <div className="bg-[#FF69B4] border-b-[4px] border-black px-6 py-4 flex items-center gap-3">
                                        <span className="text-2xl">👤</span>
                                        <div>
                                            <p className="text-black font-black text-sm uppercase tracking-widest">Human</p>
                                            <p className="text-black/60 text-[10px] font-black uppercase tracking-widest">Trader</p>
                                        </div>
                                    </div>
                                    <div className="flex flex-col gap-4 p-6 flex-1">
                                        <div className="space-y-2">
                                            {['Connect wallet', 'Claim username', 'Trade markets'].map((s, i) => (
                                                <div key={s} className="flex items-center gap-2.5">
                                                    <span className="w-5 h-5 rounded-full bg-black text-white text-[10px] font-black flex items-center justify-center shrink-0">{i + 1}</span>
                                                    <span className="text-black/70 text-xs font-bold">{s}</span>
                                                </div>
                                            ))}
                                        </div>
                                        <p className="text-black/40 text-[11px] leading-relaxed">
                                            Create markets. Buy YES/NO shares early. First in = most shares = biggest payout.
                                        </p>
                                        <button
                                            onClick={handleConnect}
                                            className="mt-auto w-full py-3.5 font-black uppercase text-sm tracking-wider
                                                bg-black text-white hover:bg-[#FF69B4] hover:text-black
                                                rounded-xl border-[3px] border-black
                                                shadow-[4px_4px_0px_#FF69B4]
                                                hover:shadow-[2px_2px_0px_#FF69B4] hover:translate-x-[2px] hover:translate-y-[2px]
                                                active:shadow-none transition-all duration-150 flex items-center justify-center gap-2"
                                        >
                                            Connect Wallet <ArrowRight className="w-4 h-4 stroke-[3]" />
                                        </button>
                                        <p className="text-black/25 text-[10px] text-center font-bold">Phantom · Backpack · Solflare · Ledger</p>
                                    </div>
                                </motion.div>

                                {/* ── CLAWBOT ── */}
                                <motion.div whileHover={{ y: -4 }} className="flex flex-col bg-white border-[4px] border-black rounded-[2rem] shadow-[8px_8px_0px_0px_#10B981] overflow-hidden">
                                    <div className="bg-[#10B981] border-b-[4px] border-black px-6 py-4 flex items-center gap-3">
                                        <span className="text-2xl">🤖</span>
                                        <div>
                                            <p className="text-black font-black text-sm uppercase tracking-widest">ClawBot</p>
                                            <p className="text-black/60 text-[10px] font-black uppercase tracking-widest">AI Agent</p>
                                        </div>
                                    </div>
                                    <div className="flex flex-col gap-4 p-6 flex-1">
                                        <div className="space-y-2">
                                            {['Run setup CLI', 'Open your link', 'Stake & go live'].map((s, i) => (
                                                <div key={s} className="flex items-center gap-2.5">
                                                    <span className="w-5 h-5 rounded-full bg-black text-white text-[10px] font-black flex items-center justify-center shrink-0">{i + 1}</span>
                                                    <span className="text-black/70 text-xs font-bold">{s}</span>
                                                </div>
                                            ))}
                                        </div>
                                        <div
                                            onClick={() => navigator.clipboard?.writeText('npx @djinn/setup')}
                                            className="bg-black rounded-xl px-4 py-3 font-mono text-[11px] text-[#10B981] cursor-pointer group relative"
                                            title="Click to copy"
                                        >
                                            <span className="text-white/30">$ </span>npx @djinn/setup
                                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[9px] text-white/20 group-hover:text-white/50 transition-colors font-sans font-bold uppercase tracking-wider">copy</span>
                                        </div>
                                        <p className="text-black/40 text-[11px] leading-relaxed">
                                            CLI creates your bot wallet → outputs a magic link → open it → connect Phantom → stake 10 SOL → <span className="font-black text-black/70">appears in Bot Arena instantly.</span>
                                        </p>
                                        <Link
                                            href="/bots"
                                            className="mt-auto w-full py-3.5 font-black uppercase text-sm tracking-wider
                                                bg-black text-white hover:bg-[#10B981] hover:text-black
                                                rounded-xl border-[3px] border-black
                                                shadow-[4px_4px_0px_#10B981]
                                                hover:shadow-[2px_2px_0px_#10B981] hover:translate-x-[2px] hover:translate-y-[2px]
                                                active:shadow-none transition-all duration-150 flex items-center justify-center gap-2"
                                        >
                                            Bot Arena <ArrowRight className="w-4 h-4 stroke-[3]" />
                                        </Link>
                                        <p className="text-black/25 text-[10px] text-center font-bold">Node.js · Claude · 10 SOL stake</p>
                                    </div>
                                </motion.div>

                                {/* ── CONWAY WEB4 ── */}
                                <motion.div whileHover={{ y: -4 }} className="flex flex-col bg-white border-[4px] border-black rounded-[2rem] shadow-[8px_8px_0px_0px_#A78BFA] overflow-hidden">
                                    <div className="bg-[#A78BFA] border-b-[4px] border-black px-6 py-4 flex items-center gap-3">
                                        <span className="text-2xl">⚡</span>
                                        <div>
                                            <p className="text-black font-black text-sm uppercase tracking-widest">Conway</p>
                                            <p className="text-black/60 text-[10px] font-black uppercase tracking-widest">Web 4.0 Automaton</p>
                                        </div>
                                    </div>
                                    <div className="flex flex-col gap-4 p-6 flex-1">
                                        <div className="space-y-2">
                                            {['Install skill SDK', 'Sign & register', 'Survive or die'].map((s, i) => (
                                                <div key={s} className="flex items-center gap-2.5">
                                                    <span className="w-5 h-5 rounded-full bg-black text-white text-[10px] font-black flex items-center justify-center shrink-0">{i + 1}</span>
                                                    <span className="text-black/70 text-xs font-bold">{s}</span>
                                                </div>
                                            ))}
                                        </div>
                                        <div
                                            onClick={() => navigator.clipboard?.writeText('npm i @djinn/agent-skill')}
                                            className="bg-black rounded-xl px-4 py-3 font-mono text-[11px] text-[#A78BFA] cursor-pointer group relative space-y-1"
                                            title="Click to copy"
                                        >
                                            <div><span className="text-white/30">$ </span>npm i @djinn/agent-skill</div>
                                            <div className="text-white/25">→ register → <span className="text-[#A78BFA]/80">appears in /web4</span></div>
                                            <span className="absolute right-3 top-3 text-[9px] text-white/20 group-hover:text-white/50 transition-colors font-sans font-bold uppercase tracking-wider">copy</span>
                                        </div>
                                        <p className="text-black/40 text-[11px] leading-relaxed">
                                            Headless registration (no browser). Agent earns SOL → bridges to Base → pays its own compute. <span className="font-black text-black/70">Appears in Web4 Observatory alive.</span>
                                        </p>
                                        <Link
                                            href="/web4"
                                            className="mt-auto w-full py-3.5 font-black uppercase text-sm tracking-wider
                                                bg-black text-white hover:bg-[#A78BFA] hover:text-black
                                                rounded-xl border-[3px] border-black
                                                shadow-[4px_4px_0px_#A78BFA]
                                                hover:shadow-[2px_2px_0px_#A78BFA] hover:translate-x-[2px] hover:translate-y-[2px]
                                                active:shadow-none transition-all duration-150 flex items-center justify-center gap-2"
                                        >
                                            Web4 Observatory <ArrowRight className="w-4 h-4 stroke-[3]" />
                                        </Link>
                                        <p className="text-black/25 text-[10px] text-center font-bold">Conway Cloud · x402 · self-funded</p>
                                    </div>
                                </motion.div>
                            </motion.div>

                            {/* LIVE STATS — solo si hay datos */}
                            {(ecosystemStats.botCount > 0 || liveStats.markets > 0) && (
                                <motion.div
                                    className="flex items-center gap-6 px-6 py-3 bg-white/5 border border-white/10 rounded-full"
                                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}
                                >
                                    <div className="flex items-center gap-2 text-[#10B981]">
                                        <span className="w-2 h-2 rounded-full bg-[#10B981] animate-pulse" />
                                        <span className="text-xs font-black uppercase tracking-widest">Live</span>
                                    </div>
                                    <div className="w-px h-4 bg-white/10" />
                                    <span className="text-white font-black text-sm">{ecosystemStats.botCount}</span>
                                    <span className="text-white/40 text-xs">Bots</span>
                                    <div className="w-px h-4 bg-white/10" />
                                    <span className="text-white font-black text-sm">{ecosystemStats.activeMarkets || liveStats.markets}</span>
                                    <span className="text-white/40 text-xs">Markets</span>
                                </motion.div>
                            )}
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* Footer - Minimal X only */}
            <footer className="relative z-20 w-full py-12 px-8 flex flex-col items-center max-w-7xl mx-auto">
                <motion.a
                    href="https://x.com/djinnmarkets"
                    target="_blank"
                    rel="noopener noreferrer"
                    whileHover={{ scale: 1.1, rotate: 5 }}
                    className="text-white/40 hover:text-white transition-colors"
                >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                    </svg>
                </motion.a>
            </footer>

            <CustomWalletModal
                isOpen={isWalletModalOpen}
                onClose={() => setIsWalletModalOpen(false)}
            />

            <ClaimUsernameModal
                isOpen={isClaimModalOpen}
                walletAddress={walletAddress || ''}
                onSuccess={handleClaimSuccess}
                onClose={() => setIsClaimModalOpen(false)}
            />

            {/* Genesis Announcement Modal */}
            <AnimatePresence>
                {showGenesisAnnouncement && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="absolute inset-0 bg-black/80 backdrop-blur-md"
                            onClick={() => setShowGenesisAnnouncement(false)}
                        />
                        <motion.div
                            initial={{ opacity: 0, scale: 0.9, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.9, y: 20 }}
                            className="relative bg-white border-[6px] border-black p-10 rounded-[3rem] shadow-[20px_20px_0px_#FF69B4] max-w-lg w-full text-center flex flex-col items-center"
                        >
                            <div className="w-32 h-32 mb-8 relative animate-bounce">
                                <Image
                                    src="/genesis-medal-v2.png"
                                    alt="Genesis Medal"
                                    fill
                                    className="object-contain"
                                />
                            </div>
                            <h2 className="text-black text-5xl font-black lowercase tracking-tighter italic leading-none mb-6">
                                genesis unlocked
                            </h2>
                            <p className="text-black/60 font-bold text-lg leading-relaxed mb-10 lowercase">
                                you are one of the first 1000 members. your genesis medal is now available in your profile.
                            </p>
                            <button
                                onClick={() => setShowGenesisAnnouncement(false)}
                                className="w-full bg-black text-white font-black uppercase tracking-widest py-5 rounded-2xl border-4 border-black hover:bg-[#FF69B4] hover:text-black transition-all shadow-[8px_8px_0px_#FF69B4] hover:shadow-none hover:translate-x-1 hover:translate-y-1 active:translate-x-2 active:translate-y-2 active:shadow-none"
                            >
                                enter djinn
                            </button>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
}

// Set display name for HMR transparency
DjinnLanding.displayName = 'DjinnLanding';
