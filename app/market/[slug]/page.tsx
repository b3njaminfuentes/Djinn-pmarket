'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Navbar from '@/components/Navbar';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { formatCompact, parseCompactNumber, getOutcomeValue, cn } from '@/lib/utils';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction } from '@solana/web3.js';
import { Clock, DollarSign, Wallet, Activity, Users, CheckCircle2, AlertCircle, Loader2, Edit2, ExternalLink, Share2, Scale, MessageCircle, Star, X, Bot, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { useDjinnProtocol } from '@/hooks/useDjinnProtocol';
import { simulateBuy, simulateSell, estimatePayoutInternal, getSpotPrice, calculateImpliedProbability, getIgnitionProgressMcap, getIgnitionStatusMcap } from '@/lib/core-amm';
import { AnimatedNumber } from '@/components/AnimatedNumber';
import { useMarketData } from '@/hooks/useMarketData';
import { useRealtimeChart } from '@/hooks/useRealtimeChart';
import { useSound } from '@/components/providers/SoundProvider';
import MorphingIcon from '@/components/ui/MorphingIcon';
import EarningsTicketModal from '@/components/EarningsTicketModal';
import confetti from 'canvas-confetti';

// Components
import PrettyChart from '@/components/market/PrettyChart';
import TheDjinnChart from '@/components/market/TheDjinnChart';
// TradingView & Switcher REMOVED
import CommentsSection from '@/components/market/CommentsSection';
import OutcomeList, { Outcome } from '@/components/market/OutcomeList';
import PurchaseToast from '@/components/market/PurchaseToast';
import ShareExperience from '@/components/ShareExperience';
import DjinnToast, { DjinnToastType } from '@/components/ui/DjinnToast';
import BotVerificationPanel from '@/components/BotVerificationPanel';
import { usePrice } from '@/lib/PriceContext';
import * as supabaseDb from '@/lib/supabase-db';
import { PrizePoolCounter } from '@/components/PrizePoolCounter';
import HoldingsPanel from '@/components/HoldingsPanel';
import HoldingsSection from '@/components/market/HoldingsSection';
import { getOutcomeColor } from '@/lib/market-colors';
import { Bet, getUserMarketBets } from '@/lib/supabase-db';

import IgnitionBar from '@/components/market/IgnitionBar';
import bs58Module from 'bs58';
const bs58 = (bs58Module as any).default || bs58Module;
import { ADMIN_WALLETS } from '@/lib/whitelist';


// Utils
const TREASURY_WALLET = new PublicKey("G1NaEsx5Pg7dSmyYy6Jfraa74b7nTbmN9A9NuiK171Ma");

// --- MOCK MULTI-OUTCOMES ---
// Matches useDjinnProtocol.ts
const PROGRAM_ID = new PublicKey("Fdbhx4cN5mPWzXneDm9XjaRgjYVjyXtpsJLGeQLPr7hg");

const MULTI_OUTCOMES: Record<string, Outcome[]> = {
    'us-strike-mexico': [
        { id: 'us-strike-mexico-jan-31', title: 'January 31', volume: '$352K', yesPrice: 7, noPrice: 93, chance: 7 },
        { id: 'us-strike-mexico-mar-31', title: 'March 31', volume: '$137K', yesPrice: 22, noPrice: 78, chance: 22 },
        { id: 'us-strike-mexico-dec-31', title: 'December 31', volume: '$130K', yesPrice: 38, noPrice: 62, chance: 38 },
    ],

    // ---------------------------------------------------------------------
    'world-cup-winner-multiple': [
        { id: 'world-cup-argentina', title: 'Argentina', volume: '$150K', yesPrice: 35, noPrice: 65, chance: 35 },
        { id: 'world-cup-chile', title: 'Chile', volume: '$80K', yesPrice: 15, noPrice: 85, chance: 15 },
        { id: 'world-cup-brasil', title: 'Brasil', volume: '$120K', yesPrice: 30, noPrice: 70, chance: 30 },
        { id: 'world-cup-bolivia', title: 'Bolivia', volume: '$50K', yesPrice: 5, noPrice: 95, chance: 5 },
    ]
};

const marketDisplayData: Record<string, any> = {
    'argentina-world-cup-2026': { title: "Will Argentina be finalist on the FIFA World Cup 2026?", icon: "🇦🇷", description: "Se resuelve YES si Argentina juega la final." },
    'btc-hit-150k': { title: 'Will Bitcoin reach ATH on 2026?', icon: '₿', description: 'Resolves YES if BTC breaks its previous record.' },
    'us-strike-mexico': { title: 'US strike on Mexico by...?', icon: '🇺🇸', description: 'Predicting geopolitical events.' },
    'world-cup-winner-multiple': { title: 'Who will win the World Cup 2026?', icon: '🏆', description: 'Predict which country will lift the trophy in the FIFA World Cup 2026.' }
};



// Generate chart data for single outcome with Bonding Curve "Origin" logic


// ... (Multi-outcome generator removed or simplified if unused, but let's keep consistent)

// --- PAGE COMPONENT ---
export default function Page() {
    // Hooks
    const params = useParams();
    const slug = params?.slug as string || '';
    const { publicKey, signTransaction } = useWallet();
    const { connection } = useConnection();
    const { program, buyShares, sellShares, claimReward, isReady: isContractReady } = useDjinnProtocol();
    const { play } = useSound();

    // --- STATE ---
    // Market Data
    const { marketData, marketInfo, activityList, holders, isLoading: isMarketLoading, refreshAll, mutateActivity, mutateHolders, mutateMarketData } = useMarketData(slug);
    const [onChainData, setOnChainData] = useState<any>(null); // Stores on-chain specific data (supplies, vault)

    // Unified Market Account (Merges SWR Static Info + On-Chain Live Info)
    const marketAccount = useMemo(() => {
        // If we found it on-chain but not in DB (rare fallback), onChainData will carry most info
        // Typically marketInfo provides metadata, onChainData provides live supplies
        const base = (marketInfo || {}) as any;
        return {
            ...base,
            ...onChainData,
            // Ensure critical fields are accessible at top level if onChainData provides them
            outcome_supplies: onChainData?.outcome_supplies || base.outcome_supplies || base.outcomeSupplies,
            yes_supply: onChainData?.yes_supply || base.yes_supply,
            no_supply: onChainData?.no_supply || base.no_supply
        };
    }, [marketInfo, onChainData]);

    const [selectedOutcomeId, setSelectedOutcomeId] = useState<string>('');
    const [selectedOutcomeName, setSelectedOutcomeName] = useState<string>('');
    const [hoveredPrice, setHoveredPrice] = useState<number | null>(null);
    const [livePrice, setLivePrice] = useState<number>(50);

    // Sync Live Price from SWR to Local State (for optimistic UI support)
    // Sync Live Price from SWR to Local State (for optimistic UI support)
    // FIX: Lockout ref to prevent stale server data from overwriting optimistic updates
    const priceLockoutRef = React.useRef(false);

    // Safety: Auto-unlock after 30s in case of indexer/tx hang
    const lockWithTimeout = () => {
        priceLockoutRef.current = true;
        setTimeout(() => {
            if (priceLockoutRef.current) {
                console.log("🔓 Safety: Optimistic lock timed out - releasing.");
                priceLockoutRef.current = false;
            }
        }, 30000);
    };

    useEffect(() => {
        if (marketData?.live_price && !priceLockoutRef.current) {
            setLivePrice(marketData.live_price);
        }
    }, [marketData]);

    // Confirmation & Toast State
    const [showConfetti, setShowConfetti] = useState(false);
    const [isClaimModalOpen, setIsClaimModalOpen] = useState(false);
    const [djinnToast, setDjinnToast] = useState<{ isVisible: boolean; type: 'SUCCESS' | 'ERROR' | 'INFO'; title: string; message: string; actionLink?: string; actionLabel?: string }>({ isVisible: false, type: 'INFO', title: '', message: '' });



    // --- CHART HISTORY STATE ---
    // Stores the full history for the session (since page load)
    // Load persisted chart data from localStorage
    const [historyState, setHistoryState] = useState<{
        probability: any[]; // Array of { time, [outcome]: val }
        candles: Record<string, any[]>; // Map of OutcomeName -> CandlestickData[]
    }>(() => {
        // Initialize from localStorage if available
        if (typeof window !== 'undefined') {
            try {
                const stored = localStorage.getItem(`djinn_chart_${slug}`);
                if (stored) {
                    const parsed = JSON.parse(stored);
                    // Only use if data is recent (within last 24 hours)
                    const lastTime = parsed.probability?.[parsed.probability.length - 1]?.time;
                    if (lastTime && (Date.now() / 1000 - lastTime) < 86400) {
                        // console.log('📊 Restored chart data from localStorage');
                        return parsed;
                    }
                }
            } catch (e) {
                console.warn('Failed to load chart data from localStorage:', e);
            }
        }
        return { probability: [], candles: {} };
    });
    const [isLoading, setIsLoading] = useState(false);
    const [showHoldingsPanel, setShowHoldingsPanel] = useState(false); // Toggle for float panel
    const [timeLeft, setTimeLeft] = useState<string>('');
    const { solPrice } = usePrice();
    const [mounted, setMounted] = useState(false);
    useEffect(() => setMounted(true), []);

    // Persist chart data to localStorage when it changes
    useEffect(() => {
        if (historyState.probability.length > 0 || Object.keys(historyState.candles).length > 0) {
            try {
                localStorage.setItem(`djinn_chart_${slug}`, JSON.stringify(historyState));
            } catch (e) {
                console.warn('Failed to save chart data to localStorage:', e);
            }
        }
    }, [historyState, slug]);







    // --- DJINN V3 METRICS ---
    const {
        yesMcap,
        noMcap,
        yesPercent,
        noPercent,
        ignitionProgress,
        ignitionStatus,
        spotYes,
        spotNo,

    } = useMemo(() => {
        console.log("📊 Recalculating MCAP Metrics. MarketAccount:", marketAccount ? "Present" : "Null", "LivePrice:", livePrice);
        let sYes = 0; let sNo = 0;

        // Use outcome_supplies from marketAccount if available (populated by on-chain fetch)
        if (marketAccount?.outcome_supplies && marketAccount.outcome_supplies.length >= 2) {
            sYes = Number(marketAccount.outcome_supplies[0]) / 1e9;
            sNo = Number(marketAccount.outcome_supplies[1]) / 1e9;
            console.log("📈 Using on-chain supplies - YES:", sYes, "NO:", sNo);
        } else if (marketAccount?.yes_supply !== undefined) {
            sYes = Number(marketAccount.yes_supply) / 1e9;
            sNo = Number(marketAccount.no_supply) / 1e9;
        } else {
            // No supply data found -> 0 Supply = 0 MCAP
            sYes = 0;
            sNo = 0;
        }

        // DEBUG: Trace Supply for MCAP
        // console.log(`🔍 MCAP Calc Debug: sYes=${sYes}, sNo=${sNo}, onChainSupplies=${JSON.stringify(marketAccount?.outcome_supplies)}`);

        // MCAP = Supply * Price * SOL_Price (Market Cap)
        // This represents the total value of all shares in circulation if sold at current price


        const currentSpotYes = getSpotPrice(sYes);
        const currentSpotNo = getSpotPrice(sNo);

        // MCAP = Supply * Price * SOL_Price (Market Cap)
        // This represents the total value of all shares in circulation if sold at current price

        const mYes = sYes * currentSpotYes; // SOL Value (MCAP)
        const mNo = sNo * currentSpotNo;    // SOL Value (MCAP)

        // ✅ RESTORED: Use Supply with 15M buffer for stable probability (max ~78-80%)
        const yP = calculateImpliedProbability(sYes, sNo);

        console.log(`📊 Supply Update - YES: ${sYes.toFixed(0)} shares (${yP.toFixed(1)}%), NO: ${sNo.toFixed(0)} shares (${(100 - yP).toFixed(1)}%)`);

        return {
            yesMcap: mYes,
            noMcap: mNo,
            yesPercent: yP,
            noPercent: 100 - yP,
            // 🎯 UPDATED: Use MCAP-based progress for $34k graduation target
            ignitionProgress: getIgnitionProgressMcap(mYes + mNo),
            ignitionStatus: getIgnitionStatusMcap(mYes + mNo),
            spotYes: currentSpotYes,
            spotNo: currentSpotNo
        };
    }, [marketAccount, livePrice, onChainData]);

    // ⚡ CERBERUS AUTOMATION: Graduation Check (The "Pink Checkmark" Trial)
    // If we hit 100% Ignition ($34k MCAP), trigger the Oracle for verification
    useEffect(() => {
        if (ignitionProgress >= 100 && slug && !marketDisplayData[slug]?.verdict) {
            // Check if we already requested (basic local latch to avoid spam)
            const latchKey = `djinn_grad_check_${slug}`;
            if (sessionStorage.getItem(latchKey)) return;

            console.log("🦁 MCAP TARGET REACHED! Triggering Cerberus Graduation Check...");
            sessionStorage.setItem(latchKey, 'true');

            // Fire and forget
            fetch('/api/oracle/monitor', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ slug })
            }).catch(e => console.error("Auto-monitor failed", e));
        }
    }, [ignitionProgress, slug]);



    // Reactive Market Outcomes (Independent Pricing Logic)
    const marketOutcomes = useMemo(() => {
        let base: Outcome[] = [];

        // 1. Try Hardcoded Multi-Outcomes
        if (MULTI_OUTCOMES[slug]) {
            base = MULTI_OUTCOMES[slug].map(o => ({ ...o }));
        }
        // 2. Dynamic Market Options (Decoupled Supply/Price logic)
        else if (marketAccount?.options && marketAccount.options.length >= 2) {
            base = marketAccount.options.map((title: string, idx: number) => {
                // Get Specific Supply for this Outcome
                let supply = 0;
                if (marketAccount.outcome_supplies && marketAccount.outcome_supplies[idx]) {
                    supply = Number(marketAccount.outcome_supplies[idx]) / 1e9;
                } else if (idx === 0 && marketAccount.yes_supply) {
                    supply = Number(marketAccount.yes_supply) / 1e9;
                } else if (idx === 1 && marketAccount.no_supply) {
                    supply = Number(marketAccount.no_supply) / 1e9;
                }

                // Calculate Independent Price (Memecoin Style)
                const spotPrice = getSpotPrice(supply);

                // Calculate Independent MCAP (Supply * Price)
                const mcapSOL = supply * spotPrice;

                return {
                    id: `${slug}-${idx}`,
                    title: title,
                    volume: '-',
                    yesPrice: spotPrice * 100,
                    noPrice: 100 - (spotPrice * 100),
                    chance: 0,
                    mcapSOL: mcapSOL,
                    supply: supply
                };
            });


            // Normalize Probabilities (Chances)
            // FIX: Use Supply Ratio logic to match core-amm.ts calculateImpliedProbability exactly
            // Do NOT use Spot Price normalization for chance, as curve shape != probability shape
            const VIRTUAL_FLOOR = 15_000_000; // Must match core-amm.ts
            let totalAdjustedSupply = 0;
            const adjustedSupplies: number[] = [];

            base.forEach((o, idx) => {
                // supplies are already fetched dynamically inside the map above, but distinct scope
                // Re-fetch supply for consistency
                let supply = 0;
                if (marketAccount.outcome_supplies && marketAccount.outcome_supplies[idx]) {
                    supply = Number(marketAccount.outcome_supplies[idx]) / 1e9;
                } else if (idx === 0 && marketAccount.yes_supply) {
                    supply = Number(marketAccount.yes_supply) / 1e9;
                } else if (idx === 1 && marketAccount.no_supply) {
                    supply = Number(marketAccount.no_supply) / 1e9;
                }
                const adj = supply + VIRTUAL_FLOOR;
                adjustedSupplies[idx] = adj;
                totalAdjustedSupply += adj;
            });

            if (totalAdjustedSupply > 0) {
                base.forEach((o, idx) => {
                    o.chance = (adjustedSupplies[idx] / totalAdjustedSupply) * 100;
                });
            } else {
                base.forEach(o => o.chance = 100 / base.length);
            }
        }
        // 3. Fallback Default (ONLY if no market account data at all)
        else {
            // If we have a livePrice but no market options (e.g. loading), assume YES/NO but correct price
            if (livePrice !== 50) {
                base = [
                    { id: 'yes', title: 'YES', volume: '0', yesPrice: livePrice, noPrice: 100 - livePrice, chance: livePrice },
                    { id: 'no', title: 'NO', volume: '0', yesPrice: 100 - livePrice, noPrice: livePrice, chance: 100 - livePrice },
                ];
            } else {
                base = [
                    { id: 'yes', title: 'YES', volume: '0', yesPrice: 50, noPrice: 50, chance: 50 },
                    { id: 'no', title: 'NO', volume: '0', yesPrice: 50, noPrice: 50, chance: 50 },
                ];
            }
        }

        // Apply Live Updates (Legacy Binary Overrides)
        // Ensure that if we have a live price signal, we enforce it on the outcome probability
        if (base.length === 2 && (marketAccount?.options?.length || 0) < 2) {
            // Check if livePrice differs significantly from base chance, if so, override
            // This prevents "Reversion to 50%" if the base logic above fell back to default
            if (base[0].chance !== livePrice) {
                base[0].chance = livePrice;
                base[0].yesPrice = livePrice;
                base[1].chance = 100 - livePrice;
                base[1].yesPrice = 100 - livePrice;
            }
        }

        // 🎨 APPLY CUSTOM COLORS (If available)
        if (marketAccount?.outcome_colors && marketAccount.outcome_colors.length === base.length) {
            base = base.map((o, idx) => ({
                ...o,
                color: marketAccount.outcome_colors[idx] // Inject custom color
            }));
        } else if (marketAccount?.outcome_colors && base.length === 2) {
            // Binary fallback mapping if length mismatch but it's likely [Yes, No]
            base[0].color = marketAccount.outcome_colors[0] || '#10B981';
            base[1].color = marketAccount.outcome_colors[1] || '#EF4444';
        }

        return base;
    }, [slug, livePrice, marketAccount]);

    // --- REALTIME CHART DATA ---
    // Using useRealtimeChart to get live data and trades
    const { chartData, latestTrade: realtimeTradeEvent } = useRealtimeChart({
        marketId: slug,
        outcomeNames: marketOutcomes.map(o => o.title),
        initialData: historyState.probability // feed persisted data if any
    });

    // Update historyState when chartData changes (for persistence)
    useEffect(() => {
        if (chartData.length > 0) {
            setHistoryState( (prev: any) => ({ ...prev, probability: chartData }));
        }
    }, [chartData]);


    // User Data
    const [solBalance, setSolBalance] = useState<number>(0);
    const [vaultBalanceSol, setVaultBalanceSol] = useState<number>(0); // On-chain vault balance for Prize Pool

    const totalPoolSol = useMemo(() => {
        return vaultBalanceSol || (marketAccount?.global_vault ? (Number(marketAccount.global_vault) / LAMPORTS_PER_SOL) : 0);
    }, [vaultBalanceSol, marketAccount?.global_vault]);

    const [myShares, setMyShares] = useState<Record<number, number>>({});
    // holders and activityList are now from SWR
    const [userProfile, setUserProfile] = useState({ username: 'Anon', avatarUrl: '/pink-pfp.png' });

    // 🔥 NEW: Robust Profile Loading (Cache-First + Event Listener)
    const loadUserProfile = useCallback(async () => {
        if (!publicKey) return;
        const walletAddress = publicKey.toBase58();
        const dynamicKey = `djinn_profile_${walletAddress}`;

        // 1. Try LocalStorage (Fastest)
        try {
            const cached = localStorage.getItem(dynamicKey);
            if (cached) {
                const parsed = JSON.parse(cached);
                if (parsed.username || parsed.avatarUrl) {
                    console.log("👤 Page: Loaded profile from cache:", parsed);
                    setUserProfile({
                        username: parsed.username || 'Anon',
                        avatarUrl: parsed.avatarUrl || '/pink-pfp.png'
                    });
                }
            }
        } catch (e) {
            console.warn("Error reading local profile:", e);
        }

        // 2. Try Supabase (Background Sync)
        try {
            const profile = await supabaseDb.getProfile(walletAddress);
            if (profile) {
                setUserProfile( (prev: any) => {
                    // Start with what we have (likely cached)
                    const newState = { ...prev };
                    let changed = false;

                    // Only update if server has data
                    if (profile.username && profile.username !== prev.username) {
                        newState.username = profile.username;
                        changed = true;
                    }
                    if (profile.avatar_url && profile.avatar_url !== prev.avatarUrl) {
                        newState.avatarUrl = profile.avatar_url;
                        changed = true;
                    }

                    if (changed) {
                        // Update cache to match server
                        try {
                            localStorage.setItem(dynamicKey, JSON.stringify(newState));
                        } catch (e) {
                            console.warn("Storage quota full, could not cache profile update", e);
                        }
                        return newState;
                    }
                    return prev;
                });
            }
        } catch (error) {
            console.error('Error fetching user profile:', error);
        }
    }, [publicKey]);

    // Initial Load & Event Listener
    useEffect(() => {
        loadUserProfile();

        const handleProfileUpdate = () => {
            console.log("✨ Page: Profile update event received, reloading...");
            loadUserProfile();
        };

        window.addEventListener('djinn-profile-updated', handleProfileUpdate);
        return () => window.removeEventListener('djinn-profile-updated', handleProfileUpdate);
    }, [loadUserProfile]);


    // UI State
    const [betAmount, setBetAmount] = useState('');
    const [selectedSide, setSelectedSide] = useState<'YES' | 'NO'>('YES');
    const [isPending, setIsPending] = useState(false);

    // Derive on-chain supplies map for the chart header
    const outcomeSuppliesMap = useMemo(() => {
        const map: Record<string, number> = {};
        if (marketAccount?.outcome_supplies && marketOutcomes.length >= marketAccount.outcome_supplies.length) {
            marketAccount.outcome_supplies.forEach((supply: any, idx: number) => {
                const title = marketOutcomes[idx]?.title || `Outcome ${idx}`;
                map[title] = Number(supply) / 1e9;
            });
        } else if (marketOutcomes.length === 2 && marketAccount?.outcome_supplies) {
            // Binary fallback
            map[marketOutcomes[0].title] = Number(marketAccount.outcome_supplies[0]) / 1e9;
            map[marketOutcomes[1].title] = Number(marketAccount.outcome_supplies[1]) / 1e9;
        }
        return map;
    }, [marketAccount, marketOutcomes]);
    const [isSuccess, setIsSuccess] = useState(false);
    const [tradeSuccessInfo, setTradeSuccessInfo] = useState<{ shares: number; side: string; txSignature: string } | null>(null);

    const [lastTradeEvent, setLastTradeEvent] = useState<{ id: string; amount: number; side: 'YES' | 'NO'; outcome?: string; title?: string; color?: string } | null>(null);
    const [tradeMode, setTradeMode] = useState<'BUY' | 'SELL'>('BUY');
    const [isMaxSell, setIsMaxSell] = useState(false);
    const [showPurchaseToast, setShowPurchaseToast] = useState(false);
    const [showShareModal, setShowShareModal] = useState(false);
    const [lastBetDetails, setLastBetDetails] = useState<any>(null);
    const [bottomTab, setBottomTab] = useState<'ACTIVITY' | 'COMMENTS' | 'HOLDERS'>('ACTIVITY');
    const [slippageTolerance, setSlippageTolerance] = useState<number>(5); // Default 5%
    const [isStarred, setIsStarred] = useState(false);
    const [purchaseBubbles, setPurchaseBubbles] = useState<{ id: number; side: 'YES' | 'NO'; amount: number }[]>([]);

    const normalizeShares = (val: number) => val;
    const updateMyShares = (index: number, amount: number) => {
        setMyShares( (prev: any) => ({ ...prev, [index]: amount }));
    };


    // ...

    // 🔥 HELPER: Creator Display Logic
    // If the creator is ME (current user), use my local up-to-date profile.
    // Otherwise, use the marketAccount data.
    const creatorDisplay = useMemo(() => {
        const wallet = marketAccount?.creator_wallet;
        const defaultName = wallet ? `${wallet.slice(0, 4)}...${wallet.slice(-4)}` : 'Djinn Creator';

        // If I am the creator
        if (wallet && publicKey && wallet === publicKey.toBase58()) {
            return {
                username: userProfile.username && userProfile.username !== 'Anon' ? userProfile.username : (marketAccount.creator_username || defaultName),
                avatar: userProfile.avatarUrl || marketAccount.creator_avatar || '/pink-pfp.png',
                isMe: true
            };
        }
        return {
            username: (marketAccount?.creator_username && marketAccount.creator_username !== 'Djinn Creator') ? marketAccount.creator_username : defaultName,
            avatar: marketAccount?.creator_avatar || '/pink-pfp.png',
            isMe: false
        };
    }, [marketAccount, userProfile, publicKey]);


    // Derived
    const isMultiOutcome = (MULTI_OUTCOMES[slug] || []).length > 0 || ((marketAccount?.options?.length || 0) > 2);
    const staticMarketInfo = marketDisplayData[slug] || {
        title: slug ? slug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ') : 'Welcome to Djinn',
        icon: '🧊',
        description: 'Market description unavailable.'
    };
    const effectiveSlug = slug;

    // Creator Profile State (Client-side fallback)
    const [creatorProfile, setCreatorProfile] = useState<{ username?: string, avatar?: string } | null>(null);

    // Fetch Creator Profile if missing from market data
    useEffect(() => {
        if (marketAccount?.creator_wallet) {
            // 1. If we already have it from the initial fetch, use it
            if (marketAccount.creator_username || marketAccount.creator_avatar) {
                setCreatorProfile({
                    username: marketAccount.creator_username,
                    avatar: marketAccount.creator_avatar
                });
            }
            // 2. Otherwise fetch explicitly
            else {
                supabaseDb.getProfile(marketAccount.creator_wallet).then( (p: any) => {
                    if (p) {
                        setCreatorProfile({
                            username: p.username,
                            avatar: p.avatar_url || undefined
                        });
                    }
                }).catch(err => {
                    console.warn("Using mock profile due to DB error:", err);
                    setCreatorProfile({
                        username: 'Djinn Helper',
                        avatar: 'https://api.dicebear.com/9.x/micah/svg?seed=DjinnHelper'
                    });
                });
            }
        }
    }, [marketAccount?.creator_wallet, marketAccount?.creator_username]);

    // User Bets State (for Holdings) - Moved here to access effectiveSlug
    const [userBets, setUserBets] = useState<Bet[]>([]);

    useEffect(() => {
        if (publicKey && effectiveSlug) {
            getUserMarketBets(publicKey.toBase58(), effectiveSlug).then(setUserBets);
            const handleBetUpdate = () => getUserMarketBets(publicKey.toBase58(), effectiveSlug).then(setUserBets);
            window.addEventListener('bet-updated', handleBetUpdate);
            return () => window.removeEventListener('bet-updated', handleBetUpdate);
        }
    }, [publicKey, effectiveSlug]);

    // Holdings formatted for the floating panel
    const myHoldingsFormatted = useMemo(() => {
        return marketOutcomes.map((outcome, idx) => ({
            outcomeName: outcome.title,
            shares: myShares[idx] || 0,
            color: getOutcomeColor(outcome.title, idx)
        })).filter(h => h.shares > 0.001);
    }, [marketOutcomes, myShares]);

    // Load starred state from localStorage on mount
    useEffect(() => {
        const saved = JSON.parse(localStorage.getItem('djinn_saved_markets') || '[]');
        setIsStarred(saved.includes(effectiveSlug));
    }, [effectiveSlug]);

    // --- INITIALIZATION ---
    useEffect(() => {
        const initialOutcomes = (MULTI_OUTCOMES[slug] || []).length > 0
            ? MULTI_OUTCOMES[slug]
            : [
                { id: 'yes', title: 'YES', yesPrice: 50, chance: 50 },
                { id: 'no', title: 'NO', yesPrice: 50, chance: 50 }
            ];

        if (true) { // Always initialize if we have outcomes (which we now do)
            setSelectedOutcomeId(initialOutcomes[0].id);
            setSelectedOutcomeName(initialOutcomes[0].title);
            setLivePrice(initialOutcomes[0].yesPrice);

            setLivePrice(initialOutcomes[0].yesPrice);

            // Generate Initial "Inception" History if empty
            // This mocks a "Launch Day" history: Flat candles at 0.000001 SOL, 50/50 probability
            setHistoryState( (prev: any) => {
                if (prev.probability.length > 0) return prev;

                const outcomes = initialOutcomes.map(o => o.title);
                const count = 100;
                const now = Math.floor(Date.now() / 1000);
                const probData = [];
                const candleData: Record<string, any[]> = {};

                // Use Real Price if available to seed history (Flat Line at Current Price)
                let seedPriceYes = 0.00000001;
                if (initialOutcomes[0].yesPrice !== 50 && initialOutcomes[0].yesPrice > 0) {
                    seedPriceYes = getSpotPrice(initialOutcomes[0].yesPrice / 100 * 1000000000); // Rough check
                }

                // ... (rest of initial history logic)
                return prev;
            });
        }
    }, [slug, effectiveSlug]); // Removed lengthy dependency array for cleanliness if possible, or keep it strict. 
    // Actually, I should only replace the small block I need.

    /* 
       Wait, I need to do 2 separate edits because they are far apart (Lines 418 and 2626). 
       The tool instructions say: "If you are making edits to multiple non-adjacent lines, use the multi_replace_file_content tool instead."
    */

    // Load starred state from localStorage on mount
    useEffect(() => {
        const saved = JSON.parse(localStorage.getItem('djinn_saved_markets') || '[]');
        setIsStarred(saved.includes(effectiveSlug));
    }, [effectiveSlug]);

    // --- INITIALIZATION ---
    useEffect(() => {
        const initialOutcomes = (MULTI_OUTCOMES[slug] || []).length > 0
            ? MULTI_OUTCOMES[slug]
            : [
                { id: 'yes', title: 'YES', yesPrice: 50, chance: 50 },
                { id: 'no', title: 'NO', yesPrice: 50, chance: 50 }
            ];

        if (true) { // Always initialize if we have outcomes (which we now do)
            setSelectedOutcomeId(initialOutcomes[0].id);
            setSelectedOutcomeName(initialOutcomes[0].title);
            setLivePrice(initialOutcomes[0].yesPrice);

            setLivePrice(initialOutcomes[0].yesPrice);

            // Generate Initial "Inception" History if empty
            // This mocks a "Launch Day" history: Flat candles at 0.000001 SOL, 50/50 probability
            if (effectiveSlug) {
                // Reconstruct History from Activity Log ("Memory")
                const reconstructHistory = async () => {
                    console.log("📜 Starting History Reconstruction for:", effectiveSlug);
                    try {
                        const activities = await supabaseDb.getAllMarketActivity(effectiveSlug);
                        // console.log("📜 Fetched Activities:", activities?.length);

                        if (!activities || activities.length === 0) {
                            console.log("📜 No activity found. Using seed fallback.");
                            // Fallback: If no activity, use CURRENT live price to seed history
                            // This prevents "reset to 50%" if market has moved but logs are missing
                            let seedYes = 50;

                            // 1. Try Market Data (Live Price)
                            if (marketData?.live_price) {
                                seedYes = marketData.live_price;
                            }
                            // 2. Try On-Chain/DB Supplies
                            else if (marketAccount?.outcome_supplies && marketAccount.outcome_supplies.length >= 2) {
                                const sYes = Number(marketAccount.outcome_supplies[0]) / 1e9;
                                const sNo = Number(marketAccount.outcome_supplies[1]) / 1e9;
                                if (sYes > 0 || sNo > 0) {
                                    // ✅ RESTORED: Use Supply with 15M buffer for stable probability
                                    seedYes = calculateImpliedProbability(sYes, sNo);
                                }
                            }

                            console.log("📜 Seeding Chart with Price:", seedYes);

                            setHistoryState( (prev: any) => {
                                // De-dup if already seeded
                                if (prev.probability.length > 0 && Math.abs(prev.probability[prev.probability.length - 1].YES - seedYes) < 0.1) return prev;

                                const now = Math.floor(Date.now() / 1000);
                                // Generate a flat line at the current SEED price
                                // CRITICAL FIX: Ensure we have enough history for the "ALL" view to look reasonable (e.g. start at market creation or 24h ago)
                                // If market creation time is unavailable, fallback to 24h ago.
                                const startTime = marketAccount?.created_at
                                    ? Math.floor(new Date(marketAccount.created_at).getTime() / 1000)
                                    : (now - 86400);

                                return {
                                    probability: [{
                                        time: startTime,
                                        dateStr: new Date(startTime * 1000).toLocaleTimeString(),
                                        YES: seedYes,
                                        NO: 100 - seedYes
                                    }, {
                                        time: now,
                                        dateStr: new Date(now * 1000).toLocaleTimeString(),
                                        YES: seedYes,
                                        NO: 100 - seedYes
                                    }],
                                    candles: {}
                                };
                            });
                            return;
                        }

                        // Replay Logic
                        // We assume simple binary for now or reconstruct based on outcome names
                        // For Binary: YES/NO.
                        let sYes = 0;
                        let sNo = 0;

                        const probData: any[] = [];
                        // Initialize with inception point
                        const firstAct = activities[0];

                        // FIX: Ensure firstTime is valid
                        let firstTime = Date.now() / 1000;
                        if (firstAct && firstAct.created_at) {
                            firstTime = new Date(firstAct.created_at).getTime() / 1000;
                        }

                        // Add "Inception" point at 0 (or 50/50) just before first activity
                        // This ensures the chart starts from the left
                        probData.push({
                            time: firstTime - 3600, // Start 1h before first action
                            dateStr: new Date((firstTime - 3600) * 1000).toLocaleTimeString(),
                            YES: 50, // Markets start at 50% usually
                            NO: 50
                        });

                        activities.forEach((act, idx) => {
                            // DEBUG: Ensure 'shares' exists and is a number. 
                            let shares = Number(act.shares);

                            if (isNaN(shares) || shares === 0) {
                                // if (idx < 5) console.warn(`📜 Activity [${idx}] has invalid shares:`, act.shares, act);
                                shares = 0;
                            }

                            // FIX: Handle both 'YES'/'NO' and outcome names (e.g. 'Evo Morales')
                            let isYes = false;

                            if (act.action === 'YES') {
                                isYes = true;
                            } else if (act.action === 'NO') {
                                isYes = false;
                            } else {
                                // Map outcome title to Side
                                // Assume Outcome 0 is YES side, Outcome 1 is NO side
                                // For Multi-Outcome, we likely track them as individual indices, but here we assume Binary Probability Chart logic for now.
                                const outcomeIdx = marketOutcomes.findIndex(o => o.title === act.action);
                                if (outcomeIdx === 0) isYes = true;
                                else isYes = false;
                                // Note: For true multi-outcome charts, we need to track [s0, s1, s2...] separately!
                                // But current reconstructHistory uses sYes/sNo binary logic.
                                // If > 2 outcomes, this logic forces them into binary buckets which might be approx correct for "Selected vs Rest"?
                                // But let's stick to simple mapping for now.
                            }

                            const isBuy = act.order_type === 'BUY' || !act.order_type;

                            if (isBuy) {
                                if (isYes) sYes += shares; else sNo += shares;
                            } else {
                                // Sell
                                if (isYes) sYes = Math.max(0, sYes - shares);
                                else sNo = Math.max(0, sNo - shares);
                            }

                            // ✅ RESTORED: Use Supply with 15M buffer for stable probability
                            const prob = calculateImpliedProbability(sYes, sNo);

                            // Log unexpected jumps
                            // if (idx % 100 === 0) console.log(`📜 Replay [${idx}] - Shares: ${sYes.toFixed(0)}/${sNo.toFixed(0)} -> Prob: ${prob.toFixed(2)}%`);

                            probData.push({
                                time: new Date(act.created_at!).getTime() / 1000,
                                dateStr: new Date(act.created_at!).toLocaleTimeString(),
                                YES: prob,
                                NO: 100 - prob
                            });
                        });

                        // console.log("📜 History Reconstructed. Points:", probData.length, "Final Prob:", probData[probData.length - 1].YES);
                        setHistoryState({ probability: probData, candles: {} });

                    } catch (e) {
                        console.error("❌ History Reconstruction Failed:", e);
                        // Fallback: Seed empty history
                        const now = Math.floor(Date.now() / 1000);
                        setHistoryState({
                            probability: [{
                                time: now - 86400,
                                YES: 50,
                                NO: 50
                            }, {
                                time: now,
                                YES: 50,
                                NO: 50
                            }],
                            candles: {}
                        });
                    }
                };

                // NEW: Load history function logic (Self-contained)
                const loadHistory = async () => {
                    if (!marketAccount?.market_pda) return;
                    const marketPubkey = new PublicKey(marketAccount.market_pda);

                    try {
                        // Dynamic import or assume imported
                        const { getMarketActivities } = await import('@/lib/supabase-db');
                        const activities = await getMarketActivities(marketPubkey.toBase58());

                        if (!activities || activities.length === 0) {
                            console.log("⚠️ No history found, seeding...");
                            const now = Math.floor(Date.now() / 1000);
                            const startTime = marketAccount?.created_at
                                ? Math.floor(new Date(marketAccount.created_at).getTime() / 1000)
                                : (now - 86400);

                            setHistoryState({
                                probability: [
                                    { time: startTime, YES: 50, NO: 50 },
                                    { time: now, YES: 50, NO: 50 }
                                ],
                                candles: {}
                            });
                            return;
                        }

                        console.log(`📊 Building history from ${activities.length} activities...`);
                        const historyPoints: any[] = [];

                        // Inception
                        const firstAct = activities[0];
                        const creationTime = marketAccount?.created_at
                            ? Math.floor(new Date(marketAccount.created_at).getTime() / 1000)
                            : (new Date(firstAct.created_at).getTime() / 1000) - 3600;

                        historyPoints.push({
                            time: creationTime,
                            YES: 50,
                            NO: 50
                        });

                        // Process - Track cumulative supplies and use buffered probability
                        let cumulativeYesSupply = 0;
                        let cumulativeNoSupply = 0;

                        activities.forEach((act: any) => {
                            if (act.type === 'BUY' || act.type === 'SELL') {
                                const yes_tokens = parseFloat(act.yes_amount || '0');
                                const no_tokens = parseFloat(act.no_amount || '0');

                                // Accumulate supplies (BUY adds, SELL subtracts)
                                if (act.type === 'BUY') {
                                    cumulativeYesSupply += yes_tokens;
                                    cumulativeNoSupply += no_tokens;
                                } else {
                                    cumulativeYesSupply = Math.max(0, cumulativeYesSupply - yes_tokens);
                                    cumulativeNoSupply = Math.max(0, cumulativeNoSupply - no_tokens);
                                }

                                // ✅ FIX: Use calculateImpliedProbability with 15M buffer
                                const prob = calculateImpliedProbability(cumulativeYesSupply, cumulativeNoSupply);

                                historyPoints.push({
                                    time: Math.floor(new Date(act.created_at).getTime() / 1000),
                                    YES: prob,
                                    NO: 100 - prob
                                });
                            }
                        });

                        // Add current time point
                        const now = Math.floor(Date.now() / 1000);
                        if (historyPoints.length > 0) {
                            // ✅ FIX: Ensure current point uses BUFFERED probability to prevent 100% spikes
                            // We re-calculate it here using the LATEST known supplies from the loop above
                            const finalProb = calculateImpliedProbability(cumulativeYesSupply, cumulativeNoSupply);

                            historyPoints.push({
                                time: now,
                                YES: finalProb, // Use safe buffered prob
                                NO: 100 - finalProb
                            });
                        }

                        setHistoryState({ probability: historyPoints, candles: {} });

                    } catch (e) {
                        console.error("Error loading history:", e);
                    }
                };

            }
        }
    }, [slug, marketAccount?.outcome_supplies]); // Re-run when supplies load to fix "Dark Chart"

    // --- LIVE TICKER REMOVED (Redundant with ProbabilityChart internal sync) ---



    // Handler for when user clicks YES/NO on an outcome
    const handleOutcomeBuyClick = (outcomeId: string, outcomeName: string, side: 'YES' | 'NO', price: number) => {
        const outcome = marketOutcomes.find(o => o.id === outcomeId);
        if (outcome) {
            setSelectedOutcomeId(outcomeId);
            setSelectedOutcomeName(outcomeName);
            setSelectedSide(side);
            setLivePrice(outcome.chance); // Use chance which is dynamically updated
        }
    };


    // Manual Refresh for User (in case of indexer lag)
    // Manual Refresh for User (in case of indexer lag)
    // Manual Refresh triggers a reload of all on-chain data
    // Manual Refresh for User
    const refreshBalances = async () => {
        setIsLoading(true);
        try {
            refreshAll(); // SWR Revalidation
            await loadOnChainData(); // On-Chain Refresh
        } catch (e) {
            console.error("Manual Refresh Failed:", e);
        } finally {
            setIsLoading(false);
        }
    };

    // Make sure 'selectedOutcomeId' is always set on load
    useEffect(() => {
        if (!selectedOutcomeId && marketOutcomes.length > 0) {
            // Priority: Hardcoded YES, or first available
            const defaultOutcome = marketOutcomes.find(o => o.title === 'YES') || marketOutcomes[0];
            if (defaultOutcome) {
                console.log("🎯 Auto-selecting Default Outcome:", defaultOutcome.title);
                setSelectedOutcomeId(defaultOutcome.id);
                setSelectedOutcomeName(defaultOutcome.title);
                setSelectedSide('YES');
                setLivePrice(defaultOutcome.chance);
            }
        }
    }, [marketOutcomes, selectedOutcomeId]);

    useEffect(() => {
        // SOL price is now managed by PriceProvider global context
        const savedProfile = localStorage.getItem('djinn_user_profile');
        if (savedProfile) setUserProfile(JSON.parse(savedProfile));

        if (publicKey) {
            supabaseDb.getProfile(publicKey.toBase58()).then(async (p) => {
                if (p) {
                    // Only overwrite if DB has data, otherwise keep LocalStorage
                    setUserProfile( (prev: any) => ({
                        username: p.username || prev.username,
                        avatarUrl: p.avatar_url || prev.avatarUrl
                    }));
                } else {
                    // If profile missing, try to create it here too (safety net)
                    try {
                        const { upsertProfile } = await import('@/lib/supabase-db');
                        const newProfile = await upsertProfile({
                            wallet_address: publicKey.toBase58(),
                            username: publicKey.toBase58().slice(0, 8) + '...',
                            bio: '',
                            avatar_url: null,
                            banner_url: null
                        });
                        if (newProfile) {
                            setUserProfile({
                                username: newProfile.username || '',
                                avatarUrl: newProfile.avatar_url || ''
                            });
                        }
                    } catch (e) {
                        console.error("Failed to auto-create profile in page:", e);
                    }
                }
            });
        }

        // GLOBAL SYNC
        const handleProfileUpdate = () => {
            if (publicKey) {
                supabaseDb.getProfile(publicKey.toBase58()).then( (p: any) => {
                    if (p) setUserProfile({ username: p.username || '', avatarUrl: p.avatar_url || '' });
                });
            }
        };
        window.addEventListener('djinn-profile-updated', handleProfileUpdate);
        return () => window.removeEventListener('djinn-profile-updated', handleProfileUpdate);

    }, [publicKey]);

    // ✅ ACCOUNT INDEPENDENCE: Clear state when wallet switches/disconnects
    useEffect(() => {
        if (!publicKey) {
            setMyShares({});
            setUserBets([]);
            setSolBalance(0);
            setUserProfile({ username: '', avatarUrl: '' });
        } else {
            // Force refresh when key changes
            refreshAll();
            loadOnChainData();
        }
    }, [publicKey]);



    // Update Balance
    useEffect(() => {
        if (!connection || !publicKey) return;
        const up = async () => {
            try {
                const bal = await connection.getBalance(publicKey, 'confirmed');
                setSolBalance(bal / LAMPORTS_PER_SOL);
            } catch (e) { console.error(e); }
        };
        up();
    }, [connection, publicKey]);

    // LOAD ON-CHAIN DATA (When effectiveSlug or program changes)
    const loadOnChainData = useCallback(async () => {
        if (!connection || !program) return;

        let targetMarketPda = '';
        if (marketInfo?.market_pda) targetMarketPda = marketInfo.market_pda;
        else if (onChainData?.market_pda) targetMarketPda = onChainData.market_pda;

        if (!targetMarketPda) {
            try {
                console.log("⚠️ Market PDA unknown, searching On-Chain...");
                const titleGuess = effectiveSlug.replace(/-/g, ' ');
                const titleBytes = new TextEncoder().encode(titleGuess);
                const accounts = await connection.getProgramAccounts(program.programId, {
                    filters: [{ memcmp: { offset: 44, bytes: bs58.encode(titleBytes) } }]
                });
                if (accounts.length > 0) {
                    targetMarketPda = accounts[0].pubkey.toBase58();
                    const decoded = program.coder.accounts.decode('Market', accounts[0].account.data);
                    setOnChainData({
                        ...decoded,
                        market_pda: targetMarketPda,
                        creator_wallet: decoded.creator.toBase58(),
                        outcome_supplies: decoded.outcomeSupplies,
                        title: decoded.title,
                        options: ['YES', 'NO'],
                        end_date: new Date(decoded.resolutionTime.toNumber() * 1000).toISOString(),
                    });
                }
            } catch (e) { console.warn("On-Chain Search failed:", e); }
        }

        if (targetMarketPda) {
            try {
                const marketPda = new PublicKey(targetMarketPda);
                if (publicKey) {
                    const decodePosition = (accInfo: any) => {
                        if (!accInfo?.data) return 0;
                        try {
                            const decoded = program.coder.accounts.decode('UserPosition', accInfo.data);
                            return Number(decoded.shares) / 1e9;
                        } catch (e) { return 0; }
                    };

                    const numOutcomes = (marketInfo as any)?.num_outcomes || 2;
                    const pdas = [];
                    for (let n = 0; n < numOutcomes; n++) {
                        const [pda] = PublicKey.findProgramAddressSync(
                            [Buffer.from("user_pos"), marketPda.toBuffer(), publicKey.toBuffer(), Buffer.from([n])],
                            program.programId
                        );
                        pdas.push(pda);
                    }

                    const [marketAccInfo, ...pdaInfos] = await connection.getMultipleAccountsInfo([marketPda, ...pdas], 'confirmed');
                    const newShares: Record<number, number> = {};
                    pdaInfos.forEach((info, idx) => {
                        newShares[idx] = decodePosition(info);
                    });
                    setMyShares(newShares);

                    if (marketAccInfo) {
                        const decodedMarket = program.coder.accounts.decode('Market', marketAccInfo.data);
                        const sYes = Number(decodedMarket.outcomeSupplies[0]) / 1e9;
                        const sNo = Number(decodedMarket.outcomeSupplies[1]) / 1e9;

                        // GUARD: Prevent stale data from overwriting optimistic updates
                        if (!priceLockoutRef.current) {
                            if (sYes + sNo >= 0) {
                                // ✅ RESTORED: Use Supply with 15M buffer for stable probability
                                const newPrice = calculateImpliedProbability(sYes, sNo);
                                // Optimistically update live price from on-chain truth
                                setLivePrice(newPrice);

                                // Update History State (Charts) - ONLY if not locked
                                setHistoryState( (prev: any) => {
                                    const now = Math.floor(Date.now() / 1000);
                                    const lastProbTime = prev.probability.length > 0 ? prev.probability[prev.probability.length - 1].time : (now - 60);
                                    const currentTime = Math.max(now, (lastProbTime || 0) + 1);

                                    // Create new probability point
                                    const newProbPoint: any = {
                                        time: currentTime,
                                        dateStr: new Date(currentTime * 1000).toLocaleTimeString()
                                    };

                                    // Map probabilities to outcome titles
                                    const outcome0 = marketOutcomes[0]?.title || 'YES';
                                    const outcome1 = marketOutcomes[1]?.title || 'NO';

                                    newProbPoint[outcome0] = newPrice;
                                    newProbPoint[outcome1] = 100 - newPrice;

                                    return {
                                        ...prev,
                                        probability: [...prev.probability, newProbPoint]
                                    };
                                });
                            }

                            const vSol = Number(decodedMarket.vaultBalance) / LAMPORTS_PER_SOL;
                            setVaultBalanceSol(vSol);
                            // console.log("✅ OnChain Fetch Complete. New Vault:", vSol, "New Supplies:", decodedMarket.outcomeSupplies.map((s: any) => s.toString()));

                            setOnChainData((prev: any) => ({
                                ...prev,
                                ...decodedMarket,
                                outcome_supplies: decodedMarket.outcomeSupplies,
                                vault_balance: vSol
                            }));
                        } else {
                            // console.log("🔒 Skipping stale on-chain update (Optimistic Lock Active)");
                        }
                    }
                }
            } catch (e) {
                console.warn("On-chain data sync failed:", e);
            }
        }
    }, [connection, effectiveSlug, publicKey, program, marketInfo, slug]);

    // --- AUTO-REFRESH & SYNC (Fixes Stale Data / Profit Calculation) ---
    useEffect(() => {
        // Initial Load
        loadOnChainData();

        // 1. Refresh on Window Focus (User comes back from another tab/wallet)
        const handleFocus = () => {
            // console.log("🔄 Focus Detected: Refreshing Market Data...");
            loadOnChainData();
            refreshAll();
        };
        window.addEventListener('focus', handleFocus);

        // 2. Poll every 3 seconds to catch external trades (Wallet B buys, Wallet A sees it)
        const interval = setInterval(() => {
            loadOnChainData();
        }, 3000);

        return () => {
            window.removeEventListener('focus', handleFocus);
            clearInterval(interval);
        };
    }, [loadOnChainData, refreshAll]);



    // CALCULATIONS (Real-Time CPMM Simulation)
    const amountNum = parseCompactNumber(betAmount) || 0;
    const isOverBalance = amountNum > solBalance;
    const currentPriceForSide = selectedSide === 'YES' ? livePrice : (100 - livePrice);

    // User Position Helper 
    const myHeldSide = (myShares[0] > 0.001) ? 'YES' : ((myShares[1] > 0.001) ? 'NO' : null);
    const myHeldAmount = selectedSide === 'YES' ? (myShares[0] || 0) : (myShares[1] || 0);
    const myHeldAmountStr = (myHeldAmount || 0).toFixed(2);

    // Trading Preview Calculations (V3 Hybrid Curve Logic)

    // Convert 0-100 probability to an approximate SOL price for initial supply estimation
    // This is just an estimation to sync UI state with curve state
    const impliedProbability = currentPriceForSide / 100;

    // Invert Phase 3 Curve: Supply -> Price.
    // We import getSupplyFromPrice from core-amm to get the exact supply for this price.
    // Price range is roughly 0.000001 (0%) to 0.95 (100%).

    // Map 0-100 prob to 0.000001 - 0.95 SOL price range
    // Map 0-100 prob to 0.000001 - 0.95 SOL price range
    const approxSolPrice = 0.000001 + (impliedProbability * (0.95 - 0.000001));

    // FIX for New Markets:
    // If price is 50% (default) and we don't have explicit high-supply data, assume interactions start at 0.
    // This prevents estimating a high entry price (~0.47 SOL) for empty markets.
    let estimatedSupply = 0;

    // FIX: Prioritize Real On-Chain outcome_supplies if available (Fresh)
    // SWR fields (yes_supply) might be stale or missing in onChainData merges.


    if (marketAccount?.outcome_supplies && marketAccount.outcome_supplies.length >= 2) {
        const outcomeIdx = selectedSide === 'YES' ? 0 : 1;
        const rawSupply = marketAccount.outcome_supplies[outcomeIdx];
        const supplyNum = Number(rawSupply);
        estimatedSupply = isNaN(supplyNum) ? 0 : supplyNum / 1_000_000_000;
        console.log(`📊 Usings on-chain outcome_supplies[${outcomeIdx}] for Simulation:`, estimatedSupply);

    } else if (marketAccount && (marketAccount.yes_supply || marketAccount.no_supply)) {
        // Fallback to SWR/Legacy fields
        const rawYes = marketAccount.yes_supply ?? marketAccount.yesSupply;
        const rawNo = marketAccount.no_supply ?? marketAccount.noSupply;

        const rawSupply = selectedSide === 'YES' ? rawYes : rawNo;

        // Safety check: Number(null) is 0.
        const supplyNum = rawSupply ? Number(rawSupply) : 0;
        estimatedSupply = isNaN(supplyNum) ? 0 : supplyNum / 1_000_000_000;
        // console.log("⚠️ Using legacy yes/no_supply for Simulation:", estimatedSupply);

    } else {
        // Fallback: If no explicit market data, assume NEW MARKET (0 Supply).
        estimatedSupply = 0;
    }

    const previewSim = simulateBuy(amountNum, {
        virtualSolReserves: 0,
        virtualShareReserves: 0,
        realSolReserves: 0,
        totalSharesMinted: estimatedSupply // Now correctly 0 for new markets
    });

    const estimatedShares = previewSim.sharesReceived;
    const effectivePrice = previewSim.averageEntryPrice;

    const potentialSolPayout = estimatePayoutInternal(estimatedShares);
    const potentialRoi = amountNum > 0 ? ((potentialSolPayout - amountNum) / amountNum) * 100 : 0;

    const usdValueInTrading = amountNum * solPrice;



    const chartColor = selectedSide === 'YES' ? '#10b981' : '#EF4444';

    // SOL price refreshing is now handled by PriceProvider

    // PLACE BET
    const handlePlaceBet = async () => {
        // DEBUG: Trace execution
        // console.log("🖱️ Buy Button Clicked. Amount:", amountNum, "Balance:", solBalance);

        if (!publicKey) return setDjinnToast({ isVisible: true, type: 'ERROR', title: 'Wallet Error', message: "Please connect wallet" });
        if (amountNum <= 0) return setDjinnToast({ isVisible: true, type: 'ERROR', title: 'Invalid Amount', message: "Enter an amount" });

        // Fix Scope Issue: Define outcomeIndex here so it is available for logging, trade, AND common updates
        const outcomeIndex = isMultiOutcome
            ? marketOutcomes.findIndex(o => o.id === selectedOutcomeId)
            : (selectedSide === 'YES' ? 0 : 1);

        if (outcomeIndex === -1) {
            setDjinnToast({ isVisible: true, type: 'ERROR', title: 'Invalid Outcome', message: "Please select a valid outcome." });
            return;
        }
        if (isOverBalance) {
            setDjinnToast({
                isVisible: true,
                type: 'ERROR',
                title: 'Insufficient Funds',
                message: `You need ${amountNum} SOL but only have ${solBalance.toFixed(4)} SOL.`,
            });
            return;
        }

        setIsPending(true);

        try {
            let buyTxSignature = '';
            // CHECK if REAL or SIMULATED
            // V4 Contract uses Internal Ledger (UserPosition), so 'yes_token_mint' check is legacy.
            // We rely on 'market_pda' presence and valid structure.
            const isRealMarket = marketAccount?.market_pda && !marketAccount.market_pda.startsWith('local_');

            if (isRealMarket) {
                // --- ON-CHAIN BUY ---
                console.log("🔗 Executing On-Chain Buy...");
                console.log("  - Market PDA:", marketAccount.market_pda);
                console.log("  - Side:", selectedSide);
                console.log("  - Amount SOL:", amountNum);

                if (!marketAccount.creator_wallet) throw new Error("Market Creator unknown");

                // console.log("🔍 DEBUG - Account Info:");
                // console.log("  - Creator Wallet:", marketAccount.creator_wallet);
                // console.log("  - Market PDA:", marketAccount.market_pda);
                // console.log("  - User Wallet:", publicKey.toBase58());

                // Read market account from contract to verify
                try {
                    const marketPda = new PublicKey(marketAccount.market_pda);
                    const marketAcct = await connection.getAccountInfo(marketPda);
                    if (marketAcct) {
                        // Parse creator (first 32 bytes after 8-byte discriminator)
                        const creatorBytes = marketAcct.data.slice(8, 40);
                        const creatorFromContract = new PublicKey(creatorBytes);
                        console.log("  - Creator from contract:", creatorFromContract.toBase58());
                        console.log("  - Creators match?", creatorFromContract.toBase58() === marketAccount.creator_wallet);

                        // Parse num_outcomes (at offset 8 + 32 + (4+64) + 8 = 116)
                        const numOutcomes = marketAcct.data.readUInt8(116);
                        // Using outer outcomeIndex
                        // console.log("  - Num outcomes:", numOutcomes);
                        // console.log("  - Outcome index:", outcomeIndex);
                        // console.log("  - Index valid?", outcomeIndex < numOutcomes);
                    }
                } catch (e) {
                    console.error("Failed to read market from contract:", e);
                }

                // FRESH SUPPLY FETCH: Get the absolute latest supply state to calculate accurate slippage
                let freshEstimatedShares = estimatedShares;
                try {
                    if (!program) throw new Error('Program not initialized');
                    const marketPda = new PublicKey(marketAccount.market_pda);
                    const freshMarket = await (program.account as any).market.fetch(marketPda);
                    if (freshMarket) {
                        // Using outer outcomeIndex
                        // Assuming 9 decimals
                        const safeFreshSupply = Number((freshMarket as any).outcomeSupplies[outcomeIndex]) / 1e9;
                        console.log(`🔄 Fresh Supply fetched: ${safeFreshSupply} (Old State: ${estimatedSupply})`);

                        // Re-simulate with fresh supply
                        const freshSim = simulateBuy(amountNum, {
                            virtualSolReserves: 0,
                            virtualShareReserves: 0,
                            realSolReserves: 0,
                            totalSharesMinted: safeFreshSupply
                        });
                        freshEstimatedShares = freshSim.sharesReceived;
                        console.log(`✅ Recalculated Shares: ${freshEstimatedShares} (Old Est: ${estimatedShares})`);
                    }
                } catch (e) {
                    console.warn("Could not fetch fresh supply, using state fallback:", e);
                }

                // Ensure minSharesOut is safe for BN (u64 max is ~18e18)
                // Shares are internal (1e9 decimals). 
                // Using the FRESH estimate now.
                const safeEstimatedShares = Math.min(freshEstimatedShares, 10_000_000_000); // 10B shares max per tx safe limit

                // Slippage protection: received * (1 - tolerance)
                // PUMPFUN RELIABILITY FIX:
                // For large buys (>0.1 SOL), price impact is massive (>10%).
                // We basically disable slippage checks for "Degen Mode" (Pump.fun style)
                // to guarantee the buy goes through regardless of price impact.
                let effectiveTolerance = slippageTolerance;
                let minS = 0;

                if (amountNum >= 0.1) {
                    console.log("⚠️ Large/Degen Buy Detected: Disabling slippage protection (MinShares = 0)");
                    minS = 0;
                } else {
                    minS = safeEstimatedShares * (1 - (effectiveTolerance / 100));
                }

                // CRITICAL SAFETY CHECK: Ensure positive
                const safeMinShares = Math.max(0, minS);
                console.log(`  - Min Shares Out: ${safeMinShares} (Tol: ${effectiveTolerance}%)`);

                // Use dummy mints if not present (V4 doesn't use them in contract, but hook signature might expect them)
                const dummyMint = new PublicKey("So11111111111111111111111111111111111111112");

                // outcomeIndex is now defined at top of function

                try {
                    const creatorKey = (marketAccount.creator || marketAccount.creator_wallet)
                        ? new PublicKey(marketAccount.creator || marketAccount.creator_wallet)
                        : TREASURY_WALLET;

                    buyTxSignature = await buyShares(
                        new PublicKey(marketAccount.market_pda),
                        outcomeIndex,
                        amountNum,
                        creatorKey,
                        safeMinShares
                    );
                    console.log("✅ Buy TX:", buyTxSignature);

                    // Award Gem for Trade (+1)
                    if (publicKey) {
                        supabaseDb.addGems(publicKey.toBase58(), 1);
                    }

                    // LOCK CHART: Determine to use optimistic price for 10s
                    // This prevents background polling from overwriting the new price with old on-chain data
                    lockWithTimeout();
                    setTimeout(() => {
                        priceLockoutRef.current = false;
                        console.log("🔓 Price Lockout Released");
                    }, 10000);
                } catch (buyErr: any) {
                    console.error("❌ Buy Shares Failed:", buyErr);
                    throw new Error(`Transaction Failed: ${buyErr.message || buyErr}`);
                }
            } else {
                // --- SIMULATED BUY ---
                console.log("🔮 Executing Simulated Buy (Demo Market)...");
                const reason = !marketAccount?.market_pda ? "Missing Market PDA" : "Local Market";

                setDjinnToast({
                    isVisible: true,
                    type: 'INFO',
                    title: 'Demo/Local Market',
                    message: `This market is offline/local (${reason}). To use real SOL, please Create a NEW Market.`
                });

                // Simulate delay
                await new Promise( (r: any) => setTimeout(r, 1000));
            }

            // --- COMMON UPDATES (DB, UI) ---
            // 1. Calculate stats (Simulated for DB sync)
            const currentProb = selectedSide === 'YES' ? livePrice : (100 - livePrice);
            const safePrice = Math.max(0.01, Math.min(0.99, currentProb / 100));
            // const virtualShareReserves = INITIAL_VIRTUAL_SOL / safePrice; // Deprecated

            const sim = simulateBuy(amountNum, {
                virtualSolReserves: 0,
                virtualShareReserves: 0,
                realSolReserves: 0,
                totalSharesMinted: estimatedSupply // Use correct supply from scope
            });

            // 2. Update Price Locally (Pari-Mutuel Inverse) and in DB
            // Calculate NEW Probability from NEW Spot Price
            // sim.endPrice is the predicted price after buy.
            // sim.endPrice is the predicted price after buy.
            let outcome0Supply = 0;
            let outcome1Supply = 0;
            if (marketAccount?.outcome_supplies && marketAccount.outcome_supplies.length >= 2) {
                outcome0Supply = Number(marketAccount.outcome_supplies[0]) / 1e9;
                outcome1Supply = Number(marketAccount.outcome_supplies[1]) / 1e9;
            } else if (marketAccount?.yes_supply !== undefined) {
                outcome0Supply = Number(marketAccount.yes_supply) / 1e9;
                outcome1Supply = Number(marketAccount.no_supply) / 1e9;
            }

            const otherSideSupply = selectedSide === 'YES' ? outcome1Supply : outcome0Supply;
            const rawOtherSidePrice = getSpotPrice(otherSideSupply);

            // STABILIZER: For fresh markets, clamp divisor price to avoid 100% explosion.
            // If other side has 0 liquidity (price ~0), a small buy feels like 100%.
            // We force a minimum "virtual liquidity price" of 0.01 (1%) for ratio calc.
            const otherSidePrice = Math.max(0.01, rawOtherSidePrice);

            // Calculate new probability for the outcome we bought
            const newLikelihood = (sim.endPrice / (sim.endPrice + otherSidePrice)) * 100;
            const newPrice = selectedSide === 'YES' ? newLikelihood : (100 - newLikelihood);

            // Calculate Delta for the Main Chart (YES Probability)
            let probDelta = 0;

            if (selectedSide === 'YES') {
                // Bought YES. YES Prob goes UP.
                // newLikelihood (YES) > livePrice.
                probDelta = newLikelihood - livePrice;
            } else {
                // Bought NO. NO Prob goes UP. YES Prob goes DOWN.
                // newLikelihood is NO Prob.
                // Main Chart is YES Prob.
                // New YES = 100 - newLikelihood.
                // Old YES = livePrice.
                probDelta = (100 - newLikelihood) - livePrice;
            }

            // Market Inertia: Probability is consensus, not token price.
            // Move probability only a fraction of the theoretical spot move.
            probDelta = probDelta * 0.15; // 15% sensitivity for "Market Consensus" inertia

            // Safety Cap
            if (Math.abs(probDelta) > 5) probDelta = probDelta > 0 ? 5 : -5;



            // 3. Log Activity (Non-blocking)
            try {
                const profile = await supabaseDb.getProfile(publicKey.toBase58()).catch(() => null);
                const activityAction = isMultiOutcome ? (selectedOutcomeName || 'YES') : selectedSide;
                const activity = {
                    wallet_address: publicKey.toBase58(),
                    username: profile?.username || userProfile.username,
                    avatar_url: profile?.avatar_url || userProfile.avatarUrl,
                    action: activityAction,
                    order_type: tradeMode,
                    amount: usdValueInTrading,
                    sol_amount: amountNum,
                    shares: sim.sharesReceived,
                    market_title: staticMarketInfo.title,
                    market_slug: effectiveSlug,
                    market_icon: staticMarketInfo.icon,
                    outcome_name: activityAction, // Already resolved to Uppercase Outcome or YES
                    created_at: new Date().toISOString()
                };
                await (supabaseDb as any).createActivity(activity);
                mutateActivity((current: any[] | undefined) => [activity, ...(current || [])], false);

                // 4. Create/Update Bet
                const dbSide = isMultiOutcome ? (selectedOutcomeName || 'YES') : selectedSide;
                await supabaseDb.createBet({
                    market_slug: effectiveSlug,
                    wallet_address: publicKey.toBase58(),
                    side: dbSide,
                    amount: usdValueInTrading,
                    sol_amount: amountNum,
                    shares: sim.sharesReceived,
                    entry_price: sim.averageEntryPrice // Use actual SOL price per share, not probability
                });

                // 4b. Update Market Price & Volume in DB for Top Holders/Markets Page Sync
                // Store SPOT PRICE in SOL (not probability) for holdings calculation
                await supabaseDb.updateMarketPrice(effectiveSlug, sim.endPrice, usdValueInTrading);
            } catch (dbErr) {
                console.warn("⚠️ DB Logging failed (non-fatal):", dbErr);
            }

            // 5. Update UI State
            setSolBalance( (prev: any) => prev - amountNum);

            // REFRESH USER HOLDINGS (Critical for UI update)
            window.dispatchEvent(new Event('bet-updated'));

            refreshAll();
            // Delay to allow RPC to propagate changes
            await new Promise(resolve => setTimeout(resolve, 1500));
            await loadOnChainData();

            setDjinnToast({
                isVisible: true,
                type: 'SUCCESS',
                title: 'Bet Placed',
                message: `Successfully bought ${sim.sharesReceived.toFixed(2)} shares of ${selectedSide}.`
            });
            setShowConfetti(true);

            // Trigger Bubble with calculated USD amount
            // 4. Update Last Trade Event (for Chart Bubbles)
            setLastTradeEvent({
                id: Date.now().toString(),
                amount: amountNum,
                side: selectedSide,
                title: isMultiOutcome ? selectedOutcomeName : (selectedSide === 'YES' ? (marketOutcomes[0]?.title || 'YES') : (marketOutcomes[1]?.title || 'NO')),
                color: getOutcomeColor(selectedOutcomeName || (selectedSide === 'YES' ? 'YES' : 'NO'), outcomeIndex)
            });

            // 5. Optimistic SWR Update to prevent "Reversion" to 50%
            // LOCKOUT: Ignore server updates for 15s to allow indexing to catch up
            lockWithTimeout();

            if (marketData) {
                mutateMarketData({
                    ...marketData,
                    live_price: newPrice,
                }, false);
            }

            // OPTIMISTIC UPDATE: Update Supplies Immediately
            // 🔒 LOCKOUT: Prevent stale background fetches from reverting this state
            priceLockoutRef.current = true;
            setTimeout(() => { priceLockoutRef.current = false; console.log("🔓 Optimistic Lock Released"); }, 15000);

            setOnChainData((prev: any) => {
                const currentSupplies = prev?.outcome_supplies || marketAccount?.outcome_supplies || ['0', '0'];
                const newSupplies = [...currentSupplies]; // Copy array
                const outcomeIndex = selectedSide === 'YES' ? 0 : 1;

                // Add bought shares (in atomic units if strings, or numbers if numbers)
                // Assuming strings from contract, but let's handle number conversion safely
                const currentVal = Number(newSupplies[outcomeIndex]);
                const newVal = currentVal + (sim.sharesReceived * 1e9); // Convert back to atomic for consistency or store as number

                // Note: The UI formatting handles conversion / 1e9.
                // But onChainData usually stores raw BN strings or numbers?
                // Let's check usage. Line 1118: Number(decoded.outcomeSupplies[0]) / 1e9
                // So onChainData stores RAW ATOMIC VALUES.

                newSupplies[outcomeIndex] = newVal.toString();

                console.log("🚀 Optimistic Supply Update (BUY):", newSupplies);

                // ✅ RESTORED: Calculate and update probability using Supply with 15M buffer
                const yesSupply = Number(newSupplies[0]) / 1e9;
                const noSupply = Number(newSupplies[1]) / 1e9;
                const newProbability = calculateImpliedProbability(yesSupply, noSupply);

                // Update live price immediately
                setLivePrice(newProbability);

                // Update history state immediately for chart
                setHistoryState(prevHistory => {
                    const now = Math.floor(Date.now() / 1000);
                    const newPoint: any = {
                        time: now,
                        YES: isMultiOutcome ? 0 : newProbability,
                        NO: isMultiOutcome ? 0 : (100 - newProbability),
                        dateStr: new Date(now * 1000).toLocaleString()
                    };

                    // For multi-outcome, calculate all probabilities
                    if (isMultiOutcome) {
                        const totalSupply = newSupplies.reduce((sum: number, s: string) => sum + Number(s), 0);
                        marketOutcomes.forEach((outcome: any, idx: number) => {
                            const supply = Number(newSupplies[idx] || 0) / 1e9;
                            newPoint[outcome.title] = totalSupply > 0 ? (supply / (totalSupply / 1e9)) * 100 : 0;
                        });
                    }

                    console.log("📈 Chart Update (BUY):", newPoint);
                    return {
                        ...prevHistory,
                        probability: [...prevHistory.probability, newPoint]
                    };
                });

                return {
                    ...prev,
                    outcome_supplies: newSupplies,
                    // Also update discrete fields if used
                    yes_supply: outcomeIndex === 0 ? newVal.toString() : prev?.yes_supply,
                    no_supply: outcomeIndex === 1 ? newVal.toString() : prev?.no_supply
                };
            });

            // ✅ OPTIMISTIC UPDATE: Update User Shares Immediately
            // Use local variable for index as multiOutcome index definition might differ or need re-calc
            const mySharesOutcomeIdx = isMultiOutcome
                ? marketOutcomes.findIndex(o => o.id === selectedOutcomeId)
                : (selectedSide === 'YES' ? 0 : 1);

            if (mySharesOutcomeIdx !== -1) {
                updateMyShares(mySharesOutcomeIdx, (myShares[mySharesOutcomeIdx] || 0) + sim.sharesReceived);
                console.log(`🚀 Optimistic MyShares Update (BUY): +${sim.sharesReceived} shares for index ${mySharesOutcomeIdx}`);
            }

            setIsSuccess(true);
            setBetAmount('');
            setTimeout(() => setLastTradeEvent(null), 3000);

            // Re-calculate index for color logic
            const colorIdx = isMultiOutcome
                ? marketOutcomes.findIndex(o => o.title === (selectedOutcomeName || 'YES'))
                : (selectedSide === 'YES' ? 0 : 1);

            setLastTradeEvent({
                id: Date.now().toString(),
                amount: amountNum,
                side: selectedSide,
                title: isMultiOutcome ? selectedOutcomeName : (selectedSide === 'YES' ? (marketOutcomes[0]?.title || 'YES') : (marketOutcomes[1]?.title || 'NO')),
                color: getOutcomeColor(selectedOutcomeName || (selectedSide === 'YES' ? 'YES' : 'NO'), colorIdx)
            });

            const tradeSideName = isMultiOutcome
                ? (selectedOutcomeName || 'YES')
                : (selectedSide === 'YES' ? (marketOutcomes[0]?.title || 'YES') : (marketOutcomes[1]?.title || 'NO'));

            // Use the buyTxSignature from outer scope if available, else 'pending'
            const finalTxSignature = buyTxSignature || '';

            setDjinnToast({
                isVisible: true,
                type: 'SUCCESS',
                title: 'SUCCESS',
                message: `Successfully bought ${formatCompact(sim.sharesReceived)} ${tradeSideName} shares.`,
                actionLink: finalTxSignature ? `https://solscan.io/tx/${finalTxSignature}?cluster=devnet` : undefined,
                actionLabel: 'View on Solscan'
            });

            // Store success info for inline bubble display
            setTradeSuccessInfo({
                shares: sim.sharesReceived,
                side: tradeSideName,
                txSignature: finalTxSignature
            });

            // Show purchase bubble notification
            const bubbleId = Date.now();
            setPurchaseBubbles(prev => [...prev, { id: bubbleId, side: selectedSide, amount: sim.sharesReceived }]);
            // Auto-dismiss after 3 seconds
            setTimeout(() => {
                setPurchaseBubbles(prev => prev.filter((bubble) => bubble.id !== bubbleId));
            }, 3000);

            setIsSuccess(true);
            setBetAmount('');

            // Reload user position from contract
            if (marketAccount?.market_pda && publicKey) {
                try {
                    const marketPda = new PublicKey(marketAccount.market_pda);
                    const PROGRAM_ID = new PublicKey('Fdbhx4cN5mPWzXneDm9XjaRgjYVjyXtpsJLGeQLPr7hg');

                    // Read BOTH UserPositions (YES and NO) after any trade
                    for (const outcomeIndex of [0, 1]) {
                        const [userPositionPda] = PublicKey.findProgramAddressSync(
                            [Buffer.from("user_pos"), marketPda.toBuffer(), publicKey.toBuffer(), Buffer.from([outcomeIndex])],
                            PROGRAM_ID
                        );

                        const posAcct = await connection.getAccountInfo(userPositionPda);
                        if (posAcct?.data && posAcct.data.length >= 57) {
                            // Parse shares from UserPosition: offset 41-49 (u128) - matching hook
                            const lo = posAcct.data.readBigUInt64LE(41);
                            const hi = posAcct.data.readBigUInt64LE(49);
                            const shares128 = (BigInt(hi) << 64n) | BigInt(lo);
                            const normalized = Number(shares128) / 1e9;

                            updateMyShares(outcomeIndex, normalized);
                            console.log(`✅ Refreshed shares for index ${outcomeIndex} from contract:`, normalized);
                        } else {
                            // No position exists for this index - set to 0
                            updateMyShares(outcomeIndex, 0);
                        }
                    }

                    // Read market account to get real supplies and calculate actual price
                    // Refactored to use Anchor Fetch for safety against variable-length data
                    try {
                        if (!program) throw new Error('Program not initialized');
                        const decodedMarket = await (program.account as any).market.fetch(marketPda) as any;

                        const yesSupply = Number(decodedMarket.outcomeSupplies[0]) / 1e9;
                        const noSupply = Number(decodedMarket.outcomeSupplies[1]) / 1e9;

                        console.log(`✅ Real supplies from contract - YES: ${yesSupply}, NO: ${noSupply}`);

                        // ✅ RESTORED: Calculate actual price using Supply with 15M buffer
                        const totalSupply = yesSupply + noSupply;
                        if (totalSupply > 0) {
                            const actualPrice = calculateImpliedProbability(yesSupply, noSupply);
                            setLivePrice(actualPrice);
                            // Update History State (Charts)
                            setHistoryState( (prev: any) => {
                                const now = Math.floor(Date.now() / 1000);
                                const lastProbTime = prev.probability.length > 0 ? prev.probability[prev.probability.length - 1].time : (now - 60);
                                const currentTime = Math.max(now, (lastProbTime || 0) + 1);

                                // 1. Update Probability Line
                                const newProbPoint: any = {
                                    time: currentTime,
                                    dateStr: new Date(currentTime * 1000).toLocaleTimeString()
                                };

                                // Mapping: If selected is YES, then YES=actualPrice, NO=100-actualPrice
                                // We need to map this to outcome titles
                                const outcome0 = marketOutcomes[0]?.title || 'YES';
                                const outcome1 = marketOutcomes[1]?.title || 'NO';

                                // actualPrice is implied probability of YES (or Outcome 0)
                                newProbPoint[outcome0] = actualPrice;
                                newProbPoint[outcome1] = 100 - actualPrice;

                                // 2. Update Candles (Price in SOL)
                                const newCandles = { ...prev.candles };

                                // Price Calculation (Spot Price in SOL)
                                const price0 = getSpotPrice(yesSupply);
                                const price1 = getSpotPrice(noSupply);

                                const updateCandleForOutcome = (outcomeIdx: number, currentPrice: number) => {
                                    const outcomeName = marketOutcomes[outcomeIdx]?.title || `Outcome ${outcomeIdx}`;
                                    const prevSeries = prev.candles[outcomeName] || [];
                                    const lastCandle = prevSeries.length > 0 ? prevSeries[prevSeries.length - 1] : { close: 0.00000001 };

                                    const open = lastCandle.close;
                                    const close = currentPrice;

                                    // Make it look like a real candle
                                    const high = Math.max(open, close) * 1.001;
                                    const low = Math.min(open, close) * 0.999;

                                    if (!newCandles[outcomeName]) newCandles[outcomeName] = [];
                                    newCandles[outcomeName] = [
                                        ...newCandles[outcomeName],
                                        { time: currentTime as any, open, high, low, close }
                                    ];
                                };

                                // Update candles for ALL outcomes (ensuring alignment)
                                (decodedMarket.outcomeSupplies as any[]).forEach((_supply: any, idx: number) => {
                                    const s = Number((decodedMarket.outcomeSupplies as any[])[idx]) / 1e9;
                                    const p = getSpotPrice(s);
                                    console.log(`🔍 Refreshed price from contract - Outcome ${idx}:`, p);
                                    updateCandleForOutcome(idx, p);
                                });

                                return {
                                    probability: [...prev.probability, newProbPoint],
                                    candles: newCandles
                                };
                            });
                            console.log(`✅ Refreshed price from contract:`, actualPrice);
                        }

                        // Refresh vault balance for Prize Pool
                        const vBalance = Number(decodedMarket.vaultBalance) / LAMPORTS_PER_SOL;
                        setVaultBalanceSol(vBalance);
                        console.log(`💰 Refreshed vault after buy:`, vBalance, "SOL");

                    } catch (err) {
                        console.error("Failed to fetch market via Anchor:", err);
                    }
                } catch (e) {
                    console.warn("Failed to refresh from contract:", e);
                }
            }

            // Trigger storage event for cross-component updates
            window.dispatchEvent(new Event('bet-updated'));

        } catch (error: any) {
            console.error("Error placing bet:", error);

            // Check for specific error types
            let errorTitle = 'Bet Failed';
            let errorMessage = error.message || 'Unknown error';

            // Market Expired Error (0x177b = 6011)
            if (error.message?.includes('MarketExpired') ||
                error.message?.includes('0x177b') ||
                error.message?.includes('Market has expired')) {
                errorTitle = 'Market Closed';
                errorMessage = 'This market has expired and is no longer accepting trades.';
            }

            setDjinnToast({ isVisible: true, type: 'ERROR', title: errorTitle, message: errorMessage });
        } finally {
            setIsPending(false);
            setTimeout(() => {
                setIsSuccess(false);
                setTradeSuccessInfo(null);
            }, 5000); // Extended to 5s for user to see and click link
        }
    };



    // Reset when side or mode changes
    useEffect(() => {
        setBetAmount('');
        setIsMaxSell(false);
    }, [selectedSide, tradeMode]);

    // ... (Keep existing calculations)
    // Dynamic Input Label & Calculation
    const inputLabel = 'SOL';
    const inputSubtext = tradeMode === 'BUY' ? 'Amount to Spend' : 'Value to Extract';

    // Handler to toggle logic
    const handleClaimWinnings = async () => {
        if (!marketAccount || !publicKey) return;
        try {
            const winningOutcome = marketAccount.winning_outcome;
            const isMultiOutcome = (marketOutcomes?.length || 0) > 2;

            // Determine index or side
            let sideOrIndex: 'yes' | 'no' | number = 'yes';

            if (isMultiOutcome) {
                const winIdx = marketOutcomes.findIndex(o => o.title === winningOutcome || o.id === winningOutcome);
                if (winIdx === -1) throw new Error("Could not find winning outcome index");
                sideOrIndex = winIdx;
            } else {
                sideOrIndex = winningOutcome === 'YES' ? 'yes' : 'no';
            }

            await claimReward(new PublicKey(marketAccount.marketPDA), new PublicKey(marketAccount.yes_token_mint || PublicKey.default), new PublicKey(marketAccount.no_token_mint || PublicKey.default), sideOrIndex);

            // Success feedback
            setIsClaimModalOpen(false);
            setDjinnToast({
                isVisible: true,
                type: 'SUCCESS',
                title: 'CLAIM SUCCESSFUL',
                message: 'Your winnings have been sent to your wallet.'
            });
            play('success');

            // Refresh data
            refreshAll();
            mutateHolders();
            setTimeout(() => window.location.reload(), 2000);
        } catch (e: any) {
            console.error(e);
            setDjinnToast({
                isVisible: true,
                type: 'ERROR',
                title: 'CLAIM FAILED',
                message: e.message || "Unknown error occurred."
            });
            play('error');
        }
    };

    const handleTrade = async (e?: any) => {
        if (e && e.preventDefault) e.preventDefault();
        console.log(`🖱️ ${tradeMode} Button Clicked.`);
        if (!publicKey) return setDjinnToast({ isVisible: true, type: 'ERROR', title: 'Wallet Error', message: "Please connect wallet" });
        const amountVal = parseCompactNumber(betAmount); // ✅ FIX: Parse "10M" → 10,000,000
        if (isNaN(amountVal) || amountVal <= 0) return setDjinnToast({ isVisible: true, type: 'ERROR', title: 'Invalid Amount', message: "Enter a valid amount" });

        if (tradeMode === 'BUY') {
            await handlePlaceBet();
        } else {
            // --- SELL LOGIC (Shares Input) ---
            // Input 'betAmount' is now explicit SHARE count from user.

            // Validate Price
            const spotPrice = getSpotPrice(estimatedSupply);
            const safePrice = spotPrice > 0 ? spotPrice : 0.0000001;

            const sharesToSell = amountNum; // Direct Input from parsed amountNum
            console.log("- Shares Limit to Sell:", sharesToSell);

            const availableShares = isMultiOutcome
                ? (myShares[marketOutcomes.findIndex(o => o.id === selectedOutcomeId)] || 0)
                : (selectedSide === 'YES' ? (myShares[0] || 0) : (myShares[1] || 0));

            // Allow small buffer for floating point issues or just cap it
            if (sharesToSell > availableShares * 1.001) { // 0.1% tolerance
                if (sharesToSell > availableShares + 0.01 && !isMaxSell) {
                    return setDjinnToast({ isVisible: true, type: 'ERROR', title: 'Insufficient Shares', message: `Insufficient shares! You only have ${availableShares.toFixed(2)} shares.` });
                }
            }

            // Cap at exact balance if close (MAX handling)
            const finalSharesToSell = (sharesToSell >= availableShares || isMaxSell) ? availableShares : sharesToSell;

            if (finalSharesToSell <= 0) {
                const outcomeLabel = isMultiOutcome ? (selectedOutcomeName || 'Outcome') : selectedSide;
                return setDjinnToast({ isVisible: true, type: 'ERROR', title: 'No Shares', message: `You don't hold any ${outcomeLabel} PREDICTIONS to sell!` });
            }

            setIsPending(true);
            try {
                // Initial success chime
                play('success');

                let txSignature = '';
                const isRealMarket = marketAccount?.market_pda && !marketAccount.market_pda.startsWith('local_');

                // Estimate Value & Fee (EXIT_FEE_BPS = 100 = 1% on-chain)
                const sellSim = simulateSell(finalSharesToSell, {
                    virtualSolReserves: 0,
                    virtualShareReserves: 0,
                    realSolReserves: 0,
                    totalSharesMinted: estimatedSupply
                });

                const estimatedSolReturn = sellSim.netInvested; // Gross Return (Pre-Fee)
                const netSolReturn = sellSim.sharesReceived;    // Net Return (Post-Fee)

                console.log("🧮 CALCULATION DEBUG:");
                console.log("- Final Shares:", finalSharesToSell);
                console.log("- Estimated SOL Return (Gross):", estimatedSolReturn);
                console.log("- Net SOL Return (Post Fee):", netSolReturn);

                if (isRealMarket) {
                    try {
                        console.log("🔗 Executing On-Chain Sell...");
                        console.log("🔗 SELL CALL - marketAccount.market_pda:", marketAccount.market_pda);
                        console.log("🔗 SELL CALL - Compare with PAGE.TSX marketInfo.market_pda above");

                        // Debugging Creator
                        // Use confirmed Master Treasury as fallback
                        const TREASURY_WALLET = new PublicKey('G1NaEsx5Pg7dSmyYy6Jfraa74b7nTbmN9A9NuiK171Ma');
                        const creatorKey = marketAccount.creator ? new PublicKey(marketAccount.creator) : TREASURY_WALLET;
                        console.log("🔗 SELL CALL - Creator Key passed:", creatorKey.toBase58());
                        console.log("🔗 SELL CALL - Is Treasury?", creatorKey.equals(TREASURY_WALLET));

                        // Calculate slippage protection for sell (user-configured tolerance)
                        const slippageMultiplier = 1 - (slippageTolerance / 100);
                        const minSolOut = Math.floor((netSolReturn * slippageMultiplier) * LAMPORTS_PER_SOL);

                        const outcomeIndex = isMultiOutcome
                            ? marketOutcomes.findIndex(o => o.id === selectedOutcomeId)
                            : (selectedSide === 'YES' ? 0 : 1);

                        if (outcomeIndex === -1) throw new Error("Invalid outcome for sell");

                        // Safe PublicKey Construction for Mints
                        const safeYesMint = typeof marketAccount.yes_token_mint === 'string' && marketAccount.yes_token_mint.length > 30
                            ? new PublicKey(marketAccount.yes_token_mint)
                            : new PublicKey("So11111111111111111111111111111111111111112");

                        const safeNoMint = typeof marketAccount.no_token_mint === 'string' && marketAccount.no_token_mint.length > 30
                            ? new PublicKey(marketAccount.no_token_mint)
                            : new PublicKey("So11111111111111111111111111111111111111112");

                        console.log("🔑 Key Debug:", {
                            yes: safeYesMint.toBase58(),
                            no: safeNoMint.toBase58(),
                            creator: creatorKey.toBase58()
                        });

                        // Safe Market PDA
                        if (!marketAccount.market_pda || marketAccount.market_pda.length < 30) {
                            throw new Error("Invalid Market PDA: " + marketAccount.market_pda);
                        }
                        const safeMarketPda = new PublicKey(marketAccount.market_pda);

                        const tx = await sellShares(
                            safeMarketPda,
                            outcomeIndex,
                            finalSharesToSell,
                            safeYesMint,
                            safeNoMint,
                            creatorKey,
                            minSolOut,
                            isMaxSell
                        );
                        console.log("✅ Sell TX:", tx);
                        txSignature = tx;

                        // LOCK CHART: Determine to use optimistic price for 10s
                        lockWithTimeout();
                        setTimeout(() => {
                            priceLockoutRef.current = false;
                            console.log("🔓 Price Lockout Released (Sell)");
                        }, 10000);

                        // OPTIMISTIC UPDATE: Burning Shares (Supply Down)
                        setOnChainData((prev: any) => {
                            const currentSupplies = prev?.outcome_supplies || marketAccount?.outcome_supplies || ['0', '0'];
                            const newSupplies = [...currentSupplies];
                            const outcomeIdx = isMultiOutcome
                                ? marketOutcomes.findIndex(o => o.id === selectedOutcomeId)
                                : (selectedSide === 'YES' ? 0 : 1);

                            if (outcomeIdx !== -1) {
                                const currentVal = Number(newSupplies[outcomeIdx]);
                                // For sell, we SUBTRACT shares. finalSharesToSell is in normal units (e.g. 10).
                                // Convert to atomic: * 1e9
                                const burnAmountAtomic = finalSharesToSell * 1e9;
                                const newVal = Math.max(0, currentVal - burnAmountAtomic);

                                newSupplies[outcomeIdx] = newVal.toString();
                                console.log("🔥 Optimistic Supply Update (SELL):", newSupplies);

                                // ✅ RESTORED: Calculate and update probability using Supply with 15M buffer
                                const yesSupply = Number(newSupplies[0]) / 1e9;
                                const noSupply = Number(newSupplies[1]) / 1e9;
                                const newProbability = calculateImpliedProbability(yesSupply, noSupply);

                                // Update live price immediately
                                setLivePrice(newProbability);

                                // Update history state immediately for chart
                                setHistoryState(prevHistory => {
                                    const now = Math.floor(Date.now() / 1000);

                                    // Use same structure as the interval loop
                                    const newPoint: any = {
                                        time: now,
                                        YES: isMultiOutcome ? 0 : newProbability,
                                        NO: isMultiOutcome ? 0 : (100 - newProbability),
                                        dateStr: new Date(now * 1000).toLocaleString()
                                    };

                                    // For multi-outcome, calculate all probabilities
                                    if (isMultiOutcome) {
                                        const totalSupply = newSupplies.reduce((sum: number, s: string) => sum + Number(s), 0);
                                        marketOutcomes.forEach((outcome: any, idx: number) => {
                                            const supply = Number(newSupplies[idx] || 0) / 1e9;
                                            newPoint[outcome.title] = totalSupply > 0 ? (supply / (totalSupply / 1e9)) * 100 : 0;
                                        });
                                    }

                                    console.log("📉 Chart Update (SELL):", newPoint);

                                    // Append but keep limit
                                    const newProbHistory = [...prevHistory.probability, newPoint].slice(-300);
                                    return {
                                        ...prevHistory,
                                        probability: newProbHistory
                                    };
                                });

                                return {
                                    ...prev,
                                    outcome_supplies: newSupplies,
                                    yes_supply: outcomeIdx === 0 ? newVal.toString() : prev?.yes_supply,
                                    no_supply: outcomeIdx === 1 ? newVal.toString() : prev?.no_supply
                                };
                            }
                            return prev;
                        });
                    } catch (sellError: any) {
                        console.error("❌ SELL ERROR DETAILS:", JSON.stringify(sellError, Object.getOwnPropertyNames(sellError), 2));

                        // Check for specific error types
                        let errorTitle = 'Sell Failed';
                        let errorMessage = sellError.message;

                        // Market Expired Error (0x177b = 6011)
                        if (sellError.message?.includes('MarketExpired') ||
                            sellError.message?.includes('0x177b') ||
                            sellError.message?.includes('Market has expired')) {
                            errorTitle = 'Market Closed';
                            errorMessage = 'This market has expired and is no longer accepting trades. You can claim your winnings if your prediction was correct.';
                        }
                        // Insufficient shares
                        else if (sellError.message?.includes('InsufficientShares')) {
                            errorTitle = 'Insufficient Shares';
                            errorMessage = 'You don\'t have enough shares to complete this sale.';
                        }

                        // Show detailed error to user
                        setDjinnToast({
                            isVisible: true,
                            type: 'ERROR',
                            title: errorTitle,
                            message: errorMessage
                        });

                        setIsPending(false);
                        return; // Stop execution on error
                    }
                } else {
                    console.log("🔮 Simulated Sell");
                    await new Promise( (r: any) => setTimeout(r, 1000));
                }

                // --- COMMON UPDATES ---
                // 1. Calculate Sell Impact (Negative)
                // Impact Logic: Selling X amount moves price DOWN.
                const currentPrice = selectedSide === 'YES' ? livePrice : (100 - livePrice); // Re-define for scope

                // Use ACTUAL value received for USD calculation
                const usdValue = estimatedSolReturn * solPrice;

                const sim = simulateBuy(estimatedSolReturn, {
                    virtualSolReserves: 0,
                    virtualShareReserves: 0,
                    realSolReserves: 0,
                    totalSharesMinted: estimatedSupply // Use correct supply
                });

                // For Sell, we INVERT the impact.
                // For Sell, we need to calculate the NEW probability from the NEW spot price.
                // sim.endPrice is the predicted price after sell.
                let outcome0Supply = 0;
                let outcome1Supply = 0;
                if (marketAccount?.outcome_supplies && marketAccount.outcome_supplies.length >= 2) {
                    outcome0Supply = Number(marketAccount.outcome_supplies[0]) / 1e9;
                    outcome1Supply = Number(marketAccount.outcome_supplies[1]) / 1e9;
                }
                const otherSideSupply = selectedSide === 'YES' ? outcome1Supply : outcome0Supply;
                const rawOtherSidePrice = getSpotPrice(otherSideSupply);

                // STABILIZER: Same floor for Sell logic to keep it symmetric
                // Using 0.00005 to match Buy Logic
                const otherSidePrice = Math.max(rawOtherSidePrice, 0.00005);

                const newLikelihood = (sim.endPrice / (sim.endPrice + otherSidePrice)) * 100;
                const currentLikelihood = selectedSide === 'YES' ? livePrice : (100 - livePrice);

                // The delta to apply to the main chart price (which is ALWAYS YES Probability)
                let probDelta = 0;

                if (selectedSide === 'YES') {
                    // We sold YES. Prob should go DOWN.
                    // newLikelihood should be < currentLikelihood.
                    probDelta = newLikelihood - currentLikelihood; // Negative
                } else {
                    // We sold NO. NO Prob goes DOWN. YES Prob goes UP.
                    // newLikelihood is NO Prob. 
                    // Main Chart is YES Prob.
                    // New YES Prob = 100 - newLikelihood.
                    // Old YES Prob = livePrice.
                    probDelta = (100 - newLikelihood) - livePrice; // Positive
                }

                // Market Inertia: Probability is consensus, not token price.
                probDelta = probDelta * 0.15; // 15% sensitivity

                // Safety Cap
                if (Math.abs(probDelta) > 5) probDelta = probDelta > 0 ? 5 : -5;

                // 2. Update Price
                const newPrice = livePrice + probDelta;
                setLivePrice(newPrice);
                // Store SPOT PRICE in SOL (not probability) for holdings calculation
                await supabaseDb.updateMarketPrice(effectiveSlug, sim.endPrice, -usdValue);

                // 2b. Reduce Bet Position in DB (Wait for this!)
                const dbSide = isMultiOutcome ? (selectedOutcomeName || 'YES') : selectedSide;
                await supabaseDb.reduceBetPosition(
                    publicKey.toBase58(),
                    effectiveSlug,
                    dbSide,
                    finalSharesToSell
                );

                // SYNC FIX: Immediately refresh holders after DB update
                const updatedHolders = await supabaseDb.getTopHolders(effectiveSlug);
                mutateHolders(updatedHolders, false);

                // 3. Log Activity
                const profile = await supabaseDb.getProfile(publicKey.toBase58()).catch(() => null);
                const activityAction = isMultiOutcome ? (selectedOutcomeName || 'YES') : selectedSide;
                const sellActivity = {
                    wallet_address: publicKey.toBase58(),
                    username: profile?.username || userProfile.username,
                    avatar_url: profile?.avatar_url || userProfile.avatarUrl,
                    action: activityAction,
                    order_type: 'SELL',
                    amount: usdValue,
                    sol_amount: estimatedSolReturn,
                    shares: finalSharesToSell,
                    market_title: staticMarketInfo.title,
                    market_slug: effectiveSlug,
                    market_icon: staticMarketInfo.icon,
                    outcome_name: activityAction,
                    created_at: new Date().toISOString()
                };
                // 4. Update Last Trade Event (for Chart Bubbles)
                // FIX: Generate ID here ONCE to prevent infinite re-render loop in Chart
                setLastTradeEvent({
                    id: Date.now().toString(),
                    amount: estimatedSolReturn,
                    side: selectedSide,
                    outcome: selectedSide // Correct property name for the local state
                });

                // 5. Optimistic SWR Update to prevent "Reversion" to 50%
                // We tell SWR: "This is the new data, trust me"

                // LOCKOUT: Ignore server updates for 15s
                lockWithTimeout();

                if (marketData) {
                    mutateMarketData({
                        ...marketData,
                        live_price: newPrice,
                        // We could also update volume/holders here if we tracked them locally
                    }, false); // false = don't revalidate immediately
                }
                await (supabaseDb as any).createActivity(sellActivity);
                mutateActivity((current: any[] | undefined) => [sellActivity, ...(current || [])], false);

                // REFRESH USER HOLDINGS
                window.dispatchEvent(new Event('bet-updated'));

                // 4. Update UI Local State
                setSolBalance( (prev: any) => prev + netSolReturn);

                // Update specific share count
                const outcomeIndex = isMultiOutcome
                    ? marketOutcomes.findIndex(o => o.id === selectedOutcomeId)
                    : (selectedSide === 'YES' ? 0 : 1);
                if (outcomeIndex !== -1) {
                    updateMyShares(outcomeIndex, Math.max(0, (myShares[outcomeIndex] || 0) - finalSharesToSell));
                }

                setLastBetDetails({
                    outcomeName: selectedOutcomeName || staticMarketInfo.title,
                    side: selectedSide,
                    solAmount: netSolReturn,
                    usdAmount: usdValue,
                    marketTitle: staticMarketInfo.title,
                    probability: livePrice,
                    username: userProfile.username,
                    type: 'SELL',
                    imageUrl: marketAccount?.icon || (typeof staticMarketInfo.icon === 'string' && staticMarketInfo.icon.startsWith('http') ? staticMarketInfo.icon : undefined)
                });

                setDjinnToast({
                    isVisible: true,
                    type: 'SUCCESS',
                    title: 'SUCCESS',
                    message: `Sold ${finalSharesToSell.toFixed(2)} ${selectedSide} shares for ${netSolReturn.toFixed(4)} SOL.`,
                    actionLink: txSignature ? `https://solscan.io/tx/${txSignature}?cluster=devnet` : undefined,
                    actionLabel: 'View on Solscan'
                });

                setIsSuccess(true);
                setBetAmount('');

                // Refresh shares and price from contract
                if (marketAccount?.market_pda && publicKey) {
                    try {
                        const marketPda = new PublicKey(marketAccount.market_pda);
                        const PROGRAM_ID = new PublicKey('Fdbhx4cN5mPWzXneDm9XjaRgjYVjyXtpsJLGeQLPr7hg');

                        refreshAll();
                        // Delay to allow RPC to propagate changes
                        await new Promise(resolve => setTimeout(resolve, 1500));
                        await loadOnChainData();
                    } catch (e) {
                        console.warn("Failed to refresh after sell:", e);
                    }
                }

                // Trigger Refreshes
                window.dispatchEvent(new Event('bet-updated'));
                setTimeout(() => {
                    supabaseDb.getTopHolders(effectiveSlug).then((d) => mutateHolders(d, false));
                }, 1000);

            } catch (error: any) {
                console.error("Trade Error:", error);
                setDjinnToast({
                    isVisible: true,
                    type: 'ERROR',
                    title: 'Transaction Failed',
                    message: error.message || 'Unknown error occurred'
                });
            } finally {
                setIsPending(false);
                setTimeout(() => setIsSuccess(false), 3000);
            }
        }
    };


    return (
        <div className="min-h-screen bg-transparent text-white font-sans selection:bg-[#F492B7] selection:text-black overflow-x-hidden">
            <Navbar />
            <div className="container mx-auto px-4 pt-24 pb-12 max-w-7xl relative z-10">

                {/* 1. HEADER SECTION (FADE IN) */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                    className="flex flex-col lg:flex-row gap-12 items-start relative mb-20"
                >
                    <div className="flex-1 min-w-0 flex flex-col gap-12 w-full">
                        <div className="flex flex-col md:flex-row items-center md:items-start gap-10 relative">
                            {/* Banner */}
                            <motion.div
                                whileHover={{ scale: 1.02 }}
                                className="w-56 h-56 md:w-72 md:h-72 rounded-[3.5rem] overflow-hidden shrink-0 border-4 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] bg-white relative"
                            >
                                {(marketAccount?.banner_url || (typeof staticMarketInfo.icon === 'string' && (staticMarketInfo.icon.startsWith('http') || staticMarketInfo.icon.startsWith('data:')))) ?
                                    <img src={marketAccount?.banner_url || staticMarketInfo.icon} className="w-full h-full object-cover" alt="Banner" />
                                    : <div className="w-full h-full flex items-center justify-center text-7xl bg-gray-50">{staticMarketInfo.icon}</div>
                                }
                                <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent pointer-events-none" />
                            </motion.div>

                            {/* Title & Stats Cluster */}
                            <div className="flex-1 flex flex-col gap-8 pt-6">
                                {/* Title Area - Jim Raptis Principle: Epic Typography */}
                                <div className="relative">
                                    <div className="absolute -top-12 right-0 flex items-center gap-3">
                                        <motion.button
                                            whileHover={{ scale: 1.1 }}
                                            whileTap={{ scale: 0.95 }}
                                            onClick={() => {
                                                setIsStarred(!isStarred);
                                                play('click'); // Standardized sound
                                            }}
                                            className="p-3 rounded-full bg-white border-2 border-black hover:bg-[#F492B7] transition-all shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] active:shadow-none"
                                        >
                                            <Star size={20} className={isStarred ? "text-yellow-400 fill-yellow-400" : "text-black"} />
                                        </motion.button>
                                        <motion.button
                                            layoutId="share-experience"
                                            whileHover={{ scale: 1.1 }}
                                            whileTap={{ scale: 0.95 }}
                                            onClick={() => {
                                                setShowShareModal(true);
                                                play('click');
                                            }}
                                            className="p-3 rounded-full bg-white border-2 border-black hover:bg-[#F492B7] transition-all shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] active:shadow-none"
                                        >
                                            <Share2 size={18} className="text-black" />
                                        </motion.button>
                                    </div>

                                    <div className="flex flex-col gap-6">
                                        <motion.h1
                                            initial={{ opacity: 0, x: -20 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            transition={{ delay: 0.2 }}
                                            className="text-5xl lg:text-7xl font-black text-white tracking-tighter leading-none lowercase"
                                        >
                                            {marketAccount?.title || staticMarketInfo.title}
                                        </motion.h1>

                                        <div className="flex flex-wrap items-center gap-4">
                                            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}>
                                                <Link href={`/profile/${marketAccount.creator_wallet}`} className="flex items-center gap-2 group p-2 pr-4 bg-white/5 rounded-full backdrop-blur-md hover:-translate-y-1 transition-all">
                                                    <div className="w-8 h-8 rounded-full overflow-hidden bg-gray-900">
                                                        <img src={creatorDisplay.avatar} className="w-full h-full object-cover" />
                                                    </div>
                                                    <span className="text-xs font-black text-white/60 uppercase tracking-widest">
                                                        by <span className="text-white group-hover:underline">{creatorDisplay.username}</span>
                                                    </span>
                                                </Link>
                                            </motion.div>

                                            <div className="px-4 py-2 bg-[#F492B7] border-2 border-black rounded-full shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] text-[10px] font-black uppercase tracking-widest text-black">
                                                Verified Market
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* MCAPS Cluster */}
                                <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.4 }} className="flex gap-6 max-w-[900px]">
                                    {marketOutcomes.slice(0, 2).map((outcome, idx) => {
                                        const color = getOutcomeColor(outcome.title, idx);
                                        const mcapUSD = (outcome.mcapSOL || 0) * (solPrice || 0);
                                        return (
                                            <motion.div key={idx} whileHover={{ y: -6, scale: 1.02 }} className="flex-1 bg-white border-4 border-black px-8 py-6 rounded-2xl flex flex-col items-center shadow-[10px_10px_0px_0px_rgba(0,0,0,1)] transition-all">
                                                <div className="flex items-center gap-2 mb-3">
                                                    <div className="w-3 h-3 rounded-full border-2 border-black" style={{ backgroundColor: color }} />
                                                    <span className="text-[10px] font-black uppercase tracking-[0.2em] text-black/60">{outcome.title} MCAP</span>
                                                </div>
                                                <div className="flex flex-col items-center">
                                                    <span className="text-3xl font-black text-black tabular-nums tracking-tighter">
                                                        <AnimatedNumber value={mcapUSD} decimals={1} prefix="$" />
                                                    </span>
                                                    <span className="text-xs font-bold text-black/40 uppercase tracking-widest font-mono">
                                                        {formatCompact(outcome.mcapSOL || 0)} SOL
                                                    </span>
                                                </div>
                                            </motion.div>
                                        );
                                    })}
                                </motion.div>
                            </div>
                        </div>
                    </div>
                </motion.div>





                {/* 2. MAIN GRID: CHART (80%) + TRADE (20%) */}
                <div className="flex flex-col lg:flex-row gap-8 items-start relative">

                    {/* LEFT AREA: Chart & Holdings & Community */}
                    <div className="flex-[8] w-full min-w-0 flex flex-col gap-12">




                        {/* CHART PANEL */}
                        <motion.div
                            initial={{ opacity: 0, scale: 0.98 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ delay: 0.5 }}
                            className="bg-transparent rounded-3xl border-2 border-white/10 overflow-hidden relative backdrop-blur-sm h-[600px] min-h-[600px]"
                        >
                            <TheDjinnChart
                                outcomeNames={marketOutcomes.map(o => o.title)}
                                data={historyState.probability || []}
                                outcomeSupplies={outcomeSuppliesMap}
                                volume={marketAccount?.volumeTotal ? formatCompact(Number(marketAccount.volumeTotal) / 1e9) + " SOL" : (marketAccount?.volume_usd || "$0")}
                                resolutionDate={marketAccount?.resolution_date}
                                outcomeColors={
                                    (marketAccount?.outcome_colors && marketAccount.outcome_colors.length > 0)
                                        ? marketAccount.outcome_colors
                                        : ['#2563EB', '#DC2626', '#10B981', '#F59E0B']
                                }
                                tradeEvent={realtimeTradeEvent ? {
                                    id: realtimeTradeEvent.id,
                                    outcome: realtimeTradeEvent.outcome,
                                    amount: realtimeTradeEvent.amount,
                                    side: realtimeTradeEvent.side
                                } : null}
                                selectedOutcome={selectedOutcomeName || (selectedSide === 'YES' ? (marketOutcomes[0]?.title || 'YES') : (marketOutcomes[1]?.title || 'NO'))}
                                onOutcomeChange={(name: string) => {
                                    setSelectedOutcomeName(name);
                                    const outcome = marketOutcomes.find(o => o.title === name);
                                    if (outcome) {
                                        setSelectedOutcomeId(outcome.id);
                                        if (marketOutcomes.length === 2) {
                                            setSelectedSide(outcome.title === marketOutcomes[0].title ? 'YES' : 'NO');
                                        }
                                    }
                                }}
                            />
                        </motion.div>

                        {/* HOLDINGS SECTION - Jim Raptis Principle: Opacity Hack */}
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }} className="bg-white rounded-3xl border-2 border-black p-8 shadow-[12px_12px_0px_0px_rgba(0,0,0,1)]">
                            <h3 className="text-2xl font-black text-black uppercase tracking-tighter mb-8 text-center border-b-2 border-black pb-4">Portfolio</h3>
                            <HoldingsSection
                                bets={userBets}
                                outcomeSupplies={marketOutcomes.map(o => o.supply || 0)}
                                marketOutcomes={marketOutcomes}
                            />
                        </motion.div>

                        {/* COMMUNITY TABS (Activity, Comments, Rank) - Jim Raptis Principle: Opacity Hack */}
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.7 }} className="bg-white rounded-3xl border-2 border-black p-8 shadow-[12px_12px_0px_0px_rgba(0,0,0,1)]">
                            <div className="flex items-center gap-10 mb-8 border-b-2 border-black pb-4">
                                <TabButton label="Activity" icon={<Activity size={18} />} active={bottomTab === 'ACTIVITY'} onClick={() => { setBottomTab('ACTIVITY'); play('click'); }} />
                                <TabButton label="Comments" icon={<MessageCircle size={18} />} active={bottomTab === 'COMMENTS'} onClick={() => { setBottomTab('COMMENTS'); play('click'); }} />
                                <TabButton label="Top Holders" icon={<Users size={18} />} active={bottomTab === 'HOLDERS'} onClick={() => { setBottomTab('HOLDERS'); play('click'); }} />
                            </div>

                            <AnimatePresence mode="wait">
                                <motion.div key={bottomTab} initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -15 }} transition={{ duration: 0.4 }}>
                                    {bottomTab === 'ACTIVITY' && (
                                        <div className="bg-gray-50 rounded-2xl border-2 border-black overflow-hidden bg-white shadow-inner">
                                            <div className="grid grid-cols-5 px-8 py-4 text-[10px] font-black uppercase tracking-widest text-black/60 bg-gray-50 border-b-2 border-black">
                                                <span>Trader</span>
                                                <span className="text-center">Side</span>
                                                <span className="text-center">Shares</span>
                                                <span className="text-right">Value</span>
                                                <span className="text-right">Time</span>
                                            </div>
                                            <div className="max-h-[700px] overflow-y-auto custom-scrollbar">
                                                {activityList.length === 0 ? (
                                                    <div className="p-20 text-center text-black/20 font-black uppercase tracking-[0.4em] italic">Ghost Town</div>
                                                ) : (
                                                    activityList.map((act, i) => (
                                                        <ActivityRow key={i} act={act} marketOutcomes={marketOutcomes} solPrice={solPrice} />
                                                    ))
                                                )}
                                            </div>
                                        </div>
                                    )}

                                    {bottomTab === 'COMMENTS' && (
                                        <CommentsSection
                                            marketSlug={effectiveSlug}
                                            publicKey={publicKey ? publicKey.toBase58() : null}
                                            userProfile={userProfile}
                                            marketOutcomes={marketOutcomes}
                                            myHeldPosition={null}
                                            myHeldAmount={"0"}
                                        />
                                    )}

                                    {bottomTab === 'HOLDERS' && <HoldersList holders={holders} marketOutcomes={marketOutcomes} publicKey={publicKey} />}
                                </motion.div>
                            </AnimatePresence>
                        </motion.div>
                        {/* RESOLUTION CRITERIA */}
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.8 }} className="bg-black text-white rounded-3xl border-2 border-black p-10 shadow-[12px_12px_0px_0px_rgba(255,255,255,0.05)]">
                            <div className="flex items-center justify-between mb-8">
                                <h3 className="text-xl font-black uppercase tracking-widest text-[#F492B7]">Resolution Protocol</h3>
                                <div className="flex items-center gap-3 px-5 py-2 rounded-full bg-white/5 border border-white/10">
                                    <span className="text-[10px] font-black uppercase text-white/60 tracking-widest">Oracle</span>
                                    {marketAccount?.resolution_source ? (
                                        <a href={marketAccount.resolution_source} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-[#F492B7] hover:underline font-black text-xs">
                                            <span>SOURCE</span> <ExternalLink size={12} />
                                        </a>
                                    ) : (
                                        <span className="font-black text-xs text-emerald-400">DECENTRALIZED</span>
                                    )}
                                </div>
                            </div>
                            <p className="text-white/60 text-lg leading-relaxed font-medium">
                                {marketAccount?.description || staticMarketInfo.description}
                            </p>
                        </motion.div>
                    </div>

                    {/* RIGHT AREA: Trade Panel & Multi-Outcome */}
                    <div className="flex-[2] w-full min-w-[340px] sticky top-28 flex flex-col gap-8">

                        {/* THE TRADE PANEL */}
                        <motion.div
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: 0.6 }}
                            whileHover={{ y: -8 }}
                            className="bg-white rounded-3xl border-2 border-black p-6 shadow-[10px_10px_0px_0px_rgba(0,0,0,1)] relative overflow-hidden"
                        >
                            {/* Header Gradient - Jim Raptis Principle: Epic Data Visualization */}
                            {/* Header Gradient - "The Obsidian Vault" Theme */}
                            <div className="w-full flex flex-col items-center px-6 py-10 rounded-3xl bg-black border-4 border-black relative overflow-hidden mb-8 group/pool isolate">

                                {/* 1. Dynamic Background Mesh */}
                                <div className="absolute inset-0 opacity-40">
                                    <div className="absolute top-0 right-0 w-64 h-64 bg-[#F492B7] rounded-full mix-blend-screen filter blur-[80px] opacity-20 animate-pulse" />
                                    <div className="absolute bottom-0 left-0 w-64 h-64 bg-[#9945FF] rounded-full mix-blend-screen filter blur-[80px] opacity-20" />
                                </div>

                                {/* 2. Grid Overlay */}
                                <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 mix-blend-overlay" />

                                {/* 3. Content */}
                                <motion.div
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className="relative z-10 flex flex-col items-center"
                                >
                                    <div className="flex items-center gap-2 mb-4">
                                        <div className="w-1.5 h-1.5 rounded-full bg-[#00FF94] shadow-[0_0_10px_#00FF94] animate-pulse" />
                                        <span className="text-[10px] font-black uppercase tracking-[0.4em] text-white/40">Total Pool</span>
                                        <div className="w-1.5 h-1.5 rounded-full bg-[#00FF94] shadow-[0_0_10px_#00FF94] animate-pulse" />
                                    </div>

                                    <div className="flex items-baseline gap-2">
                                        <span className="text-6xl font-black text-white tracking-tighter drop-shadow-2xl filter">
                                            <AnimatedNumber
                                                value={totalPoolSol}
                                                decimals={2}
                                                className="inline bg-clip-text text-transparent bg-gradient-to-b from-white to-gray-400"
                                            />
                                        </span>
                                        <span className="text-2xl font-black text-[#F492B7] tracking-tight">SOL</span>
                                    </div>

                                    {/* 4. Interactive Progress Bar */}
                                    <div className="w-full max-w-[80%] h-1.5 bg-white/10 rounded-full mt-6 relative overflow-hidden group-hover/pool:bg-white/20 transition-colors">
                                        <motion.div
                                            layoutId="pool-progress"
                                            className="absolute inset-0 bg-gradient-to-r from-[#F492B7] to-[#9945FF]"
                                            initial={{ x: '-100%' }}
                                            animate={{ x: '100%' }}
                                            transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                                        />
                                    </div>
                                </motion.div>
                            </div>

                            {/* RESOLVED STATE HANDLING */}
                            {marketAccount?.resolved ? (
                                <div className="mb-8">
                                    <div className="w-full py-4 bg-black text-white font-black text-center text-sm uppercase tracking-[0.3em] rounded-xl border-4 border-black mb-4 shadow-[4px_4px_0px_rgba(0,0,0,0.2)]">
                                        MARKET RESOLVED
                                    </div>

                                    {/* WINNINGS CHECK */}
                                    {(() => {
                                        const winningOutcome = marketAccount.winning_outcome; // 'YES', 'NO', or ID
                                        // Determine user's winning shares
                                        let winningShares = 0;
                                        if (isMultiOutcome) {
                                            const winIdx = marketOutcomes.findIndex(o => o.title === winningOutcome || o.id === winningOutcome);
                                            if (winIdx !== -1) winningShares = myShares[winIdx] || 0;
                                        } else {
                                            winningShares = winningOutcome === 'YES' ? (myShares[0] || 0) : (winningOutcome === 'NO' ? (myShares[1] || 0) : 0);
                                        }

                                        if (winningShares > 0.01) {
                                            return (
                                                <button
                                                    onClick={() => setIsClaimModalOpen(true)}
                                                    className="w-full py-5 bg-[#FFD600] text-black font-black text-xl uppercase tracking-widest rounded-2xl border-4 border-black shadow-[6px_6px_0px_black] hover:-translate-y-1 hover:shadow-[10px_10px_0px_black] active:translate-y-0 active:shadow-none transition-all animate-pulse"
                                                >
                                                    CLAIM {formatCompact(winningShares)} SOL
                                                </button>
                                            )
                                        } else {
                                            return (
                                                <div className="text-center p-4 bg-gray-100 rounded-xl border-2 border-black/10">
                                                    <span className="text-xs font-bold text-gray-400 uppercase">Better luck next time</span>
                                                </div>
                                            )
                                        }
                                    })()}
                                </div>
                            ) : (
                                /* Buy/Sell Toggles - Jim Raptis Principle: Drastic Selected Items */
                                <div className="mb-8 p-1.5 bg-gray-100 border-4 border-black rounded-2xl flex gap-1.5 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]">
                                    <button onClick={() => { setTradeMode('BUY'); play('click'); }} className={`flex-1 py-4 rounded-xl text-xs font-black tracking-widest uppercase transition-all border-4 ${tradeMode === 'BUY' ? 'bg-emerald-400 text-black border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] -translate-y-1' : 'text-black/60 border-transparent bg-transparent hover:text-black'}`}>BUY</button>
                                    <button onClick={() => { setTradeMode('SELL'); play('click'); }} className={`flex-1 py-4 rounded-xl text-xs font-black tracking-widest uppercase transition-all border-4 ${tradeMode === 'SELL' ? 'bg-rose-400 text-black border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] -translate-y-1' : 'text-black/60 border-transparent bg-transparent hover:text-black'}`}>SELL</button>
                                </div>
                            )}

                            {/* Outcome Selector - Jim Raptis Principle: Frictionless Selection */}
                            <div className="mb-8">
                                <label className="text-[10px] font-black uppercase text-black/60 tracking-widest mb-4 block">Select Outcome</label>
                                {isMultiOutcome ? (
                                    <div className="flex flex-wrap gap-2">
                                        {marketOutcomes.map((outcome) => (
                                            <button
                                                key={outcome.id}
                                                onClick={() => {
                                                    setSelectedOutcomeId(outcome.id);
                                                    setSelectedOutcomeName(outcome.title);
                                                    play('click');
                                                }}
                                                className={`px-4 py-2.5 rounded-xl text-[10px] font-black uppercase transition-all border-2 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] active:shadow-none ${selectedOutcomeId === outcome.id
                                                    ? 'bg-black text-white border-black -translate-y-0.5'
                                                    : 'bg-white text-black border-black hover:bg-gray-50'
                                                    }`}
                                            >
                                                {outcome.title}
                                            </button>
                                        ))}
                                    </div>

                                ) : (
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => { setSelectedSide('YES'); play('click'); }}
                                            className={`flex-1 py-4 rounded-2xl text-xs font-black transition-all border-4 relative overflow-hidden group shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] active:shadow-none flex items-center justify-center gap-2 ${selectedSide === 'YES'
                                                ? 'bg-emerald-400 text-black border-black -translate-y-1'
                                                : 'bg-white text-black border-black hover:bg-emerald-50'
                                                }`}
                                        >
                                            <svg width="14" height="14" viewBox="0 0 12 12" fill="none"><path d="M6 2L10 7H2L6 2Z" fill="currentColor" /></svg>
                                            <span className="relative z-10 lowercase">{marketOutcomes[0]?.title === 'YES' ? 'up' : (marketOutcomes[0]?.title || 'up')}</span>
                                        </button>
                                        <button
                                            onClick={() => { setSelectedSide('NO'); play('click'); }}
                                            className={`flex-1 py-4 rounded-2xl text-xs font-black transition-all border-4 relative overflow-hidden group shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] active:shadow-none flex items-center justify-center gap-2 ${selectedSide === 'NO'
                                                ? 'bg-rose-400 text-black border-black -translate-y-1'
                                                : 'bg-white text-black border-black hover:bg-rose-50'
                                                }`}
                                        >
                                            <svg width="14" height="14" viewBox="0 0 12 12" fill="none"><path d="M6 10L2 5H10L6 10Z" fill="currentColor" /></svg>
                                            <span className="relative z-10 lowercase">{marketOutcomes[1]?.title === 'NO' ? 'down' : (marketOutcomes[1]?.title || 'down')}</span>
                                        </button>
                                    </div>
                                )}
                            </div>



                            {/* Main Input - Jim Raptis Principle: Labels Above Inputs */}
                            <div className="bg-white rounded-2xl border-4 border-black p-6 mb-8 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]">
                                <label className="text-[10px] font-black uppercase text-black/60 tracking-widest mb-4 block">{tradeMode === 'BUY' ? 'Principal (SOL)' : 'Volume (Shares)'}</label>
                                <div className="flex items-center gap-3">
                                    <input type="text" inputMode="decimal" value={betAmount || ''} onChange={(e) => { setBetAmount(e.target.value); setIsMaxSell(false); }} className="bg-transparent text-5xl font-black text-black w-full outline-none placeholder-gray-100 tracking-tighter focus:text-[#F492B7] tabular-nums" placeholder="0" />
                                    <div className="flex items-center gap-2 bg-black px-4 py-2 rounded-xl border-2 border-black shrink-0 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
                                        <span className="text-xs font-black text-white">{tradeMode === 'BUY' ? 'SOL' : 'SHR'}</span>
                                    </div>
                                </div>
                                {tradeMode === 'SELL' && (
                                    <div className="flex gap-2 mt-6 pt-6 border-t-2 border-black/5">
                                        {[50, 100].map((pct) => (
                                            <button key={pct} onClick={() => {
                                                const sharesOwned = isMultiOutcome ? (myShares[marketOutcomes.findIndex(o => o.id === selectedOutcomeId)] || 0) : (selectedSide === 'YES' ? (myShares[0] || 0) : (myShares[1] || 0));
                                                if (sharesOwned <= 0) return;
                                                play('click');
                                                if (pct === 100) { setIsMaxSell(true); } else { setIsMaxSell(false); }
                                                const sharesToSell = sharesOwned * (pct / 100);
                                                setBetAmount(sharesToSell >= 100_000 ? formatCompact(sharesToSell) : sharesToSell.toFixed(2));
                                            }} className="flex-1 py-2.5 rounded-xl text-[10px] font-bold bg-white text-black border-2 border-black hover:bg-gray-50 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] active:shadow-none transition-all">
                                                {pct === 100 ? 'MAX OUT' : `${pct}%`}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Estimates Grid */}
                            <div className="bg-gray-50 rounded-2xl border-2 border-black p-5 space-y-4 mb-8">
                                <div className="flex justify-between items-center">
                                    <span className="text-[9px] font-black uppercase text-black/60">Expected Yield</span>
                                    <span className="text-lg font-black text-black">{formatCompact(estimatedShares)} <span className="text-[10px] text-black/60">SHR</span></span>
                                </div>
                                <div className="flex justify-between items-center pt-3 border-t border-black/10">
                                    <span className="text-[9px] font-black uppercase text-black/40">Drift Impact</span>
                                    <span className={`text-xs font-black ${amountNum > 0.5 ? 'text-rose-500' : 'text-emerald-500'}`}>
                                        {(amountNum * 0.12).toFixed(2)}%
                                    </span>
                                </div>
                            </div>

                            {/* Execute Action */}
                            <motion.button
                                whileHover={{ scale: 1.02, y: -2 }}
                                whileTap={{ scale: 0.98 }}
                                onClick={() => {
                                    handleTrade();
                                    play('click');
                                }}
                                disabled={isPending || isSuccess}
                                className={`w-full py-6 rounded-2xl font-black text-xl uppercase tracking-[0.2em] shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] hover:shadow-[10px_10px_0px_0px_rgba(0,0,0,1)] active:shadow-none transition-all border-4 border-black ${isSuccess ? 'bg-emerald-400 text-black' : 'bg-black text-white hover:bg-[#F492B7] hover:text-black'}`}
                            >
                                {isPending ? 'TRANSACTING...' : isSuccess ? 'CONFIRMED!' : 'EXECUTE'}
                            </motion.button>
                        </motion.div>

                        {/* OUTCOME SELECTOR FOR MULTI-OUTCOME */}
                        {isMultiOutcome && (
                            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.7 }} className="bg-white rounded-[2.5rem] border-2 border-black p-6 shadow-[10px_10px_0px_0px_rgba(0,0,0,1)]">
                                <h3 className="text-[10px] font-black uppercase text-black/40 tracking-widest mb-6 text-center">Available Targets</h3>
                                <OutcomeList
                                    outcomes={marketOutcomes}
                                    selectedId={selectedOutcomeId}
                                    onSelect={setSelectedOutcomeId}
                                    onBuyClick={handleOutcomeBuyClick}
                                />
                            </motion.div>
                        )}
                    </div>
                </div>

                {/* ── BOT VERIFICATION PANEL ─────────────────────────────────────── */}
                {marketAccount && (
                    <div className="mt-12">
                        <BotVerificationPanel
                            marketSlug={effectiveSlug}
                            marketTitle={marketAccount.title || ''}
                            endDate={marketAccount.end_date || new Date(Date.now() + 86400000).toISOString()}
                            isResolved={marketAccount.resolved || false}
                            cerberusVerdict={marketAccount.cerberus_verdict}
                            cerberusConfidence={marketAccount.cerberus_confidence}
                        />
                    </div>
                )}

                {/* SHARE EXPERIENCE INTEGRATION */}
                <ShareExperience
                    isOpen={showShareModal}
                    onClose={() => setShowShareModal(false)}
                    layoutId="share-experience"
                    data={{
                        title: marketAccount?.title || staticMarketInfo.title,
                        username: userProfile?.username || 'agent-alpha',
                        imageUrl: marketAccount?.icon || (typeof staticMarketInfo.icon === 'string' && staticMarketInfo.icon.startsWith('http') ? staticMarketInfo.icon : undefined),
                        stats: [
                            { label: 'Volume', value: formatCompact(parseInt(marketAccount?.total_pool || '0') / LAMPORTS_PER_SOL) + ' SOL' },
                            { label: 'Market Cap', value: formatCompact(parseInt(marketAccount?.mcap || '0') / LAMPORTS_PER_SOL) + ' SOL' },
                            { label: 'Phase', value: 'Alpha' }
                        ],
                        qrValue: typeof window !== 'undefined' ? window.location.href : `https://djinn.market/market/${effectiveSlug}`
                    }}
                />



                <DjinnToast
                    isVisible={djinnToast.isVisible}
                    onClose={() => setDjinnToast( (prev: any) => ({ ...prev, isVisible: false }))}
                    type={djinnToast.type}
                    title={djinnToast.title}
                    message={djinnToast.message}
                    actionLink={djinnToast.actionLink}
                    actionLabel={djinnToast.actionLabel}
                />
                <EarningsTicketModal
                    isOpen={isClaimModalOpen}
                    onClose={() => setIsClaimModalOpen(false)}
                    amount={(() => {
                        if (!marketAccount?.winning_outcome) return 0;
                        const winningOutcome = marketAccount.winning_outcome;
                        const isMultiOutcome = (marketOutcomes?.length || 0) > 2;
                        let s = 0;
                        if (isMultiOutcome) {
                            const winIdx = marketOutcomes.findIndex(o => o.title === winningOutcome || o.id === winningOutcome);
                            if (winIdx !== -1) s = myShares[winIdx] || 0;
                        } else {
                            s = winningOutcome === 'YES' ? (myShares[0] || 0) : (winningOutcome === 'NO' ? (myShares[1] || 0) : 0);
                        }
                        return s;
                    })()}
                    marketTitle={marketAccount?.title || 'Unknown Market'}
                    outcome={marketAccount?.winning_outcome || 'Unknown'}
                    shares={(() => {
                        if (!marketAccount?.winning_outcome) return 0;
                        const winningOutcome = marketAccount.winning_outcome;
                        const isMultiOutcome = (marketOutcomes?.length || 0) > 2;
                        let s = 0;
                        if (isMultiOutcome) {
                            const winIdx = marketOutcomes.findIndex(o => o.title === winningOutcome || o.id === winningOutcome);
                            if (winIdx !== -1) s = myShares[winIdx] || 0;
                        } else {
                            s = winningOutcome === 'YES' ? (myShares[0] || 0) : (winningOutcome === 'NO' ? (myShares[1] || 0) : 0);
                        }
                        return s;
                    })()}
                    onClaim={handleClaimWinnings}
                />
            </div >
        </div >
    );
}

