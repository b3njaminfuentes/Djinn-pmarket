'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter, usePathname } from 'next/navigation';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { LAMPORTS_PER_SOL } from '@solana/web3.js';
import { useCategory } from '@/lib/CategoryContext';
import { useModal } from '@/lib/ModalContext';
import { useAchievement } from '@/lib/AchievementContext';
import OnboardingModal from './OnboardingModal';
import CustomWalletModal from './CustomWalletModal';
import CategoryMegaMenu from './CategoryMegaMenu';
import WalletProfileMenu from './WalletProfileMenu';
import GlobalSearch from './GlobalSearch';
import ClaimUsernameModal from './ClaimUsernameModal';
import HowItWorksModal from './HowItWorksModal';
import { useSound } from '@/components/providers/SoundProvider';
import MorphingIcon from '@/components/ui/MorphingIcon';
import { motion, AnimatePresence } from 'framer-motion';
import { getUnreadNotificationCount, getNotifications, markNotificationsRead } from '@/lib/supabase-db';
import type { Notification, Profile } from '@/lib/supabase-db';

const mainCategories = ["Trending", "New", "Earth", "Politics", "Crypto", "Sports", "Culture", "Tech", "Science", "Finance", "Climate", "Mentions", "Movies", "AI", "Gaming", "Music"];
const earthSubcategories = ["North America", "Central America", "South America", "Europe", "Africa", "Asia", "Oceania"];

