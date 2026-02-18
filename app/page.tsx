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
                            className="w-full flex flex-col items-center gap-8 max-w-md"
                        >
                            {/* LAUNCH COUNTDOWN */}
                            <LaunchCountdown />

                            {/* LIVE STATS */}
                            <motion.div
                                className="flex items-center gap-6 px-6 py-3 bg-white/5 backdrop-blur-xl border border-white/10 rounded-full"
                                initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}
                            >
                                <div className="flex items-center gap-2 text-[#10B981]">
                                    <span className="w-2 h-2 rounded-full bg-[#10B981] animate-pulse shadow-[0_0_8px_#10B981]" />
                                    <span className="text-xs font-black uppercase tracking-widest">Devnet Live</span>
                                </div>
                                {(ecosystemStats.botCount > 0 || liveStats.markets > 0) && (
                                    <>
                                        <div className="w-px h-4 bg-white/10" />
                                        <span className="text-white font-black text-sm tabular-nums">{ecosystemStats.botCount}</span>
                                        <span className="text-white/40 text-xs">Bots</span>
                                        <div className="w-px h-4 bg-white/10" />
                                        <span className="text-white font-black text-sm tabular-nums">{ecosystemStats.activeMarkets || liveStats.markets}</span>
                                        <span className="text-white/40 text-xs">Markets</span>
                                    </>
                                )}
                            </motion.div>

                            {/* CONNECT WALLET — the only CTA */}
                            <motion.div className="w-full flex flex-col items-center gap-4" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
                                <button
                                    onClick={handleConnect}
                                    disabled={isRegistering}
                                    className="w-full py-5 font-black uppercase text-base tracking-wider
                                        bg-white text-black hover:bg-[#FF69B4] hover:text-black
                                        rounded-2xl border-[3px] border-black
                                        shadow-[6px_6px_0px_#FF69B4]
                                        hover:shadow-[3px_3px_0px_#FF69B4] hover:translate-x-[3px] hover:translate-y-[3px]
                                        active:shadow-none active:translate-x-[6px] active:translate-y-[6px]
                                        transition-all duration-150 flex items-center justify-center gap-3"
                                >
                                    Connect Wallet <ArrowRight className="w-5 h-5 stroke-[3]" />
                                </button>
                                <p className="text-white/25 text-xs font-medium">Phantom · Backpack · Solflare · Ledger</p>
                            </motion.div>
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
