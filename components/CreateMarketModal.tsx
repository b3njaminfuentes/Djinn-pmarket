'use client';

import React, { useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { useDjinnProtocol } from '@/hooks/useDjinnProtocol';
import { isSupabaseConfigured } from '@/lib/supabase';
import { compressImage } from '@/lib/utils';
import { uploadToIPFS } from '@/lib/ipfs';
import { checkMarketMilestones, createMarket, updateMarketPrice } from '@/lib/supabase-db';
import AchievementToast from './AchievementToast';
import { useRouter } from 'next/navigation';
import { Loader2, ExternalLink } from 'lucide-react';
import confetti from 'canvas-confetti';
import { useSound } from './providers/SoundProvider';
import TwitterWarningModal from './TwitterWarningModal';
import { parseMarketSource, type MarketSourceAnalysis } from '@/lib/oracle/market-sources';

// --- ICONS ---
const CloseIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor" className="w-6 h-6">
        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
    </svg>
);

const TrashIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-5 h-5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
    </svg>
);

interface CreateMarketModalProps { isOpen: boolean; onClose: () => void; }

// Default Colors
const COLORS = [
    "#10B981", // Green (Yes)
    "#EF4444", // Red (No)
    "#3B82F6", // Blue
    "#F59E0B", // Amber
    "#8B5CF6", // Purple
    "#EC4899", // Pink
    "#06B6D4", // Cyan
    "#14B8A6", // Teal
    "#6366F1", // Indigo
    "#84CC16", // Lime
    "#F97316", // Orange
    "#D946EF", // Fuchsia
    "#F43F5E", // Rose
    "#0EA5E9", // Sky
    "#FACC15", // Yellow
    "#A855F7", // Bright Purple
    "#22C55E", // Bright Green
    "#FB923C", // Bright Orange
    "#F472B6", // Bright Pink
    "#34D399", // Emerald
];

const CATEGORIES = [
    'Crypto', 'Politics', 'Sports', 'Business', 'Science', 'Tech/AI', 'Gaming', 'Pop Culture', 'Twitter', 'Global', 'Other'
];

// Max duration for Twitter markets (API only searches 7 days back)
const TWITTER_MAX_DAYS = 7;