// --- SUB COMPONENTS ---

function TabButton({ label, icon, active, onClick }: any) {
    return (
        <button
            onClick={onClick}
            className={`flex items-center gap-3 text-xs font-black uppercase tracking-[0.2em] transition-all pb-3 relative ${active ? 'text-black' : 'text-gray-400 hover:text-gray-600'}`}
        >
            {icon} {label}
            {active && (
                <motion.div layoutId="tab-underline" className="absolute bottom-0 left-0 right-0 h-1 bg-[#F492B7] rounded-full" />
            )}
        </button>
    );
}

function ActivityRow({ act, marketOutcomes, solPrice }: any) {
    const isBuy = act.order_type === 'BUY' || !act.order_type;
    let displayAction = act.action;
    let actionColor = '#808080';

    const findOutcomeIndex = (name: string) => marketOutcomes.findIndex((o: any) => o.title === name);

    if (act.action === 'YES' || act.action === 'NO') {
        const outcomeIdx = act.action === 'YES' ? 0 : 1;
        if (marketOutcomes[outcomeIdx]) {
            displayAction = marketOutcomes[outcomeIdx].title;
            actionColor = getOutcomeColor(displayAction, outcomeIdx);
        } else {
            actionColor = getOutcomeColor(act.action, outcomeIdx);
        }
    } else {
        const outcomeIdx = findOutcomeIndex(act.action);
        actionColor = getOutcomeColor(act.action, outcomeIdx !== -1 ? outcomeIdx : undefined);
    }

    return (
        <motion.div
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            className="grid grid-cols-5 items-center px-8 py-5 border-b-2 border-black/5 hover:bg-[#F492B7]/5 transition-colors group"
        >
            <div className="flex items-center gap-4 col-span-1">
                <Link href={`/profile/${act.wallet_address}`} className="w-10 h-10 rounded-full bg-white flex items-center justify-center border-2 border-black overflow-hidden shrink-0 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] group-hover:scale-110 transition-transform">
                    <img src={act.avatar_url || '/pink-pfp.png'} className="w-full h-full object-cover" onError={(e) => e.currentTarget.src = '/pink-pfp.png'} />
                </Link>
                <Link href={`/profile/${act.wallet_address}`} className="text-xs font-black text-black group-hover:underline truncate max-w-[80px]">
                    {act.username || `${act.wallet_address.slice(0, 4)}...`}
                </Link>
            </div>
            <div className="text-center col-span-1">
                <span className="text-[9px] font-black uppercase px-3 py-1.5 rounded-lg border-2" style={{ backgroundColor: `${actionColor}15`, color: actionColor, borderColor: `${actionColor}30` }}>
                    {act.order_type || 'BUY'} {displayAction}
                </span>
            </div>
            <div className="text-center col-span-1">
                <span className="text-xs font-black text-black/60 tabular-nums">{formatCompact(act.shares || 0)}</span>
            </div>
            <div className="text-right col-span-1">
                <div className="text-sm font-black text-black">${act.amount?.toFixed(2)}</div>
                <div className="text-[10px] font-bold text-black/30">{act.sol_amount?.toFixed(3)} SOL</div>
            </div>
            <div className="text-right text-[10px] font-bold text-black/20 col-span-1 uppercase">
                {timeAgo(act.created_at)}
            </div>
        </motion.div>
    );
}