function NavbarContent() {
    const [isOpen, setIsOpen] = useState(false);
    const [isNavMenuOpen, setIsNavMenuOpen] = useState(false);
    const [userPfp, setUserPfp] = useState<string | null>(null);
    const [username, setUsername] = useState<string>("User");
    const [hasGenesisGem, setHasGenesisGem] = useState<boolean>(false);
    const [balance, setBalance] = useState<number>(0);
    const { openCreateMarket, openActivityFeed } = useModal();
    const { unlockAchievement } = useAchievement();
    const { play } = useSound();
    const router = useRouter();
    const pathname = usePathname();

    // Hide navbar search on home/markets page (has its own big search bar)
    const isHomePage = pathname === '/' || pathname === '/markets';

    useEffect(() => {
        console.log("🔌 STARTUP Supabase URL:", process.env.NEXT_PUBLIC_SUPABASE_URL);
    }, []);

    const [mounted, setMounted] = useState(false);
    useEffect(() => { setMounted(true); }, []);

    const { connected, publicKey, disconnect } = useWallet();
    const { connection } = useConnection();

    const [isWalletModalOpen, setIsWalletModalOpen] = useState(false);
    const [isClaimModalOpen, setIsClaimModalOpen] = useState(false);
    const [isHowItWorksOpen, setIsHowItWorksOpen] = useState(false);
    const [tempConnectedWallet, setTempConnectedWallet] = useState<string | null>(null);

    // Notifications
    const [notificationCount, setNotificationCount] = useState(0);
    const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
    const [notifications, setNotifications] = useState<(Notification & { from_profile?: Profile })[]>([]);

    // Cargar perfil (Local + Supabase + Balance)
    const loadProfile = async () => {
        if (!connected || !publicKey) {
            setUsername('');
            setUserPfp('');
            return;
        }

        const walletAddress = publicKey.toBase58();

        try {
            const cachedProfile = localStorage.getItem(`djinn_profile_${walletAddress}`);
            if (cachedProfile) {
                const profile = JSON.parse(cachedProfile);
                setUsername(profile.username || 'Anon');
                setUserPfp(profile.avatar_url && profile.avatar_url.trim() ? profile.avatar_url : '/pink-pfp.png');
                setHasGenesisGem(!!profile.has_genesis_gem);
            }
        } catch (e) {
            console.error('Cache read error:', e);
        }

        try {
            const { getProfile } = await import('@/lib/supabase-db');
            const dbProfile = await getProfile(walletAddress);

            if (dbProfile) {
                const profileData = {
                    username: dbProfile.username || `${walletAddress.slice(0, 4)}...${walletAddress.slice(-4)}`,
                    avatar_url: dbProfile.avatar_url && dbProfile.avatar_url.trim() ? dbProfile.avatar_url : '/pink-pfp.png',
                    bio: dbProfile.bio || '',
                    has_genesis_gem: !!dbProfile.has_genesis_gem
                };

                setUsername(profileData.username);
                setUserPfp(profileData.avatar_url);
                setHasGenesisGem(profileData.has_genesis_gem);

                try {
                    localStorage.setItem(`djinn_profile_${walletAddress}`, JSON.stringify(profileData));
                } catch (quotaErr) {
                    console.warn('⚠️ LocalStorage full, skipped profile cache update');
                }
            } else {
                // Check if this wallet is a registered bot
                try {
                    const botCheck = await fetch(`/api/bot/check?wallet=${walletAddress}`);
                    const botData = await botCheck.json();
                    if (botData.isBot) {
                        console.log('🤖 Bot wallet detected:', botData.botName);
                        // Only redirect if we are on home/markets and not already on a specific bot/market page
                        const isProtectedPage = pathname.startsWith('/market/') || pathname.startsWith('/bot/') || pathname.startsWith('/profile/');
                        if (!isProtectedPage && pathname !== '/bots') {
                            router.push('/bots');
                        }
                        return; // Bot wallets don't need the claim flow
                    }
                } catch {
                    // If check fails, continue with normal flow
                }

                console.log('✨ New User Detected! Opening Claim Flow for:', walletAddress);
                setTempConnectedWallet(walletAddress);
                if (pathname !== '/bots' && !pathname.startsWith('/bot/')) {
                    setIsClaimModalOpen(true);
                }
            }
        } catch (err: any) {
            console.error('🔴 Database sync error:', err);
            // If Supabase is down or blocked, don't crash the UI, but log clearly
            if (err.message?.includes('PGRST')) {
                console.warn('Supabase query failed, might be a schema issue or network.');
            }
        }
    };

    const handleClaimSuccess = async (newUsername: string) => {
        // Do NOT close modal here. Let the modal handle the transition to 'SUCCESS' step.
        // The modal will call onClose when the user clicks 'Skip' or finishes.
        setUsername(newUsername);
        setUserPfp('/pink-pfp.png');

        if (connected && publicKey) {
            try {
                const { getWhitelistStatus } = await import('@/lib/whitelist');
                const status = await getWhitelistStatus(publicKey.toBase58());
                const { getUserAchievements, grantAchievement } = await import('@/lib/supabase-db');

                if (status.isRegistered || status.isAdmin) {
                    const achievements = await getUserAchievements(publicKey.toBase58());
                    if (!achievements.some(a => a.code === 'GENESIS_MEMBER')) {
                        unlockAchievement({
                            name: "Genesis Member",
                            description: "One of the first 1000 Djinn users",
                            image_url: "/genesis-medal-v2.png"
                        });
                        grantAchievement(publicKey.toBase58(), 'GENESIS_MEMBER');
                        localStorage.setItem(`djinn_genesis_notified_v16_${publicKey.toBase58()}`, 'true');
                    }
                }
            } catch (e) {
                console.error("Error triggering instant achievement:", e);
            }
        }
    };

    const handleClaimClose = () => {
        setIsClaimModalOpen(false);
        disconnect();
    };

    useEffect(() => {
        let subscriptionId: number;

        if (connected && publicKey) {
            loadProfile();

            connection.getBalance(publicKey).then((bal) => {
                setBalance(bal / LAMPORTS_PER_SOL);
            }).catch(e => console.error("Initial balance fetch error:", e));

            try {
                subscriptionId = connection.onAccountChange(
                    publicKey,
                    (updatedAccountInfo) => {
                        setBalance(updatedAccountInfo.lamports / LAMPORTS_PER_SOL);
                    },
                    'confirmed'
                );
            } catch (e) {
                console.error("Failed to subscribe to account changes:", e);
            }

            const handleProfileUpdate = () => {
                loadProfile();
            };
            window.addEventListener('djinn-profile-updated', handleProfileUpdate);

            return () => {
                if (subscriptionId) connection.removeAccountChangeListener(subscriptionId);
                window.removeEventListener('djinn-profile-updated', handleProfileUpdate);
            };
        }
    }, [connected, publicKey, connection]);

    useEffect(() => {
        let isAborted = false;
        const safeLoad = async () => {
            if (isAborted) return;
            try {
                await loadProfile();
            } catch (e: any) {
                if (e.message?.includes('quota') || e.message?.includes('429')) {
                    isAborted = true;
                }
            }
        };
        safeLoad();
        const interval = setInterval(safeLoad, 60000);
        return () => clearInterval(interval);
    }, [connected, publicKey]);

    useEffect(() => {
        if (connected) {
            const hasAutoOpened = sessionStorage.getItem('djinn_menu_auto_opened');
            if (!hasAutoOpened) {
                setTimeout(() => {
                    setIsOpen(true);
                    sessionStorage.setItem('djinn_menu_auto_opened', 'true');
                }, 500);
            }
        } else {
            setIsOpen(false);
            sessionStorage.removeItem('djinn_menu_auto_opened');
        }
    }, [connected]);

    // Poll notification count every 30s
    useEffect(() => {
        if (!connected || !publicKey) {
            setNotificationCount(0);
            return;
        }

        const wallet = publicKey.toBase58();
        const fetchCount = () => {
            getUnreadNotificationCount(wallet).then(setNotificationCount);
        };
        fetchCount();
        const interval = setInterval(fetchCount, 30000);
        return () => clearInterval(interval);
    }, [connected, publicKey]);

    const handleOpenNotifications = async () => {
        if (!publicKey) return;
        const wallet = publicKey.toBase58();
        setIsNotificationsOpen(true);
        setIsNavMenuOpen(false);

        const notifs = await getNotifications(wallet);
        setNotifications(notifs);

        // Mark as read
        await markNotificationsRead(wallet);
        setNotificationCount(0);
    };

    return (
        <>
            <nav className="fixed top-0 left-0 w-full z-50 bg-black">
                <style jsx global>{`
                @keyframes breathe {
                    0%, 100% { opacity: 1; transform: scale(1); }
                    50% { opacity: 0.6; transform: scale(0.9); }
                }
                @keyframes flameModern {
                    0%, 100% { transform: scaleY(1) scaleX(1); opacity: 1; }
                    25% { transform: scaleY(1.08) scaleX(0.95); opacity: 0.95; }
                    50% { transform: scaleY(0.92) scaleX(1.05); opacity: 1; }
                    75% { transform: scaleY(1.05) scaleX(0.97); opacity: 0.9; }
                }
                .animate-star-slow { animation: breathe 3s ease-in-out infinite; }
                .animate-flame-modern { animation: flameModern 1.2s ease-in-out infinite; transform-origin: bottom center; }
            `}</style>

                <div className="w-full px-6 md:px-12 h-24 flex items-center justify-between relative">
                    <Link href="/markets" className="flex items-center group gap-0">
                        <div className="relative w-16 h-16 md:w-24 md:h-24 transition-transform duration-500 group-hover:scale-110 -mr-3">
                            <Image src="/djinn-logo.png" alt="Djinn Logo" fill className="object-contain" priority />
                        </div>
                        <span className="text-3xl md:text-5xl text-white mt-1 relative z-10" style={{ fontFamily: 'var(--font-adriane), serif', fontWeight: 700 }}>
                            Djinn
                        </span>
                    </Link>

                    {!isHomePage && (
                        <div className="hidden md:flex flex-1 justify-center z-50 px-4">
                            {mounted && <GlobalSearch />}
                        </div>
                    )}

                    <div className="flex items-center gap-4">
                        <div className="hidden sm:flex items-center gap-4">

                            {pathname !== '/markets' && (
                                <motion.button
                                    whileHover={{ scale: 1.05 }}
                                    whileTap={{ scale: 0.95 }}
                                    onClick={() => {
                                        openCreateMarket();
                                        play('click');
                                    }}
                                    className="bg-[#F492B7] text-black text-sm font-black py-3 px-6 rounded-xl hover:brightness-110 active:scale-95 transition-all uppercase tracking-wide shadow-lg"
                                >
                                    Create a Market
                                </motion.button>
                            )}

                            {!mounted ? (
                                <div className="px-5 py-2.5 rounded-xl bg-[#1A1A1A] text-gray-400 text-[11px] font-black uppercase tracking-wider border-2 border-white/10">
                                    Loading...
                                </div>
                            ) : pathname === '/bots' ? (
                                <div className="px-5 py-2.5 rounded-xl bg-[#F492B7]/10 text-[#F492B7] border-2 border-[#F492B7]/20 text-[10px] font-black uppercase tracking-wider">
                                    Bot Mode
                                </div>
                            ) : !connected ? (
                                <button
                                    onClick={() => { setIsWalletModalOpen(true); play('click'); }}
                                    className="px-5 py-2.5 rounded-xl bg-white text-black border-2 border-black text-[11px] font-black uppercase tracking-wider shadow-[4px_4px_0px_0px_#F492B7] hover:translate-y-1 hover:shadow-[2px_2px_0px_0px_#F492B7] active:translate-y-1 active:shadow-none transition-all duration-300"
                                >
                                    Connect Wallet
                                </button>
                            ) : (
                                <>
                                    <div className="flex items-center gap-3">
                                        <div
                                            className="relative w-10 h-10 rounded-full overflow-hidden bg-black cursor-pointer hover:scale-105 transition-transform"
                                            onClick={() => setIsOpen(!isOpen)}
                                        >
                                            <img
                                                src={userPfp || "/pink-pfp.png"}
                                                alt="Profile"
                                                className="w-full h-full object-cover"
                                                onError={(e) => { setUserPfp(null); }}
                                            />
                                        </div>

                                        <Link
                                            href="/profile/me"
                                            className="flex flex-col items-start leading-none group hover:opacity-80 transition-all"
                                        >
                                            <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mb-0.5 group-hover:text-[#F492B7]">
                                                {username && username !== 'User' && !username.startsWith(publicKey?.toString().slice(0, 4) || 'xxxx')
                                                    ? username
                                                    : `${publicKey?.toString().slice(0, 4)}...${publicKey?.toString().slice(-4)}`
                                                }
                                            </span>
                                            <span className="text-xs font-bold text-white tracking-tight" style={{ fontFamily: 'var(--font-adriane), serif' }}>
                                                {balance.toFixed(2)} SOL
                                            </span>
                                        </Link>

                                        <span
                                            className="text-gray-500 text-xs cursor-pointer hover:text-white transition-colors ml-1"
                                            onClick={() => setIsOpen(!isOpen)}
                                        >
                                            ▼
                                        </span>
                                    </div>

                                    <div className="relative">
                                        <motion.button
                                            whileHover={{ scale: 1.05 }}
                                            whileTap={{ scale: 0.95 }}
                                            onClick={() => {
                                                setIsNavMenuOpen(!isNavMenuOpen);
                                                play('toggle');
                                            }}
                                            className="relative p-2 text-black bg-[#F492B7] rounded-xl hover:brightness-110 active:scale-95 transition-all shadow-lg"
                                        >
                                            <MorphingIcon type={isNavMenuOpen ? "close" : "menu"} size={24} />
                                            {notificationCount > 0 && (
                                                <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] bg-red-500 text-white text-[10px] font-black rounded-full flex items-center justify-center px-1 border-2 border-black animate-pulse">
                                                    {notificationCount > 9 ? '9+' : notificationCount}
                                                </span>
                                            )}
                                        </motion.button>

                                        {isNavMenuOpen && (
                                            <>
                                                <div className="fixed inset-0 z-[100]" onClick={() => setIsNavMenuOpen(false)} />
                                                <div className="absolute top-12 right-0 w-48 bg-black border-2 border-white rounded-xl z-[101] py-3 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                                                    <Link
                                                        href="/leaderboard"
                                                        onClick={() => setIsNavMenuOpen(false)}
                                                        className="w-full flex items-center gap-3 px-5 py-3 text-white hover:text-black hover:bg-[#F492B7] transition-all text-sm font-bold group"
                                                    >
                                                        <MorphingIcon type="leaderboard" size={18} />
                                                        <span>Leaderboard</span>
                                                    </Link>
                                                    <Link
                                                        href="/activity"
                                                        onClick={() => setIsNavMenuOpen(false)}
                                                        className="w-full flex items-center gap-3 px-5 py-3 text-white hover:text-black hover:bg-[#F492B7] transition-all text-sm font-bold group text-left"
                                                    >
                                                        <MorphingIcon type="activity" size={18} />
                                                        <span>Activity Feed</span>
                                                    </Link>
                                                    <Link
                                                        href="/bots"
                                                        onClick={() => setIsNavMenuOpen(false)}
                                                        className="w-full flex items-center gap-3 px-5 py-3 text-white hover:text-black hover:bg-[#F492B7] transition-all text-sm font-bold group"
                                                    >
                                                        <span className="text-lg">🤖</span>
                                                        <span>AI Agents</span>
                                                    </Link>
                                                    <Link
                                                        href="/web4"
                                                        onClick={() => setIsNavMenuOpen(false)}
                                                        className="w-full flex items-center gap-3 px-5 py-3 text-white hover:text-black hover:bg-[#F492B7] transition-all text-sm font-bold group"
                                                    >
                                                        <span className="text-lg">⚡</span>
                                                        <span>Web 4.0 Hub</span>
                                                    </Link>

                                                    <button
                                                        onClick={handleOpenNotifications}
                                                        className="w-full flex items-center gap-3 px-5 py-3 text-white hover:text-black hover:bg-[#F492B7] transition-all text-sm font-bold group relative"
                                                    >
                                                        <span className="text-lg">🔔</span>
                                                        <span>Notifications</span>
                                                        {notificationCount > 0 && (
                                                            <span className="ml-auto min-w-[20px] h-[20px] bg-red-500 text-white text-[10px] font-black rounded-full flex items-center justify-center px-1">
                                                                {notificationCount}
                                                            </span>
                                                        )}
                                                    </button>

                                                    <div className="border-t-2 border-white my-1" />

                                                    <Link
                                                        href={`/profile/me`}
                                                        onClick={() => setIsNavMenuOpen(false)}
                                                        className="w-full flex items-center gap-3 px-5 py-3 text-[#F492B7] hover:bg-white hover:text-black transition-all text-sm font-black uppercase tracking-wider"
                                                    >
                                                        <span className="text-lg">👤</span>
                                                        <span>Profile</span>
                                                    </Link>


                                                </div>
                                            </>
                                        )}
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                </div>

                <CategoryMegaMenu />
            </nav>

            {/* NOTIFICATIONS PANEL */}
            <AnimatePresence>
                {isNotificationsOpen && (
                    <>
                        <div className="fixed inset-0 z-[80] bg-black/40 backdrop-blur-sm" onClick={() => setIsNotificationsOpen(false)} />
                        <motion.div
                            initial={{ opacity: 0, y: -20, scale: 0.95 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: -20, scale: 0.95 }}
                            transition={{ duration: 0.2 }}
                            className="fixed top-28 right-6 w-[360px] max-h-[70vh] bg-[#1A1A1A] border-2 border-white/20 rounded-2xl shadow-[8px_8px_0px_0px_rgba(244,146,183,0.3)] z-[81] overflow-hidden flex flex-col"
                        >
                            <div className="p-4 border-b border-white/10 flex items-center justify-between">
                                <h3 className="text-white text-sm font-black uppercase tracking-widest">Notifications</h3>
                                <button onClick={() => setIsNotificationsOpen(false)} className="text-gray-400 hover:text-white transition-colors font-black">✕</button>
                            </div>
                            <div className="overflow-y-auto flex-1">
                                {notifications.length === 0 ? (
                                    <div className="p-8 text-center text-gray-500 text-xs font-bold uppercase tracking-widest">
                                        No notifications yet
                                    </div>
                                ) : (
                                    notifications.map((notif, i) => (
                                        <button
                                            key={notif.id || i}
                                            onClick={() => {
                                                setIsNotificationsOpen(false);
                                                const profileName = notif.from_profile?.username || notif.from_wallet;
                                                router.push(`/profile/${profileName}`);
                                            }}
                                            className="w-full flex items-center gap-3 p-4 hover:bg-white/5 transition-colors text-left border-b border-white/5 last:border-0 group"
                                        >
                                            <img
                                                src={notif.from_profile?.avatar_url || '/pink-pfp.png'}
                                                alt=""
                                                className="w-10 h-10 rounded-full object-cover bg-black border border-white/10 group-hover:border-[#F492B7]/50 transition-colors flex-shrink-0"
                                                onError={(e) => { e.currentTarget.src = '/pink-pfp.png'; }}
                                            />
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm text-white">
                                                    <span className="font-black text-[#F492B7] group-hover:text-white transition-colors">
                                                        {notif.from_profile?.username || `${notif.from_wallet.slice(0, 4)}...${notif.from_wallet.slice(-4)}`}
                                                    </span>
                                                    {' '}{notif.message}
                                                </p>
                                                <p className="text-[10px] text-gray-500 mt-1">
                                                    {notif.created_at ? new Date(notif.created_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}
                                                </p>
                                            </div>
                                            {!notif.read && (
                                                <span className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0" />
                                            )}
                                        </button>
                                    ))
                                )}
                            </div>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>

            <WalletProfileMenu
                isOpen={isOpen}
                onClose={() => setIsOpen(false)}
                username={username || 'Anon'}
                pfp={userPfp || '/pink-pfp.png'}
                walletAddress={publicKey ? publicKey.toBase58() : ''}
                disconnect={() => { disconnect(); setIsOpen(false); }}
                onEditProfile={() => {
                    setIsOpen(false);
                    if (username) router.push(`/profile/${username}`);
                }}
                openCreateMarket={openCreateMarket}
                openActivityFeed={openActivityFeed}
                connected={connected}
                publicKey={publicKey}
                hasGenesisGem={hasGenesisGem}
            />

            <CustomWalletModal
                isOpen={isWalletModalOpen}
                onClose={() => setIsWalletModalOpen(false)}
            />

            <ClaimUsernameModal
                isOpen={isClaimModalOpen}
                walletAddress={tempConnectedWallet || publicKey?.toBase58() || ''}
                onSuccess={handleClaimSuccess}
                onClose={handleClaimClose}
            />

            <HowItWorksModal
                isOpen={isHowItWorksOpen}
                onClose={() => setIsHowItWorksOpen(false)}
            />
        </>
    );
}

export default function Navbar() {
    return (
        <React.Suspense fallback={<div className="h-20 bg-black/50 backdrop-blur-md border-b border-white/5" />}>
            <NavbarContent />
        </React.Suspense>
    );
}
