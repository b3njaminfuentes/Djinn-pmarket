'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { SharePositionCard } from '@/components/social/SharePositionCard';
import { WinningClaimModal } from '@/components/social/WinningClaimModal';
import {
    ChevronLeft,
    ChevronDown,
    Clock,
    TrendingUp,
    TrendingDown,
    ArrowUp,
    ArrowDown,
    Wallet,
    Radio,
    Share2,
    Bookmark,
    CheckCircle2,
    XCircle,
    Activity,
    Scale,
    Trophy,
    Users,
    MessageCircle,
    Star,
    ExternalLink,
    Filter
} from 'lucide-react';
import { Liveline } from 'liveline';
import type { LivelinePoint } from 'liveline';
import dynamic from 'next/dynamic';
import { useBinancePrice } from '@/hooks/useBinancePrice';
import LiveTicker from '@/components/LiveTicker';
import CommentsSection from '@/components/market/CommentsSection';
import { formatCompact } from '@/lib/utils';
import { getOutcomeColor } from '@/lib/market-colors';
import { AnimatedNumber } from '@/components/AnimatedNumber';
import { useChronosProgram, deriveChronosMarketKey } from '@/hooks/useChronosProgram';

import StarfieldBg from '@/components/StarfieldBg';

// ═══════════════════════════════════════════════════════════════════════════════
// CONFIG
// ═══════════════════════════════════════════════════════════════════════════════

const ASSETS = {
    btc: { name: 'Bitcoin', symbol: 'BTC', icon: 'https://cryptologos.cc/logos/bitcoin-btc-logo.png', color: '#F7931A', defaultPrice: 97000 },
    eth: { name: 'Ethereum', symbol: 'ETH', icon: 'https://cryptologos.cc/logos/ethereum-eth-logo.png', color: '#627EEA', defaultPrice: 2700 },
    sol: { name: 'Solana', symbol: 'SOL', icon: 'https://cryptologos.cc/logos/solana-sol-logo.png', color: '#000000', defaultPrice: 195 },
};

// ═══════════════════════════════════════════════════════════════════════════════
// COUNTDOWN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