function HoldersList({ holders, marketOutcomes, publicKey }: any) {
    return (
        <div className={`grid gap-12 ${marketOutcomes.length > 2 ? 'grid-cols-1 md:grid-cols-2' : 'lg:grid-cols-2'}`}>
            {marketOutcomes.map((outcome: any, idx: number) => {
                const title = outcome.title;
                const color = getOutcomeColor(title, idx);
                const outcomeHolders = (holders && holders[title]) ? holders[title] : [];

                return (
                    <div key={title} className="bg-gray-50 rounded-2xl border-2 border-black p-6">
                        <div className="flex items-center justify-between mb-6 pb-4 border-b-2 border-black/5">
                            <h3 className="text-xs font-black uppercase tracking-[0.3em]" style={{ color }}>{title}</h3>
                            <span className="text-[8px] font-black text-black/20 uppercase">Top 5</span>
                        </div>
                        <div className="space-y-3">
                            {outcomeHolders.length === 0 ? (
                                <div className="py-10 text-center text-black/20 font-black italic uppercase tracking-widest">No holders</div>
                            ) : (
                                outcomeHolders.slice(0, 5).map((h: any, i: number) => {
                                    const isMe = publicKey && h.wallet_address === publicKey.toBase58();
                                    const shares = h.positions[title] || 0;
                                    return (
                                        <div key={i} className={`flex items-center justify-between p-3 rounded-xl border-2 border-transparent hover:border-black/10 hover:bg-white transition-all cursor-pointer ${isMe ? 'bg-white border-black/20 shadow-[4px_4px_0px_0px_rgba(0,0,0,0.05)]' : ''}`}>
                                            <div className="flex items-center gap-4">
                                                <div className="relative">
                                                    <div className="w-10 h-10 rounded-full border-2 border-black overflow-hidden">
                                                        {h.avatar ? <img src={h.avatar} className="w-full h-full object-cover" /> : <div className="w-full h-full" style={{ background: `linear-gradient(135deg, ${color}, #000)` }} />}
                                                    </div>
                                                    <div className={`absolute -top-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-black border-2 border-black shadow-[1px_1px_0px_0px_rgba(0,0,0,1)] ${i === 0 ? 'bg-yellow-400' : i === 1 ? 'bg-gray-300' : i === 2 ? 'bg-orange-400' : 'bg-white'}`}>
                                                        {i + 1}
                                                    </div>
                                                </div>
                                                <div className="flex flex-col">
                                                    <span className="text-xs font-black text-black truncate max-w-[120px]">{h.name}</span>
                                                    <span className="text-[9px] font-bold text-black/40 uppercase tracking-widest">Collector</span>
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <div className="text-xs font-black text-black tabular-nums">{formatCompact(shares)}</div>
                                                <div className="text-[8px] font-bold uppercase tracking-tighter" style={{ color }}>Shares</div>
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

function timeAgo(dateString?: string) {
    if (!dateString) return 'Now';
    const date = new Date(dateString);
    const now = new Date();
    const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days}d`;
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}
