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

const StarfieldBg = dynamic(() => import('@/components/StarfieldBg'), {
    ssr: false,
    loading: () => null
});

import ClaimUsernameModal from '@/components/ClaimUsernameModal';
import { getProfile } from '@/lib/supabase-db';
import { supabase } from '@/lib/supabase';

const ClawBotConnect = dynamic(() => import('@/components/ClawBotConnect'), { ssr: false });



// ─── Waitlist Panel ───────────────────────────────────────────────────────────

function WaitlistPanel({ position, totalCount, walletAddress }: { position: number; totalCount: number; walletAddress: string }) {
    const GENESIS_LIMIT = 1000;
    const filled = Math.min(totalCount, GENESIS_LIMIT);
    const spotsLeft = Math.max(0, GENESIS_LIMIT - filled);
    const [users, setUsers] = React.useState<any[]>([]);

    React.useEffect(() => {
        const fetchBots = async () => {
            const { data } = await supabase
                .from('profiles')
                .select('username, wallet_address, created_at, avatar_url')
                .eq('agent_type', 'clawbot')
                .order('created_at', { ascending: false })
                .limit(50);
            if (data) setUsers(data);
        };
        fetchBots();

        const channel = supabase
            .channel('waitlist_bots_realtime')
            .on(
                'postgres_changes',
                { event: 'INSERT', schema: 'public', table: 'profiles', filter: 'agent_type=eq.clawbot' },
                (payload) => {
                    setUsers((current) => [payload.new, ...current].slice(0, 50));
                }
            )
            .subscribe();

        return () => { supabase.removeChannel(channel); };
    }, []);

    return (
        <div className="w-full flex flex-col gap-5">
            {/* Position card */}
            <div className="bg-white text-black border-[4px] border-black rounded-[2rem] shadow-[10px_10px_0px_0px_#F492B7] overflow-hidden">
                <div className="bg-black px-6 py-3 flex items-center">
                    <div className="flex items-center gap-2.5">
                        <span className="w-2 h-2 rounded-full bg-[#F492B7] animate-pulse" />
                        <span className="text-white font-black text-[10px] uppercase tracking-[0.25em]">Genesis Waitlist</span>
                    </div>
                </div>
                <div className="px-7 py-6 flex items-end justify-between">
                    <div>
                        <p className="text-black/40 font-black text-[9px] uppercase tracking-[0.3em] mb-1">Your Position</p>
                        <p className="font-black text-6xl lowercase tracking-tighter leading-none italic text-black">
                            #{position || '\u2014'}
                        </p>
                    </div>
                    <div className="text-right">
                        <p className="text-black/40 font-black text-[9px] uppercase tracking-[0.3em] mb-1">Total</p>
                        <p className="font-black text-4xl tracking-tighter text-black tabular-nums pb-1">
                            {filled}
                        </p>
                    </div>
                </div>
            </div>
        </div>
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
    const [ecosystemStats, setEcosystemStats] = useState({ waitlistCount: 0, botCount: 0, humanCount: 0, activeMarkets: 0 });

    const walletAddress = useMemo(() => publicKey?.toBase58(), [publicKey]);
    const [showWelcome, setShowWelcome] = useState(false);

    // Welcome transition → auto-register + claim modal
    useEffect(() => {
        if (connected && walletAddress && !loading && !profile && !isClaimModalOpen && !showWelcome) {
            // Check if spots are available before showing welcome
            if (status.isFull && !status.isRegistered && !status.isAdmin) {
                console.log("🚫 [Home] Spots full, denying access.");
                return;
            }

            setShowWelcome(true);
            registerForWhitelist(walletAddress).then((res) => {
                if (res.success) {
                    setTimeout(() => {
                        setShowWelcome(false);
                        setIsClaimModalOpen(true);
                    }, 2200);
                } else {
                    console.error("❌ [Home] Failed to register:", res.message);
                    setShowWelcome(false);
                }
            });
        }
    }, [connected, walletAddress, loading, profile, isClaimModalOpen, showWelcome, status]);

    // Enhanced Cookie management — protects routes via middleware
    useEffect(() => {
        if (connected && walletAddress) {
            document.cookie = `djinn_connected=${walletAddress};path=/;max-age=${60 * 60 * 24 * 7};SameSite=Lax`;

            // Set access cookie if the user has a profile or is whitelisted
            if (profile || status.isRegistered || status.isAdmin) {
                document.cookie = `djinn_access=true;path=/;max-age=${60 * 60 * 24 * 7};SameSite=Lax`;
            }
        } else {
            document.cookie = 'djinn_connected=;path=/;max-age=0';
            document.cookie = 'djinn_access=;path=/;max-age=0';
        }
    }, [connected, walletAddress, profile, status]);

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

            // NOTE: Claim modal is handled by the handleConnect button only
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

        // Check if waitlist is full and user is not registered
        if (status.isFull && !status.isRegistered && !status.isAdmin) {
            // We handle this visually in the render now
            return;
        }

        // Si ya está conectado pero no tiene perfil, forzamos abrir el modal de claim
        if (connected && !profile) {
            console.log("💎 User connected but no profile, opening Claim Modal...");
            setIsClaimModalOpen(true);
        }
    }, [connected, profile, status]);

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
            {/* Starfield Background */}
            <div className="fixed inset-0 z-0">
                <StarfieldBg />
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
                            {status.isRegistered || status.isAdmin ? (
                                <>
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

                                    {/* WAITLIST BLOCK + CLAWBOT PANEL */}
                                    <motion.div
                                        initial={{ opacity: 0, y: 20 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: 0.3 }}
                                        className="w-full max-w-xl flex flex-col items-center gap-5"
                                    >
                                        {status.isAdmin ? (
                                            <Link href="/markets" className="w-full">
                                                <button className="w-full py-5 px-16 font-black uppercase text-xl md:text-2xl italic tracking-widest bg-[#F492B7] text-black rounded-full border-[4px] border-black shadow-[6px_6px_0px_rgba(0,0,0,1)] hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[4px_4px_0px_rgba(0,0,0,1)] transition-all flex flex-col items-center justify-center gap-1">
                                                    <span className="flex items-center gap-3">ENTER DJINN</span>
                                                </button>
                                            </Link>
                                        ) : profile.has_access ? (
                                            /* ACCESS GRANTED */
                                            /* WAITLIST LOCKED STATE */
                                            <div
                                                className="py-5 px-16 font-black uppercase text-xl italic tracking-widest
                                                    bg-white text-black/40 rounded-full
                                                    border-[4px] border-black/40
                                                    shadow-[6px_6px_0px_rgba(0,0,0,0.15)]
                                                    flex flex-col items-center justify-center gap-1 cursor-default select-none"
                                            >
                                                <span className="flex items-center gap-3">
                                                    GATEWAY LOCKED
                                                </span>
                                                <span className="text-[10px] font-bold tracking-[0.3em] not-italic">OPENING FEB 28</span>
                                            </div>
                                        ) : (
                                            <WaitlistPanel
                                                position={profile.user_number || status.count}
                                                totalCount={status.count}
                                                walletAddress={walletAddress || ''}
                                            />
                                        )}
                                    </motion.div>

                                    {/* ClawBot Connect */}
                                    <ClawBotConnect walletAddress={walletAddress || ''} />
                                </>
                            ) : (
                                <div className="flex flex-col items-center gap-8 py-10">
                                    <div className="bg-[#FF0055] text-white border-[6px] border-black px-12 py-6 rounded-[2rem] shadow-[12px_12px_0px_#000] transform -rotate-2">
                                        <p className="font-black uppercase text-4xl md:text-5xl tracking-tighter italic">
                                            Spots Full
                                        </p>
                                    </div>
                                    <p className="text-white/60 font-black uppercase text-xs md:text-sm tracking-[0.3em] text-center max-w-xs mt-4 leading-relaxed">
                                        Waitlist at maximum capacity. <br /> Follow @djinnmarkets for next wave access.
                                    </p>
                                    <motion.a
                                        href="https://x.com/djinnmarkets"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        whileHover={{ scale: 1.05, rotate: 2 }}
                                        whileTap={{ scale: 0.95 }}
                                        className="mt-4 px-8 py-4 bg-white text-black border-[4px] border-black rounded-2xl shadow-[8px_8px_0px_#F492B7] font-black uppercase text-sm tracking-widest flex items-center gap-3 hover:shadow-[4px_4px_0px_#F492B7] hover:translate-x-1 hover:translate-y-1 transition-all"
                                    >
                                        <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" /></svg>
                                        Follow DJINN Updates
                                    </motion.a>
                                </div>
                            )}
                        </div>
                    ) : showWelcome ? (
                        /* Welcome transition — after wallet connects */
                        <motion.div
                            key="welcome-screen"
                            initial={{ opacity: 0, scale: 0.85 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 1.05 }}
                            transition={{ type: 'spring', stiffness: 120, damping: 18 }}
                            className="flex flex-col items-center gap-8 py-16"
                        >
                            <motion.div
                                animate={{ scale: [1, 1.08, 1] }}
                                transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
                                className="w-36 h-36 relative"
                            >
                                <Image src="/djinn-logo.png" alt="Djinn" fill className="object-contain" />
                            </motion.div>
                            <motion.h2
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.3 }}
                                className="text-5xl md:text-7xl font-black text-white lowercase tracking-tighter italic"
                                style={{ fontFamily: 'var(--font-adriane), serif' }}
                            >
                                Welcome
                            </motion.h2>
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                transition={{ delay: 0.7 }}
                                className="flex items-center gap-3 px-6 py-3 bg-white/5 border border-white/10 rounded-full"
                            >
                                <span className="w-2 h-2 rounded-full bg-[#10B981] animate-pulse" />
                                <span className="text-white/60 font-black text-xs uppercase tracking-[0.2em]">Wallet Connected</span>
                            </motion.div>
                        </motion.div>
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
                            className="flex flex-col items-center"
                        >
                            {(status.isFull || ecosystemStats.humanCount >= 1000) && !status.isRegistered && !status.isAdmin ? (
                                <div className="flex flex-col items-center gap-6">
                                    <div className="bg-[#FF0055] text-white border-[6px] border-black px-12 py-6 rounded-[2rem] shadow-[12px_12px_0px_#000] transform -rotate-2">
                                        <p className="font-black uppercase text-4xl md:text-5xl tracking-tighter italic">
                                            Spots Full
                                        </p>
                                    </div>
                                    <p className="text-white/60 font-black uppercase text-xs md:text-sm tracking-[0.3em] text-center max-w-xs mt-4 leading-relaxed">
                                        Waitlist at maximum capacity. <br /> Follow for next wave access.
                                    </p>
                                    <motion.a
                                        href="https://x.com/djinnmarkets"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        whileHover={{ scale: 1.05, rotate: 2 }}
                                        whileTap={{ scale: 0.95 }}
                                        className="mt-4 px-8 py-4 bg-white text-black border-[4px] border-black rounded-2xl shadow-[8px_8px_0px_#F492B7] font-black uppercase text-sm tracking-widest flex items-center gap-3 hover:shadow-[4px_4px_0px_#F492B7] hover:translate-x-1 hover:translate-y-1 transition-all"
                                    >
                                        <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" /></svg>
                                        Follow @djinnmarkets
                                    </motion.a>
                                </div>
                            ) : (
                                <>
                                    <motion.button
                                        initial={{ opacity: 0, y: 15 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: 0.2 }}
                                        onClick={handleConnect}
                                        className="group relative px-10 md:px-14 py-5 md:py-6 bg-white text-black rounded-2xl md:rounded-3xl select-none
                                            border-[4px] md:border-[6px] border-black
                                            shadow-[8px_8px_0px_#F492B7] md:shadow-[12px_12px_0px_#F492B7]
                                            hover:shadow-[4px_4px_0px_#F492B7] hover:translate-x-[4px] hover:translate-y-[4px]
                                            active:shadow-none active:translate-x-[8px] active:translate-y-[8px] md:active:translate-x-[12px] md:active:translate-y-[12px]
                                            transition-all duration-200 flex items-center justify-center gap-4"
                                    >
                                        <span
                                            className="font-black uppercase tracking-[0.05em]"
                                            style={{
                                                fontFamily: 'var(--font-unbounded), sans-serif',
                                                fontSize: 'clamp(1rem, 2.5vw, 1.5rem)',
                                                lineHeight: 1
                                            }}
                                        >
                                            Connect Wallet
                                        </span>
                                        <ArrowRight className="w-6 h-6 md:w-8 md:h-8 stroke-[4] group-hover:translate-x-2 transition-transform" />
                                    </motion.button>

                                    {/* Waitlist count */}
                                    <motion.div
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        transition={{ delay: 0.4 }}
                                        className="flex flex-col items-center gap-3 mt-6"
                                    >
                                        {ecosystemStats.waitlistCount > 0 && (
                                            <div className="flex items-center gap-3 px-5 py-2 bg-white/5 border border-white/10 rounded-full">
                                                <span className="w-2 h-2 rounded-full bg-[#F492B7] animate-pulse" />
                                                <span className="text-white font-black text-base tabular-nums">{ecosystemStats.waitlistCount.toLocaleString()}</span>
                                                <span className="text-white/40 text-xs font-black uppercase tracking-widest">on waitlist</span>
                                            </div>
                                        )}
                                    </motion.div>
                                </>
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
                                className="w-full bg-[#f8f8f8] text-black font-black uppercase text-xl md:text-2xl tracking-[0.2em] py-5 md:py-6 rounded-2xl border-[4px] md:border-[6px] border-black hover:bg-[#F492B7] hover:text-white transition-all shadow-[6px_6px_0px_#000000] md:shadow-[8px_8px_0px_#000000] hover:shadow-[4px_4px_0px_#000000] hover:translate-x-[2px] hover:translate-y-[2px] md:hover:translate-x-[4px] md:hover:translate-y-[4px] active:translate-x-[6px] active:translate-y-[6px] md:active:translate-x-[8px] md:active:translate-y-[8px] active:shadow-none"
                            >
                                Welcome
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