function BigCountdown({ endTime }: { endTime: number }) {
    const [timeLeft, setTimeLeft] = useState({ days: 0, hours: 0, minutes: 0, seconds: 0 });

    useEffect(() => {
        const update = () => {
            const diff = Math.max(0, endTime - Date.now());
            setTimeLeft({
                days: Math.floor(diff / (1000 * 60 * 60 * 24)),
                hours: Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)),
                minutes: Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60)),
                seconds: Math.floor((diff % (1000 * 60)) / 1000),
            });
        };
        update();
        const interval = setInterval(update, 1000);
        return () => clearInterval(interval);
    }, [endTime]);

    return (
        <div className="flex items-baseline gap-1 text-rose-500">
            {timeLeft.days > 0 && <span className="text-4xl font-black font-mono tracking-tighter">{timeLeft.days}<span className="text-xs font-bold font-mono text-rose-300 mr-2 ml-1 align-top">D</span></span>}
            {(timeLeft.days > 0 || timeLeft.hours > 0) && <span className="text-4xl font-black font-mono tracking-tighter">{String(timeLeft.hours).padStart(2, '0')}<span className="text-xs font-bold font-mono text-rose-300 mr-2 ml-1 align-top">H</span></span>}
            <span className="text-4xl font-black font-mono tracking-tighter">{String(timeLeft.minutes).padStart(2, '0')}</span>
            <span className="text-xs font-bold font-mono text-rose-300 mr-2 ml-1 align-top">M</span>
            <span className="text-4xl font-black font-mono tracking-tighter">{String(timeLeft.seconds).padStart(2, '0')}</span>
            <span className="text-xs font-bold font-mono text-rose-300 ml-1 align-top">S</span>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TRADE PANEL (Neo-Brutalist)
// ═══════════════════════════════════════════════════════════════════════════════

const TradePanel = ({ isAbove, onTrade, currentPool, marketState }: { isAbove: boolean, onTrade: (amount: string, side: 'YES' | 'NO') => void, currentPool: number, marketState?: any }) => {
    const [tradeMode, setTradeMode] = useState<'BUY' | 'SELL'>('BUY');
    const [selectedSide, setSelectedSide] = useState<'YES' | 'NO'>(isAbove ? 'YES' : 'NO');
    const [amount, setAmount] = useState('');
    const [isSuccess, setIsSuccess] = useState(false);

    // Mock balance for percentage buttons
    const mockBalance = 10; // SOL - replace with real wallet balance

    const handleTrade = async () => {
        if (!amount) return;
        try {
            // Call parent function to execute trade on chain - wait for confirmation
            await onTrade(amount, selectedSide);
            // Only show success AFTER blockchain confirms
            setIsSuccess(true);
            setTimeout(() => {
                setIsSuccess(false);
                setAmount('');
            }, 2000);
        } catch (error) {
            console.error('Trade failed:', error);
            // Don't show success if it failed
        }
    };

    const setPercentage = (pct: number) => {
        const val = (mockBalance * pct / 100).toFixed(2);
        setAmount(val);
    };

    return (
        <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="bg-white rounded-[2rem] border-4 border-black p-6 shadow-[10px_10px_0px_0px_rgba(0,0,0,1)] relative overflow-hidden"
        >
            {/* Header Gradient */}
            <div className="w-full flex flex-col items-center px-6 py-8 rounded-3xl bg-gradient-to-br from-[#FF92C6] via-[#FFB6C1] to-[#F492CC] border-4 border-black shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] relative overflow-hidden mb-8 group/pool">
                <span className="text-[10px] font-black uppercase tracking-[0.4em] text-black/80 mb-2 relative z-10">Total Locked</span>
                <div className="flex items-baseline gap-2 relative z-10">
                    <span className="text-5xl font-black text-black tracking-tighter drop-shadow-sm">
                        <AnimatedNumber value={currentPool} decimals={2} className="inline" />
                    </span>
                    <span className="text-2xl font-black text-white drop-shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">SOL</span>
                </div>
            </div>

            {/* Buy/Sell Toggles */}
            <div className="mb-6 p-1.5 bg-gray-100 border-4 border-black rounded-2xl flex gap-1.5 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
                <button onClick={() => setTradeMode('BUY')} className={`flex-1 py-3 rounded-xl text-[10px] font-black tracking-widest uppercase transition-all border-2 ${tradeMode === 'BUY' ? 'bg-emerald-400 text-black border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] -translate-y-0.5' : 'text-black/40 border-transparent bg-transparent hover:text-black'}`}>BUY</button>
                <button onClick={() => setTradeMode('SELL')} className={`flex-1 py-3 rounded-xl text-[10px] font-black tracking-widest uppercase transition-all border-2 ${tradeMode === 'SELL' ? 'bg-rose-400 text-black border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] -translate-y-0.5' : 'text-black/40 border-transparent bg-transparent hover:text-black'}`}>SELL</button>
            </div>

            {/* Side Selector */}
            <div className="flex gap-3 mb-6">
                <button
                    onClick={() => setSelectedSide('YES')}
                    className={`flex-1 py-4 rounded-xl text-sm font-bold transition-all border-4 relative overflow-hidden shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] active:shadow-none flex items-center justify-center gap-2 ${selectedSide === 'YES'
                        ? 'bg-emerald-400 text-black border-black -translate-y-1'
                        : 'bg-white text-black border-black hover:bg-emerald-50'
                        }`}
                >
                    <svg width="14" height="14" viewBox="0 0 12 12" fill="none"><path d="M6 2L10 7H2L6 2Z" fill="currentColor" /></svg>
                    up
                </button>
                <button
                    onClick={() => setSelectedSide('NO')}
                    className={`flex-1 py-4 rounded-xl text-sm font-bold transition-all border-4 relative overflow-hidden shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] active:shadow-none flex items-center justify-center gap-2 ${selectedSide === 'NO'
                        ? 'bg-rose-400 text-black border-black -translate-y-1'
                        : 'bg-white text-black border-black hover:bg-rose-50'
                        }`}
                >
                    <svg width="14" height="14" viewBox="0 0 12 12" fill="none"><path d="M6 10L2 5H10L6 10Z" fill="currentColor" /></svg>
                    down
                </button>
            </div>

            {/* Input */}
            <div className="bg-white rounded-2xl border-4 border-black p-5 mb-4 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]">
                <label className="text-[9px] font-black uppercase text-black/40 tracking-widest mb-3 block">Amount</label>
                <div className="flex items-center gap-3">
                    <input
                        type="number"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        className="bg-transparent text-4xl font-black text-black w-full outline-none placeholder-gray-200 tracking-tighter tabular-nums no-spinner"
                        placeholder="0.00"
                    />
                    <span className="text-xs font-black bg-black text-white px-2 py-1 rounded">SOL</span>
                </div>
            </div>

            {/* Percentage Buttons (SELL ONLY) */}
            {tradeMode === 'SELL' && (
                <div className="flex gap-2 mb-6">
                    {[25, 50, 75, 100].map((pct) => (
                        <button
                            key={pct}
                            onClick={() => setPercentage(pct)}
                            className="flex-1 py-2 rounded-lg border-2 border-black text-[10px] font-black uppercase tracking-wider bg-gray-50 hover:bg-black hover:text-white transition-all active:scale-95 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:shadow-none"
                        >
                            {pct === 100 ? 'max' : `${pct}%`}
                        </button>
                    ))}
                </div>
            )}

            {/* Execute Action */}
            <motion.button
                whileHover={{ scale: 1.02, y: -2 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleTrade}
                className={`w-full py-5 rounded-2xl font-black text-lg uppercase tracking-[0.2em] shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] hover:shadow-[10px_10px_0px_0px_rgba(0,0,0,1)] active:shadow-none transition-all border-4 border-black ${isSuccess ? 'bg-emerald-500 text-white' : 'bg-black text-white hover:bg-[#F492B7] hover:text-black'}`}
            >
                {isSuccess ? 'CONFIRMED!' : (!amount ? 'ENTER AMOUNT' : 'EXECUTE TRADE')}
            </motion.button>

            {/* WARN: NO COUNTERPARTY */}
            {marketState && (() => {
                const supplyUp = marketState.outcomeSupplies ? marketState.outcomeSupplies[0].toString() : '0';
                const supplyDown = marketState.outcomeSupplies ? marketState.outcomeSupplies[1].toString() : '0';
                const noUp = supplyUp === '0';
                const noDown = supplyDown === '0';
                const total = supplyUp !== '0' || supplyDown !== '0';

                if (total && (noUp || noDown)) {
                    const missingSide = noUp ? 'UP' : 'DOWN';
                    const mySide = selectedSide;
                    const isRisk = (mySide === 'YES' && noDown) || (mySide === 'NO' && noUp); // YES=UP, NO=DOWN?
                    // Verify Side Mapping: YES button sets selectedSide='YES'. Contract outcome 0.
                    // NO button sets selectedSide='NO'. Contract outcome 1.
                    // If I buy YES (UP), I need someone on NO (DOWN).
                    // If supplyDown (outcome 1) is 0, then I have no counterparty.

                    if (isRisk) {
                        return (
                            <div className="mt-4 p-3 bg-amber-50 border-2 border-amber-200 rounded-xl flex items-start gap-3">
                                <div className="text-amber-500 mt-0.5">⚠️</div>
                                <div>
                                    <h4 className="text-[10px] font-black uppercase text-amber-600 mb-1">No Counterparty Liquidity</h4>
                                    <p className="text-xs text-amber-700 leading-relaxed font-medium">
                                        There is currently <strong>0 {missingSide}</strong> liquidity.
                                        If you buy {mySide} now and no one buys {missingSide} before end,
                                        you will receive a <strong>REFUND</strong> (minus fees).
                                        You are betting against yourself!
                                    </p>
                                </div>
                            </div>
                        );
                    }
                }
                return null;
            })()}
        </motion.div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MARKET FINISHED PANEL (For Past/Ended Rounds)
// ═══════════════════════════════════════════════════════════════════════════════

function MarketFinishedPanel({
    round,
    assetName,
    assetIcon,
    userPosition,
    onClaim,
    onShare,
}: {
    round: RoundData;
    assetName: string;
    assetIcon: string;
    userPosition?: { side: 'UP' | 'DOWN'; shares: number; potentialWin: number } | null;
    onClaim?: () => void;
    onShare?: () => void;
}) {
    const isUp = round.result === 'UP';
    const outcomeColor = isUp ? 'text-emerald-500' : 'text-rose-500';
    const outcomeBg = isUp ? 'bg-emerald-50 border-emerald-200' : 'bg-rose-50 border-rose-200';

    // Check for Refund Scenario (One-sided betting)
    const isRefund = round.upPool !== undefined && round.downPool !== undefined && (
        (round.upPool > 0 && round.downPool === 0) ||
        (round.downPool > 0 && round.upPool === 0)
    );

    // Check if user won based on their position
    // If Refund: Everyone gets back their SOL (User "Wins" refund)
    const userWon = userPosition && (
        isRefund ||
        (userPosition.side === 'UP' && isUp) ||
        (userPosition.side === 'DOWN' && !isUp)
    );

    const isRefundUI = isRefund && userPosition; // Show refund UI if user participated

    return (
        <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="bg-white rounded-[2rem] border-4 border-black p-6 shadow-[10px_10px_0px_0px_rgba(0,0,0,1)] relative overflow-hidden"
        >
            {/* Header */}
            <div className="flex items-center gap-3 mb-6">
                <img src={assetIcon} className="w-10 h-10" alt={assetName} />
                <div>
                    <h3 className="text-lg font-black uppercase tracking-tighter text-black">
                        {isRefund ? "Market Refunded" : "Market Finished"}
                    </h3>
                    <p className="text-xs text-gray-500 font-semibold">{round.time}</p>
                </div>
            </div>

            {/* Outcome Badge */}
            <div className={`rounded-2xl border-2 ${isRefund ? 'bg-indigo-50 border-indigo-200' : outcomeBg} p-6 flex flex-col items-center justify-center`}>
                <div className={`w-16 h-16 rounded-full ${isRefund ? 'bg-indigo-500' : (isUp ? 'bg-emerald-500' : 'bg-rose-500')} flex items-center justify-center mb-4`}>
                    {isRefund ? (
                        <Scale className="w-8 h-8 text-white" />
                    ) : (
                        isUp ? <ArrowUp className="w-8 h-8 text-white" /> : <ArrowDown className="w-8 h-8 text-white" />
                    )}
                </div>
                <h2 className={`text-3xl font-black ${isRefund ? 'text-indigo-600' : outcomeColor}`}>
                    Outcome: {isRefund ? 'REFUND' : round.result}
                </h2>
                <p className="text-sm text-gray-600 mt-2 text-center font-medium">
                    {isRefund ? (
                        "No opposing bets. All funds returned."
                    ) : (
                        `${assetName} Up or Down - ${round.time}`
                    )}
                </p>
            </div>

            {/* Price Details */}
            <div className="mt-6 grid grid-cols-2 gap-4">
                <div className="bg-gray-50 rounded-xl p-4 border-2 border-gray-200">
                    <p className="text-[10px] font-black uppercase text-gray-400 mb-1">Price to Beat</p>
                    <p className="text-lg font-black text-black tabular-nums">
                        ${round.strikePrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </p>
                </div>
                <div className="bg-gray-50 rounded-xl p-4 border-2 border-gray-200">
                    <p className="text-[10px] font-black uppercase text-gray-400 mb-1">Final Price</p>
                    <p className={`text-lg font-black tabular-nums ${outcomeColor}`}>
                        ${round.endPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </p>
                </div>
            </div>

            {/* User Holdings & Claim Section */}
            {userPosition && (
                <div className={`mt-6 rounded-2xl border-2 p-5 ${userWon ? (isRefundUI ? 'bg-indigo-50 border-indigo-300' : 'bg-emerald-50 border-emerald-300') : 'bg-rose-50 border-rose-300'}`}>
                    <div className="flex items-center justify-between mb-4">
                        <div>
                            <p className="text-[10px] font-black uppercase text-gray-500">Your Position</p>
                            <p className={`text-xl font-black ${isRefundUI ? 'text-indigo-600' : (userPosition.side === 'UP' ? 'text-emerald-600' : 'text-rose-600')}`}>
                                {userPosition.shares.toFixed(2)} {userPosition.side} Shares
                            </p>
                        </div>
                        <div className={`w-12 h-12 rounded-full ${userWon ? (isRefundUI ? 'bg-indigo-500' : 'bg-emerald-500') : 'bg-rose-500'} flex items-center justify-center`}>
                            {userWon ? (
                                isRefundUI ? <Scale className="w-6 h-6 text-white" /> : <Trophy className="w-6 h-6 text-white" />
                            ) : (
                                <XCircle className="w-6 h-6 text-white" />
                            )}
                        </div>
                    </div>

                    {userWon ? (
                        <>
                            <div className="bg-white/60 rounded-xl p-4 mb-4">
                                <p className="text-[10px] font-black uppercase text-indigo-600 mb-1">
                                    {isRefundUI ? "♻️ Refund Available" : "🎉 You Won!"}
                                </p>
                                <p className={`text-lg font-bold ${isRefundUI ? 'text-indigo-700' : 'text-emerald-700'} tabular-nums leading-tight`}>
                                    {isRefundUI
                                        ? "Redeeming your SOL..."
                                        : `+${userPosition.potentialWin.toFixed(4)} SOL`
                                    }
                                </p>
                            </div>
                            <div className="flex gap-3">
                                <button
                                    onClick={onClaim}
                                    className={`flex-1 ${isRefundUI ? 'bg-indigo-500 hover:bg-indigo-600' : 'bg-emerald-500 hover:bg-emerald-600'} text-white font-black py-4 rounded-xl transition-all uppercase tracking-wider text-sm shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] active:translate-y-1 active:shadow-none`}
                                >
                                    {isRefundUI ? "Claim Refund" : "Claim Winnings"}
                                </button>
                                <button
                                    onClick={onShare}
                                    className="bg-black hover:bg-gray-800 text-white font-black py-4 px-6 rounded-xl transition-all shadow-[4px_4px_0px_0px_rgba(100,100,100,0.3)] hover:shadow-[6px_6px_0px_0px_rgba(100,100,100,0.3)]"
                                >
                                    <Share2 className="w-5 h-5" />
                                </button>
                            </div>
                        </>
                    ) : (
                        <div className="bg-white/60 rounded-xl p-4">
                            <p className="text-[10px] font-black uppercase text-rose-600 mb-1">Better luck next time</p>
                            <p className="text-sm text-gray-600">Your position was on {userPosition.side}, but the market closed {round.result}.</p>
                        </div>
                    )}
                </div>
            )}

            {/* No Position Message */}
            {!userPosition && (
                <div className="mt-6 bg-gray-50 rounded-xl p-4 border-2 border-gray-200 text-center">
                    <p className="text-sm text-gray-500">You didn't participate in this round.</p>
                </div>
            )}

            {/* Disclaimer */}
            <p className="text-xs text-gray-500 text-center mt-6">
                By trading, you agree to the <span className="underline cursor-pointer">Terms of Use</span>.
            </p>
        </motion.div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PAST ROUNDS SELECTOR & DETAILS
// ═══════════════════════════════════════════════════════════════════════════════

interface RoundData {
    id: number;
    time: string;
    isWin: boolean;
    result: string;
    strikePrice: number;
    endPrice: number;
    status: 'LIVE' | 'ENDED';
    upPool?: number;
    downPool?: number;
    totalPool?: number;
    startTime?: number;
    endTime?: number;
}

function RoundSelector({
    rounds,
    selectedRoundId,
    onSelect
}: {
    rounds: RoundData[],
    selectedRoundId: number,
    onSelect: (id: number) => void
}) {
    const [showPastDropdown, setShowPastDropdown] = useState(false);
    const selectedRound = rounds.find( (r: any) => r.id === selectedRoundId);
    const liveRound = rounds.find( (r: any) => r.status === 'LIVE');
    const pastRounds = rounds.filter( (r: any) => r.status === 'ENDED').slice(0, 10);

    // Generate time slot labels for nearby rounds
    const formatSlotLabel = (round: RoundData) => {
        // Extract time from time string like "9:45 PM — 10:00 PM"
        // Show full time including minutes (e.g., "9:45 PM" for 15m intervals)
        const match = round.time.match(/(\d+):(\d+)\s*(AM|PM)/i);
        if (match) {
            const [, hour, minute, period] = match;
            // For 15-minute intervals, show hour:minute format
            // For hourly intervals, just show hour
            if (minute === '00') {
                return `${hour} ${period.toUpperCase()}`;
            }
            return `${hour}:${minute} ${period.toUpperCase()}`;
        }
        return `R${round.id}`;
    };

    return (
        <div className="mt-6">
            {/* Bottom Bar - Time Slots & Past Dropdown */}
            <div className="flex items-center gap-3 flex-wrap">
                {/* Past Dropdown */}
                <div className="relative">
                    <button
                        onClick={() => setShowPastDropdown(!showPastDropdown)}
                        className="flex items-center gap-2 px-4 py-2.5 bg-white border-2 border-black rounded-full text-xs font-black uppercase tracking-wider shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] hover:shadow-[5px_5px_0px_0px_rgba(0,0,0,1)] transition-all"
                    >
                        Past
                        <ChevronDown className="w-3 h-3" />
                    </button>

                    {/* Dropdown */}
                    <AnimatePresence>
                        {showPastDropdown && (
                            <motion.div
                                initial={{ opacity: 0, y: -10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -10 }}
                                className="absolute bottom-full left-0 mb-2 bg-white border-2 border-black rounded-2xl shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] min-w-[200px] max-h-[300px] overflow-y-auto z-50"
                            >
                                {pastRounds.length === 0 ? (
                                    <div className="p-4 text-center text-gray-400 text-xs">No past rounds yet</div>
                                ) : (
                                    pastRounds.map((round) => (
                                        <button
                                            key={round.id}
                                            onClick={() => {
                                                onSelect(round.id);
                                                setShowPastDropdown(false);
                                            }}
                                            className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors border-b border-black/5 last:border-b-0"
                                        >
                                            {/* Result Icon */}
                                            <div className={`w-5 h-5 rounded-full flex items-center justify-center ${round.isWin ? 'bg-emerald-500' : 'bg-rose-500'}`}>
                                                {round.isWin ? (
                                                    <TrendingUp className="w-3 h-3 text-white" />
                                                ) : (
                                                    <TrendingDown className="w-3 h-3 text-white" />
                                                )}
                                            </div>
                                            {/* Time & Date */}
                                            <div className="text-left">
                                                <span className="block text-sm font-black text-black">{round.time.split(' — ')[0]}</span>
                                                <span className="block text-[10px] text-gray-400">Today</span>
                                            </div>
                                        </button>
                                    ))
                                )}
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>

                {/* Result Mini-Icons (Last 4) */}
                <div className="flex items-center gap-1 px-2">
                    {pastRounds.slice(0, 4).map((round, i) => (
                        <div
                            key={round.id}
                            className={`w-6 h-6 rounded-full flex items-center justify-center cursor-pointer transition-all hover:scale-110 ${round.isWin ? 'bg-emerald-100 text-emerald-600' : 'bg-rose-100 text-rose-600'}`}
                            onClick={() => onSelect(round.id)}
                            title={`Round #${round.id}: ${round.result}`}
                        >
                            {round.isWin ? (
                                <TrendingUp className="w-3 h-3" />
                            ) : (
                                <TrendingDown className="w-3 h-3" />
                            )}
                        </div>
                    ))}
                </div>

                {/* Divider */}
                <div className="h-6 w-px bg-black/10" />

                {/* Time Slot Buttons (Chronological: past ← live → future) */}
                {[...rounds]
                    .filter( (r: any) => r.result !== 'FUTURE') // Exclude future slots from main bar for now
                    .sort((a: any, b: any) => a.id - b.id) // Oldest on left, newest on right
                    .slice(-5) // Show last 5 (most recent)
                    .map((round) => {
                        const isSelected = selectedRoundId === round.id;
                        const isLiveRound = round.status === 'LIVE' && round.result === 'LIVE';

                        return (
                            <button
                                key={round.id}
                                onClick={() => onSelect(round.id)}
                                className={`flex items-center gap-1.5 px-4 py-2.5 rounded-full text-xs font-black uppercase tracking-wider transition-all border-2 ${isSelected
                                    ? 'bg-black text-white border-black shadow-[3px_3px_0px_0px_rgba(0,0,0,0.2)]'
                                    : 'bg-white text-black border-black/20 hover:border-black'
                                    }`}
                            >
                                {/* Red dot ONLY on actual live round */}
                                {isLiveRound && <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />}
                                {formatSlotLabel(round)}
                            </button>
                        );
                    })}

                {/* More Dropdown (if more than 5 rounds) */}
                {rounds.length > 5 && (
                    <button className="flex items-center gap-1 px-4 py-2.5 bg-white border-2 border-black/20 rounded-full text-xs font-black uppercase tracking-wider hover:border-black transition-all">
                        More
                        <ChevronDown className="w-3 h-3" />
                    </button>
                )}
            </div>

            {/* Selected Round Detail View */}
            <AnimatePresence mode="wait">
                {selectedRound && selectedRound.status === 'ENDED' && (
                    <motion.div
                        key={selectedRound.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="mt-4 bg-white border-2 border-black rounded-2xl p-6 relative overflow-hidden shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]"
                    >
                        <div className="relative z-10">
                            <h4 className="text-black text-[10px] font-black uppercase tracking-widest mb-4 border-b-2 border-black/5 pb-2">
                                Round #{selectedRound.id} Analysis
                            </h4>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-sm">
                                <div>
                                    <span className="block text-gray-400 text-[9px] font-black uppercase tracking-widest mb-1">Target Price</span>
                                    <span className="font-mono font-bold text-lg">${selectedRound.strikePrice.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                                </div>
                                <div>
                                    <span className="block text-gray-400 text-[9px] font-black uppercase tracking-widest mb-1">Settle Price</span>
                                    <span className={`font-mono font-bold text-lg ${selectedRound.isWin ? 'text-emerald-500' : 'text-rose-500'}`}>
                                        ${selectedRound.endPrice.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                                    </span>
                                </div>
                                <div>
                                    <span className="block text-gray-400 text-[9px] font-black uppercase tracking-widest mb-1">Result</span>
                                    <span className={`font-black text-lg ${selectedRound.isWin ? 'text-emerald-500' : 'text-rose-500'}`}>
                                        {selectedRound.result}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════════
// CUSTOM TOOLTIP (UTC)
// ═══════════════════════════════════════════════════════════════════════════════

const CustomTooltip = ({ active, payload, label, assetIcon }: any) => {
    if (active && payload && payload.length) {
        const date = new Date(label); // timestamp
        // Format UTC
        const utcDate = date.toUTCString().slice(0, 22); // e.g. "Mon, 09 Feb 2026 01:00"

        return (
            <div className="bg-white border-2 border-black rounded-xl p-4 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
                <div className="flex items-center gap-2 mb-2">
                    <img src={assetIcon} className="w-5 h-5" alt="" />
                    <span className="text-[10px] font-black uppercase tracking-widest text-gray-500">{utcDate} UTC</span>
                </div>
                <div className="text-xl font-black text-black tabular-nums tracking-tighter">
                    ${Number(payload[0].value).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </div>
            </div>
        );
    }
    return null;
};

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════════════════════

export default function ChronosMarketPage() {
    const params = useParams();
    const marketId = params.marketId as string; // e.g., btc-15m-105

    // Parse market ID (Client Side)
    const [assetKey, intervalRaw, roundStr] = marketId?.split('-') || ['btc', '15m', '1'];
    const asset = ASSETS[assetKey as keyof typeof ASSETS] || ASSETS.btc;
    const currentRoundNumber = parseInt(roundStr) || 1;
    const interval = intervalRaw.toLowerCase();

    // Terminology
    const isMajor = ['BTC', 'ETH', 'SOL'].includes(asset.symbol);
    const labels = isMajor ? { up: 'UP', down: 'DOWN' } : { up: 'YES', down: 'NO' };

    // Real-Time Price
    const hookInterval = (['15m', '1h', '4h', '24h', '1w'].includes(interval) ? interval : '15m') as '15m' | '1h' | '4h' | '24h' | '1w';
    const hookSymbol = asset.symbol as 'BTC' | 'ETH' | 'SOL';
    const { price: currentPrice, history: priceHistory, candles, isLoadingHistory } = useBinancePrice(
        hookSymbol,
        hookInterval
    );

    // BLOCKCHAIN HOOK
    const { buyShares, claimWinnings, fetchMyPositions, isConnected } = useChronosProgram();
    const [realPositions, setRealPositions] = useState<any[]>([]);

    useEffect(() => {
        if (isConnected) {
            // Initial fetch
            fetchMyPositions().then(setRealPositions);

            // Poll every 10s for updates
            const intervalId = setInterval(() => {
                fetchMyPositions().then(setRealPositions);
            }, 10000);
            return () => clearInterval(intervalId);
        }
    }, [isConnected, fetchMyPositions]);

    // Timing
    const [endTime, setEndTime] = useState(0);
    const [priceToBeat, setPriceToBeat] = useState(0);

    const getDuration = useCallback((int: string) => {
        switch (int) {
            case '15m': return 15 * 60 * 1000;
            case '1h': return 60 * 60 * 1000;
            case '4h': return 4 * 60 * 60 * 1000;
            case '24h': return 24 * 60 * 60 * 1000;
            case '1w': return 7 * 24 * 60 * 60 * 1000;
            default: return 15 * 60 * 1000;
        }
    }, []);

    // Fetch the real candle open price from Binance at round start time
    useEffect(() => {
        const now = Date.now();
        const duration = getDuration(interval);
        const start = Math.floor(now / duration) * duration;
        const end = start + duration;
        setEndTime(end);

        // Fetch real open price from Binance for this round's start
        const fetchRealOpen = async () => {
            try {
                const binanceInterval: Record<string, string> = { '15m': '15m', '1h': '1h', '4h': '4h', '24h': '1d', '1w': '1w' };
                const bInterval = binanceInterval[interval] || '15m';
                const res = await fetch(`https://api.binance.com/api/v3/klines?symbol=${asset.symbol}USDT&interval=${bInterval}&startTime=${start}&limit=1`);
                const data = await res.json();
                if (data && data.length > 0) {
                    const openPrice = parseFloat(data[0][1]);
                    if (openPrice > 0) {
                        setPriceToBeat(openPrice);
                        return;
                    }
                }
            } catch (e) {
                console.warn('Failed to fetch candle open from Binance:', e);
            }
            // Fallback: use current price if fetch fails
            if (!priceToBeat && currentPrice > 0) {
                setPriceToBeat(currentPrice);
            }
        };

        if (!priceToBeat) {
            fetchRealOpen();
        }
    }, [interval, currentPrice, getDuration, priceToBeat, asset.symbol]);

    const effectivePriceToBeat = priceToBeat || currentPrice || asset.defaultPrice || 0;
    const effectiveCurrentPrice = currentPrice || asset.defaultPrice || priceToBeat || 0;
    const priceDiff = effectiveCurrentPrice - effectivePriceToBeat;
    const isAbove = priceDiff >= 0;
    const chartColor = isAbove ? '#10B981' : '#F43F5E';
    const priceChange = effectiveCurrentPrice - effectivePriceToBeat;

    // Rounds: Real Blockchain Data
    const { fetchAllMarkets } = useChronosProgram();
    const [rounds, setRounds] = useState<RoundData[]>([]);
    const [currentMarketState, setCurrentMarketState] = useState<any>(null);

    useEffect(() => {
        let mounted = true;
        const loadRounds = async () => {
            const allMarkets = await fetchAllMarkets();
            if (!mounted) return;

            // Filter for current asset & interval
            const intervalVal = interval === '1h' ? 1 : 0; // 0=15min, 1=1h
            const assetIndex = asset.symbol === 'BTC' ? 0 : asset.symbol === 'ETH' ? 1 : 2;

            const relevant = allMarkets.filter( (m: any) =>
                m.account.asset === assetIndex &&
                m.account.interval === intervalVal
            );

            // Find current active market logic
            const activeM = relevant.find( (m: any) => (m.account as any).roundNumber.toNumber() === currentRoundNumber);
            if (activeM) setCurrentMarketState(activeM.account);

            const mapped: RoundData[] = relevant.map( (m: any) => {
                const acc = m.account as any;
                const isResolved = acc.status.resolved !== undefined || (typeof acc.status === 'object' && 'resolved' in acc.status) || acc.status === 3;

                const isEnded = acc.winningOutcome !== null;
                const result = isEnded ? (acc.winningOutcome === 0 ? 'UP' : 'DOWN') : 'LIVE';

                const targetPrice = acc.targetPrice && acc.targetPrice.toNumber ? acc.targetPrice.toNumber() : (acc.targetPrice || 0);
                const finalPrice = acc.finalPrice ? (acc.finalPrice.toNumber ? acc.finalPrice.toNumber() : acc.finalPrice) : 0;

                const strike = targetPrice / 100;
                const endP = finalPrice / 100;

                // Dates
                const startTime = acc.startTime && acc.startTime.toNumber ? acc.startTime.toNumber() : (acc.startTime || 0);
                const endTime = acc.endTime && acc.endTime.toNumber ? acc.endTime.toNumber() : (acc.endTime || 0);

                const start = new Date(startTime * 1000);
                const end = new Date(endTime * 1000);
                const timeStr = `${start.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} — ${end.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;

                // Pool Data for Refund Logic
                const upSharesBN = acc.outcomeSupplies ? acc.outcomeSupplies[0] : null;
                const downSharesBN = acc.outcomeSupplies ? acc.outcomeSupplies[1] : null;
                const upShares = upSharesBN ? (upSharesBN.toNumber ? upSharesBN.toNumber() : Number(upSharesBN)) : 0;
                const downShares = downSharesBN ? (downSharesBN.toNumber ? downSharesBN.toNumber() : Number(downSharesBN)) : 0;

                const potBN = acc.totalPotAtResolution || acc.vaultBalance;
                const totalPot = potBN ? (potBN.toNumber ? potBN.toNumber() : Number(potBN)) : 0;

                return {
                    id: (acc.roundNumber && acc.roundNumber.toNumber ? acc.roundNumber.toNumber() : (acc.roundNumber || 0)),
                    time: timeStr,
                    isWin: acc.winningOutcome === 0,
                    result: result as 'UP' | 'DOWN' | 'LIVE',
                    status: isEnded ? 'ENDED' : 'LIVE',
                    strikePrice: strike,
                    endPrice: endP,
                    upPool: upShares,
                    downPool: downShares,
                    totalPool: totalPot / 1e9, // Store as SOL
                    startTime: startTime,
                    endTime: endTime
                };
            });

            // If empty (no chain data), mock current round
            if (mapped.length === 0) {
                const duration = getDuration(interval);
                const now = Date.now();
                const roundStart = Math.floor(now / duration) * duration;
                const roundEnd = roundStart + duration;
                const formatTime = (ts: number) => new Date(ts).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });

                mapped.push({
                    id: currentRoundNumber,
                    time: `${formatTime(roundStart)} — ${formatTime(roundEnd)}`,
                    isWin: isAbove,
                    result: 'LIVE',
                    status: 'LIVE',
                    strikePrice: effectivePriceToBeat,
                    endPrice: effectiveCurrentPrice,
                    startTime: roundStart / 1000,
                    endTime: roundEnd / 1000,
                });
            }

            // Sort desc
            mapped.sort((a: any, b: any) => b.id - a.id);
            setRounds(mapped);
        };

        if (isConnected) {
            loadRounds();
        } else {
            // Default mock if not connected
            const duration = getDuration(interval);
            const now = Date.now();
            const roundStart = Math.floor(now / duration) * duration;
            const roundEnd = roundStart + duration;
            const formatTime = (ts: number) => new Date(ts).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
            setRounds([{
                id: currentRoundNumber,
                time: `${formatTime(roundStart)} — ${formatTime(roundEnd)}`,
                isWin: isAbove, // this depends on live price
                result: 'LIVE',
                status: 'LIVE',
                strikePrice: effectivePriceToBeat,
                endPrice: effectiveCurrentPrice,
                startTime: roundStart / 1000,
                endTime: roundEnd / 1000,
            }]);
        }

        return () => { mounted = false; };
    }, [isConnected, fetchAllMarkets, interval, asset.symbol, currentRoundNumber, getDuration, isAbove, effectivePriceToBeat, effectiveCurrentPrice]);

    // === AUTO-REFRESH WHEN ROUND ENDS ===
    // Track live round number (can increment without URL change)
    const [liveRoundNumber, setLiveRoundNumber] = useState(currentRoundNumber);
    const [completedRounds, setCompletedRounds] = useState<RoundData[]>([]);

    useEffect(() => {
        if (!endTime || endTime <= 0) return;

        const now = Date.now();
        const timeUntilEnd = endTime - now;

        if (timeUntilEnd <= 0) {
            // Round already ended, trigger immediate transition
            handleRoundEnd();
            return;
        }

        // Schedule transition when timer ends
        const timeout = setTimeout(() => {
            handleRoundEnd();
        }, timeUntilEnd);

        return () => clearTimeout(timeout);

        function handleRoundEnd() {
            const duration = getDuration(interval);
            const oldRoundStart = Math.floor((Date.now() - 1000) / duration) * duration; // slight offset to get previous round
            const formatTime = (ts: number) => new Date(ts).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });

            // Save completed round to history
            const completedRound: RoundData = {
                id: liveRoundNumber,
                time: `${formatTime(oldRoundStart)} — ${formatTime(oldRoundStart + duration)}`,
                isWin: isAbove,
                result: isAbove ? 'UP' : 'DOWN',
                status: 'ENDED',
                strikePrice: effectivePriceToBeat,
                endPrice: effectiveCurrentPrice,
            };

            setCompletedRounds( (prev: any) => {
                // Avoid duplicates
                if (prev.some( (r: any) => r.id === completedRound.id)) return prev;
                return [completedRound, ...prev].slice(0, 20); // Keep last 20
            });

            // Transition to next round
            const newRoundStart = Math.floor(Date.now() / duration) * duration;
            const newRoundEnd = newRoundStart + duration;

            setLiveRoundNumber( (prev: any) => prev + 1);
            setEndTime(newRoundEnd);
            setPriceToBeat(0); // Reset to trigger re-fetch of new target price
        }
    }, [endTime, liveRoundNumber, interval, getDuration, isAbove, effectivePriceToBeat, effectiveCurrentPrice]);

    // Merge blockchain rounds with locally tracked completed rounds + generate mock past rounds
    const allRounds = useMemo(() => {
        const merged = [...rounds];
        completedRounds.forEach(cr => {
            if (!merged.some( (r: any) => r.id === cr.id)) {
                merged.push(cr);
            }
        });

        // Generate mock past rounds for the last 5 intervals (for demo/display)
        const duration = getDuration(interval);
        const now = Date.now();
        const currentSlot = Math.floor(now / duration);
        const formatTime = (ts: number) => new Date(ts).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });

        // Create past rounds using REAL Binance History if available
        if (candles && candles.length > 2) {
            // candles are sorted oldest to newest. last one is current open candle.
            // so we look backwards from length-2
            const lastCompleteIndex = candles.length - 2;

            for (let i = 0; i < 10; i++) { // expanded history to 10 rounds
                const idx = lastCompleteIndex - i;
                if (idx < 0) break;

                const candle = candles[idx];
                const pastRoundId = liveRoundNumber - (i + 1);

                // Skip if exists
                if (merged.some( (r: any) => r.id === pastRoundId)) continue;

                const isUp = candle.close >= candle.open;
                merged.push({
                    id: pastRoundId,
                    time: `${formatTime(candle.time)} — ${formatTime(candle.time + duration)}`,
                    isWin: isUp,
                    result: isUp ? 'UP' : 'DOWN',
                    status: 'ENDED',
                    strikePrice: candle.open,
                    endPrice: candle.close,
                    startTime: candle.time / 1000,
                    endTime: (candle.time + duration) / 1000
                });
            }
        } else {
            // Fallback: Generate deterministic mock past rounds (only if API fails)
            for (let i = 1; i <= 5; i++) {
                const slotStart = (currentSlot - i) * duration;
                const slotEnd = slotStart + duration;
                const pastRoundId = liveRoundNumber - i;

                if (merged.some( (r: any) => r.id === pastRoundId)) continue;

                const seed = pastRoundId * 12345 + 67890;
                const seededRandom1 = ((seed * 9301 + 49297) % 233280) / 233280;
                const seededRandom2 = (((seed * 2) * 9301 + 49297) % 233280) / 233280;

                let basePrice = asset.defaultPrice || 97000;
                const mockStrikePrice = basePrice + (seededRandom1 - 0.5) * basePrice * 0.003;
                const priceChange = (seededRandom2 - 0.5) * basePrice * 0.006;
                const mockEndPrice = mockStrikePrice + priceChange;
                const isUp = mockEndPrice >= mockStrikePrice;

                merged.push({
                    id: pastRoundId,
                    time: `${formatTime(slotStart)} — ${formatTime(slotEnd)}`,
                    isWin: isUp,
                    result: isUp ? 'UP' : 'DOWN',
                    status: 'ENDED',
                    strikePrice: mockStrikePrice,
                    endPrice: mockEndPrice,
                    startTime: slotStart / 1000,
                    endTime: slotEnd / 1000
                });
            }
        }

        // Add future time slots (not tradable yet)
        for (let i = 1; i <= 2; i++) {
            const slotStart = (currentSlot + i) * duration;
            const slotEnd = slotStart + duration;
            const futureRoundId = liveRoundNumber + i;

            if (!merged.some( (r: any) => r.id === futureRoundId)) {
                merged.push({
                    id: futureRoundId,
                    time: `${formatTime(slotStart)} — ${formatTime(slotEnd)}`,
                    isWin: false,
                    result: 'FUTURE',
                    status: 'LIVE', // Mark as "upcoming"
                    strikePrice: 0,
                    endPrice: 0,
                    startTime: slotStart / 1000,
                    endTime: slotEnd / 1000
                });
            }
        }

        merged.sort((a: any, b: any) => b.id - a.id);
        return merged;
    }, [rounds, completedRounds, getDuration, interval, liveRoundNumber, effectivePriceToBeat, asset.symbol, candles, asset.defaultPrice]);



    // Social Tabs State
    const [bottomTab, setBottomTab] = useState<'ACTIVITY' | 'COMMENTS' | 'HOLDERS'>('ACTIVITY');

    const [totalPool, setTotalPool] = useState(0);
    const [myTrades, setMyTrades] = useState<any[]>([]);
    const [showWinModal, setShowWinModal] = useState(false);
    const [lastWinAmount, setLastWinAmount] = useState(0);

    // Mock Win Trigger for Demo
    const triggerWinDemo = () => {
        setLastWinAmount(25.5);
        setShowWinModal(true);
    };

    useEffect(() => {
        setMyTrades([]);
        setTotalPool(0);
        setActivityList([]);
    }, [marketId]);

    // Activity & Holders - start empty, filled by real trades only
    const [activityList, setActivityList] = useState<any[]>([]);

    const [holders, setHolders] = useState<any>({
        'UP': [],
        'DOWN': []
    });

    // Handle Real Fake Trade -> NOW REAL BLOCKCHAIN TRADE
    const handleAddTrade = async (amount: string, side: 'YES' | 'NO') => {
        if (!isConnected) {
            alert("Please connect your wallet to trade!");
            return;
        }

        try {
            const intervalVal = (interval === '1h' || interval === '1H') ? 1
                : (interval === '24h' || interval === '24H' || interval === '1d' || interval === '1D') ? 2
                    : (interval === '1w' || interval === '1W') ? 3
                        : 0;
            const marketKey = deriveChronosMarketKey(asset.symbol, currentRoundNumber, intervalVal);

            // 0=UP/YES, 1=DOWN/NO
            const outcomeIndex = side === 'YES' ? 0 : 1; // Assuming 'YES' maps to UP (outcome 0)

            await buyShares(marketKey, outcomeIndex, parseFloat(amount));

            // Refresh positions
            const positions = await fetchMyPositions();
            setRealPositions(positions);

            // Optimistic UI updates
            const amt = parseFloat(amount);
            setTotalPool( (prev: any) => prev + amt); // This is just local view
            setMyTrades( (prev: any) => [...prev, {
                price: currentPrice,
                time: Date.now(),
                side
            }]);

        } catch (e) {
            console.error("Trade Failed", e);
            alert("Transaction Failed! check console.");
        }
    };

    // Selected Round View
    const [selectedRoundView, setSelectedRoundView] = useState<number>(currentRoundNumber);

    // Compute displayed prices based on selected round (past vs live)
    const selectedRoundData = allRounds.find( (r: any) => r.id === selectedRoundView);
    const isViewingPastRound = selectedRoundData && selectedRoundData.status === 'ENDED';

    // When viewing past round: use that round's strikePrice/endPrice
    // When viewing live round: use current live prices
    const displayedTargetPrice = isViewingPastRound && selectedRoundData
        ? selectedRoundData.strikePrice
        : effectivePriceToBeat;

    const displayedFinalPrice = isViewingPastRound && selectedRoundData
        ? selectedRoundData.endPrice
        : effectiveCurrentPrice;

    // Synthesize Chart Data for Past Rounds (or Mock Demo) - NOW FOR LIVE TOO
    const formattedChartData = useMemo(() => {
        if (selectedRoundData && selectedRoundData.startTime && selectedRoundData.endTime) {
            const start = selectedRoundData.startTime * 1000; // Convert to ms
            const end = selectedRoundData.endTime * 1000;     // Convert to ms

            // For live rounds, only chart up to NOW
            const now = Date.now();
            const isLive = selectedRoundData.status === 'LIVE' && end > now;
            const effectiveEnd = isLive ? now : end;

            const strike = selectedRoundData.strikePrice;
            const finalP = selectedRoundData.endPrice; // This is current price for LIVE


            const points = [];
            const steps = 40; // More points for smoother line
            const duration = effectiveEnd - start;
            if (duration <= 0) return [{ time: start, price: strike }]; // Safety

            const priceDiff = finalP - strike;

            // Generate seeded random walk
            for (let i = 0; i <= steps; i++) {
                const progress = i / steps;
                const time = Math.floor(start + duration * progress);

                // Linear Base
                let price = strike + priceDiff * progress;

                // Add deterministic noise (mid-path volatility)
                if (i > 0 && i < steps) {
                    // Pseudo-random based on Round ID and step index
                    const seed = (selectedRoundData.id * 100) + i;
                    // Simple deterministic noise function
                    const noise = Math.sin(seed * 0.1) * Math.cos(seed * 0.05);
                    // Scale noise relative to price (0.1% volatility)
                    const noiseFactor = noise * (strike * 0.001);
                    price += noiseFactor;
                }
                points.push({ time, price });
            }
            return points;
        }
        return priceHistory.map( (p: any) => ({ time: p.time, price: p.price }));
    }, [selectedRoundData, priceHistory]);

    // ── Liveline normalisation ────────────────────────────────────────────────
    // Liveline expects values in 0-100. We normalise the real price range to
    // that scale, then reverse-normalise inside formatValue to show $dollars.
    const { livelinePoints, strikeNormalized, priceMin, priceMax } = useMemo(() => {
        if (!formattedChartData.length) {
            return { livelinePoints: [] as LivelinePoint[], strikeNormalized: 50, priceMin: 0, priceMax: 100 };
        }
        const prices = formattedChartData.map((d: { time: number; price: number }) => d.price);
        const rawMin = Math.min(...prices, displayedTargetPrice || prices[0]);
        const rawMax = Math.max(...prices, displayedTargetPrice || prices[0]);
        const pad = (rawMax - rawMin) * 0.1 || 1; // 10% visual breathing room
        const pMin = rawMin - pad;
        const pMax = rawMax + pad;
        const range = pMax - pMin;
        const norm = (p: number) => Math.max(0, Math.min(100, ((p - pMin) / range) * 100));
        return {
            livelinePoints: formattedChartData.map((d: { time: number; price: number }) => ({
                time: Math.floor(d.time / 1000), // ms → unix seconds
                value: norm(d.price),
            })),
            strikeNormalized: norm(displayedTargetPrice || 0),
            priceMin: pMin,
            priceMax: pMax,
        };
    }, [formattedChartData, displayedTargetPrice]);

    const currentValueNormalized = useMemo(() => {
        const range = priceMax - priceMin;
        if (!range) return 50;
        return Math.max(0, Math.min(100, ((effectiveCurrentPrice - priceMin) / range) * 100));
    }, [effectiveCurrentPrice, priceMin, priceMax]);

    return (
        <div className="min-h-screen relative overflow-hidden bg-black text-black font-sans selection:bg-[#F492B7] selection:text-black">
            <StarfieldBg />

            {/* Top Bar */}
            <div className="relative z-20 sticky top-0 bg-black/80 backdrop-blur-md border-b border-white/10">
                <div className="max-w-[1400px] mx-auto px-6 h-16 flex items-center justify-between">
                    <Link
                        href="/crypto/majors"
                        className="flex items-center gap-2 text-gray-400 hover:text-white transition font-medium text-sm lowercase tracking-wide group"
                    >
                        <ChevronLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
                        back to crypto
                    </Link>
                </div>
            </div>

            <div className="relative z-10 max-w-[1400px] mx-auto px-6 py-8">
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">

                    {/* LEFT COLUMN */}
                    <div className="lg:col-span-8 space-y-8">
                        {/* Market Header Card (Neo-Brutalist) */}
                        <div className="bg-white border-4 border-black rounded-[2.5rem] p-8 shadow-[12px_12px_0px_0px_rgba(0,0,0,1)] relative overflow-hidden">
                            <div className="flex flex-col md:flex-row items-center justify-between gap-6 mb-8 relative z-10">
                                <div className="flex items-center gap-6">
                                    <div className="w-16 h-16 rounded-full border-4 border-black p-2 bg-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
                                        <img src={asset.icon} alt={asset.name} className="w-full h-full object-contain" />
                                    </div>
                                    <div>
                                        <h1 className="text-3xl md:text-4xl font-black text-black tracking-tighter mb-2 uppercase">
                                            {asset.name} #{liveRoundNumber}
                                        </h1>
                                        <div className="flex items-center gap-3">
                                            <span className="bg-black text-white px-3 py-1 rounded-lg text-xs font-black uppercase tracking-widest border-2 border-black">{interval}</span>
                                        </div>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <p className="text-[10px] font-black uppercase text-gray-400 tracking-widest mb-1">Time Remaining</p>
                                    <BigCountdown endTime={endTime} />
                                </div>
                            </div>

                            {/* Stats Grid */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-6 bg-gray-50 rounded-3xl border-2 border-black">
                                <div>
                                    <p className="text-[10px] uppercase tracking-widest text-gray-400 font-black mb-1">Target Price</p>
                                    <div className="text-4xl font-black text-black tracking-tighter tabular-nums">
                                        <AnimatedNumber value={effectivePriceToBeat} prefix="$" decimals={2} />
                                    </div>
                                </div>
                                <div className="text-right">
                                    <p className="text-[10px] uppercase tracking-widest text-[#F7931A] font-black mb-1 flex items-center justify-end gap-2">
                                        Current Price
                                        <span className={`text-[10px] px-1.5 py-0.5 rounded ${priceChange >= 0 ? 'bg-emerald-100 text-emerald-600' : 'bg-rose-100 text-rose-600'}`}>
                                            {priceChange >= 0 ? '▲' : '▼'} ${Math.abs(priceChange).toFixed(2)}
                                        </span>
                                    </p>
                                    <div className="text-5xl font-black tracking-tighter tabular-nums text-[#F7931A]">
                                        <AnimatedNumber value={effectiveCurrentPrice} prefix="$" decimals={2} className="text-[#F7931A]" />
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Chart Container */}
                        <div className="bg-white border-4 border-black rounded-[2.5rem] p-6 shadow-[10px_10px_0px_0px_rgba(0,0,0,1)] h-[600px] flex flex-col relative overflow-hidden">
                            <div className="flex justify-between items-center mb-4">
                                <h3 className="font-black text-black uppercase tracking-widest text-xs flex items-center gap-2">
                                    <Activity className="w-4 h-4" /> Live Chart
                                </h3>
                                <div className="flex items-center gap-2 bg-emerald-100 border border-emerald-300 px-3 py-1 rounded-full">
                                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                                    <span className="text-[10px] font-black text-emerald-600 uppercase tracking-wider">Connected</span>
                                </div>
                            </div>

                            <div className="flex-1 w-full min-h-0 rounded-2xl overflow-hidden border-2 border-black/10">
                                <Liveline
                                    data={livelinePoints}
                                    value={currentValueNormalized}
                                    color={chartColor}
                                    theme="light"
                                    fill
                                    pulse
                                    badge
                                    badgeTail
                                    grid
                                    momentum
                                    scrub
                                    referenceLine={{
                                        value: strikeNormalized,
                                        label: `Strike $${displayedTargetPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
                                    }}
                                    formatValue={(v) => {
                                        const actual = priceMin + (v / 100) * (priceMax - priceMin);
                                        return `$${actual.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
                                    }}
                                    style={{ width: '100%', height: '100%' }}
                                />
                            </div>

                            <RoundSelector rounds={allRounds} selectedRoundId={selectedRoundView} onSelect={setSelectedRoundView} />
                        </div>

                        {/* Social Tabs (Comments / Activity) */}
                        <div className="bg-white rounded-[2.5rem] border-4 border-black p-8 shadow-[12px_12px_0px_0px_rgba(0,0,0,1)]">
                            <div className="flex items-center gap-8 mb-6 border-b-2 border-black/10 pb-4">
                                <TabButton label="Activity" icon={<Activity size={16} />} active={bottomTab === 'ACTIVITY'} onClick={() => setBottomTab('ACTIVITY')} />
                                <TabButton label="Comments" icon={<MessageCircle size={16} />} active={bottomTab === 'COMMENTS'} onClick={() => setBottomTab('COMMENTS')} />
                                <TabButton label="Top Holders" icon={<Users size={16} />} active={bottomTab === 'HOLDERS'} onClick={() => setBottomTab('HOLDERS')} />
                            </div>

                            <div className="min-h-[300px]">




                                {bottomTab === 'ACTIVITY' && (
                                    <div className="space-y-0">
                                        {activityList.length === 0 ? (
                                            <div className="p-8 text-center text-gray-400 text-xs italic">No recent activity</div>
                                        ) : activityList.map((act, i) => (
                                            <div key={i} className="flex items-center justify-between py-4 border-b border-black/5 hover:bg-gray-50 px-2 transition-colors">
                                                <div className="flex items-center gap-3">
                                                    <img src={act.avatar} className="w-8 h-8 rounded-full border border-black bg-white" alt="avatar" />
                                                    <div>
                                                        <span className="block text-xs font-bold text-black">{act.username}</span>
                                                        <span className="text-[10px] text-gray-500 font-medium">{act.time}</span>
                                                    </div>
                                                </div>
                                                <div className="text-right">
                                                    <span className={`block text-xs font-bold lowercase ${act.action === 'YES' ? 'text-emerald-500' : 'text-rose-500'}`}>{act.action === 'YES' ? labels.up : labels.down} (${act.amount})</span>
                                                    <span className="text-[10px] text-black/40 font-medium">{act.shares} shares</span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                                {bottomTab === 'COMMENTS' && (
                                    <CommentsSection
                                        marketSlug={marketId}
                                        publicKey={null} // Default guest
                                        userProfile={{ username: 'Guest', avatarUrl: '/pink-pfp.png' }} // FIX: Provide profile
                                        marketOutcomes={[{ title: labels.up, color: '#10B981' }, { title: labels.down, color: '#EF4444' }]}
                                        myHeldPosition={null}
                                        myHeldAmount={null}
                                    />
                                )}

                                {bottomTab === 'HOLDERS' && (
                                    <>
                                        {/* MY HOLDINGS (Real Blockchain Data) */}
                                        {(() => {
                                            const intervalVal = (interval === '1h' || interval === '1H') ? 1
                                                : (interval === '24h' || interval === '24H' || interval === '1d' || interval === '1D') ? 2
                                                    : (interval === '1w' || interval === '1W') ? 3
                                                        : 0;
                                            try {
                                                const currentMarketKey = deriveChronosMarketKey(asset.symbol, currentRoundNumber, intervalVal);
                                                const myPos = realPositions.filter( (p: any) => p.account.market.toString() === currentMarketKey.toString());

                                                if (myPos.length > 0) {
                                                    return (
                                                        <div className="mb-8 p-4 bg-blue-50/50 rounded-2xl border-2 border-blue-100">
                                                            <h4 className="text-[10px] font-black uppercase tracking-widest mb-3 text-blue-600">My Holdings (On-Chain)</h4>
                                                            <div className="space-y-2">
                                                                {myPos.map((pos) => {
                                                                    const isUp = pos.account.outcome === 0;
                                                                    const side = isUp ? 'UP' : 'DOWN';
                                                                    const color = isUp ? 'text-emerald-600' : 'text-rose-600';
                                                                    return (
                                                                        <div key={pos.publicKey.toString()} className="flex justify-between items-center bg-white p-3 rounded-xl border border-blue-200">
                                                                            <div className="flex items-center gap-2">
                                                                                <span className={`font-black text-xs ${color}`}>{side}</span>
                                                                                {pos.account.claimed && <span className="text-[10px] bg-gray-200 px-1 rounded text-gray-500">CLAIMED</span>}
                                                                            </div>
                                                                            <span className="font-mono text-sm font-bold">{formatCompact(pos.account.shares.toString())} Shares</span>
                                                                        </div>
                                                                    );
                                                                })}
                                                            </div>
                                                        </div>
                                                    );
                                                }
                                            } catch (e) { console.error(e); }
                                            return null;
                                        })()}

                                        <HoldersList holders={holders} marketOutcomes={[{ title: 'UP' }, { title: 'DOWN' }]} />
                                    </>
                                )}
                            </div>
                        </div>

                    </div>

                    {/* RIGHT COLUMN - Trade Panel or Market Finished */}
                    <div className="lg:col-span-4 space-y-8">
                        {(() => {
                            // Find the selected round data
                            const selectedRound = allRounds.find( (r: any) => r.id === selectedRoundView);
                            const isViewingPastRound = selectedRound && selectedRound.status === 'ENDED';

                            if (isViewingPastRound && selectedRound) {
                                return (
                                    <MarketFinishedPanel
                                        round={selectedRound}
                                        assetName={asset.name}
                                        assetIcon={asset.icon}
                                        userPosition={(() => {
                                            // 1. Try to find REAL position from blockchain state
                                            const intervalEnum = (interval === '1h' || interval === '1H') ? 1
                                                : (interval === '24h' || interval === '24H' || interval === '1d' || interval === '1D') ? 2
                                                    : (interval === '1w' || interval === '1W') ? 3
                                                        : 0;
                                            // Ensure we have valid data before deriving key
                                            if (!asset.symbol || selectedRound.id === undefined) return null;

                                            try {
                                                const marketKey = deriveChronosMarketKey(asset.symbol, selectedRound.id, intervalEnum);
                                                const realPos = realPositions.find( (p: any) => p.account.market.toString() === marketKey.toString());

                                                if (realPos) {
                                                    const shares = realPos.account.shares.toNumber ? realPos.account.shares.toNumber() : Number(realPos.account.shares);
                                                    const isUp = realPos.account.outcome === 0;
                                                    return {
                                                        side: isUp ? 'UP' : 'DOWN',
                                                        shares: shares,
                                                        potentialWin: shares * 1.95, // Approx payout
                                                        claimed: realPos.account.claimed
                                                    };
                                                }
                                            } catch (e) {
                                                console.error("Error checking position:", e);
                                            }

                                            // 2. If it's a MOCK past round (for demo), generate a fake position sometimes
                                            if (selectedRound.id < liveRoundNumber && selectedRound.id % 2 !== 0) {
                                                // Demo: User participated in odd-numbered past rounds
                                                const isWin = selectedRound.result === 'UP';
                                                return {
                                                    side: isWin ? 'UP' : 'DOWN', // Let's say we won for demo joy
                                                    shares: 10 + (selectedRound.id % 5),
                                                    potentialWin: (10 + (selectedRound.id % 5)) * 0.05 // 0.05 SOL profit
                                                };
                                            }
                                            return null;
                                        })()}
                                        onClaim={async () => {
                                            // 1. Identify if it's a real position claim
                                            try {
                                                const intervalEnum = interval === '1h' ? 1 : interval === '4h' ? 2 : 0;
                                                const marketKey = deriveChronosMarketKey(asset.symbol, selectedRound.id, intervalEnum);
                                                // Find position by market key
                                                const realPos = realPositions.find( (p: any) => p.account.market.toString() === marketKey.toString());

                                                if (realPos && !realPos.account.claimed) {
                                                    const outcomeIndex = realPos.account.outcome; // 0 or 1

                                                    await claimWinnings(marketKey, outcomeIndex);
                                                    alert("Claim Successful! 💰");
                                                    triggerWinDemo(); // Show confetti
                                                    // Ideally refresh positions here
                                                    fetchMyPositions().then(setRealPositions);
                                                } else {
                                                    // Fallback to demo claim for mock rounds
                                                    if (selectedRound.id < liveRoundNumber) {
                                                        alert("You claimed your winnings! (Demo)");
                                                        triggerWinDemo();
                                                    }
                                                }
                                            } catch (e) {
                                                console.error("Claim logic error:", e);
                                                // Fallback demo
                                                if (selectedRound.id < liveRoundNumber) {
                                                    alert("You claimed your winnings! (Demo)");
                                                    triggerWinDemo();
                                                }
                                            }
                                        }}
                                        onShare={() => {
                                            // Share logic (e.g., copy to clipboard or open modal)
                                            const text = `I just won on ${asset.name} #${selectedRound.id}! Look at those gains 🚀 #DjinnMarket`;
                                            navigator.clipboard.writeText(text);
                                            alert("Result copied to clipboard!");
                                        }}
                                    />
                                );
                            }

                            return <TradePanel isAbove={isAbove} onTrade={handleAddTrade} currentPool={totalPool} marketState={currentMarketState} />;
                        })()}

                        {/* Rules Card */}
                        <div className="bg-black text-white rounded-[2rem] border-4 border-black p-8 shadow-[8px_8px_0px_0px_rgba(255,255,255,0.1)]">
                            <h3 className="text-sm font-bold lowercase tracking-wide mb-6 text-[#F492B7]">rules</h3>
                            <ul className="space-y-4 text-sm text-gray-300 font-medium">
                                <li className="flex gap-3">
                                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                                    <div>
                                        <span className="text-white font-bold">round starts:</span>
                                        <span className="ml-1">{endTime ? new Date(endTime - getDuration(interval)).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--'}</span>
                                    </div>
                                </li>
                                <li className="flex gap-3">
                                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                                    <div>
                                        <span className="text-white font-bold">round ends:</span>
                                        <span className="ml-1">{endTime ? new Date(endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--'}</span>
                                    </div>
                                </li>
                                <li className="flex gap-3">
                                    <Scale className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                                    <div>
                                        <span className="text-white font-bold">anchor price:</span>
                                        <span className="ml-1">${effectivePriceToBeat.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                                        <span className="text-gray-500 text-[10px] ml-1">(candle open at round start)</span>
                                    </div>
                                </li>
                                <li className="flex gap-3">
                                    <Clock className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                                    <span>price above target at close = <span className="text-emerald-400 font-bold">up wins</span></span>
                                </li>
                                <li className="flex gap-3">
                                    <Clock className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                                    <span>payouts are automatic at round end</span>
                                </li>
                            </ul>
                        </div>
                    </div>

                </div>
            </div>
        </div >
    );
}

// Sub-Components
function TabButton({ label, icon, active, onClick }: any) {
    return (
        <button
            onClick={onClick}
            className={`flex items-center gap-2 text-xs font-black uppercase tracking-[0.2em] transition-all relative ${active ? 'text-black' : 'text-gray-400 hover:text-black'}`}
        >
            {icon} {label}
            {active && <motion.div layoutId="tab-underline" className="absolute -bottom-5 left-0 right-0 h-1 bg-[#F492B7] rounded-full" />}
        </button>
    );
}

function HoldersList({ holders, marketOutcomes }: any) {
    return (
        <div className="space-y-6">
            {marketOutcomes.map((outcome: any, idx: number) => {
                const title = outcome.title;
                const list = holders[title] || [];
                return (
                    <div key={title}>
                        <h4 className={`text-[10px] font-black uppercase tracking-widest mb-3 ${idx === 0 ? 'text-emerald-500' : 'text-rose-500'}`}>{title} Whales</h4>
                        {list.length > 0 ? list.map((h: any, i: number) => (
                            <div key={i} className="flex items-center justify-between p-2 rounded-xl hover:bg-gray-50">
                                <div className="flex items-center gap-3">
                                    <span className="text-[10px] font-black text-gray-300 w-4">#{i + 1}</span>
                                    <img src={h.avatar} className="w-8 h-8 rounded-full border border-black bg-white" />
                                    <span className="text-xs font-black text-black">{h.name}</span>
                                </div>
                                <span className="text-xs font-bold text-black">{formatCompact(h.positions[title])} Shares</span>
                            </div>
                        )) : <div className="text-xs text-gray-400 italic">No holders yet</div>}
                    </div>
                );
            })}
        </div>
    );
}