export default function CreateMarketModal({ isOpen, onClose }: CreateMarketModalProps) {
    const router = useRouter();
    const wallet = useWallet();
    const { publicKey } = wallet;
    const { play } = useSound();
    const { createMarket: createMarketOnChain, isReady: isContractReady } = useDjinnProtocol();

    const [isLoading, setIsLoading] = useState(false);
    const [isSuccess, setIsSuccess] = useState(false);
    const [newAchievements, setNewAchievements] = useState<any[]>([]);
    const [marketType, setMarketType] = useState<'binary' | 'multiple'>('binary');
    const [poolName, setPoolName] = useState('');
    const [mainImage, setMainImage] = useState<string | null>(null);
    const [sourceUrl, setSourceUrl] = useState('');
    const [activeColorPicker, setActiveColorPicker] = useState<number | null>(null);
    const [selectedCategory, setSelectedCategory] = useState<string>('Crypto');

    // Updated Option State with Color
    const [options, setOptions] = useState<{ id: number; name: string; color: string }[]>([
        { id: 1, name: 'Yes', color: '#10B981' },
        { id: 2, name: 'No', color: '#EF4444' }
    ]);

    const [initialBuyAmount, setInitialBuyAmount] = useState('0');
    const [initialBuySide, setInitialBuySide] = useState<'yes' | 'no'>('yes');

    // Twitter market fields
    const [showTwitterWarning, setShowTwitterWarning] = useState(false);
    const [twitterWarningAccepted, setTwitterWarningAccepted] = useState(false);
    const [twitterMarketType, setTwitterMarketType] = useState<'keyword' | 'metric'>('keyword');
    const [targetUsername, setTargetUsername] = useState('');
    const [targetKeyword, setTargetKeyword] = useState('');
    const [targetTweetId, setTargetTweetId] = useState('');
    const [metricThreshold, setMetricThreshold] = useState('10000');

    const [error, setError] = useState('');
    const [sourceUrlError, setSourceUrlError] = useState('');
    const [urlAnalysis, setUrlAnalysis] = useState<MarketSourceAnalysis | null>(null);
    const [qualityCheckResult, setQualityCheckResult] = useState<{
        approved: boolean; score: number; reason: string;
    } | null>(null);
    const [successData, setSuccessData] = useState<{
        txSignature: string;
        marketPda: string;
        yesMint: string;
        noMint: string;
        slug: string;
    } | null>(null);

    // Reset State logic
    React.useEffect(() => {
        if (!isOpen) {
            const t = setTimeout(() => {
                setIsSuccess(false);
                setIsLoading(false);
                setPoolName('');
                setMainImage(null);
                setMarketType('binary');
                setOptions([{ id: 1, name: 'Yes', color: '#10B981' }, { id: 2, name: 'No', color: '#EF4444' }]);
                setInitialBuyAmount('0');
                setInitialBuySide('yes');
                setSuccessData(null);
                setSourceUrl('');
                setSourceUrlError('');
                setUrlAnalysis(null);
                setQualityCheckResult(null);
                setSelectedCategory('Crypto');
                setShowTwitterWarning(false);
                setTwitterWarningAccepted(false);
                setTwitterMarketType('keyword');
                setTargetUsername('');
                setTargetKeyword('');
                setTargetTweetId('');
                setMetricThreshold('10000');
            }, 300);
            return () => clearTimeout(t);
        }
    }, [isOpen]);

    // Helpers
    const handleImageUpload = (file: File) => {
        const reader = new FileReader();
        reader.onload = (e) => setMainImage(e.target?.result as string);
        reader.readAsDataURL(file);
    };

    const addOption = () => {
        const nextId = options.length + 1;
        const nextColor = COLORS[(nextId - 1) % COLORS.length];
        setOptions([...options, { id: nextId, name: '', color: nextColor }]);
    };

    const switchMode = (mode: 'binary' | 'multiple') => {
        setMarketType(mode);
        if (mode === 'binary') {
            setOptions([
                { id: 1, name: 'Yes', color: '#10B981' },
                { id: 2, name: 'No', color: '#EF4444' }
            ]);
        } else {
            setOptions([
                { id: 1, name: '', color: COLORS[0] },
                { id: 2, name: '', color: COLORS[1] },
                { id: 3, name: '', color: COLORS[2] }
            ]);
        }
    };

    // --- MAIN LOGIC ---
    const handleCreateMarket = async () => {
        if (!isSupabaseConfigured) {
            setError('⚠️ Supabase not configured.');
            return;
        }

        if (!publicKey) {
            alert("Please connect your wallet first!");
            return;
        }
        if (!poolName) return alert("Please enter a question");

        if (!sourceUrl.trim()) {
            setSourceUrlError('A source URL is required — paste the link where you found this question.');
            setIsLoading(false);
            return;
        }

        const finalCategory = selectedCategory;
        setIsLoading(true);

        try {
            console.log("🚀 Creating market...");
            const timestamp = Date.now().toString(36);
            const sanitizedName = poolName.toLowerCase().trim()
                .replace(/[^\w\s-]/g, '')
                .replace(/[\s_-]+/g, '-')
                .replace(/^-+|-+$/g, '')
                .slice(0, 20);

            const slug = `${sanitizedName}-${timestamp}`;
            // Twitter markets are capped at 7 days (API limitation)
            const maxDays = finalCategory === 'Twitter' ? TWITTER_MAX_DAYS : 7;
            const RESOLUTION_SECONDS = maxDays * 24 * 60 * 60;
            const finalResolutionTime = Math.floor(Date.now() / 1000) + RESOLUTION_SECONDS;

            let finalBanner = "https://arweave.net/djinn-placeholder";
            if (mainImage) {
                const compressed = await compressImage(mainImage);
                finalBanner = await uploadToIPFS(compressed);
            }

            let marketPDA = '';
            let txSignature = '';
            let yesTokenMint = '';
            let noTokenMint = '';

            if (isContractReady && wallet && publicKey) {
                try {
                    const timeoutPromise = new Promise((_, reject) =>
                        setTimeout(() => reject(new Error('Timeout - Network congested.')), 120000)
                    );

                    const buyAmount = parseFloat(initialBuyAmount) || 0;
                    const numOutcomes = options.length;
                    const contractPromise = createMarketOnChain(
                        poolName,
                        poolName,
                        new Date(finalResolutionTime * 1000),
                        sourceUrl,
                        finalBanner || "https://arweave.net/placeholder",
                        numOutcomes,
                        buyAmount,
                        initialBuySide === 'yes' ? 0 : 1
                    );

                    const result = await Promise.race([contractPromise, timeoutPromise]) as any;

                    if (!result || !result.tx) throw new Error("No transaction signature returned");

                    marketPDA = result.marketPda.toBase58();
                    yesTokenMint = result.yesMintPda.toBase58();
                    noTokenMint = result.noMintPda.toBase58();
                    txSignature = result.tx;
                } catch (blockchainError: any) {
                    console.error("⚠️ Blockchain failed:", blockchainError);
                    alert(`Blockchain Error: ${blockchainError.message}`);
                    throw blockchainError;
                }
            } else {
                marketPDA = `local_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
                txSignature = 'local_fallback';
            }

            await (createMarket as any)({
                slug,
                title: poolName,
                creator_wallet: publicKey.toString(),
                category: finalCategory,
                end_date: new Date(finalResolutionTime * 1000).toISOString(),
                market_pda: marketPDA,
                yes_token_mint: yesTokenMint,
                no_token_mint: noTokenMint,
                tx_signature: txSignature,
                total_yes_pool: 0,
                total_no_pool: 0,
                resolved: false,
                resolution_source: sourceUrl || 'DERIVED',
                banner_url: finalBanner,
                options: options.map(opt => opt.name || '').filter(name => name.trim() !== ''),
                outcome_colors: options.map(opt => opt.color),
                // Twitter market fields
                ...(finalCategory === 'Twitter' ? {
                    twitter_market_type: twitterMarketType === 'keyword' ? 'keyword_mention' : 'metric_threshold',
                    target_username: targetUsername.replace('@', '') || undefined,
                    target_keyword: targetKeyword || undefined,
                    target_tweet_id: targetTweetId || undefined,
                    metric_threshold: twitterMarketType === 'metric' ? parseInt(metricThreshold) || undefined : undefined,
                } : {})
            });

            const initialVol = parseFloat(initialBuyAmount) || 0;
            await updateMarketPrice(slug, 50, initialVol * 200);

            const optimisticMarket = {
                id: `local_${Date.now()}`,
                slug,
                title: poolName,
                volume: "$0",
                chance: 50,
                icon: finalBanner,
                category: finalCategory,
                createdAt: Date.now(),
                marketPDA,
                yesTokenMint,
                noTokenMint,
                resolved: false,
                winningOutcome: null,
                resolutionSource: sourceUrl || 'DERIVED',
                creator_wallet: publicKey.toString(),
                options: options.map(o => o.name),
                outcome_colors: options.map(o => o.color)
            };

            setSuccessData({
                txSignature,
                marketPda: marketPDA,
                yesMint: yesTokenMint,
                noMint: noTokenMint,
                slug
            });

            // ── Kick off Cerberus quality check (async, non-blocking) ──────────
            fetch('/api/oracle/quality-check', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title: poolName,
                    sourceUrl,
                    endDate: new Date(finalResolutionTime * 1000).toISOString(),
                    category: finalCategory,
                    market_slug: slug,
                }),
            })
                .then(r => r.json())
                .then(qc => setQualityCheckResult({ approved: qc.approved, score: qc.score, reason: qc.reason }))
                .catch(() => { /* quality check is best-effort */ });

            // 🎉 FIREWORKS SOUND
            play('success');

            // 🎉 FIRE CONFETTI - Intense Burst from Center
            const duration = 1.5 * 1000;
            const animationEnd = Date.now() + duration;
            const defaults = { startVelocity: 45, spread: 360, ticks: 100, zIndex: 9999, gravity: 0.8 };

            const randomInRange = (min: number, max: number) => Math.random() * (max - min) + min;

            const interval: any = setInterval(function () {
                const timeLeft = animationEnd - Date.now();

                if (timeLeft <= 0) {
                    return clearInterval(interval);
                }

                const particleCount = 80 * (timeLeft / duration);

                // Fire from center (where the modal is)
                confetti({ ...defaults, particleCount, origin: { x: 0.5, y: 0.55 }, scalar: 1.2 });
                confetti({ ...defaults, particleCount, origin: { x: 0.5, y: 0.55 }, scalar: 0.8 });
            }, 200);

            setIsSuccess(true);

            // Cleanup
            setPoolName('');
            setMainImage(null);
            setMarketType('binary');
            setOptions([{ id: 1, name: 'Yes', color: '#10B981' }, { id: 2, name: 'No', color: '#EF4444' }]);

            try {
                const currentLocal = JSON.parse(localStorage.getItem('djinn_created_markets') || '[]');
                localStorage.setItem('djinn_created_markets', JSON.stringify([optimisticMarket, ...currentLocal]));
            } catch (e) {
                console.warn("LocalStorage save failed", e);
            }

            try {
                const dracoRes = await fetch('/api/markets', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        id: optimisticMarket.id,
                        title: poolName,
                        sourceUrl: sourceUrl,
                        imageUrl: finalBanner,
                        creator: publicKey.toString(),
                        marketPda: marketPDA,
                        slug: slug
                    })
                });
            } catch (e) { }

            window.dispatchEvent(new Event('storage'));
            window.dispatchEvent(new CustomEvent('market-created', { detail: optimisticMarket }));

        } catch (error: any) {
            console.error("❌ Error:", error);
            setError(error.message || 'Unknown error');
        } finally {
            setIsLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 font-sans animate-in fade-in duration-300">
            {/* BACKDROP: Clean semi-transparent black for high focus */}
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => !isLoading && onClose()} />

            {/* NEO-BRUTALIST CONTAINER */}
            <div className={`
                relative w-full overflow-hidden transition-all duration-300
                bg-white border-4 border-black rounded-3xl p-0
                shadow-[12px_12px_0px_0px_rgba(0,0,0,1)]
                ${isSuccess ? 'max-w-md' : 'max-w-2xl max-h-[90vh] flex flex-col'}
            `}>

                {/* --- SUCCESS MODE --- */}
                {isSuccess && successData ? (
                    <div className="p-8 text-center flex flex-col items-center">
                        {/* Header: Title + Close */}
                        <div className="w-full flex justify-end mb-4">
                            <button onClick={onClose} className="bg-red-500 text-white border-2 border-black p-2 rounded-full hover:bg-red-600 hover:scale-105 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:translate-y-[2px] active:shadow-none transition-all">
                                <CloseIcon />
                            </button>
                        </div>

                        {/* Big Icon */}
                        <div className="mb-6 relative">
                            <div className="w-24 h-24 bg-[#10B981] border-4 border-black rounded-full flex items-center justify-center shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] animate-in zoom-in spin-in-12 duration-500">
                                <svg className="w-12 h-12 text-black" fill="none" stroke="currentColor" strokeWidth="4" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                                </svg>
                            </div>
                        </div>

                        <h2 className="text-4xl font-black text-black lowercase mb-2">market created!</h2>
                        <div className="flex items-center gap-2 mb-8">
                            {qualityCheckResult === null ? (
                                <span className="inline-flex items-center gap-1.5 bg-amber-100 border-2 border-amber-400 text-amber-700 font-black text-xs uppercase px-3 py-1.5 rounded-full">
                                    <Loader2 className="w-3 h-3 animate-spin" /> cerberus reviewing...
                                </span>
                            ) : qualityCheckResult.approved ? (
                                <span className="inline-flex items-center gap-1.5 bg-emerald-100 border-2 border-emerald-500 text-emerald-700 font-black text-xs uppercase px-3 py-1.5 rounded-full">
                                    🐕 cerberus approved — trading opens shortly
                                </span>
                            ) : (
                                <span className="inline-flex items-center gap-1.5 bg-red-100 border-2 border-red-400 text-red-700 font-black text-xs uppercase px-3 py-1.5 rounded-full">
                                    ⚠️ needs review — {qualityCheckResult.reason?.slice(0, 40)}
                                </span>
                            )}
                        </div>

                        {/* Receipt Card */}
                        <div className="w-full bg-[#f8f9fa] border-2 border-dashed border-black rounded-xl p-6 mb-8 text-left font-mono text-sm relative">
                            <div className="flex justify-between border-b-2 border-dashed border-gray-300 pb-2 mb-2">
                                <span className="text-gray-500">MARKET_PDA</span>
                                <span className="text-black font-bold">{successData.marketPda.slice(0, 4)}...{successData.marketPda.slice(-4)}</span>
                            </div>
                            <div className="flex justify-between border-b-2 border-dashed border-gray-300 pb-2 mb-2">
                                <span className="text-gray-500">ASSET_TYPE</span>
                                <span className="text-black font-bold">VIRTUAL_SHARES</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-gray-500">OUTCOMES</span>
                                <span className="text-black font-bold">{options.length}</span>
                            </div>
                        </div>

                        {/* Action Primary */}
                        <div className="w-full space-y-3">
                            <button
                                onClick={() => { play('click'); onClose(); router.push(`/market/${successData.slug}`); }}
                                className="w-full py-4 bg-[#F492B7] border-2 border-black rounded-xl font-black text-xl uppercase text-black hover:bg-[#ff85b0] hover:-translate-y-1 hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] active:translate-y-0 active:shadow-none transition-all flex items-center justify-center gap-2"
                            >
                                Open Market
                            </button>

                            <a
                                href={`https://solscan.io/tx/${successData.txSignature}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={() => play('click')}
                                className="w-full py-3 bg-white border-2 border-black rounded-xl font-black text-xs uppercase text-black/60 hover:text-black hover:bg-gray-50 hover:-translate-y-1 hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:translate-y-0 active:shadow-none transition-all flex items-center justify-center gap-2"
                            >
                                <ExternalLink size={14} /> View on Solscan
                            </a>
                        </div>
                    </div>
                ) : (
                    /* --- FORM MODE --- */
                    <>
                        {/* Header */}
                        <div className="p-6 md:p-8 pb-4 flex justify-between items-center bg-white border-b-4 border-black z-20">
                            <h1 className="text-3xl md:text-3xl font-black lowercase tracking-tight text-black leading-none">
                                create market
                            </h1>

                            {/* CLOSE BUTTON - Always Visible, Neo-Brutalist */}
                            <button
                                onClick={onClose}
                                className="group bg-red-400 border-2 border-black p-2.5 rounded-full hover:bg-red-500 transition-all shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] active:translate-y-[2px] active:shadow-none"
                            >
                                <CloseIcon />
                            </button>
                        </div>

                        <div className="p-6 md:p-8 overflow-y-auto custom-scrollbar flex-1 bg-white">
                            {/* Mode Switcher */}
                            <div className="flex gap-4 mb-8">
                                <button onClick={() => switchMode('binary')} className={`flex-1 py-3 border-2 border-black rounded-xl font-black uppercase text-sm transition-all ${marketType === 'binary' ? 'bg-[#F492B7] text-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] -translate-y-1' : 'bg-white text-gray-400 hover:text-black hover:bg-gray-50'}`}>
                                    Binary
                                </button>
                                <button onClick={() => switchMode('multiple')} className={`flex-1 py-3 border-2 border-black rounded-xl font-black uppercase text-sm transition-all ${marketType === 'multiple' ? 'bg-[#F492B7] text-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] -translate-y-1' : 'bg-white text-gray-400 hover:text-black hover:bg-gray-50'}`}>
                                    Multiple
                                </button>
                            </div>

                            <div className="space-y-8">
                                {/* Image & Title */}
                                <div className="flex flex-col md:flex-row gap-6">
                                    <div className="w-32 shrink-0">
                                        <label className="text-black font-black lowercase mb-2 block tracking-tight">Icon</label>
                                        <div
                                            className="w-32 h-32 bg-white border-2 border-black border-dashed rounded-xl flex items-center justify-center cursor-pointer hover:bg-gray-50 hover:border-solid transition-all overflow-hidden relative group"
                                            onClick={() => { const input = document.createElement('input'); input.type = 'file'; input.accept = 'image/*'; input.onchange = (e: any) => handleImageUpload(e.target.files[0]); input.click(); }}
                                        >
                                            {mainImage ? (
                                                <img src={mainImage} className="w-full h-full object-cover" />
                                            ) : (
                                                <div className="text-center p-2 opacity-50 group-hover:opacity-100 transition-opacity">
                                                    <div className="text-3xl mb-1">📷</div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                    <div className="flex-1">
                                        <label className="text-black font-black lowercase mb-2 block tracking-tight">Question</label>
                                        <textarea
                                            placeholder="what will happen?"
                                            className="w-full h-32 bg-white border-2 border-black rounded-xl p-4 text-xl font-bold text-black outline-none focus:shadow-[4px_4px_0px_0px_#F492B7] transition-all resize-none placeholder:text-gray-300"
                                            value={poolName}
                                            onChange={(e) => setPoolName(e.target.value)}
                                        />
                                    </div>
                                </div>

                                {/* Category Selector */}
                                <div>
                                    <label className="text-black font-black lowercase mb-2 block tracking-tight">Category</label>
                                    <div className="flex flex-wrap gap-2">
                                        {CATEGORIES.map((cat) => (
                                            <button
                                                key={cat}
                                                onClick={() => {
                                                    setSelectedCategory(cat);
                                                    if (cat === 'Twitter' && !twitterWarningAccepted) {
                                                        setShowTwitterWarning(true);
                                                    }
                                                }}
                                                className={`px-4 py-2 rounded-xl text-xs font-black uppercase border-2 border-black transition-all ${selectedCategory === cat
                                                    ? 'bg-[#FFD600] text-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] -translate-y-1'
                                                    : 'bg-white text-gray-500 hover:text-black hover:bg-gray-50'
                                                    }`}
                                            >
                                                {cat}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Source URL — REQUIRED */}
                                <div>
                                    <label className="text-black font-black lowercase mb-2 block tracking-tight">
                                        resolution source
                                        <span className="ml-1.5 text-red-500 text-xs font-black uppercase">required</span>
                                    </label>
                                    <input
                                        type="text"
                                        placeholder="https://kalshi.com/markets/... or https://reuters.com/..."
                                        className={`w-full bg-white border-2 rounded-xl py-4 px-4 font-bold text-black outline-none focus:shadow-[4px_4px_0px_0px_#F492B7] transition-all placeholder:text-gray-300 ${sourceUrlError ? 'border-red-500 shadow-[2px_2px_0px_0px_#ef4444]' : 'border-black'}`}
                                        value={sourceUrl}
                                        onChange={(e) => {
                                            const url = e.target.value;
                                            setSourceUrl(url);
                                            setSourceUrlError('');

                                            if (url.length > 8) {
                                                const analysis = parseMarketSource(url);
                                                setUrlAnalysis(analysis);

                                                // Auto-set category
                                                if (analysis.suggestedCategory && analysis.suggestedCategory !== 'Other') {
                                                    setSelectedCategory(analysis.suggestedCategory);
                                                }

                                                // Auto-populate question if Kalshi/Polymarket and field is empty
                                                if (analysis.extractedQuestion && !poolName) {
                                                    setPoolName(analysis.extractedQuestion);
                                                }

                                                // Twitter-specific logic
                                                if (analysis.platform === 'twitter') {
                                                    const userMatch = url.match(/(?:twitter\.com|x\.com)\/([^\/\?#]+)/);
                                                    if (userMatch?.[1] && !['search', 'hashtag', 'home', 'explore'].includes(userMatch[1])) {
                                                        setTargetUsername(userMatch[1]);
                                                    }
                                                    const idMatch = url.match(/\/status\/(\d+)/);
                                                    if (idMatch?.[1]) setTargetTweetId(idMatch[1]);
                                                    if (!twitterWarningAccepted) setShowTwitterWarning(true);
                                                }
                                            } else {
                                                setUrlAnalysis(null);
                                            }
                                        }}
                                    />

                                    {/* Source Detection Badge */}
                                    {urlAnalysis && (
                                        <div className={`mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border-2 text-xs font-black uppercase transition-all
                                            ${urlAnalysis.platform === 'kalshi' ? 'bg-emerald-50 border-emerald-400 text-emerald-700' :
                                              urlAnalysis.platform === 'polymarket' ? 'bg-blue-50 border-blue-400 text-blue-700' :
                                              urlAnalysis.platform === 'twitter' ? 'bg-sky-50 border-sky-400 text-sky-700' :
                                              urlAnalysis.credibleDomain ? 'bg-emerald-50 border-emerald-400 text-emerald-700' :
                                              'bg-amber-50 border-amber-400 text-amber-700'}`
                                        }>
                                            <span>{urlAnalysis.platformIcon}</span>
                                            <span>
                                                {urlAnalysis.platform === 'kalshi' && 'Kalshi Market Detected'}
                                                {urlAnalysis.platform === 'polymarket' && 'Polymarket Detected'}
                                                {urlAnalysis.platform === 'twitter' && 'X / Twitter Source'}
                                                {urlAnalysis.platform === 'general' && urlAnalysis.credibleDomain && `Verified source · ${urlAnalysis.platformLabel}`}
                                                {urlAnalysis.platform === 'general' && !urlAnalysis.credibleDomain && `Unrecognized source · Cerberus will review`}
                                                {urlAnalysis.platform === 'unknown' && 'Invalid URL'}
                                            </span>
                                            {urlAnalysis.extractedQuestion && (
                                                <span className="opacity-60">· question auto-imported</span>
                                            )}
                                        </div>
                                    )}

                                    {sourceUrlError ? (
                                        <p className="text-xs font-bold text-red-500 mt-2">{sourceUrlError}</p>
                                    ) : !urlAnalysis ? (
                                        <p className="text-xs font-bold text-gray-400 mt-2 lowercase">paste the url where you found this question — cerberus uses it to verify the outcome</p>
                                    ) : null}
                                </div>

                                {/* Twitter Market Config */}
                                {selectedCategory === 'Twitter' && (
                                    <div className="space-y-4 border-2 border-black rounded-xl p-5 bg-[#FFF9E6]">
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className="text-lg">🐦</span>
                                            <label className="text-black font-black lowercase tracking-tight">twitter market config</label>
                                        </div>

                                        {/* Market Type Toggle */}
                                        <div className="flex gap-3">
                                            <button
                                                type="button"
                                                onClick={() => setTwitterMarketType('keyword')}
                                                className={`flex-1 py-2.5 border-2 border-black rounded-xl font-black text-xs uppercase transition-all ${twitterMarketType === 'keyword'
                                                    ? 'bg-[#FFD600] text-black shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] -translate-y-0.5'
                                                    : 'bg-white text-gray-400 hover:text-black'
                                                    }`}
                                            >
                                                keyword mention
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setTwitterMarketType('metric')}
                                                className={`flex-1 py-2.5 border-2 border-black rounded-xl font-black text-xs uppercase transition-all ${twitterMarketType === 'metric'
                                                    ? 'bg-[#FFD600] text-black shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] -translate-y-0.5'
                                                    : 'bg-white text-gray-400 hover:text-black'
                                                    }`}
                                            >
                                                metric threshold
                                            </button>
                                        </div>

                                        {twitterMarketType === 'keyword' ? (
                                            <div className="space-y-3">
                                                <div>
                                                    <label className="text-black font-bold text-xs lowercase mb-1 block">target username</label>
                                                    <div className="flex items-center gap-0 group">
                                                        <span className={`bg-black text-white font-black text-sm px-3 py-3 rounded-l-xl border-2 border-black border-r-0 ${targetUsername ? 'grayscale' : ''}`}>@</span>
                                                        <input
                                                            type="text"
                                                            placeholder="elonmusk"
                                                            className={`flex-1 bg-white border-2 border-black rounded-r-xl py-3 px-3 font-bold text-black outline-none focus:shadow-[2px_2px_0px_0px_#F492B7] transition-all placeholder:text-gray-300 ${targetUsername && sourceUrl.includes(targetUsername) ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : ''}`}
                                                            value={targetUsername}
                                                            onChange={(e) => {
                                                                // Only allow manual edit if NOT derived from URL
                                                                if (!sourceUrl.includes('twitter.com') && !sourceUrl.includes('x.com')) {
                                                                    setTargetUsername(e.target.value.replace('@', ''));
                                                                }
                                                            }}
                                                            readOnly={!!(targetUsername && sourceUrl.includes(targetUsername))}
                                                        />
                                                        {targetUsername && sourceUrl.includes(targetUsername) && (
                                                            <div className="absolute right-8 text-xs font-bold text-gray-400 pointer-events-none">LOCKED FROM URL</div>
                                                        )}
                                                    </div>
                                                </div>
                                                <div>
                                                    <label className="text-black font-bold text-xs lowercase mb-1 block">keyword to search</label>
                                                    <input
                                                        type="text"
                                                        placeholder="Bitcoin"
                                                        className="w-full bg-white border-2 border-black rounded-xl py-3 px-3 font-bold text-black outline-none focus:shadow-[2px_2px_0px_0px_#F492B7] transition-all placeholder:text-gray-300"
                                                        value={targetKeyword}
                                                        onChange={(e) => setTargetKeyword(e.target.value)}
                                                    />
                                                    <p className="text-xs text-black/50 font-medium mt-1">exact match, case-insensitive</p>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="space-y-3">
                                                <div className="relative">
                                                    <label className="text-black font-bold text-xs lowercase mb-1 block">tweet ID</label>
                                                    <input
                                                        type="text"
                                                        placeholder="1234567890123456789"
                                                        className={`w-full bg-white border-2 border-black rounded-xl py-3 px-3 font-bold text-black outline-none focus:shadow-[2px_2px_0px_0px_#F492B7] transition-all placeholder:text-gray-300 ${targetTweetId && sourceUrl.includes(targetTweetId) ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : ''}`}
                                                        value={targetTweetId}
                                                        onChange={(e) => {
                                                            if (!sourceUrl.includes(e.target.value)) {
                                                                setTargetTweetId(e.target.value);
                                                            }
                                                        }}
                                                        readOnly={!!(targetTweetId && sourceUrl.includes(targetTweetId))}
                                                    />
                                                    {targetTweetId && sourceUrl.includes(targetTweetId) && (
                                                        <div className="absolute right-4 top-9 text-xs font-bold text-gray-400 pointer-events-none">LOCKED</div>
                                                    )}
                                                </div>
                                                <div>
                                                    <label className="text-black font-bold text-xs lowercase mb-1 block">likes threshold</label>
                                                    <div className="flex gap-2 mb-2">
                                                        {['10000', '50000', '100000', '500000', '1000000'].map((val) => (
                                                            <button
                                                                key={val}
                                                                onClick={() => setMetricThreshold(val)}
                                                                className={`px-3 py-1.5 border-2 border-black rounded-lg text-xs font-black transition-all ${metricThreshold === val
                                                                    ? 'bg-[#FFD600] text-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] -translate-y-0.5'
                                                                    : 'bg-white text-black hover:bg-gray-100'}`}
                                                            >
                                                                {(parseInt(val) / 1000)}k
                                                            </button>
                                                        ))}
                                                    </div>
                                                    <input
                                                        type="text"
                                                        placeholder="10,000"
                                                        className="w-full bg-white border-2 border-black rounded-xl py-3 px-3 font-bold text-black outline-none focus:shadow-[2px_2px_0px_0px_#F492B7] transition-all placeholder:text-gray-300 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                                        value={metricThreshold ? parseInt(metricThreshold).toLocaleString() : ''}
                                                        onChange={(e) => {
                                                            const val = e.target.value.replace(/,/g, '');
                                                            if (!isNaN(Number(val))) {
                                                                setMetricThreshold(val);
                                                            }
                                                        }}
                                                    />
                                                </div>
                                            </div>
                                        )}

                                        {/* 7-day limit notice */}
                                        <div className="flex items-center gap-2 bg-black/5 rounded-lg px-3 py-2">
                                            <span className="text-sm">⏰</span>
                                            <p className="text-xs font-bold text-black/60 lowercase">twitter markets are limited to 7 days max (API constraint)</p>
                                        </div>
                                    </div>
                                )}

                                {/* Outcomes with Custom Color Menu */}
                                <div>
                                    <div className="flex justify-between items-center mb-4">
                                        <label className="text-black font-black lowercase tracking-tight">Outcomes & Colors</label>
                                        {marketType === 'multiple' && (
                                            <button onClick={addOption} className="text-black bg-[#FFA07A] border-2 border-black px-3 py-1.5 rounded-lg text-xs font-black uppercase shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:translate-y-[-1px] active:translate-y-0 active:shadow-none transition-all">
                                                + Add
                                            </button>
                                        )}
                                    </div>

                                    <div className="space-y-3">
                                        {options.map((option, index) => (
                                            <div key={option.id} className="flex items-center gap-3 animate-in fade-in slide-in-from-left-4 duration-300">

                                                {/* LEFT: Color Picker (Click to Toggle) */}
                                                <div className="relative shrink-0">
                                                    {/* The Trigger Swatch (No Number) */}
                                                    <div
                                                        className="w-12 h-12 rounded-xl border-2 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] shrink-0 cursor-pointer hover:-translate-y-0.5 transition-transform flex items-center justify-center"
                                                        style={{ backgroundColor: option.color }}
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setActiveColorPicker(activeColorPicker === index ? null : index);
                                                        }}
                                                    >
                                                    </div>

                                                    {/* The Mini Menu (Toggle on Click) */}
                                                    {activeColorPicker === index && (
                                                        <div className="absolute bottom-full left-0 mb-2 flex flex-wrap gap-1 p-2 bg-white border-2 border-black rounded-xl shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] w-40 z-50 animate-in fade-in zoom-in-95 duration-200">
                                                            {COLORS.map((c) => (
                                                                <button
                                                                    key={c}
                                                                    className="w-8 h-8 rounded-lg border-2 border-black hover:scale-110 transition-transform"
                                                                    style={{ backgroundColor: c }}
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        const newOpts = [...options];
                                                                        newOpts[index].color = c;
                                                                        setOptions(newOpts);
                                                                        setActiveColorPicker(null); // Close after select
                                                                    }}
                                                                />
                                                            ))}
                                                            {/* Close Trigger (Optional) */}
                                                            <div className="fixed inset-0 z-[-1]" onClick={() => setActiveColorPicker(null)} />
                                                        </div>
                                                    )}

                                                    {/* Backdrop to close menu when clicking outside (Local) */}
                                                    {activeColorPicker === index && (
                                                        <div className="fixed inset-0 z-40 bg-transparent" onClick={() => setActiveColorPicker(null)} />
                                                    )}
                                                </div>

                                                {/* MIDDLE: Outcome Name Input */}
                                                <input
                                                    type="text"
                                                    placeholder={`Option ${index + 1}`}
                                                    className="flex-1 bg-white border-2 border-black rounded-xl py-3 px-4 font-bold text-black outline-none focus:shadow-[2px_2px_0px_0px_#F492B7] transition-all placeholder:text-gray-300"
                                                    value={option.name}
                                                    onChange={(e) => {
                                                        const newOpts = [...options];
                                                        newOpts[index].name = e.target.value;
                                                        setOptions(newOpts);
                                                    }}
                                                />

                                                {/* RIGHT: Delete Button */}
                                                {marketType === 'multiple' && options.length > 3 && (
                                                    <button
                                                        onClick={() => setOptions(options.filter((_, i) => i !== index))}
                                                        className="w-10 h-10 flex items-center justify-center text-black bg-red-100 border-2 border-black rounded-xl hover:bg-red-200 transition-colors shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:translate-y-[2px] active:shadow-none shrink-0"
                                                    >
                                                        <TrashIcon />
                                                    </button>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* Error */}
                                {error && (
                                    <div className="bg-red-50 border-2 border-red-500 text-red-600 font-bold p-4 rounded-xl">
                                        {error}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Footer / Submit */}
                        <div className="p-6 md:p-8 pt-4 bg-white border-t-4 border-black z-20">
                            <button
                                onClick={handleCreateMarket}
                                disabled={isLoading}
                                className="w-full py-5 bg-[#10B981] border-2 border-black rounded-xl font-black text-2xl uppercase text-black hover:bg-[#34d399] hover:-translate-y-1 hover:shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] active:translate-y-0 active:shadow-none disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
                            >
                                {isLoading ? (
                                    <>
                                        <Loader2 className="animate-spin w-6 h-6" /> creating...
                                    </>
                                ) : (
                                    'Create Market'
                                )}
                            </button>
                        </div>
                    </>
                )}
            </div>

            <TwitterWarningModal
                isOpen={showTwitterWarning}
                onClose={() => {
                    setShowTwitterWarning(false);
                    // If they cancel, revert category
                    if (!twitterWarningAccepted) {
                        setSelectedCategory('Crypto');
                    }
                }}
                onAccept={() => {
                    setTwitterWarningAccepted(true);
                    setShowTwitterWarning(false);
                }}
            />

            <AchievementToast achievements={newAchievements} onClose={() => setNewAchievements([])} />
        </div>
    );
}