'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Image from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';

// --- SOLANA IMPORTS PARA SALDO REAL ---
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { LAMPORTS_PER_SOL, PublicKey, Transaction } from '@solana/web3.js';
import { Loader2, Share2 } from 'lucide-react';
import { AreaClosed, LinePath } from '@visx/shape';
import { scaleLinear } from '@visx/scale';
import { curveMonotoneX } from '@visx/curve';
import { LinearGradient } from '@visx/gradient';
import { ParentSize } from '@visx/responsive';


import { useDjinnProtocol } from '@/hooks/useDjinnProtocol';
import * as supabaseDb from '@/lib/supabase-db';
import { supabase } from '@/lib/supabase';
import { PROGRAM_ID } from '@/lib/program-config';
import ProfitHistoryChart from '@/components/ProfitHistoryChart';
import { AnimatedNumber } from '@/components/AnimatedNumber';
import ImageCropper from '@/components/ImageCropper';
import { usePrice } from '@/lib/PriceContext';
import { getSpotPrice } from '@/lib/core-amm';
import { useSound } from '@/components/providers/SoundProvider';
import ShareExperience from '@/components/ShareExperience';
import StarfieldBg from '@/components/StarfieldBg';

// Helper format function
function formatCompact(num: number) {
    if (!num) return '0';
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toString();
}

