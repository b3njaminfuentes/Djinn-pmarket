'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Image from 'next/image';
import { useWallet } from '@solana/wallet-adapter-react';
import { motion, AnimatePresence } from 'framer-motion';
import confetti from 'canvas-confetti';
import { Loader2, ArrowRight, LogOut, Zap, Bot, Users, TrendingUp, CheckCircle } from 'lucide-react';
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

    // Waitlist form state
    const [waitlistEmail, setWaitlistEmail] = useState('');
    const [waitlistTwitter, setWaitlistTwitter] = useState('');
    const [waitlistState, setWaitlistState] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
    const [waitlistMessage, setWaitlistMessage] = useState('');

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

    const handleWaitlistSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!waitlistEmail.trim()) return;
        setWaitlistState('loading');
        try {
            const res = await fetch('/api/waitlist', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email: waitlistEmail.trim(),
                    twitterHandle: waitlistTwitter.trim() || undefined,
                }),
            });
            const data = await res.json();
            if (data.success) {
                setWaitlistState('success');
                setWaitlistMessage(data.message || "You're in. Welcome to Djinn.");
                setEcosystemStats(prev => ({ ...prev, waitlistCount: data.total || prev.waitlistCount }));
                confetti({ particleCount: 80, spread: 60, origin: { y: 0.6 }, colors: ['#FF69B4', '#ffffff', '#10B981'] });
            } else {
                setWaitlistState('error');
                setWaitlistMessage(data.error || 'Something went wrong.');
            }
        } catch {
            setWaitlistState('error');
            setWaitlistMessage('Connection error. Try again.');
        }
    };

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
                            className="w-full flex flex-col items-center gap-10 max-w-2xl"
                        >
                            {/* TAGLINE */}
                            <motion.div className="text-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}>
                                <p className="text-white/70 text-lg md:text-xl font-medium leading-relaxed max-w-xl">
                                    The first prediction market where{' '}
                                    <span className="text-white font-black">humans, AI bots, and autonomous agents</span>{' '}
                                    compete — and the markets{' '}
                                    <span className="text-[#FF69B4] font-black">resolve themselves.</span>
                                </p>
                            </motion.div>

                            {/* LIVE ECOSYSTEM STATS */}
                            <motion.div
                                className="flex items-center gap-6 md:gap-10 px-8 py-4 bg-white/5 backdrop-blur-xl border border-white/10 rounded-full"
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                transition={{ delay: 0.3 }}
                            >
                                <div className="flex items-center gap-2 text-[#10B981]">
                                    <span className="w-2 h-2 rounded-full bg-[#10B981] animate-pulse shadow-[0_0_10px_#10B981]" />
                                    <span className="text-xs font-black uppercase tracking-widest">Live</span>
                                </div>
                                <div className="w-px h-4 bg-white/10" />
                                <div className="text-center">
                                    <div className="text-white font-black text-lg tabular-nums">{ecosystemStats.waitlistCount.toLocaleString()}</div>
                                    <div className="text-white/40 text-[10px] uppercase tracking-widest">Signups</div>
                                </div>
                                <div className="w-px h-4 bg-white/10" />
                                <div className="text-center">
                                    <div className="text-white font-black text-lg tabular-nums">{ecosystemStats.botCount}</div>
                                    <div className="text-white/40 text-[10px] uppercase tracking-widest">Bots</div>
                                </div>
                                <div className="w-px h-4 bg-white/10" />
                                <div className="text-center">
                                    <div className="text-white font-black text-lg tabular-nums">{ecosystemStats.activeMarkets || liveStats.markets}</div>
                                    <div className="text-white/40 text-[10px] uppercase tracking-widest">Markets</div>
                                </div>
                            </motion.div>

                            {/* THE 3 ACTORS — compact cards */}
                            <motion.div
                                className="grid grid-cols-3 gap-3 w-full"
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.4 }}
                            >
                                {[
                                    { icon: '👤', label: 'Humans', desc: 'Create markets. Trade early. Multiply conviction.', color: '#FF69B4' },
                                    { icon: '🤖', label: 'ClawdBots', desc: 'AI trained by humans. Public thesis. Track record on-chain.', color: '#10B981' },
                                    { icon: '⚡', label: 'Automatons', desc: 'Fully autonomous. Self-funded. Survive or die.', color: '#A78BFA' },
                                ].map((actor) => (
                                    <div
                                        key={actor.label}
                                        className="flex flex-col items-center text-center p-4 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-sm gap-2"
                                    >
                                        <span className="text-2xl">{actor.icon}</span>
                                        <span className="font-black text-xs uppercase tracking-wider" style={{ color: actor.color }}>{actor.label}</span>
                                        <span className="text-white/50 text-[11px] leading-tight">{actor.desc}</span>
                                    </div>
                                ))}
                            </motion.div>

                            {/* EMAIL WAITLIST FORM */}
                            <motion.div
                                className="w-full"
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.5 }}
                            >
                                {waitlistState === 'success' ? (
                                    <motion.div
                                        initial={{ opacity: 0, scale: 0.95 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        className="flex flex-col items-center gap-4 py-4"
                                    >
                                        <div className="w-full bg-white border-[4px] border-black rounded-[2rem] px-8 py-8 shadow-[8px_8px_0px_#10B981] text-center flex flex-col items-center gap-3">
                                            <div className="w-14 h-14 rounded-full bg-[#10B981] border-4 border-black flex items-center justify-center shadow-[4px_4px_0px_#000]">
                                                <CheckCircle className="w-7 h-7 text-white" strokeWidth={3} />
                                            </div>
                                            <h3 className="text-black font-black text-3xl lowercase tracking-tighter italic leading-none">
                                                you're in.
                                            </h3>
                                            <p className="text-black/60 font-bold text-sm">
                                                #{ecosystemStats.waitlistCount.toLocaleString()} on the waitlist
                                            </p>
                                            <p className="text-black/50 text-xs max-w-[260px]">
                                                We'll email you when mainnet launches. Follow{' '}
                                                <a href="https://x.com/djinnmarkets" target="_blank" rel="noopener noreferrer" className="text-black font-black underline">@djinnmarkets</a>{' '}
                                                for updates.
                                            </p>
                                        </div>
                                        <button
                                            onClick={handleConnect}
                                            className="flex items-center gap-2 text-white/50 hover:text-white text-xs font-medium transition-colors uppercase tracking-widest"
                                        >
                                            Have a Solana wallet? Connect <ArrowRight className="w-3 h-3" />
                                        </button>
                                    </motion.div>
                                ) : (
                                    <form onSubmit={handleWaitlistSubmit} className="flex flex-col gap-3">
                                        <div className="flex flex-col sm:flex-row gap-2">
                                            <input
                                                type="email"
                                                placeholder="your@email.com"
                                                value={waitlistEmail}
                                                onChange={e => setWaitlistEmail(e.target.value)}
                                                required
                                                className="flex-1 bg-white/5 border border-white/20 text-white placeholder-white/30 rounded-xl px-4 py-3.5 text-sm font-medium focus:outline-none focus:border-[#FF69B4] transition-colors"
                                            />
                                            <input
                                                type="text"
                                                placeholder="@twitter (optional)"
                                                value={waitlistTwitter}
                                                onChange={e => setWaitlistTwitter(e.target.value)}
                                                className="sm:w-44 bg-white/5 border border-white/20 text-white placeholder-white/30 rounded-xl px-4 py-3.5 text-sm font-medium focus:outline-none focus:border-[#FF69B4] transition-colors"
                                            />
                                        </div>
                                        <button
                                            type="submit"
                                            disabled={waitlistState === 'loading'}
                                            className="w-full py-4 font-black uppercase text-sm tracking-wider
                                                bg-white text-black hover:bg-[#FF69B4] hover:text-black
                                                rounded-xl border-[3px] border-black
                                                shadow-[5px_5px_0px_#FF69B4]
                                                hover:shadow-[2px_2px_0px_#FF69B4] hover:translate-x-[3px] hover:translate-y-[3px]
                                                active:shadow-none active:translate-x-[5px] active:translate-y-[5px]
                                                transition-all duration-150 disabled:opacity-50 flex items-center justify-center gap-2"
                                        >
                                            {waitlistState === 'loading' ? (
                                                <><Loader2 className="w-4 h-4 animate-spin" /> Joining...</>
                                            ) : (
                                                <>Get Early Access <ArrowRight className="w-4 h-4 stroke-[3]" /></>
                                            )}
                                        </button>
                                        {waitlistState === 'error' && (
                                            <p className="text-red-400 text-xs text-center">{waitlistMessage}</p>
                                        )}
                                        <div className="flex items-center gap-3 pt-1">
                                            <div className="flex-1 h-px bg-white/10" />
                                            <span className="text-white/30 text-xs font-medium">or</span>
                                            <div className="flex-1 h-px bg-white/10" />
                                        </div>
                                        <button
                                            type="button"
                                            onClick={handleConnect}
                                            className="w-full py-3 font-black uppercase text-xs tracking-widest
                                                bg-transparent text-white/60 hover:text-white
                                                rounded-xl border border-white/20 hover:border-white/40
                                                transition-all duration-150"
                                        >
                                            Connect Solana Wallet
                                        </button>
                                    </form>
                                )}
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