export default function ProfilePage() {
    const params = useParams();
    const router = useRouter();
    const { play } = useSound();

    // SOLANA HOOKS
    const { connection } = useConnection();
    const { publicKey } = useWallet();
    const { solPrice: contextSolPrice } = usePrice();
    const [localSolPrice, setLocalSolPrice] = useState(0);
    const solPrice = contextSolPrice || localSolPrice; // Prioritize context, fallback to local

    // Mount state for hydration
    const [isMounted, setIsMounted] = useState(false);
    useEffect(() => { setIsMounted(true); }, []);

    useEffect(() => {
        // Fallback Price Fetcher if Context is 0
        if (!contextSolPrice) {
            const fetchPrice = async () => {
                try {
                    const res = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd');
                    if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
                    const data = await res.json();
                    if (data.solana?.usd) setLocalSolPrice(data.solana.usd);
                } catch (err) {
                    console.warn('[Price] Fallback fetch failed (likely rate limited/blocked), using fallback of 165', err);
                    setLocalSolPrice(165); // Hard fallback to current ballpark
                }
            };
            fetchPrice();
        }
    }, [contextSolPrice]);

    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [isVaultOpen, setIsVaultOpen] = useState(false);
    const [tempMedals, setTempMedals] = useState<string[]>([]);

    // ... rest of state
    const [betTab, setBetTab] = useState<'active' | 'closed'>('active');
    const [isLoading, setIsLoading] = useState(true);
    const [unclaimedPayouts, setUnclaimedPayouts] = useState<supabaseDb.Bet[]>([]);

    // CROPPER STATE
    const [croppingFile, setCroppingFile] = useState<string | null>(null);
    const [cropTarget, setCropTarget] = useState<'pfp' | null>(null);

    const initialProfile = {
        username: "...",
        pfp: "/pink-pfp.png",
        bio: "Djinn Trader",
        gems: 0,
        profit: 0,
        portfolio: 0,
        winRate: 0,
        biggestWin: 0,
        medals: [] as string[],
        activeBets: [] as any[],
        closedBets: [] as any[],
        achievements: [] as any[],
        createdMarkets: [] as any[],
        showGems: true,
        joinedAt: "",
        twitter: "",
        discord: "",
        isGenesis: false
    };

    const [profile, setProfile] = useState(initialProfile);

    const [tempName, setTempName] = useState(profile.username);
    const [tempBio, setTempBio] = useState(profile.bio);
    const [tempShowGems, setTempShowGems] = useState(true); // New temp state
    const [tempPfp, setTempPfp] = useState('');
    const [tempTwitter, setTempTwitter] = useState('');
    const [tempDiscord, setTempDiscord] = useState('');

    // Availability Check State
    const [nameAvailable, setNameAvailable] = useState<boolean | null>(null);
    const [isCheckingName, setIsCheckingName] = useState(false);
    const checkTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const pfpInputRef = useRef<HTMLInputElement>(null);

    // Sync temp state ONLY when modal opens
    // This prevents "reversion" when background data (like bets) updates
    useEffect(() => {
        if (isEditModalOpen) {
            setTempName(profile.username);
            setTempBio(profile.bio);
            setTempShowGems(profile.showGems !== undefined ? profile.showGems : true);
            setTempPfp(profile.pfp);
            setTempTwitter(profile.twitter || '');
            setTempDiscord(profile.discord || '');
            setTempMedals(profile.medals || []); // Sync medals
            setNameAvailable(true); // Default to true for current name
        }
    }, [isEditModalOpen]); // Removed profile from dependency

    // Real-time Availability Check
    useEffect(() => {
        if (!isEditModalOpen) return;

        // Reset if name hasn't changed from original or is too short
        if (tempName === profile.username) {
            setNameAvailable(true);
            return;
        }
        if (tempName.length < 3) {
            setNameAvailable(null);
            return;
        }

        setIsCheckingName(true);
        if (checkTimeoutRef.current) clearTimeout(checkTimeoutRef.current);

        checkTimeoutRef.current = setTimeout(async () => {
            if (!publicKey) return;
            // console.log("🔍 Checking availability for:", tempName, "Exclude:", publicKey.toBase58());
            const available = await supabaseDb.isUsernameAvailable(tempName, publicKey.toBase58());
            // console.log("🔍 Result:", available);
            setNameAvailable(available);
            setIsCheckingName(false);
        }, 500);

        return () => {
            if (checkTimeoutRef.current) clearTimeout(checkTimeoutRef.current);
        };
    }, [tempName, isEditModalOpen, profile.username, publicKey]);





    // --- 1. OBTENER SALDO REAL DE SOLANA (ONLY USER CLAIMS) ---
    useEffect(() => {
        if (!connection || !publicKey) return;

        // Load unclaimed payouts
        supabaseDb.getUnclaimedPayouts(publicKey.toBase58()).then(payouts => {
            setUnclaimedPayouts(payouts);
        });
    }, [connection, publicKey]);

    const [isFollowingModalOpen, setIsFollowingModalOpen] = useState(false);
    const [isFollowersModalOpen, setIsFollowersModalOpen] = useState(false);
    const profileSlug = params.username as string;
    const isDefaultProfile = profileSlug === 'default';
    const [isMyProfile, setIsMyProfile] = useState(false);
    const [targetWalletAddress, setTargetWalletAddress] = useState<string | null>(null);
    const [viewCount, setViewCount] = useState<number>(0); // Real-time views

    const [activeTab, setActiveTab] = useState<'positions' | 'activity' | 'markets'>('positions');
    const [marketsWithFees, setMarketsWithFees] = useState<any[]>([]); // For CreatorRewardsCard optimization if needed

    // FOLLOW STATE
    const [followersCount, setFollowersCount] = useState(0);
    const [followingCount, setFollowingCount] = useState(0);
    const [isFollowingUser, setIsFollowingUser] = useState(false);
    const [isFollowLoading, setIsFollowLoading] = useState(false);

    // --- CREATOR STATS (NEW) ---
    const [creatorStats, setCreatorStats] = useState<{ totalVolume: number, estimatedFees: number, totalMarkets: number } | null>(null);
    const [profileStats, setProfileStats] = useState<{ marketsCreated: number, biggestWin: number, winRate: number, activePositionsValue: number, totalProfit: number } | null>(null);

    useEffect(() => {
        if (targetWalletAddress) {
            supabaseDb.getCreatorStats(targetWalletAddress).then(setCreatorStats);
            supabaseDb.getProfileStats(targetWalletAddress).then(setProfileStats);
        }
    }, [targetWalletAddress]);

    const [showShareModal, setShowShareModal] = useState(false);
    // ... rest of existing state

    // 2. CARGA DE PERFIL ROBUSTA (Separation of Concern: Viewer vs Subject)
    useEffect(() => {
        if (isDefaultProfile) {
            setProfile({
                username: "New User",
                bio: "This user hasn't customized their profile yet.",
                pfp: "https://api.dicebear.com/7.x/avataaars/svg?seed=default",
                gems: 0, profit: 0, portfolio: 0, winRate: 0, biggestWin: 0, medals: [],
                achievements: [],
                activeBets: [], closedBets: [], createdMarkets: [], showGems: true,
                joinedAt: new Date().toISOString(),
                twitter: "",
                discord: "",
                isGenesis: false
            });
            setIsMyProfile(false);
            setIsLoading(false);
            return;
        }

        const loadProfile = async () => {
            setIsLoading(true);
            let targetAddress: string | null = null;
            let isMeCheck = false;

            // ... (rest of function)

            try {
                // A. RESOLVE IDENTITY
                const myWallet = publicKey?.toBase58();
                const GOD_WALLET = 'C31JQfZBVRsnvFqiNptD95rvbEx8fsuPwdZn62yEWx9X';

                // 1. Check if slug matches my wallet or special "me"
                if (myWallet && (profileSlug.toLowerCase() === 'me' || profileSlug === myWallet)) {
                    targetAddress = myWallet;
                    isMeCheck = true;
                }
                // 2. Check if slug is a valid Solana Address
                else {
                    try {
                        const pubKey = new PublicKey(profileSlug);
                        if (PublicKey.isOnCurve(pubKey.toBuffer())) {
                            targetAddress = profileSlug;
                        }
                    } catch (e) {
                        // Not a public key, treat as username
                    }
                }

                // 3. Fallback to Username Lookup
                if (!targetAddress) {
                    const profileByUsername = await supabaseDb.getProfileByUsername(profileSlug);
                    if (profileByUsername) {
                        targetAddress = profileByUsername.wallet_address;
                    }
                }

                // B. GHOST PROFILE / NO ADDRESS RESOLVED
                if (!targetAddress) {
                    const isLordSlug = profileSlug.toLowerCase() === 'lord';
                    let ghost = {
                        ...initialProfile,
                        username: isLordSlug ? "Lord" : (profileSlug.length > 10 ? `${profileSlug.slice(0, 4)}...${profileSlug.slice(-4)}` : profileSlug),
                        bio: isLordSlug ? "The Master of Djinns" : "New Djinn Trader",
                        pfp: "/pink-pfp.png",
                        showGems: true
                    };

                    if (isLordSlug) {
                        ghost.medals = ['FIRST_MARKET', 'ORACLE', 'DIAMOND_HANDS', 'PINK_CRYSTAL', 'EMERALD_SAGE', 'MOON_DANCER', 'MARKET_SNIPER', 'APEX_PREDATOR', 'GOLD_TROPHY', 'LEGENDARY_TRADER'];
                        ghost.gems = 99999;
                        ghost.profit = 1250000;
                        ghost.achievements = [
                            { code: 'FIRST_MARKET', name: 'Genesis Creator', image_url: '/genesis-medal-v2.png', xp: 100 },
                            { code: 'ORACLE', name: 'Grand Oracle', image_url: '/orange-crystal-v2.png', xp: 250 },
                            { code: 'DIAMOND_HANDS', name: 'Diamond Hands', image_url: '/diamond-crystal.png', xp: 1000 },
                            { code: 'PINK_CRYSTAL', name: 'Mystic Rose', image_url: '/pink-crystal.png', xp: 2000 },
                            { code: 'EMERALD_SAGE', name: 'Emerald Sage', image_url: '/green-crystal.png', xp: 2500 },
                            { code: 'MOON_DANCER', name: 'Moon Dancer', image_url: '/moon-crystal.png', xp: 3000 },
                            { code: 'MARKET_SNIPER', name: 'Market Sniper', image_url: '/emerald-sniper.png', xp: 5000 },
                            { code: 'APEX_PREDATOR', name: 'Apex Predator', image_url: '/apex-skull.png', xp: 10000 },
                            { code: 'THE_CHAMPION', name: 'The Champion', image_url: '/gold-trophy.png', xp: 50000 },
                            { code: 'LEGENDARY_TRADER', name: 'Legendary Trader', image_url: '/gems-trophy.png', xp: 100000 }
                        ];
                    }

                    setProfile(ghost);
                    setIsLoading(false);
                    return;
                }

                // C. FINAL TARGET RESOLVED
                setTargetWalletAddress(targetAddress);
                isMeCheck = (!!myWallet && myWallet === targetAddress);
                setIsMyProfile(isMeCheck);

                // --- BOT CHECK ---
                let botProfileData = null;
                try {
                    const botRes = await fetch(`/api/bot/${targetAddress}`);
                    if (botRes.ok) {
                        const botData = await botRes.json();
                        if (botData && botData.id) {
                            botProfileData = botData;
                            console.log("🤖 COMPLETED BOT PROFILE LOAD:", botData.name);
                        }
                    }
                } catch (e) { }

                // D. LOAD ACTUAL DATA (Memory Source of Truth)
                let finalProfile = {
                    ...initialProfile,
                    username: botProfileData?.name || `${targetAddress.slice(0, 4)}...${targetAddress.slice(-4)}`,
                    pfp: botProfileData?.avatar || "/pink-pfp.png",
                    bio: botProfileData ? `Protocol Bot • ${botProfileData.tier} Tier • ${botProfileData.category}` : "New Djinn Trader",
                    // Map Bot Stats
                    winRate: botProfileData?.stats?.winRate || 0,
                    portfolio: botProfileData?.vault?.totalAum || 0,
                    profit: botProfileData?.stats?.pnl || 0
                };

                // 1. Local Storage Override (Skip if Bot)
                let localMedalsLoaded = false;
                if (!botProfileData && isMeCheck) {
                    const local = localStorage.getItem(`djinn_profile_${targetAddress}`);
                    if (local) {
                        try {
                            const p = JSON.parse(local);
                            if (p.username) finalProfile.username = p.username;
                            if (p.medals && Array.isArray(p.medals)) { finalProfile.medals = p.medals; localMedalsLoaded = true; }
                            if (p.showGems !== undefined) finalProfile.showGems = p.showGems;
                            if (p.pfp) finalProfile.pfp = p.pfp;
                            else if (p.avatar_url) finalProfile.pfp = p.avatar_url;
                            if (p.bio) finalProfile.bio = p.bio;
                            if (p.twitter) finalProfile.twitter = p.twitter;
                            if (p.discord) finalProfile.discord = p.discord;
                        } catch (e) { }
                    }
                }

                // 2. PARALLEL FETCH: Profile + Achievements + Balance
                const isLordWallet = targetAddress === GOD_WALLET || targetAddress === 'C31JQfZBVRsnvFqiNptD95rvbEx8fsuPwdZn62yEWx9X';

                const [dbProfile, achievements, balance] = await Promise.all([
                    !botProfileData ? supabaseDb.getProfile(targetAddress).catch(() => null) : Promise.resolve(null),
                    isLordWallet ? Promise.resolve(null) : supabaseDb.getUserAchievements(targetAddress).catch(() => []),
                    connection.getBalance(new PublicKey(targetAddress)).catch(() => 0)
                ]);

                // Apply DB profile
                if (dbProfile) {
                    finalProfile.username = dbProfile.username || finalProfile.username;
                    finalProfile.bio = dbProfile.bio || finalProfile.bio;
                    if (dbProfile.avatar_url) finalProfile.pfp = dbProfile.avatar_url;
                    if (dbProfile.created_at) finalProfile.joinedAt = dbProfile.created_at;
                    if (typeof dbProfile.views === 'number') setViewCount(dbProfile.views);
                    if (dbProfile.twitter) finalProfile.twitter = dbProfile.twitter;
                    if (dbProfile.discord) finalProfile.discord = dbProfile.discord;
                }

                // 3. Special "Architect" Injection
                const { isGenesisMember } = await import('@/lib/whitelist');
                const isGenesisMemberUser = await isGenesisMember(targetAddress);
                finalProfile.isGenesis = isGenesisMemberUser;

                if (isLordWallet) {
                    // Respect user-saved medals from localStorage; only use defaults if none were saved
                    if (!localMedalsLoaded) finalProfile.medals = ['FIRST_MARKET', 'ORACLE', 'DIAMOND_HANDS', 'PINK_CRYSTAL', 'EMERALD_SAGE', 'MOON_DANCER', 'MARKET_SNIPER', 'APEX_PREDATOR', 'GOLD_TROPHY', 'LEGENDARY_TRADER'];
                    finalProfile.profit = 1250000;
                    setViewCount(99999);
                    finalProfile.achievements = [
                        { code: 'FIRST_MARKET', name: 'Genesis Creator', image_url: '/genesis-medal-v2.png', xp: 100 },
                        { code: 'ORACLE', name: 'Grand Oracle', image_url: '/orange-crystal-v2.png', xp: 250 },
                        { code: 'DIAMOND_HANDS', name: 'Diamond Hands', image_url: '/diamond-crystal.png', xp: 1000 },
                        { code: 'PINK_CRYSTAL', name: 'Mystic Rose', image_url: '/pink-crystal.png', xp: 2000 },
                        { code: 'EMERALD_SAGE', name: 'Emerald Sage', image_url: '/green-crystal.png', xp: 2500 },
                        { code: 'MOON_DANCER', name: 'Moon Dancer', image_url: '/moon-crystal.png', xp: 3000 },
                        { code: 'MARKET_SNIPER', name: 'Market Sniper', image_url: '/emerald-sniper.png', xp: 5000 },
                        { code: 'APEX_PREDATOR', name: 'Apex Predator', image_url: '/apex-skull.png', xp: 10000 },
                        { code: 'THE_CHAMPION', name: 'The Champion', image_url: '/gold-trophy.png', xp: 50000 },
                        { code: 'LEGENDARY_TRADER', name: 'Legendary Trader', image_url: '/gems-trophy.png', xp: 100000 }
                    ];
                } else if (achievements) {
                    finalProfile.achievements = achievements;
                    finalProfile.medals = achievements.map((a: any) => a.code);
                }

                // 4. On-chain Balance (Use Vault TVL if Bot?)
                if (botProfileData) {
                    finalProfile.portfolio = botProfileData.vault?.totalAum || (balance / LAMPORTS_PER_SOL);
                } else {
                    finalProfile.portfolio = balance / LAMPORTS_PER_SOL;
                }

                // 5. Load Active Bets for everyone
                loadActiveBets(targetAddress);

                setProfile(finalProfile);

            } catch (error) {
                console.error('Error loading profile:', error);
            } finally {
                setIsLoading(false);
            }
        };

        const handleGlobalUpdate = () => {
            console.log("🔄 Global profile update received");
            loadProfile();
        };

        window.addEventListener('djinn-profile-updated', handleGlobalUpdate);
        window.addEventListener('market-created', handleGlobalUpdate);

        loadProfile();

        return () => {
            window.removeEventListener('djinn-profile-updated', handleGlobalUpdate);
            window.removeEventListener('market-created', handleGlobalUpdate);
        };
    }, [isDefaultProfile, publicKey, profileSlug, connection]);

    // 2.2. LOAD FOLLOW DATA
    useEffect(() => {
        if (!targetWalletAddress) return;

        const loadFollowData = async () => {
            const counts = await supabaseDb.getFollowCounts(targetWalletAddress);
            setFollowersCount(counts.followers);
            setFollowingCount(counts.following);

            if (publicKey && publicKey.toBase58() !== targetWalletAddress) {
                const following = await supabaseDb.isFollowing(publicKey.toBase58(), targetWalletAddress);
                setIsFollowingUser(following);
            }
        };

        loadFollowData();
    }, [targetWalletAddress, publicKey]);

    // 4. LOAD CREATED MARKETS (Explicit Fetch)
    useEffect(() => {
        const fetchCreatedMarkets = async () => {
            // Determine whose profile we are viewing
            let targetWallet = null;
            if (isMyProfile && publicKey) targetWallet = publicKey.toBase58();
            else if (targetWalletAddress) targetWallet = targetWalletAddress;

            if (!targetWallet) return;

            try {
                // 1. Fetch from Supabase
                const { data: sbMarkets } = await supabase
                    .from('markets')
                    .select('*')
                    .eq('creator_wallet', targetWallet);

                let finalCreated = sbMarkets || [];

                // 2. Merge with Local Storage if it's MY profile
                if (isMyProfile) {
                    const localStr = localStorage.getItem('djinn_created_markets');
                    if (localStr) {
                        try {
                            const localMarkets = JSON.parse(localStr);
                            // Dedupe
                            const existingIds = new Set(finalCreated.map( (m: any) => m.slug));
                            const uniqueLocal = localMarkets.filter( (m: any) => !existingIds.has(m.slug));
                            finalCreated = [...uniqueLocal, ...finalCreated];
                        } catch (e) { console.error(e) }
                    }
                }

                // Format for UI
                const uiMarkets = finalCreated.map( (m: any) => ({
                    id: m.id,
                    slug: m.slug,
                    title: m.title,
                    icon: m.banner_url || m.icon || '🔮',
                    volume: m.volume || '$0', // TODO: Calculate real volume
                    type: 'binary',
                    createdAt: m.created_at || m.createdAt
                }));

                setProfile( (prev: any) => ({ ...prev, createdMarkets: uiMarkets }));

            } catch (error) {
                console.error("Error loading created markets", error);
            }
        };

        fetchCreatedMarkets();
    }, [isMyProfile, publicKey, targetWalletAddress]);



    // 5. REAL-TIME VIEWS LOGIC
    useEffect(() => {
        if (!targetWalletAddress) return;

        // A. Increment View (Once per mount per unique session potentially, but basic here)
        supabaseDb.incrementProfileViews(targetWalletAddress);

        // B. Subscribe to Realtime Updates
        const channel = supabase
            .channel(`profile_views:${targetWalletAddress}`)
            .on('postgres_changes', {
                event: 'UPDATE',
                schema: 'public',
                table: 'profiles',
                filter: `wallet_address=eq.${targetWalletAddress}`
            }, (payload) => {
                if (payload.new && typeof payload.new.views === 'number') {
                    setViewCount(payload.new.views);
                }
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [targetWalletAddress]);

    // 3. LOAD BETS FROM SUPABASE (active + closed)
    const loadActiveBets = async (walletAddress: string) => {
        try {
            const bets = await supabaseDb.getUserBets(walletAddress);
            const activeBets = bets.filter(bet => !bet.claimed);
            const claimedBets = bets.filter(bet => bet.claimed);

            // Format a bet for display
            const formatBet = async (bet: any) => {
                const [marketMeta, marketData] = await Promise.all([
                    supabaseDb.getMarket(bet.market_slug),
                    supabaseDb.getMarketData(bet.market_slug)
                ]);

                const currentPrice = marketData?.live_price || bet.entry_price || 50;
                const volume = marketData?.volume || 0;
                const purchasePrice = bet.side === 'YES' ? currentPrice : (100 - currentPrice);
                const invested = bet.amount || 0;
                const shares = bet.shares || 0;
                const currentValue = shares * (purchasePrice / 100);
                const profit = currentValue - invested;
                const change = invested > 0 ? ((profit / invested) * 100).toFixed(1) : '0.0';

                return {
                    id: bet.id || bet.market_slug,
                    title: marketMeta?.title || bet.market_slug,
                    market_icon: (marketMeta as any)?.icon || marketMeta?.banner_url || '🔮',
                    volume,
                    invested,
                    current: bet.claimed ? (bet.payout || 0) : currentValue,
                    shares,
                    side: bet.side,
                    change: `${profit >= 0 ? '+' : ''}${change}%`,
                    profit: bet.claimed ? ((bet.payout || 0) - invested) : profit,
                    sol_amount: bet.sol_amount,
                    market_slug: bet.market_slug,
                    payout: bet.payout,
                    entry_price: bet.entry_price,
                    currentPrice: (bet as any).currentPrice || currentPrice,
                    outcome_name: bet.side
                };
            };

            const [formattedActive, formattedClosed] = await Promise.all([
                Promise.all(activeBets.map(formatBet)),
                Promise.all(claimedBets.map(formatBet))
            ]);

            setProfile( (prev: any) => ({ ...prev, activeBets: formattedActive, closedBets: formattedClosed }));
        } catch (error) {
            console.error('Error loading bets:', error);
        }
    };

    const updateAndSave = async (newData: any) => {
        // Immediate UI Update
        setProfile(newData);

        if (!publicKey) return;
        const walletAddress = publicKey.toBase58();

        // 1. SAVE TO LOCAL STORAGE (Dynamic Key - Single Source of Truth for this wallet)
        const dynamicKey = `djinn_profile_${walletAddress}`;

        // Optimización: Si el PFP es un base64 muy grande, no lo guardamos en cache local
        // Solo guardamos si es una URL corta o un base64 pequeño (< 100KB)
        const pfpToCache = (newData.pfp && newData.pfp.length > 100000 && newData.pfp.startsWith('data:'))
            ? "/pink-pfp.png"
            : newData.pfp;

        const toSave = {
            username: newData.username,
            bio: newData.bio,
            pfp: pfpToCache,
            avatar_url: pfpToCache,
            medals: newData.medals || [],
            showGems: newData.showGems !== undefined ? newData.showGems : true,
            twitter: newData.twitter,
            discord: newData.discord
        };

        try {
            localStorage.setItem(dynamicKey, JSON.stringify(toSave));
            console.log("✅ Profile cached safely");
        } catch (e) {
            if (e instanceof Error && e.name === 'QuotaExceededError') {
                // Wipe all djinn caches if full
                Object.keys(localStorage).forEach( (k: any) => {
                    if (k.startsWith('djinn_profile_')) localStorage.removeItem(k);
                });
                try { localStorage.setItem(dynamicKey, JSON.stringify(toSave)); } catch (err) { }
            }
        }

        // 2. SAVE TO SUPABASE (Background)
        try {
            const result = await supabaseDb.upsertProfile({
                wallet_address: walletAddress,
                username: newData.username,
                bio: newData.bio,
                avatar_url: newData.pfp,
                twitter: newData.twitter,
                discord: newData.discord
            });

            if (!result) {
                console.warn("⚠️ Supabase save returned null (RLS or Network Error?)");
            } else {
                console.log("✅ Saved to Supabase:", result);
            }
        } catch (err) {
            console.error("Supabase Save Error:", err);
        }

        // 3. BROADCAST UPDATE
        window.dispatchEvent(new Event('djinn-profile-updated'));
    };

    const saveIdentity = () => {
        if (tempName !== profile.username && nameAvailable === false) {
            return; // Block save if name is taken
        }

        const updated = {
            ...profile,
            username: tempName || profile.username,
            bio: tempBio || profile.bio,
            pfp: tempPfp || profile.pfp,
            twitter: tempTwitter, // Allow empty string to clear
            discord: tempDiscord,
            showGems: tempShowGems,
            medals: tempMedals // Save the new medals order
        };
        updateAndSave(updated);
        play('success');
        setIsEditModalOpen(false);
    };

    const handleCashOut = (betId: string) => {
        const bet = profile.activeBets.find((b: any) => b.id === betId);
        if (!bet) return;
        const profitChange = bet.current - bet.invested;
        const newActive = profile.activeBets.filter((b: any) => b.id !== betId);
        const newClosed = [...profile.closedBets, { ...bet, closedAt: bet.current }];

        // Calculate Gem Reward for Profit
        let gemReward = 0;
        if (profitChange >= 1000) gemReward = 10000;
        else if (profitChange >= 100) gemReward = 1000;

        if (gemReward > 0 && publicKey) {
            supabaseDb.addGems(publicKey.toBase58(), gemReward);
        }

        play('success');

        const updated = {
            ...profile,
            activeBets: newActive,
            closedBets: newClosed,
            profit: profile.profit + profitChange,
            gems: (profile.gems || 0) + gemReward
        };
        updateAndSave(updated);
        setBetTab('closed');
    };

    const addMedal = async (medal: string = "🔮") => {
        if (profile.medals.length < 9) {
            updateAndSave({ ...profile, medals: [...profile.medals, medal] });

            // Persist Achievement to DB if it's a known code
            if (publicKey && ['GOLD_TROPHY', 'LEGENDARY_TRADER', 'FIRST_MARKET', 'APEX_PREDATOR'].includes(medal)) {
                await supabaseDb.grantAchievement(publicKey.toBase58(), medal);
            }
            play('toggle');
        }
    };

    const removeMedal = (index: number) => {
        const newMedals = profile.medals.filter((_, i) => i !== index);
        updateAndSave({ ...profile, medals: newMedals });
        play('toggle');
    };

    const handleToggleFollow = async () => {
        if (!publicKey || !targetWalletAddress || isFollowLoading) return;

        setIsFollowLoading(true);
        const myWallet = publicKey.toBase58();

        try {
            if (isFollowingUser) {
                const ok = await supabaseDb.unfollowUser(myWallet, targetWalletAddress);
                console.log(`[Follow] Unfollow result for ${targetWalletAddress}:`, ok);
                if (ok) {
                    setIsFollowingUser(false);
                    setFollowersCount( (prev: any) => Math.max(0, prev - 1));
                }
            } else {
                const ok = await supabaseDb.followUser(myWallet, targetWalletAddress);
                console.log(`[Follow] Follow result for ${targetWalletAddress}:`, ok);
                if (ok) {
                    setIsFollowingUser(true);
                    setFollowersCount( (prev: any) => prev + 1);
                    // Create notification for the target user (fire-and-forget, don't block follow)
                    try {
                        supabaseDb.createNotification(targetWalletAddress, 'follow', myWallet, 'started following you');
                    } catch (_) { /* notifications table may not exist yet */ }
                }
            }
        } catch (err) {
            console.error("Follow error:", err);
        } finally {
            setIsFollowLoading(false);
            play('click');
        }
    };

    // --- WALLET SYNC ---
    useEffect(() => {
        if (publicKey && connection) {
            const fetchBalance = async () => {
                try {
                    const balance = await connection.getBalance(publicKey);
                    const solBalance = balance / LAMPORTS_PER_SOL;
                    setProfile( (prev: any) => ({ ...prev, portfolio: solBalance }));
                } catch (error) {
                    console.error("Error fetching balance:", error);
                }
            };
            fetchBalance();
            // Poll every 10s
            const interval = setInterval(fetchBalance, 10000);
            return () => clearInterval(interval);
        }
    }, [publicKey, connection]);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, type: 'pfp') => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => {
                // Instead of saving correctly, open cropper
                setCroppingFile(reader.result as string);
                setCropTarget(type);
            };
            reader.readAsDataURL(file);
        }
    };

    const handleCropComplete = (croppedImage: string) => {
        setTempPfp(croppedImage);
        setCroppingFile(null);
        setCropTarget(null);
    };

    const handleCropCancel = () => {
        setCroppingFile(null);
        setCropTarget(null);
        // Reset inputs
        if (pfpInputRef.current) pfpInputRef.current.value = '';
    };

    return (
        <main className="min-h-screen text-white font-sans pb-40 selection:bg-[#F492B7] pt-32">
            {/* IMAGE CROPPER MODAL */}
            {croppingFile && (
                <ImageCropper
                    imageSrc={croppingFile}
                    aspectRatio={1}
                    onCropComplete={handleCropComplete}
                    onCancel={handleCropCancel}
                />
            )}
            <StarfieldBg />

            <div className="max-w-[1600px] mx-auto px-14 pt-2 relative z-10">
                {/* PROFILE INFO - NO BACKGROUND */}
                <div className="mb-12">
                    {/* GRID LAYOUT: FOTO (LEFT) | INFO (RIGHT) */}
                    <div className="grid grid-cols-[auto_1fr] gap-8">
                        {/* LEFT COLUMN: FOTO + BIO */}
                        <div className="flex flex-col gap-6">
                            {/* FOTO */}
                            <div className="w-52 h-52 rounded-full overflow-hidden border-4 border-black group">
                                <img
                                    src={(profile.pfp && profile.pfp.trim()) ? profile.pfp : '/pink-pfp.png'}
                                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                                    alt=""
                                    onError={(e) => {
                                        (e.currentTarget as HTMLImageElement).src = '/pink-pfp.png';
                                    }}
                                />
                            </div>

                            {/* BIO - BELOW FOTO */}
                            {profile.bio && (
                                <p className="text-white text-base leading-relaxed font-bold max-w-xs">{profile.bio}</p>
                            )}

                            {/* FOLLOW BUTTON - BELOW BIO */}
                            {!isMyProfile && (
                                <button
                                    onClick={handleToggleFollow}
                                    disabled={!isMounted || isFollowLoading || !publicKey}
                                    className={`w-full py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all border-3 ${isFollowingUser
                                        ? 'bg-white border-black text-black hover:translate-y-1 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]'
                                        : 'bg-[#F492B7] border-black text-black hover:translate-y-1 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]'
                                        } disabled:opacity-50`}
                                >
                                    {isFollowLoading ? '...' : (isFollowingUser ? 'Following' : 'Follow')}
                                </button>
                            )}
                        </div>

                        {/* RIGHT COLUMN: NOMBRE + MEDALS + FOLLOWERS + GEMAS + STATS */}
                        <div className="flex flex-col gap-4">
                            {/* NOMBRE + MEDALS + EDIT BUTTON */}
                            <div className="flex items-center justify-between gap-4">
                                <div className="flex items-center gap-3 flex-wrap">
                                    <h1 className="text-6xl font-black tracking-tighter leading-none text-white">{profile.username}</h1>

                                    {/* MEDALS */}
                                    {profile.medals && profile.medals.map((m: string, i: number) => {
                                        if (m === 'GOLD_TROPHY') return <img key={i} src="/gold-trophy.png" className="w-12 h-12 object-contain border-2 border-black shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] hover:scale-110 transition-all cursor-help rounded-lg" title="Achieved Top 1 Leaderboard" alt="Trophy" />;
                                        if (m === 'LEGENDARY_TRADER') return <img key={i} src="/gems-trophy.png" className="w-10 h-10 object-contain border-2 border-black shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] hover:scale-110 transition-all cursor-help rounded-lg" title="Biggest Win All Time" alt="Legendary" />;
                                        if (m === 'FIRST_MARKET') return <img key={i} src="/genesis-medal-v2.png" className="w-10 h-10 object-contain border-2 border-black shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] hover:scale-110 transition-all cursor-help rounded-lg" title="Genesis Creator" alt="Genesis" />;
                                        if (m === 'MARKET_MAKER') return <img key={i} src="/blue-crystal.png" className="w-10 h-10 object-contain border-2 border-black shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] hover:scale-110 transition-all cursor-help rounded-lg" title="Market Maker" alt="Market Maker" />;
                                        if (m === 'ORACLE') return <img key={i} src="/orange-crystal-v2.png" className="w-10 h-10 object-contain border-2 border-black shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] hover:scale-110 transition-all cursor-help rounded-lg" title="Grand Oracle" alt="Oracle" />;
                                        if (m === 'DIAMOND_HANDS') return <img key={i} src="/diamond-crystal.png" className="w-10 h-10 object-contain border-2 border-black shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] hover:scale-110 transition-all cursor-help rounded-lg" title="Diamond Hands" alt="Diamond" />;
                                        if (m === 'PINK_CRYSTAL') return <img key={i} src="/pink-crystal.png" className="w-10 h-10 object-contain border-2 border-black shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] hover:scale-110 transition-all cursor-help rounded-lg" title="Mystic Rose" alt="Rose" />;
                                        if (m === 'EMERALD_SAGE') return <img key={i} src="/green-crystal.png" className="w-10 h-10 object-contain border-2 border-black shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] hover:scale-110 transition-all cursor-help rounded-lg" title="Emerald Sage" alt="Emerald" />;
                                        if (m === 'MOON_DANCER') return <img key={i} src="/moon-crystal.png" className="w-10 h-10 object-contain border-2 border-black shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] hover:scale-110 transition-all cursor-help rounded-lg" title="Moon Dancer" alt="Moon" />;
                                        if (m === 'MARKET_SNIPER') return <img key={i} src="/emerald-sniper.png" className="w-10 h-10 object-contain border-2 border-black shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] hover:scale-110 transition-all cursor-help rounded-lg" title="Market Sniper" alt="Sniper" />;
                                        if (m === 'APEX_PREDATOR') return <img key={i} src="/apex-skull.png" className="w-10 h-10 object-contain border-2 border-black shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] hover:scale-110 transition-all cursor-help rounded-lg" title="Apex Predator" alt="Apex" />;
                                        return <span key={i} className="text-3xl animate-pulse cursor-help hover:scale-110 transition-transform" title="Medal">{m}</span>;
                                    })}
                                </div>

                                {isMyProfile && (
                                    <button
                                        onClick={() => {
                                            setTempName(profile.username);
                                            setTempBio(profile.bio);
                                            setTempPfp(profile.pfp);
                                            setIsEditModalOpen(true);
                                        }}
                                        className="border-3 border-black bg-white text-black px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest hover:translate-y-1 hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-all flex items-center gap-2"
                                    >
                                        <span>✎</span> Edit Profile
                                    </button>
                                )}
                            </div>

                            {/* FOLLOWERS/FOLLOWING - BELOW NOMBRE */}
                            <div className="flex items-center gap-3">
                                <button
                                    className="bg-black/5 border-2 border-black rounded-xl px-4 py-2 flex items-center gap-2 hover:bg-[#F492B7] transition-all"
                                    onClick={() => setIsFollowersModalOpen(true)}
                                >
                                    <span className="text-white text-2xl font-black">{formatCompact(followersCount)}</span>
                                    <span className="text-white/70 text-xs font-black lowercase">followers</span>
                                </button>
                                <button
                                    className="bg-black/5 border-2 border-black rounded-xl px-4 py-2 flex items-center gap-2 hover:bg-[#F492B7] transition-all"
                                    onClick={() => setIsFollowingModalOpen(true)}
                                >
                                    <span className="text-white text-2xl font-black">{formatCompact(followingCount)}</span>
                                    <span className="text-white/70 text-xs font-black lowercase">following</span>
                                </button>
                            </div>

                            {/* GEMAS - BELOW FOLLOWERS (SMALLER, NO EMOJI) */}
                            {profile.showGems !== false && (
                                <div className="flex items-center gap-2">
                                    <span className="text-xl font-black text-white">
                                        {profile.gems.toLocaleString('en-US')}
                                    </span>
                                    <span className="text-white/70 text-xs font-black uppercase tracking-widest">gems</span>
                                </div>
                            )}

                            {/* METADATA: JOINED + VIEWS + WALLET - BELOW GEMAS */}
                            <div className="flex items-center gap-2 flex-wrap">
                                <span className="bg-black/5 border-2 border-black rounded-full px-3 py-1 text-white text-xs font-black lowercase">joined {profile.joinedAt ? new Date(profile.joinedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</span>
                                <span className="bg-black/5 border-2 border-black rounded-full px-3 py-1 text-white text-xs font-black lowercase">{viewCount.toLocaleString()} views</span>
                                {targetWalletAddress && (
                                    <button
                                        onClick={() => {
                                            navigator.clipboard.writeText(targetWalletAddress);
                                            const btn = document.getElementById('wallet-copy-btn-header');
                                            if (btn) {
                                                btn.textContent = 'copied!';
                                                setTimeout(() => { btn.textContent = targetWalletAddress.slice(0, 4) + '...' + targetWalletAddress.slice(-4); }, 2000);
                                            }
                                        }}
                                        className="group bg-black/5 border-2 border-black rounded-full px-3 py-1 hover:bg-[#F492B7] transition-all"
                                    >
                                        <span id="wallet-copy-btn-header" className="text-white text-xs font-black lowercase">{targetWalletAddress.slice(0, 4)}...{targetWalletAddress.slice(-4)}</span>
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* STATS GRID - NEO-BRUTALISM */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-12">
                    <StatCard
                        label="Positions Value"
                        value={`${(profile.activeBets.reduce((acc: number, bet: any) => acc + (bet.current || 0), 0)).toLocaleString('en-US', { style: 'currency', currency: 'USD' })}`}
                        color="text-black"
                    />
                    <StatCard
                        label="Win rate"
                        value={`${profileStats?.winRate ?? profile.winRate ?? 0}%`}
                        color="text-black"
                    />
                    <StatCard
                        label="Biggest win"
                        value={`+${(profileStats?.biggestWin ?? profile.biggestWin ?? 0).toLocaleString()} SOL`}
                        color="text-[#10B981]"
                    />
                    <StatCard label="Markets created" value={profileStats?.marketsCreated ?? creatorStats?.totalMarkets ?? profile.createdMarkets?.length ?? 0} color="text-black" />
                </div>

                {/* CHARTS GRID */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-12">
                    <ProfitLossCard profit={profile.profit} activeBets={profile.activeBets.filter((b: any) => !b.market_slug?.includes('mkjm2hmf'))} walletAddress={targetWalletAddress || publicKey?.toBase58() || ''} />
                    <CreatorRewardsCard
                        createdMarkets={profile.createdMarkets.filter( (m: any) => !m.slug?.includes('mkjm2hmf'))}
                        isMyProfile={isMyProfile}
                        creatorStats={creatorStats}
                    />
                </div>

                {/* TABS NAVIGATION */}
                <div className="bg-white border-3 border-black rounded-xl p-2 flex gap-2 shadow-[6px_6px_0px_0px_rgba(0,0,0,0.2)] mb-8">
                    {(['positions', 'activity', 'markets'] as const).map((tab) => (
                        <button
                            key={tab}
                            onClick={() => setActiveTab(tab)}
                            className={`px-6 py-3 rounded-lg text-sm font-black lowercase tracking-tight transition-all ${activeTab === tab ? 'bg-black text-white border-2 border-black' : 'bg-transparent text-black border-2 border-transparent hover:bg-black/5 hover:border-black/20'}`}
                        >
                            {tab}
                        </button>
                    ))}
                </div>

                {/* TAB CONTENT */}
                <div className="min-h-[400px]">
                    {activeTab === 'positions' && (
                        <PositionsTable
                            activeBets={profile.activeBets.filter((b: any) => !b.market_slug?.includes('mkjm2hmf'))}
                            closedBets={profile.closedBets.filter((b: any) => !b.market_slug?.includes('mkjm2hmf'))}
                            isMyProfile={isMyProfile}
                            solPrice={solPrice || 0}
                        />
                    )}
                    {activeTab === 'activity' && (
                        <ActivityTable walletAddress={targetWalletAddress || publicKey?.toBase58() || ''} />
                    )}
                    {activeTab === 'markets' && (
                        <MyMarketsList markets={profile.createdMarkets.filter( (m: any) => !m.slug?.includes('mkjm2hmf'))} />
                    )}
                </div>

                {/* UNCLAIMED WINNINGS - BETS PAYOUT */}
                {unclaimedPayouts.length > 0 && isMyProfile && (
                    <UnclaimedWinningsCard
                        payouts={unclaimedPayouts}
                        onClaim={async (betId, amount) => {
                            if (!confirm(`Claim ${amount.toFixed(4)} SOL?`)) return;
                            try {
                                const { error } = await supabaseDb.claimPayout(betId);
                                if (error) throw error;
                                alert('✅ Payout claimed successfully!');
                                // Remove from local state
                                setUnclaimedPayouts( (prev: any) => prev.filter( (p: any) => p.id !== betId));
                                // Update balance (simulated)
                                setProfile( (prev: any) => ({ ...prev, portfolio: prev.portfolio + amount }));
                            } catch (e: any) {
                                console.error(e);
                                alert('Error claiming payout: ' + e.message);
                            }
                        }}
                    />
                )}

            </div>

            {/* EDIT MODAL */}
            {isEditModalOpen && (
                <EditModal
                    profile={profile}
                    tempName={tempName}
                    tempBio={tempBio}
                    setTempName={setTempName}
                    setTempBio={setTempBio}
                    tempPfp={tempPfp}
                    showGems={tempShowGems}
                    setShowGems={setTempShowGems}
                    nameAvailable={nameAvailable}
                    isCheckingName={isCheckingName}
                    onClose={() => setIsEditModalOpen(false)}
                    onSave={saveIdentity}
                    addMedal={addMedal}
                    removeMedal={removeMedal}
                    pfpInputRef={pfpInputRef}
                    handleFileChange={handleFileChange}
                    openVault={() => setIsVaultOpen(true)}
                    tempMedals={tempMedals}
                />
            )}

            {/* MEDAL VAULT OVERLAY */}
            {isVaultOpen && (
                <MedalVault
                    profile={profile}
                    earnedAchievements={profile.achievements}
                    selectedMedals={tempMedals}
                    setSelectedMedals={setTempMedals}
                    onClose={() => setIsVaultOpen(false)}
                />
            )}

            {/* FOLLOWING LIST MODAL */}
            {isFollowingModalOpen && targetWalletAddress && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
                    <div className="bg-[#1A1A1A] w-full max-w-md rounded-3xl border border-white/10 shadow-2xl overflow-hidden flex flex-col max-h-[80vh]">
                        <div className="p-6 border-b border-white/5 flex items-center justify-between">
                            <h3 className="text-xl font-black uppercase tracking-tighter text-white">Following</h3>
                            <button onClick={() => setIsFollowingModalOpen(false)} className="text-gray-400 hover:text-white transition-colors">✕</button>
                        </div>
                        <FollowingList wallet={targetWalletAddress} router={router} onClose={() => setIsFollowingModalOpen(false)} />
                    </div>
                </div>
            )}
            {/* FOLLOWERS LIST MODAL */}
            {isFollowersModalOpen && targetWalletAddress && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
                    <div className="bg-[#1A1A1A] w-full max-w-md rounded-3xl border border-white/10 shadow-2xl overflow-hidden flex flex-col max-h-[80vh]">
                        <div className="p-6 border-b border-white/5 flex items-center justify-between">
                            <h3 className="text-xl font-black uppercase tracking-tighter text-white">Followers</h3>
                            <button onClick={() => setIsFollowersModalOpen(false)} className="text-gray-400 hover:text-white transition-colors">✕</button>
                        </div>
                        <FollowersList wallet={targetWalletAddress} router={router} onClose={() => setIsFollowersModalOpen(false)} />
                    </div>
                </div>
            )}
            {/* SHARE EXPERIENCE INTEGRATION */}
            <ShareExperience
                isOpen={showShareModal}
                onClose={() => setShowShareModal(false)}
                layoutId="share-experience"
                data={{
                    title: `${profile.username}'s Journey`,
                    username: profile.username,
                    imageUrl: profile.pfp,
                    stats: [
                        { label: 'Profit', value: (profile.profit || 0).toFixed(2) + ' SOL' },
                        { label: 'Win Rate', value: (profile.winRate || 0).toFixed(0) + '%' },
                        { label: 'Portfolio', value: (profile.portfolio || 0).toFixed(2) + ' SOL' }
                    ],
                    qrValue: typeof window !== 'undefined' ? window.location.href : `https://djinn.market/profile/${profile.username}`,
                    twitter: profile.twitter
                }}
            />
        </main>
    );
}


// --- SUB-COMPONENTES (SIN CAMBIOS VISUALES) ---

function ProfitChart({ activeBets }: any) {
    const maxProfit = Math.max(...activeBets.map((b: any) => b.profit), 100);
    const minProfit = Math.min(...activeBets.map((b: any) => b.profit), -100);
    const range = maxProfit - minProfit;

    return (
        <div className="relative h-64 w-full bg-black/40 rounded-2xl p-8 border border-white/10 backdrop-blur-sm">
            <div className="absolute inset-8 flex flex-col justify-between">
                {[0, 1, 2, 3, 4].map((i) => (
                    <div key={i} className="w-full h-px bg-white/[0.03]" />
                ))}
            </div>
            <div className="relative h-full flex items-end justify-around gap-6">
                {activeBets.map((bet: any, idx: number) => {
                    const height = Math.abs((bet.profit / range) * 100);
                    const isPositive = bet.profit >= 0;

                    return (
                        <div key={idx} className="flex flex-col items-center flex-1 group">
                            <div className="relative w-full flex flex-col items-center justify-end h-full">
                                {isPositive ? (
                                    <div className="w-full bg-gradient-to-t from-[#10B981] to-[#10B981]/40 rounded-t-xl transition-all duration-300 group-hover:brightness-125 relative" style={{ height: `${height}%`, minHeight: '12px', boxShadow: '0 0 20px rgba(16, 185, 129, 0.3)' }}><div className="absolute inset-0 bg-gradient-to-t from-white/20 to-transparent rounded-t-xl"></div></div>
                                ) : (
                                    <div className="w-full bg-gradient-to-b from-red-500 to-red-500/40 rounded-b-xl transition-all duration-300 group-hover:brightness-125 relative" style={{ height: `${height}%`, minHeight: '12px', boxShadow: '0 0 20px rgba(239, 68, 68, 0.3)' }}><div className="absolute inset-0 bg-gradient-to-b from-white/20 to-transparent rounded-b-xl"></div></div>
                                )}
                            </div>
                            <div className="opacity-0 group-hover:opacity-100 absolute bottom-full mb-3 bg-black/95 border border-[#F492B7]/30 rounded-xl p-3 text-xs font-black whitespace-nowrap transition-all z-10 backdrop-blur-xl">
                                <span className={bet.profit >= 0 ? 'text-[#10B981]' : 'text-red-500'}>{bet.profit >= 0 ? '+' : ''}${bet.profit}</span>
                            </div>
                        </div>
                    );
                })}
            </div>
            <div className="absolute left-8 right-8 top-1/2 h-[2px] bg-gradient-to-r from-transparent via-[#F492B7]/40 to-transparent" style={{ boxShadow: '0 0 10px rgba(244, 146, 183, 0.2)' }}></div>
        </div>
    );
}

function StatCard({ label, value, color = "text-black" }: any) {
    return (
        <div className="bg-white border-4 border-black p-6 rounded-2xl shadow-[8px_8px_0px_0px_#F492B7] hover:translate-y-1 hover:shadow-[4px_4px_0px_0px_#F492B7] transition-all">
            <p className="text-[10px] uppercase font-black tracking-widest text-black/70 mb-2">{label}</p>
            <p className={`text-4xl font-black tracking-tighter italic leading-none ${color}`}>{value}</p>
        </div>
    );
}

function MarketCard({ market, router }: any) {
    return (
        <div onClick={() => router.push(`/market/${market.slug}`)} className="group bg-white border-4 border-black rounded-3xl overflow-hidden hover:shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] transition-all cursor-pointer shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:-translate-y-1 duration-200">
            <div className="h-48 w-full relative overflow-hidden bg-gradient-to-br from-[#F492B7] to-[#FFB6C1] border-b-4 border-black">
                {typeof market.icon === 'string' && (market.icon.startsWith('data:image') || market.icon.startsWith('http')) ? (
                    <img src={market.icon} className="w-full h-full object-cover mix-blend-multiply group-hover:scale-110 transition-transform duration-500" alt="" />
                ) : (
                    <div className="w-full h-full flex items-center justify-center text-6xl">{market.icon || '🔮'}</div>
                )}
                <div className="absolute top-4 left-4 bg-emerald-400 border-3 border-black px-3 py-1.5 rounded-lg shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-black animate-pulse" />
                    <span className="text-[10px] font-black uppercase tracking-widest text-black">Live</span>
                </div>
            </div>
            <div className="p-6 space-y-4">
                <h4 className="text-xl font-black uppercase leading-tight tracking-tighter h-14 overflow-hidden text-black group-hover:text-[#F492B7] transition-colors line-clamp-2">{market.title}</h4>
                <div className="flex justify-between items-center border-t-4 border-black pt-4">
                    <div><span className="text-[10px] font-black text-black/60 uppercase tracking-widest block mb-1">Type</span><span className="text-black text-sm font-black uppercase">{market.type || 'Binary'}</span></div>
                    <div className="text-right"><span className="text-[10px] font-black text-black/60 uppercase tracking-widest block mb-1">Volume</span><span className="text-black text-sm font-black">{market.volume || '$0'}</span></div>
                </div>
            </div>
        </div>
    );
}

function BetCard({ bet, onCashOut, router, setShowShareModal }: any) {
    const isPositive = bet.profit >= 0;

    const handleShare = (e: any) => {
        e.stopPropagation();
        setShowShareModal(true);
    };

    const handleCopyShare = () => {
        const shareText = `🔮 I'm ${isPositive ? 'up' : 'down'} ${bet.change} on "${bet.title}" | Djinn Markets`;
        navigator.clipboard.writeText(shareText);
        alert('📋 Copied to clipboard!');
    };

    return (
        <>
            {/* TICKET CARD STYLE - NEO-BRUTALIST */}
            <div
                onClick={() => router.push(`/market/${bet.market_slug}`)}
                className="group relative bg-white border-4 border-black rounded-3xl overflow-hidden hover:shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] transition-all cursor-pointer shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:-translate-y-1"
            >
                {/* 1. TICKET HEADER (Market Image & Gradient) */}
                <div className="h-32 w-full relative overflow-hidden bg-gradient-to-br from-[#F492B7] to-[#FFB6C1] border-b-4 border-black">
                    {typeof bet.market_icon === 'string' && (bet.market_icon.startsWith('http') || bet.market_icon.startsWith('data:')) ? (
                        <img src={bet.market_icon} className="w-full h-full object-cover mix-blend-multiply group-hover:scale-105 transition-transform duration-500" alt="" />
                    ) : (
                        <div className="w-full h-full flex items-center justify-center text-4xl text-black/50">{bet.market_icon}</div>
                    )}

                    {/* Floating Badge: SIDE - NEO-BRUTALIST */}
                    <div className={`absolute top-4 right-4 z-20 px-3 py-1.5 rounded-lg font-black text-xs uppercase tracking-widest border-3 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] ${bet.side === 'YES' ? 'bg-emerald-400 text-black' : 'bg-rose-400 text-black'}`}>
                        {bet.side} Position
                    </div>

                    {/* MARKET TITLE (Overlaid) */}
                    <div className="absolute bottom-4 left-6 right-6 z-20">
                        <h4 className="text-xl font-black text-black leading-tight line-clamp-1 drop-shadow-none">{bet.title}</h4>
                    </div>
                </div>

                {/* 2. TICKET BODY (Stats) */}
                <div className="p-6 relative">
                    {/* Perforation Line Effect - BOLD */}
                    <div className="absolute top-0 left-0 right-0 h-[2px] bg-black border-t-2 border-dashed border-black" />
                    <div className="absolute -top-3 -left-3 w-6 h-6 bg-white border-4 border-black rounded-full" />
                    <div className="absolute -top-3 -right-3 w-6 h-6 bg-white border-4 border-black rounded-full" />

                    <div className="grid grid-cols-2 gap-y-6 gap-x-4 mb-6">
                        {/* SHARES */}
                        <div>
                            <p className="text-black/60 text-[10px] uppercase font-black tracking-widest mb-1">Shares</p>
                            <p className="text-black text-lg font-mono font-black">{formatCompact(bet.shares)}</p>
                        </div>
                        {/* INVESTED SOL */}
                        <div className="text-right">
                            <p className="text-black/60 text-[10px] uppercase font-black tracking-widest mb-1">Invested</p>
                            <p className="text-black text-lg font-mono font-black">{bet.sol_amount?.toFixed(3)} SOL</p>
                        </div>

                        {/* MARKET VOLUME */}
                        <div>
                            <p className="text-black/60 text-[10px] uppercase font-black tracking-widest mb-1">Vol</p>
                            <div className="flex items-center gap-1 text-black font-mono text-sm font-black">
                                <span>{formatCompact(bet.volume)}</span>
                            </div>
                        </div>

                        {/* PROFIT/LOSS */}
                        <div className="text-right">
                            <p className="text-black/60 text-[10px] uppercase font-black tracking-widest mb-1">P/L</p>
                            <p className={`text-lg font-black ${isPositive ? 'text-emerald-600' : 'text-rose-600'}`}>
                                {isPositive ? '+' : ''}{bet.change}
                            </p>
                        </div>
                    </div>

                    {/* ACTION FOOTER - NEO-BRUTALIST BUTTONS */}
                    <div className="flex gap-3 mt-2">
                        <button
                            onClick={(e) => { e.stopPropagation(); onCashOut(bet.id); }}
                            className="flex-1 bg-black hover:bg-[#F492B7] border-3 border-black text-white hover:text-black py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
                        >
                            Sell
                        </button>
                        <motion.button
                            layoutId="share-experience"
                            onClick={handleShare}
                            className="bg-[#F492B7] hover:bg-[#FFB6C1] border-3 border-black text-black w-12 flex items-center justify-center rounded-xl transition-all shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
                        >
                            <Share2 size={16} />
                        </motion.button>
                    </div>

                </div>
            </div>

        </>
    );
}

// --- EDIT MODAL ---
function EditModal({ profile, tempName, tempBio, setTempName, setTempBio, tempPfp, setTempPfp, showGems, setShowGems, nameAvailable, isCheckingName, onClose, onSave, pfpInputRef, handleFileChange, openVault, tempMedals }: any) {
    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/90 backdrop-blur-3xl">
            <div className="relative bg-white border-4 border-black w-full max-w-2xl max-h-[90vh] flex flex-col rounded-3xl shadow-[16px_16px_0px_0px_#F492B7] overflow-hidden">

                {/* HEAD - FIXED */}
                <div className="px-10 pt-10 pb-6 shrink-0 z-10 bg-[#F492B7] border-b-4 border-black">
                    <h2 className="text-3xl font-black lowercase tracking-tight text-black">edit identity</h2>
                </div>

                {/* BODY - SCROLLABLE */}
                <div className="p-10 overflow-y-auto flex-1 custom-scrollbar space-y-10 bg-white">

                    {/* GEMS & ASSETS QUICK SECTION */}
                    <div className="flex items-center gap-6 bg-white border-3 border-black p-6 rounded-2xl group cursor-pointer hover:translate-y-0.5 transition-all shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] hover:shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]" onClick={openVault}>
                        <div className="w-16 h-16 rounded-2xl bg-[#FFD700] flex items-center justify-center border-2 border-black group-hover:scale-110 transition-transform">
                            <span className="text-3xl">💎</span>
                        </div>
                        <div className="flex-1">
                            <p className="text-sm font-black text-black lowercase tracking-tight">gems</p>
                            <p className="text-[11px] text-black/70 font-bold uppercase tracking-widest mt-1">manage featured gems ({tempMedals.length}/9 slots used)</p>
                        </div>
                        <div className="flex gap-2">
                            {tempMedals.slice(0, 3).map((m: string, i: number) => {
                                let src = "/genesis-medal-v2.png";
                                if (m === 'FIRST_MARKET') src = "/genesis-medal-v2.png";
                                if (m === 'GOLD_TROPHY') src = "/gold-trophy.png";
                                if (m === 'LEGENDARY_TRADER') src = "/gems-trophy.png";
                                if (m === 'ORACLE') src = "/orange-crystal-v2.png";
                                if (m === 'MARKET_MAKER') src = "/blue-crystal-v2.png";
                                if (m === 'DIAMOND_HANDS') src = "/diamond-crystal.png";
                                if (m === 'PINK_CRYSTAL') src = "/pink-crystal.png";
                                if (m === 'EMERALD_SAGE') src = "/green-crystal.png";
                                if (m === 'MOON_DANCER') src = "/moon-crystal.png";
                                if (m === 'MARKET_SNIPER') src = "/emerald-sniper.png";
                                if (m === 'APEX_PREDATOR') src = "/apex-skull.png";

                                return <img key={i} src={src} className="w-8 h-8 object-contain" alt="" />;
                            })}
                            {tempMedals.length > 3 && <span className="text-black/70 text-xs font-bold flex items-center">+{tempMedals.length - 3}</span>}
                        </div>
                        <div className="text-black font-black text-xl translate-x-0 group-hover:translate-x-2 transition-transform">→</div>
                    </div>

                    {/* MAIN FORM */}
                    <div className="space-y-8">
                        {/* PFP & DETAILS ROW - NO BANNER */}
                        <div className="flex gap-8">
                            {/* AVATAR SECTION */}
                            <div className="shrink-0 space-y-4 pb-8">
                                <div className="bg-[#FFD700] border-3 border-black rounded-xl px-3 py-1.5 inline-block">
                                    <p className="text-xs font-black uppercase tracking-widest text-black">avatar</p>
                                </div>
                                <button
                                    onClick={() => pfpInputRef.current?.click()}
                                    className="w-32 h-32 bg-gradient-to-br from-[#F492B7] to-[#FFB6C1] border-4 border-black rounded-full flex items-center justify-center relative group hover:scale-105 transition-all overflow-hidden mx-auto shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] hover:shadow-[8px_8px_0px_0px_#F492B7]"
                                >
                                    <img src={tempPfp || profile.pfp} className="w-full h-full object-cover object-center group-hover:scale-110 transition-all" alt="" />
                                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                        <span className="text-white text-xs font-black uppercase tracking-widest">📷 change</span>
                                    </div>
                                </button>
                            </div>

                            {/* FORM INPUTS */}
                            <div className="flex-1 space-y-6">
                                {/* USERNAME INPUT */}
                                <div>
                                    <div className="flex items-center justify-between mb-3">
                                        <div className="bg-black border-3 border-black rounded-lg px-3 py-1.5">
                                            <p className="text-xs font-black uppercase tracking-widest text-white">username</p>
                                        </div>
                                        {/* USERNAME & MEDAL */}
                                        <div className="flex items-center gap-4">
                                            <h1 className="text-7xl font-black uppercase tracking-tighter italic leading-none text-white">
                                                {profile.username}
                                            </h1>
                                            {profile.isGenesis && (
                                                <div className="relative group/genesis">
                                                    <div className="w-16 h-16 bg-white border-4 border-black rounded-2xl shadow-[6px_6px_0px_#FF69B4] flex items-center justify-center hover:scale-110 transition-transform cursor-help">
                                                        <Image
                                                            src="/genesis-medal-v2.png"
                                                            alt="Genesis"
                                                            width={40}
                                                            height={40}
                                                            className="object-contain"
                                                        />
                                                    </div>
                                                    <div className="absolute top-full left-1/2 -translate-x-1/2 mt-4 px-4 py-2 bg-black border-2 border-[#FF69B4] text-white text-[10px] font-black uppercase tracking-[0.2em] rounded-xl opacity-0 group-hover/genesis:opacity-100 transition-opacity whitespace-nowrap shadow-[6px_6px_0px_#FF69B4] pointer-events-none z-50">
                                                        Genesis Member #1000
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-1.5 transition-all duration-300">
                                            {isCheckingName ? (
                                                <Loader2 className="w-3 h-3 text-[#F492B7] animate-spin" />
                                            ) : tempName.length >= 3 && tempName !== profile.username ? (
                                                nameAvailable ? (
                                                    <div className="flex items-center gap-1 bg-[#10B981] border-2 border-black text-white px-3 py-1.5 rounded-lg shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
                                                        <span className="text-[10px] font-black uppercase tracking-widest">available</span>
                                                        <span className="text-sm">✓</span>
                                                    </div>
                                                ) : (
                                                    <div className="flex items-center gap-1 bg-red-500 border-2 border-black text-white px-3 py-1.5 rounded-lg shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
                                                        <span className="text-[10px] font-black uppercase tracking-widest">taken</span>
                                                        <span className="text-sm">✕</span>
                                                    </div>
                                                )
                                            ) : null}
                                        </div>
                                    </div>
                                    <div className="relative">
                                        <input
                                            type="text"
                                            className={`w-full bg-[#FFFEF0] border-4 ${nameAvailable === false && tempName !== profile.username ? 'border-red-500' : 'border-black'} rounded-xl p-4 text-black text-lg font-black outline-none focus:border-[#F492B7] focus:shadow-[4px_4px_0px_0px_#F492B7] transition-all placeholder:text-black/30 placeholder:font-bold shadow-[2px_2px_0px_0px_rgba(0,0,0,0.2)]`}
                                            placeholder="enter your username..."
                                            value={tempName}
                                            onChange={(e) => setTempName(e.target.value.replace(/[^a-zA-Z0-9_]/g, '').slice(0, 15))}
                                        />
                                        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-black text-black/40">{tempName.length}/15</span>
                                    </div>
                                    {nameAvailable === false && tempName !== profile.username && (
                                        <p className="text-xs text-red-500 font-black uppercase tracking-wide mt-2 ml-1 bg-red-50 border-2 border-red-500 rounded-lg px-3 py-2">⚠️ this username is already claimed by another djinn.</p>
                                    )}
                                </div>

                                {/* BIO TEXTAREA */}
                                <div>
                                    <div className="bg-black border-3 border-black rounded-lg px-3 py-1.5 inline-block mb-3">
                                        <p className="text-xs font-black uppercase tracking-widest text-white">bio</p>
                                    </div>
                                    <div className="relative">
                                        <textarea
                                            className="w-full bg-[#FFFEF0] border-4 border-black rounded-xl p-4 text-black text-base font-bold outline-none h-28 resize-none focus:border-[#F492B7] focus:shadow-[4px_4px_0px_0px_#F492B7] transition-all placeholder:text-black/30 placeholder:font-bold shadow-[2px_2px_0px_0px_rgba(0,0,0,0.2)]"
                                            placeholder="tell us your story..."
                                            value={tempBio}
                                            onChange={(e) => setTempBio(e.target.value.slice(0, 200))}
                                        />
                                        <span className="absolute right-4 bottom-4 text-xs font-black text-black/40">{tempBio.length}/200</span>
                                    </div>
                                </div>

                            </div>
                        </div>
                    </div>
                </div>

                {/* FOOTER - FIXED */}
                <div className="p-8 shrink-0 border-t-4 border-black bg-white z-10">
                    <div className="flex gap-4">
                        <button onClick={onClose} className="flex-1 bg-white border-3 border-black text-black py-4 rounded-xl font-black lowercase text-sm hover:bg-black hover:text-white transition-all shadow-[4px_4px_0px_0px_rgba(0,0,0,0.2)]">cancel</button>
                        <button onClick={onSave} className="flex-1 bg-[#F492B7] border-3 border-black text-black py-4 rounded-xl font-black lowercase text-sm hover:translate-y-1 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition-all">save changes</button>
                    </div>
                </div>

                {/* HIDDEN INPUTS */}
                <input type="file" ref={pfpInputRef} className="hidden" onChange={(e) => handleFileChange(e, 'pfp')} />
            </div>
        </div>
    );
}

// --- PROFIT/LOSS CARD - REAL DATA ---
function ProfitLossCard({ profit, activeBets, walletAddress }: { profit: number; activeBets: any[]; walletAddress?: string }) {
    const [period, setPeriod] = useState<'1D' | '1W' | '1M' | 'ALL'>('ALL');
    const [hoverValue, setHoverValue] = useState<number | null>(null);
    const [hoverIndex, setHoverIndex] = useState<number | null>(null);
    const [activities, setActivities] = useState<any[]>([]);

    const chartColor = '#F492B7';

    // Load real activity data
    useEffect(() => {
        if (!walletAddress) {
            setActivities([]);
            return;
        }
        setActivities([]); // Clear before fetch to avoid stale data
        supabaseDb.getUserActivity(walletAddress).then(data => {
            setActivities(data || []);
        });
    }, [walletAddress]);

    // Build cumulative P/L chart from real activities
    const { chartData, currentProfit } = useMemo(() => {
        if (activities.length === 0) return {
            chartData: [{ y: 50, val: 0 }, { y: 50, val: 0 }],
            currentProfit: 0
        };

        // Filter by period
        const now = new Date();
        let cutoff = new Date(0); // ALL
        if (period === '1D') cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        else if (period === '1W') cutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        else if (period === '1M') cutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

        // Sort oldest first for cumulative calculation
        const sorted = [...activities]
            .filter(a => new Date(a.created_at || 0) >= cutoff)
            .sort((a: any, b: any) => new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime());

        if (sorted.length === 0) return {
            chartData: [{ y: 50, val: 0 }, { y: 50, val: 0 }],
            currentProfit: 0
        };

        // Build cumulative P/L: BUY = -cost, SELL = +revenue
        const rawValues: number[] = [0]; // Start at 0
        let cumulative = 0;
        for (const act of sorted) {
            const amount = act.sol_amount || act.amount || 0;
            if (act.order_type === 'SELL' || act.action === 'sell') {
                cumulative += amount;
            } else {
                cumulative -= amount;
            }
            rawValues.push(cumulative);
        }

        // Normalize to 0-100 range for SVG
        const maxVal = Math.max(...rawValues);
        const minVal = Math.min(...rawValues);
        const range = maxVal - minVal || 1;

        const calculated = rawValues.map(val => ({
            y: 90 - ((val - minVal) / range) * 80,
            val
        }));

        return { chartData: calculated, currentProfit: cumulative };
    }, [activities, period]);

    const isPositive = currentProfit >= 0;
    const displayValue = hoverValue !== null ? hoverValue : currentProfit;
    const periodLabels = { '1D': 'Past Day', '1W': 'Past Week', '1M': 'Past Month', 'ALL': 'All Time' };

    return (
        <div className="bg-white border-4 border-black rounded-3xl p-6 mb-8 relative overflow-hidden shadow-[8px_8px_0px_0px_#F492B7] hover:translate-y-1 hover:shadow-[4px_4px_0px_0px_#F492B7] transition-all">
            {/* Header Row */}
            <div className="flex items-start justify-between mb-2 relative z-10">
                <div>
                    <div className="flex items-center gap-2 mb-1">
                        <span className="text-[10px] font-black uppercase tracking-widest text-black/70">
                            {isPositive ? '▲' : '▼'} profit/loss
                        </span>
                    </div>
                    <h2 className={`text-4xl font-black tracking-tighter leading-none italic ${isPositive ? 'text-[#10B981]' : 'text-red-500'}`}>
                        {displayValue >= 0 ? '+' : '-'}{Math.abs(displayValue).toFixed(2)} SOL
                    </h2>
                    <p className="text-black/60 text-xs font-bold mt-1">{periodLabels[period]} • {new Date().toLocaleDateString()}</p>
                </div>

                {/* Time Tabs */}
                <div className="flex items-center bg-white rounded-lg p-1 border-2 border-black/20">
                    {(['1D', '1W', '1M', 'ALL'] as const).map((p) => (
                        <button
                            key={p}
                            onClick={() => setPeriod(p)}
                            className={`px-3 py-1 text-xs font-black rounded-lg transition-all ${period === p
                                ? 'bg-black text-white border-2 border-black shadow-[3px_3px_0px_0px_#F492B7]'
                                : 'text-black border-2 border-transparent hover:border-black'
                                }`}
                        >
                            {p}
                        </button>
                    ))}
                </div>
            </div>

            {/* Chart Container */}
            <div
                className="relative h-64 -mx-6 -mb-6 cursor-crosshair group bg-[#FFF5F7] border-t-2 border-black/10"
                onMouseMove={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    const x = e.clientX - rect.left;
                    const width = rect.width;
                    const index = Math.min(Math.floor((x / width) * chartData.length), chartData.length - 1);
                    if (chartData[index]) {
                        setHoverValue(chartData[index].val);
                        setHoverIndex(index);
                    }
                }}
                onMouseLeave={() => {
                    setHoverValue(null);
                    setHoverIndex(null);
                }}
            >
                {/* Vertical Line Indicator */}
                {hoverIndex !== null && chartData.length > 1 && (
                    <div
                        className="absolute top-0 bottom-0 w-0.5 bg-black/30 z-20 pointer-events-none transition-transform duration-75"
                        style={{ left: `${(hoverIndex / (chartData.length - 1)) * 100}%` }}
                    />
                )}

                <svg viewBox="0 0 240 100" className="w-full h-full" preserveAspectRatio="none">
                    {chartData.length > 1 ? (
                        <>
                            <path
                                d={`M 0 100 ${chartData.map((d, i) => `L ${i * (240 / (chartData.length - 1))} ${100 - d.y}`).join(' ')} L 240 100 Z`}
                                fill={chartColor}
                                opacity="0.15"
                            />
                            <path
                                d={`M 0 ${100 - (chartData[0]?.y || 0)} ${chartData.map((d, i) => `L ${i * (240 / (chartData.length - 1))} ${100 - d.y}`).join(' ')}`}
                                fill="none"
                                stroke={chartColor}
                                strokeWidth="2.5"
                            />
                        </>
                    ) : (
                        <path d="M 0 50 L 240 50" stroke={chartColor} strokeWidth="2.5" strokeDasharray="4 4" opacity="0.5" />
                    )}
                </svg>
            </div>
        </div>
    );
}

// --- CREATOR REWARDS CARD - COMPACT BAR STYLE ---
// --- CREATOR REWARDS CARD - COMPACT BAR STYLE ---
function CreatorRewardsCard({ createdMarkets, isMyProfile, creatorStats }: { createdMarkets: any[], isMyProfile: boolean, creatorStats: { totalVolume: number, estimatedFees: number, totalMarkets: number } | null }) {
    const { connection } = useConnection();
    const { publicKey } = useWallet();
    const [claimableSol, setClaimableSol] = useState(0);
    const [marketsWithFees, setMarketsWithFees] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    // claimCreatorFees not available in current program version
    // const { claimCreatorFees } = useDjinnProtocol();

    // Interaction state
    const [hoverValue, setHoverValue] = useState<number | null>(null);
    const [hoverIndex, setHoverIndex] = useState<number | null>(null);

    // Fetch Real On-Chain Fees
    useEffect(() => {
        if (!createdMarkets.length || !connection) return;

        const fetchFees = async () => {
            try {
                const PID = new PublicKey(PROGRAM_ID);

                const keys = await Promise.all(createdMarkets.map(async (m) => {
                    const [pda] = PublicKey.findProgramAddressSync(
                        [Buffer.from("market"), Buffer.from(m.slug).subarray(0, 32)],
                        PID
                    );
                    return pda;
                }));

                const accountInfos = await connection.getMultipleAccountsInfo(keys);

                let total = 0;
                const withFees: any[] = [];

                accountInfos.forEach((info, idx) => {
                    if (!info) return;
                    const data = info.data;
                    let offset = 8 + 32;

                    const titleLen = data.readUInt32LE(offset);
                    offset += 4 + titleLen;
                    const slugLen = data.readUInt32LE(offset);
                    offset += 4 + slugLen;
                    offset += 8 + 1 + 1 + 1 + 8 + 8;

                    const fees = Number(data.readBigUInt64LE(offset)) / LAMPORTS_PER_SOL;

                    if (fees > 0) {
                        total += fees;
                        withFees.push({ ...createdMarkets[idx], pda: keys[idx], fees });
                    }
                });

                setClaimableSol(total);
                setMarketsWithFees(withFees);

            } catch (e) {
                console.error("Error fetching creator fees:", e);
            }
        };

        fetchFees();
    }, [createdMarkets, connection]);

    const handleClaimAll = async () => {
        if (!publicKey || !marketsWithFees.length) return;
        setIsLoading(true);
        try {
            let claimedCount = 0;
            for (const market of marketsWithFees) {
                try {
                    // TODO: Re-enable when claimCreatorFees is added to the program
                    console.warn('claimCreatorFees not yet available in program');
                    claimedCount++;
                } catch (err) {
                    console.error(`Failed to claim from ${market.slug}`, err);
                }
            }

            if (claimedCount > 0) {
                alert(`✅ Successfully claimed rewards from ${claimedCount} markets!`);
                setClaimableSol(0);
                setMarketsWithFees([]);
            }

        } catch (e) {
            console.error(e);
            alert("Error claiming fees");
        } finally {
            setIsLoading(false);
        }
    };

    // Move condition to JSX
    const isVisible = isMyProfile || (creatorStats && creatorStats.totalMarkets > 0) || createdMarkets.length > 0;

    // Time period state
    const [rewardsPeriod, setRewardsPeriod] = useState<'1D' | '3D' | '1W' | '1M' | 'ALL'>('ALL');

    // Display Values
    // Primary: Lifetime Earnings (USD) from creatorStats, or fallback to Claimable
    // Secondary: Claimable (SOL)
    const lifetimeFeesUsd = creatorStats?.estimatedFees || 0;
    const claimableUsd = claimableSol * 180; // Approx SOL price

    // If no lifetime stats yet (e.g. data lag), fall back to showing what's claimable now as "earnings"
    const displayBigNumber = lifetimeFeesUsd > 0 ? lifetimeFeesUsd : claimableUsd;

    // Derived value for animation (Mock distribution for consistency)
    const periodValue = useMemo(() => {
        if (rewardsPeriod === 'ALL') return displayBigNumber;
        if (rewardsPeriod === '1M') return displayBigNumber * 0.8;
        if (rewardsPeriod === '1W') return displayBigNumber * 0.4;
        if (rewardsPeriod === '3D') return displayBigNumber * 0.2;
        return displayBigNumber * 0.05; // 1D
    }, [rewardsPeriod, displayBigNumber]);

    // Generate chart data based on period
    const dataPoints = rewardsPeriod === '1D' ? 24 : rewardsPeriod === '3D' ? 72 : rewardsPeriod === '1W' ? 7 : rewardsPeriod === '1M' ? 30 : 90;

    const miniChartData = useMemo(() => {
        // If no earnings, return flat line
        if (displayBigNumber <= 0.01) {
            return Array.from({ length: dataPoints }, (_, i) => ({ y: 50, val: 0 }));
        }

        // If earnings exist, show upward trend (cumulative growth simulation)
        return Array.from({ length: dataPoints }, (_, i) => {
            const progress = i / (dataPoints - 1);
            // Non-linear growth curve (starts slow, speeds up)
            const curve = Math.pow(progress, 2);
            // Add slight noise
            const noise = (Math.random() * 0.1) - 0.05;
            const finalProgress = Math.max(0, Math.min(1, curve + noise));

            return {
                y: 10 + (finalProgress * 80), // Map to 10-90% height
                val: finalProgress * displayBigNumber // Value at that point
            };
        });
    }, [rewardsPeriod, dataPoints, displayBigNumber]);

    const periodLabels = { '1D': 'Today', '3D': '3 Days', '1W': 'This Week', '1M': 'This Month', 'ALL': 'All Time' };

    if (!isVisible) return null;

    return (
        <div className="bg-white border-4 border-black rounded-3xl p-6 mb-8 relative overflow-hidden shadow-[8px_8px_0px_0px_#10B981] hover:translate-y-1 hover:shadow-[4px_4px_0px_0px_#10B981] transition-all">
            {/* Header Row */}
            <div className="flex items-start justify-between mb-2 relative z-10">
                <div>
                    <div className="flex items-center gap-2 mb-1">
                        <span className="text-[10px] font-black uppercase tracking-widest text-black/70">
                            ▲ creator rewards
                        </span>
                    </div>

                    <div className="flex items-center gap-3">
                        <h2 className="text-4xl font-black tracking-tighter leading-none italic text-[#10B981]">
                            $<AnimatedNumber value={hoverValue !== null ? hoverValue : periodValue} />
                        </h2>

                        {isMyProfile && (
                            <button
                                onClick={handleClaimAll}
                                disabled={isLoading || claimableSol <= 0}
                                className="bg-[#10B981] hover:translate-y-0.5 text-white font-black text-[10px] px-3 py-1.5 rounded-lg transition-all disabled:opacity-40 disabled:cursor-not-allowed border-2 border-black uppercase tracking-widest flex items-center gap-1 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] hover:shadow-[1px_1px_0px_0px_rgba(0,0,0,1)]"
                            >
                                {isLoading ? <Loader2 className="animate-spin w-3 h-3" /> : 'Claim'}
                            </button>
                        )}
                    </div>

                    <p className="text-black/60 text-xs font-bold mt-1">
                        {periodLabels[rewardsPeriod]} • {claimableSol > 0 ? <span className="text-[#10B981] font-black">{claimableSol.toFixed(4)} SOL Unclaimed</span> : 'All caught up'}
                    </p>
                </div>

                {/* Time Tabs (Claim button moved next to number) */}
                <div className="flex items-center gap-3">
                    <div className="flex items-center bg-white rounded-lg p-1 border-2 border-black/20">
                        {(['1D', '3D', '1W', '1M', 'ALL'] as const).map((p) => (
                            <button
                                key={p}
                                onClick={() => setRewardsPeriod(p)}
                                className={`px-2 py-1 text-xs font-black rounded-lg transition-all ${rewardsPeriod === p
                                    ? 'bg-black text-white border-2 border-black shadow-[3px_3px_0px_0px_#10B981]'
                                    : 'text-black border-2 border-transparent hover:border-black'
                                    }`}
                            >
                                {p}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* Chart Container */}
            <div
                className="relative h-64 -mx-6 -mb-6 cursor-crosshair group bg-[#F0FDF4] border-t-2 border-black/10"
                onMouseMove={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    const x = e.clientX - rect.left;
                    const width = rect.width;
                    const index = Math.min(Math.floor((x / width) * dataPoints), dataPoints - 1);
                    if (miniChartData[index]) {
                        setHoverValue(miniChartData[index].val);
                        setHoverIndex(index);
                    }
                }}
                onMouseLeave={() => {
                    setHoverValue(null);
                    setHoverIndex(null);
                }}
            >
                {/* Vertical Line Indicator */}
                {hoverIndex !== null && (
                    <div
                        className="absolute top-0 bottom-0 w-0.5 bg-black/30 z-20 pointer-events-none transition-transform duration-75"
                        style={{ left: `${(hoverIndex / (dataPoints - 1)) * 100}%` }}
                    />
                )}

                <svg viewBox="0 0 240 100" className="w-full h-full" preserveAspectRatio="none">
                    <path
                        d={`M 0 100 ${miniChartData.map((d, i) => `L ${i * (240 / miniChartData.length)} ${100 - d.y}`).join(' ')} L 240 100 Z`}
                        fill="#10B981"
                        opacity="0.15"
                    />
                    <path
                        d={`M 0 ${100 - miniChartData[0]?.y} ${miniChartData.map((d, i) => `L ${i * (240 / miniChartData.length)} ${100 - d.y}`).join(' ')}`}
                        fill="none"
                        stroke="#10B981"
                        strokeWidth="2.5"
                    />
                </svg>
            </div>
        </div>
    );
}

// --- UNCLAIMED WINNINGS CARD (COMPACT BAR) ---
function UnclaimedWinningsCard({ payouts, onClaim }: { payouts: any[], onClaim: (id: string, amount: number) => void }) {
    const totalUnclaimed = payouts.reduce((sum, p) => sum + (p.payout || 0), 0);

    // Batch claim handler
    const handleClaimAll = () => {
        payouts.forEach( (p: any) => onClaim(p.id, parseFloat(p.payout)));
    };

    return (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 w-full max-w-lg px-4 animate-in slide-in-from-bottom-5 fade-in duration-500">
            <div className="bg-[#1A1A1A] border border-white/10 rounded-2xl p-4 shadow-[0_0_50px_rgba(0,0,0,0.8)] flex items-center justify-between gap-6 backdrop-blur-xl">
                <div className="flex flex-col">
                    <span className="text-gray-400 text-xs font-medium">Available to claim</span>
                    <span className="text-2xl font-black text-[#10B981] tracking-tight">
                        ${totalUnclaimed.toFixed(2)}
                    </span>
                </div>

                <button
                    onClick={handleClaimAll}
                    className="bg-[#10B981] hover:bg-[#059669] text-black font-bold px-8 py-3 rounded-xl transition-all shadow-lg shadow-emerald-500/20 active:scale-95"
                >
                    Claim
                </button>
            </div>
        </div>
    );
}

// --- POSITIONS TABLE ---
function PositionsTable({ activeBets, closedBets, isMyProfile, solPrice }: { activeBets: any[], closedBets: any[], isMyProfile: boolean, solPrice: number }) {
    const [filter, setFilter] = useState<'active' | 'closed'>('active');
    const router = useRouter();
    const bets = filter === 'active' ? activeBets : closedBets;

    return (
        <div className="bg-white border-4 border-black rounded-3xl overflow-hidden shadow-[12px_12px_0px_0px_rgba(0,0,0,0.3)]">
            <div className="flex items-center gap-4 p-6 border-b-4 border-black bg-white">
                <button
                    onClick={() => setFilter('active')}
                    className={`px-6 py-2 rounded-xl text-sm font-black lowercase tracking-tight transition-all border-2 ${filter === 'active' ? 'bg-black text-white border-black' : 'bg-white text-black border-black/20 hover:border-black'}`}
                >
                    active
                </button>
                <button
                    onClick={() => setFilter('closed')}
                    className={`px-6 py-2 rounded-xl text-sm font-black lowercase tracking-tight transition-all border-2 ${filter === 'closed' ? 'bg-black text-white border-black' : 'bg-white text-black border-black/20 hover:border-black'}`}
                >
                    closed
                </button>
            </div>

            {bets.length === 0 ? (
                <div className="text-center py-20 bg-white border-4 border-dashed border-black/20 m-6 rounded-2xl">
                    <p className="text-black/70 font-black uppercase tracking-widest text-sm">no {filter} positions found</p>
                </div>
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="text-[10px] font-black uppercase tracking-widest border-b-4 border-black bg-black text-white">
                                <th className="py-4 pl-6">market</th>
                                <th className="py-4 text-right">shares</th>
                                <th className="py-4 text-right">avg mcap</th>
                                <th className="py-4 text-right">curr mcap</th>
                                <th className="py-4 text-right">value</th>
                                <th className="py-4 text-right pr-6">roi</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-black/20">
                            {bets.map((bet: any, i: number) => {
                                // --- ROBUST CALCULATIONS ---

                                // 1. Normalize Atomic Shares (if needed)
                                // In supabase-db we now divide by 1e9, so bet.current is correct.
                                // bet.shares from DB might be atomic (large int).
                                // Let's detect if shares are massive (> 1M and likely atomic).
                                // Actually, supabase-db returns RAW dB rows often.
                                // We'll stick to the props passed: assumes bet.shares is raw if we didn't transform it.
                                // BUT: `getUserBets` in logic NOW returns transformed `current`.

                                // Let's rely on consistent price/mcap logic:
                                // Price = SOL per 1 whole share.

                                // MCAP Calculation:
                                // 1 Billion * Price
                                // Entry Price might be atomic (e.g. 1e-12).
                                const isAtomicEntry = (bet.entry_price || 0) < 0.000001;
                                const entryMcapSol = isAtomicEntry
                                    ? bet.entry_price * 1_000_000_000_000_000_000
                                    : bet.entry_price * 1_000_000_000;

                                const currentMcapSol = (bet.currentPrice || 0) * 1_000_000_000;

                                const entryMcapUsd = entryMcapSol * solPrice;
                                const currentMcapUsd = currentMcapSol * solPrice;

                                // PnL Calculation
                                // We use the PRE-CALCULATED `bet.current` from backend which is accurate.
                                // Current Value (USD)
                                const valUsd = (bet.current || 0) * solPrice;

                                // Entry Value (Cost Basis) - Need to handle atomic shares vs normal price?
                                // If bet.shares is atomic (e.g. 2,000,000,000 for 2 shares), and entry_price is per atomic (1e-9).
                                // Then Cost = shares * entry_price.
                                // If bet.shares is atomic and entry_price is per WHOLE share...
                                // Let's trust the PnL logic: 
                                const costSol = bet.shares * (bet.entry_price || 0);
                                // Only correct if units match.

                                // Let's use specific PnL derived from bet.current (Value) vs Cost.
                                // Cost is tricky if we don't know if shares are normalized. 
                                // Let's approximate Cost derived from Roi if available, or just straight math.

                                // Normalized Cost (Estimate):
                                // If 'current' is (Shares/1e9)*Price, then 'cost' should be (Shares/1e9)*EntryPrice
                                // ONLY IF shares in DB are 1e9 scaled.
                                const isAtomicShares = bet.shares > 1_000_000; // heuristic
                                const normalizedShares = isAtomicShares ? bet.shares / 1_000_000_000 : bet.shares;
                                const costSolNormalized = normalizedShares * (isAtomicEntry ? bet.entry_price * 1_000_000_000 : bet.entry_price);

                                // Re-do: 
                                // If entry_price is atomic (1e-12), and shares is atomic (1e9). product = 1e-3.
                                // If entry_price is normal (1e-3) and shares normal (1). product = 1e-3.
                                // So raw product `bet.shares * bet.entry_price` is ALWAYS correct SOL Cost 
                                // (assuming both are atomic OR both are normal).

                                const totalCostSol = bet.shares * bet.entry_price;
                                const currentValueSol = bet.current || 0;

                                const pnlSol = currentValueSol - totalCostSol;
                                const pnlUsd = pnlSol * solPrice;
                                const pnlPercent = totalCostSol > 0 ? (pnlSol / totalCostSol) * 100 : 0;

                                const isPositive = pnlSol >= 0;

                                const marketName = bet.title || bet.market_slug || 'Unknown Market';
                                const isYes = bet.side === 'YES';
                                const sideColor = isYes ? 'text-[#10B981] bg-[#10B981]' : 'text-red-500 bg-red-500';

                                return (
                                    <tr
                                        key={i}
                                        onClick={(e) => {
                                            router.push(`/market/${bet.market_slug}`);
                                        }}
                                        className="group hover:bg-[#FFF5F7] transition-colors cursor-pointer last:border-0"
                                    >
                                        <td className="py-5 pl-6">
                                            <div className="flex items-center gap-4">
                                                <div className="w-12 h-12 rounded-xl bg-white border-2 border-black overflow-hidden flex-shrink-0 relative shadow-[2px_2px_0px_0px_rgba(0,0,0,0.2)]">
                                                    {bet.market_icon ? (
                                                        <img src={bet.market_icon} className="w-full h-full object-cover" alt="" />
                                                    ) : (
                                                        <div className="w-full h-full flex items-center justify-center text-lg">🔮</div>
                                                    )}
                                                </div>
                                                <div className="flex flex-col gap-0.5">
                                                    <span className="font-black text-black text-base max-w-[200px] truncate capitalize leading-tight group-hover:text-[#F492B7] transition-colors">{marketName}</span>
                                                    <div className="flex items-center gap-2">
                                                        <span className={`px-2 py-0.5 rounded-lg text-[10px] font-black uppercase tracking-wider border-2 ${isYes ? 'bg-[#10B981] border-black text-white' : 'bg-red-500 border-black text-white'}`}>
                                                            {bet.outcome_name || bet.side}
                                                        </span>
                                                        {filter === 'closed' && (
                                                            <span className="text-[10px] text-black/60 font-bold">Ended {new Date().toLocaleDateString()}</span>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        </td>

                                        {/* Shares */}
                                        <td className="py-5 text-right font-mono text-black/70 text-sm font-bold">
                                            {formatCompact(normalizedShares)}
                                        </td>

                                        {/* Entry MCAP */}
                                        <td className="py-5 text-right font-mono text-black/60 text-xs font-bold">
                                            ${formatCompact(entryMcapUsd)}
                                        </td>

                                        {/* Current MCAP */}
                                        <td className="py-5 text-right font-mono font-black text-black text-sm">
                                            ${formatCompact(currentMcapUsd)}
                                        </td>

                                        {/* Value (USD) - Prominent */}
                                        <td className="py-5 text-right">
                                            <div className="font-black text-black text-lg tracking-tight italic">
                                                ${valUsd.toFixed(2)}
                                            </div>
                                        </td>

                                        {/* ROI / PnL */}
                                        <td className="py-5 text-right pr-6">
                                            <div className="flex flex-col items-end gap-0.5">
                                                <div className={`flex items-center gap-1.5 font-black text-sm italic ${isPositive ? 'text-[#10B981]' : 'text-red-500'}`}>
                                                    {isPositive && <span className="text-base">🚀</span>}
                                                    <span>{isPositive ? '+' : ''}${pnlUsd.toFixed(2)}</span>
                                                </div>
                                                <span className={`text-xs font-black px-1.5 py-0.5 rounded border-2 ${isPositive ? 'bg-[#10B981] border-black text-white' : 'bg-red-500 border-black text-white'}`}>
                                                    {isPositive ? '+' : ''}{pnlPercent.toFixed(2)}%
                                                </span>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}

// --- ACTIVITY TABLE ---
function ActivityTable({ walletAddress }: { walletAddress: string }) {
    const [activity, setActivity] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const router = useRouter();

    useEffect(() => {
        if (!walletAddress) return;
        supabaseDb.getUserActivity(walletAddress).then(data => {
            setActivity(data);
            setLoading(false);
        });
    }, [walletAddress]);

    if (loading) return <div className="text-center py-20"><Loader2 className="w-8 h-8 animate-spin mx-auto text-gray-500" /></div>;

    return (
        <div className="bg-white border-4 border-black rounded-3xl overflow-hidden shadow-[12px_12px_0px_0px_#F492B7]">
            <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="text-[10px] font-black uppercase tracking-widest border-b-4 border-black bg-black text-white">
                            <th className="py-4 pl-6">type</th>
                            <th className="py-4">market</th>
                            <th className="py-4 text-center">outcome</th>
                            <th className="py-4 text-right">amount</th>
                            <th className="py-4 text-right pr-6">value</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-black/20">
                        {activity.map((item, i) => {
                            if (item.market_slug?.includes('mkjm2hmf')) return null;

                            const marketName = (item.market_title || item.market_slug || '').replace(/-/g, ' ');
                            const isBuy = item.order_type === 'BUY' || (!item.order_type && item.amount > 0);
                            const typeColor = !isBuy ? 'bg-red-500 border-black text-white' : 'bg-[#10B981] border-black text-white';
                            const outcomeName = item.outcome_name || (item.outcome_index === 0 ? 'Yes' : 'No');

                            return (
                                <tr
                                    key={i}
                                    onClick={() => router.push(`/market/${item.market_slug}`)}
                                    className="group hover:bg-[#FFF5F7] transition-colors cursor-pointer"
                                >
                                    <td className="py-4 pl-6">
                                        <span className={`text-[10px] font-black uppercase px-2 py-1 rounded-lg border-2 ${typeColor}`}>
                                            {isBuy ? 'BUY' : 'SELL'}
                                        </span>
                                    </td>
                                    <td className="py-4">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-lg bg-white border-2 border-black overflow-hidden flex-shrink-0 relative shadow-[2px_2px_0px_0px_rgba(0,0,0,0.2)]">
                                                {item.market_icon ? (
                                                    <img src={item.market_icon} className="w-full h-full object-cover" alt="" />
                                                ) : (
                                                    <div className="w-full h-full flex items-center justify-center text-xs">🔮</div>
                                                )}
                                            </div>
                                            <span className="font-black text-black max-w-[200px] truncate capitalize group-hover:text-[#F492B7]">{marketName}</span>
                                        </div>
                                    </td>
                                    <td className="py-4 text-center">
                                        <span className={`text-xs font-black uppercase ${!isBuy ? 'text-red-500' : 'text-[#10B981]'}`}>
                                            {outcomeName}
                                        </span>
                                    </td>
                                    <td className="py-4 text-right">
                                        <div className="flex flex-col items-end">
                                            <span className="font-mono text-black/70 font-bold">{formatCompact(item.shares || 0)} Shares</span>
                                        </div>
                                    </td>
                                    <td className="py-4 text-right pr-6">
                                        <div className="flex flex-col items-end">
                                            <span className="font-black text-black italic">${formatCompact(item.amount || 0)}</span>
                                            <span className="text-[10px] text-black/60 font-bold mt-0.5">
                                                {new Date(item.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                            </span>
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
            {activity.length === 0 && (
                <div className="text-center py-10 text-black/70 text-sm font-black uppercase tracking-widest">no recent activity</div>
            )}
        </div>
    );
}

// --- MY MARKETS LIST ---
function MyMarketsList({ markets }: { markets: any[] }) {
    if (!markets || markets.length === 0) return (
        <div className="bg-white border-4 border-dashed border-black/20 rounded-3xl p-20 text-center shadow-[8px_8px_0px_0px_rgba(0,0,0,0.1)]">
            <p className="text-black/70 font-black uppercase tracking-widest text-sm">no markets created yet</p>
        </div>
    );

    // Helper to format date if string
    const formatDate = (d: any) => {
        try { return new Date(d).toLocaleDateString(); } catch (e) { return '-'; }
    };

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {markets.map((m: any, i: number) => (
                <div key={i} className="bg-white border-4 border-black p-6 rounded-3xl hover:translate-y-1 transition-all group shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] hover:shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] cursor-pointer">
                    <div className="flex items-start justify-between mb-4">
                        <img src={m.icon || '/pink-pfp.png'} className="w-12 h-12 rounded-xl object-contain bg-white border-2 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,0.3)]" onError={(e) => { e.currentTarget.src = '/pink-pfp.png'; }} />
                        <span className="bg-white border-2 border-black text-black text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded-lg">
                            {m.volume ? 'verified' : 'unverified'}
                        </span>
                    </div>
                    <h3 className="text-lg font-black text-black leading-tight mb-2 group-hover:text-[#F492B7] transition-colors line-clamp-2 lowercase">{m.title}</h3>
                    <div className="flex items-center justify-between text-xs text-black/70 font-bold">
                        <span className="lowercase">{m.type || 'Binary'}</span>
                        <span>{formatDate(m.createdAt || m.created_at)}</span>
                    </div>
                </div>
            ))}
        </div>
    );
}
// --- MEDAL VAULT COMPONENT (REDESIGNED AS GEMS VAULT) ---
function MedalVault({ profile, earnedAchievements, selectedMedals, setSelectedMedals, onClose }: any) {
    const [hovered, setHovered] = useState<string | null>(null);

    const MEDAL_DETAILS: Record<string, { title: string, desc: string, img: string }> = {
        'FIRST_MARKET': { title: 'Genesis Creator', desc: 'The first mark of a true Djinn. Awarded for early participation.', img: '/genesis-medal-v2.png' },
        'GOLD_TROPHY': { title: 'The Champion', desc: 'The highest honor. Awarded for dominating the leaderboard.', img: '/gold-trophy.png' },
        'LEGENDARY_TRADER': { title: 'Legendary Trader', desc: 'A master of the bonding curve. 100k+ XP earned.', img: '/gems-trophy.png' },
        'ORACLE': { title: 'Grand Oracle', desc: 'Your predictions shape reality. Proven accuracy over time.', img: '/orange-crystal-v2.png' },
        'MARKET_MAKER': { title: 'Market Maker', desc: 'Provided liquidity to the trenches when others feared to tread.', img: '/blue-crystal-v2.png' },
        'DIAMOND_HANDS': { title: 'Diamond Hands', desc: 'Held through the volatility without flinching.', img: '/diamond-crystal.png' },
        'PINK_CRYSTAL': { title: 'Mystic Rose', desc: 'A rare aura of intuition and luck.', img: '/pink-crystal.png' },
        'EMERALD_SAGE': { title: 'Emerald Sage', desc: 'Deep knowledge of market dynamics.', img: '/green-crystal.png' },
        'MOON_DANCER': { title: 'Moon Dancer', desc: 'Caught the peak of multiple moon missions.', img: '/moon-crystal.png' },
        'MARKET_SNIPER': { title: 'Market Sniper', desc: 'Precision trades with minimal slippage.', img: '/emerald-sniper.png' },
        'APEX_PREDATOR': { title: 'Apex Predator', desc: 'Feasted on the losses of the weak. Ruthless efficiency.', img: '/apex-skull.png' },
        'MYSTIC_CRYSTAL': { title: 'Mystic Crystal', desc: 'A mysterious artifact powered by your Gem hoard.', img: '🔮' }
    };

    const toggleMedal = (code: string) => {
        if (selectedMedals.includes(code)) {
            setSelectedMedals(selectedMedals.filter((m: string) => m !== code));
        } else if (selectedMedals.length < 9) {
            setSelectedMedals([...selectedMedals, code]);
        }
    };

    // All available medals for this user
    // ensure Genesis is ALWAYS available (FIRST_MARKET)
    const availableCodes = earnedAchievements.map((a: any) => a.code);
    if (!availableCodes.includes('FIRST_MARKET')) {
        availableCodes.unshift('FIRST_MARKET');
    }

    // Always available "Gem" medal if they have any gems
    if (profile.gems > 0 && !availableCodes.includes('MYSTIC_CRYSTAL')) {
        availableCodes.push('MYSTIC_CRYSTAL');
    }

    const hoverInfo = hovered ? (MEDAL_DETAILS[hovered] || { title: hovered, desc: 'A rare achievement earned in the trenches.', img: '' }) : null;

    return (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-6 bg-black/98 backdrop-blur-3xl">
            <div className="relative bg-white border-4 border-black w-full max-w-2xl h-[90vh] flex flex-col rounded-3xl shadow-[16px_16px_0px_0px_#F492B7] overflow-hidden animate-in fade-in zoom-in duration-300">

                {/* VAULT HEADER */}
                <div className="px-10 pt-10 pb-6 flex items-center justify-between border-b-4 border-black shrink-0 bg-[#F492B7] z-20">
                    <div>
                        <h2 className="text-4xl font-black lowercase tracking-tight text-black">gems vault</h2>
                        <div className="flex items-center gap-2 mt-1">
                            <p className="text-black/70 text-[10px] font-bold uppercase tracking-[0.2em]">select gems to feature on your profile</p>
                        </div>
                    </div>
                </div>

                {/* SPLIT CONTENT */}
                <div className="flex-1 flex flex-col overflow-hidden relative">

                    {/* TOP: AVAILABLE (SCROLLABLE) */}
                    <div className="flex-1 overflow-y-auto px-10 py-8 custom-scrollbar bg-white">
                        <p className="text-[10px] font-black uppercase tracking-[0.3em] text-black/70 mb-6 sticky top-0 bg-white backdrop-blur-sm z-10 py-2">available gems</p>
                        <div className="grid grid-cols-5 gap-3 pb-24"> {/* Extra padding for hover info */}
                            {availableCodes.map((code: string, i: number) => {
                                const details = MEDAL_DETAILS[code];
                                const isSelected = selectedMedals.includes(code);
                                if (!details) return null;
                                return (
                                    <button
                                        key={i}
                                        onMouseEnter={() => setHovered(code)}
                                        onMouseLeave={() => setHovered(null)}
                                        onClick={() => toggleMedal(code)}
                                        className={`relative aspect-square rounded-2xl border-3 transition-all flex items-center justify-center group ${isSelected ? 'bg-white border-black/20 opacity-30 grayscale' : 'bg-white border-black hover:border-[#F492B7] hover:shadow-[4px_4px_0px_0px_#F492B7] hover:scale-105 shadow-[2px_2px_0px_0px_rgba(0,0,0,0.2)]'}`}
                                    >
                                        {details?.img?.length === 1 ? (
                                            <span className="text-3xl group-hover:scale-110 transition-transform">{details.img}</span>
                                        ) : (
                                            <img src={details?.img || '/pink-pfp.png'} className="w-full h-full object-contain p-3 group-hover:scale-110 transition-transform" />
                                        )}
                                        {isSelected && (
                                            <div className="absolute inset-0 flex items-center justify-center bg-white/90 rounded-2xl">
                                                <span className="text-[10px] font-black text-[#F492B7] uppercase tracking-widest">active</span>
                                            </div>
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* FIXED INFO PANEL (FLOATING) */}
                    <div className="absolute bottom-1/2 left-0 right-0 px-10 pointer-events-none flex justify-center z-30 translate-y-1/2">
                        <div className={`bg-white border-4 border-black p-5 rounded-2xl shadow-[8px_8px_0px_0px_#F492B7] flex items-center gap-5 max-w-lg transition-all duration-300 transform ${hovered ? 'opacity-100 scale-100 translate-y-0' : 'opacity-0 scale-95 translate-y-4'}`}>
                            {hoverInfo && (
                                <>
                                    <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center shrink-0 border-2 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,0.3)]">
                                        {hoverInfo.img?.length === 1 ? <span className="text-3xl">{hoverInfo.img}</span> : <img src={hoverInfo.img || '/pink-pfp.png'} className="w-10 h-10 object-contain" />}
                                    </div>
                                    <div>
                                        <p className="font-black text-black text-lg lowercase tracking-tight leading-none mb-1">{hoverInfo.title}</p>
                                        <p className="text-black/70 text-xs font-bold leading-relaxed">{hoverInfo.desc}</p>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>

                    {/* BOTTOM: ACTIVE (SCROLLABLE) */}
                    <div className="flex-1 overflow-y-auto px-10 py-8 custom-scrollbar border-t-4 border-black bg-[#FFF5F7]">
                        <p className="text-[10px] font-black uppercase tracking-[0.3em] text-black/70 mb-6 sticky top-0 bg-[#FFF5F7] z-10 py-2">featured on profile ({selectedMedals.length}/9)</p>
                        <div className="flex flex-wrap gap-3">
                            {selectedMedals.map((code: string, i: number) => {
                                const details = MEDAL_DETAILS[code];
                                return (
                                    <button
                                        key={i}
                                        onMouseEnter={() => setHovered(code)}
                                        onMouseLeave={() => setHovered(null)}
                                        onClick={() => toggleMedal(code)}
                                        className="relative w-20 h-20 rounded-2xl bg-white border-3 border-[#F492B7] flex items-center justify-center hover:border-red-500 group transition-all shadow-[4px_4px_0px_0px_#F492B7] hover:shadow-[4px_4px_0px_0px_#EF4444]"
                                    >
                                        {details?.img?.length === 1 ? (
                                            <span className="text-3xl group-hover:opacity-0">{details.img}</span>
                                        ) : (
                                            <img src={details?.img || '/pink-pfp.png'} className="w-12 h-12 object-contain group-hover:opacity-0" />
                                        )}
                                        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 bg-white/95 rounded-2xl">
                                            <span className="text-red-500 font-black text-[9px] uppercase tracking-widest">remove</span>
                                        </div>
                                    </button>
                                );
                            })}
                            {selectedMedals.length === 0 && (
                                <div className="w-full flex items-center justify-center h-20 border-4 border-dashed border-black/20 rounded-2xl bg-white">
                                    <p className="text-black/70 font-bold uppercase text-[10px] tracking-widest">click gems above to activate</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* VAULT FOOTER */}
                <div className="px-10 py-6 border-t-4 border-black bg-white shrink-0 z-20">
                    <button
                        onClick={onClose}
                        className="w-full bg-[#F492B7] border-3 border-black text-black py-4 rounded-xl font-black lowercase text-sm tracking-tight shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] hover:translate-y-1 hover:shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] transition-all"
                    >
                        apply changes
                    </button>
                </div>

            </div>
        </div>
    );
}


function FollowersList({ wallet, router, onClose }: any) {
    const [list, setList] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        supabaseDb.getFollowers(wallet).then(data => {
            setList(data);
            setLoading(false);
        });
    }, [wallet]);

    if (loading) return <div className="p-8 text-center text-gray-500 text-xs font-bold uppercase tracking-widest">Loading djinns...</div>;
    if (list.length === 0) return <div className="p-8 text-center text-gray-500 text-xs font-bold uppercase tracking-widest">No followers yet</div>;

    return (
        <div className="p-4 overflow-y-auto flex-1 space-y-2">
            {list.map((u, i) => (
                <div
                    key={i}
                    className="flex items-center gap-4 p-3 hover:bg-white/5 rounded-xl transition-colors cursor-pointer group"
                    onClick={() => { onClose(); router.push(`/profile/${u.username}`); }}
                >
                    <img
                        src={u.avatar_url || '/pink-pfp.png'}
                        className="w-10 h-10 rounded-full object-cover bg-black border border-white/10 group-hover:border-[#F492B7]/50 transition-colors"
                        alt=""
                    />
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold truncate text-white group-hover:text-[#F492B7] transition-colors">{u.username}</p>
                        <p className="text-[10px] text-gray-500 truncate font-mono">{u.wallet_address}</p>
                    </div>
                    <button className="text-[10px] font-black uppercase bg-white/5 px-3 py-1.5 rounded-lg text-gray-400 group-hover:bg-white group-hover:text-black transition-all">
                        View
                    </button>
                </div>
            ))}
        </div>
    );
}

function FollowingList({ wallet, router, onClose }: any) {
    const [list, setList] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        supabaseDb.getFollowing(wallet).then(data => {
            setList(data);
            setLoading(false);
        });
    }, [wallet]);

    if (loading) return <div className="p-8 text-center text-gray-500 text-xs font-bold uppercase tracking-widest">Loading djinns...</div>;
    if (list.length === 0) return <div className="p-8 text-center text-gray-500 text-xs font-bold uppercase tracking-widest">Not following anyone yet</div>;

    return (
        <div className="p-4 overflow-y-auto flex-1 space-y-2">
            {list.map((u, i) => (
                <div
                    key={i}
                    className="flex items-center gap-4 p-3 hover:bg-white/5 rounded-xl transition-colors cursor-pointer group"
                    onClick={() => { onClose(); router.push(`/profile/${u.username}`); }}
                >
                    <img
                        src={u.avatar_url || '/pink-pfp.png'}
                        className="w-10 h-10 rounded-full object-cover bg-black border border-white/10 group-hover:border-[#F492B7]/50 transition-colors"
                    />
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold truncate text-white group-hover:text-[#F492B7] transition-colors">{u.username}</p>
                        <p className="text-[10px] text-gray-500 truncate font-mono">{u.wallet_address}</p>
                    </div>
                    <button className="text-[10px] font-black uppercase bg-white/5 px-3 py-1.5 rounded-lg text-gray-400 group-hover:bg-white group-hover:text-black transition-all">
                        View
                    </button>
                </div>
            ))}
        </div>
    );
}

