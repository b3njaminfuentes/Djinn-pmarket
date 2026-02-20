'use client';

import { useState, useEffect } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { useConnection } from '@solana/wallet-adapter-react';
import { PublicKey } from '@solana/web3.js';
import { useDjinnProtocol } from '../hooks/useDjinnProtocol';
import { simulateBuy, estimatePayoutInternal, CURVE_CONSTANT, VIRTUAL_OFFSET } from '../lib/core-amm';
import * as supabaseDb from '../lib/supabase-db';
import { TransactionConfirmationService, TxStatus } from '../lib/TransactionConfirmationService';
import { SyncQueue } from '../lib/SyncQueue';

interface QuickBetModalProps {
    isOpen: boolean;
    onClose: () => void;
    market: {
        title: string;
        icon: string;
        chance: number;
        volume: string;
        marketPDA?: string;
        yesTokenMint?: string;
        noTokenMint?: string;
        slug?: string; // Add slug for DB sync
    };
    outcome: 'yes' | 'no';
}

export default function QuickBetModal({ isOpen, onClose, market, outcome }: QuickBetModalProps) {
    const wallet = useWallet();
    const { setVisible } = useWalletModal();
    const { connection } = useConnection();
    const { buyShares, program } = useDjinnProtocol();
    const [amount, setAmount] = useState(1);
    const [isLoading, setIsLoading] = useState(false);
    const [txStatus, setTxStatus] = useState<TxStatus | 'IDLE'>('IDLE');
    const [solPrice, setSolPrice] = useState(0);

    // Initialize TxConfirmationService with connection
    useEffect(() => {
        if (connection) {
            TransactionConfirmationService.init(connection);
        }
    }, [connection]);

    // Register SyncQueue handlers on mount
    useEffect(() => {
        SyncQueue.registerHandler('ACTIVITY', async (payload) => {
            await supabaseDb.createActivity(payload as any);
        });
        SyncQueue.registerHandler('BET', async (payload) => {
            await supabaseDb.createBet(payload as any);
        });
        SyncQueue.registerHandler('MARKET_UPDATE', async (payload) => {
            const { slug, price, volume } = payload as any;
            await supabaseDb.updateMarketPrice(slug, price, volume);
        });
    }, []);

    useEffect(() => {
        const handleEsc = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', handleEsc);

        // Fetch SOL Price for USD estimates
        fetch("https://api.binance.com/api/v3/ticker/price?symbol=SOLUSDT")
            .then(res => res.json())
            .then(data => setSolPrice(parseFloat(data.price)))
            .catch(console.error);

        return () => window.removeEventListener('keydown', handleEsc);
    }, [onClose]);

    // Prevent body scroll when modal is open
    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = 'unset';
        }
        return () => { document.body.style.overflow = 'unset'; };
    }, [isOpen]);

    // --- REAL AMM MATH ---
    // Price = S / K. S = Price * K.
    // S_market = TotalShares + VIRTUAL_OFFSET
    const currentPrice = (market.chance || 50) / 100;
    const safePrice = Math.max(0.01, Math.min(0.99, currentPrice));

    // Reverse engineer State from Price
    const marketState = {
        virtualSolReserves: 0,
        virtualShareReserves: 0,
        realSolReserves: 0, // Not needed for buy sim
        totalSharesMinted: (safePrice * CURVE_CONSTANT) - VIRTUAL_OFFSET
    };

    const sim = simulateBuy(amount, marketState);
    const estPayout = estimatePayoutInternal(sim.sharesReceived);
    const roi = ((estPayout - amount) / amount) * 100;
    const usdValue = amount * solPrice;

    const handleDeposit = async () => {
        if (!wallet.publicKey || !wallet.signTransaction) {
            setVisible(true);
            return;
        }

        if (!market.marketPDA || !market.yesTokenMint || !market.noTokenMint) {
            console.warn("Market configuration missing. Using mocks for demo.");
            // Fallback to mocks only if absolutely necessary, but prefer erroring out in prod
        }

        setIsLoading(true);
        setTxStatus('PENDING');

        try {
            console.log(`🎲 Placing ${outcome.toUpperCase()} bet: ${amount} SOL`);

            // 1. EXECUTE ON-CHAIN
            if (!market.marketPDA) {
                alert("This is a demo market (not on-chain). Bet simulated!");
                setIsLoading(false);
                setTxStatus('IDLE');
                onClose();
                return;
            }

            // 1. Fetch Actual Share Supplies for Accurate Math
            if (!program) throw new Error("Protocol not ready");
            const marketPdaPubkey = new PublicKey(market.marketPDA);
            const marketAccount = await (program.account as any).market.fetch(marketPdaPubkey);
            const outcomeIndex = outcome === 'yes' ? 0 : 1;

            // Re-calculate simulation with REAL on-chain supplies
            const currentSupply = Number(marketAccount.outcomeSupplies[outcomeIndex]);
            const realSim = simulateBuy(amount, {
                totalSharesMinted: currentSupply / 1e9, // simulateBuy expects shares (not lamports)
                virtualSolReserves: 0,
                virtualShareReserves: 0,
                realSolReserves: 0
            });

            const marketCreator = marketAccount.creator as PublicKey;

            // Enforce 1% slippage
            const minSharesOut = realSim.sharesReceived * 0.99;

            const signature = await buyShares(
                marketPdaPubkey,
                outcomeIndex,
                amount,
                marketCreator,
                minSharesOut
            );

            console.log('📡 TX Broadcast:', signature);
            setTxStatus('CONFIRMING');

            // 2. WAIT FOR CHAIN CONFIRMATION (Using the new service)
            try {
                const confirmResult = await TransactionConfirmationService.confirm(signature, 60000);
                console.log('✅ TX Confirmed on-chain:', confirmResult);
                setTxStatus('CONFIRMED');
            } catch (confirmError: any) {
                console.error('❌ TX Failed/Expired:', confirmError);
                setTxStatus('FAILED');
                alert(`Transaction failed on-chain: ${confirmError.error || 'Timeout'}\n\nNo changes were made to your account.`);
                return; // DO NOT sync to DB if chain failed
            }

            // 3. SYNC TO SUPABASE VIA QUEUE (Guaranteed delivery)
            const slug = market.slug || market.title.toLowerCase().replace(/ /g, '-').replace(/[^\w-]/g, '');
            const walletAddress = wallet.publicKey!.toBase58();

            // A. Ensure Profile (still sync, not critical)
            const profile = await supabaseDb.getProfile(walletAddress);
            if (!profile) {
                await supabaseDb.upsertProfile({
                    wallet_address: walletAddress,
                    username: `User ${walletAddress.slice(0, 4)}`,
                    bio: 'Crypto trader',
                    avatar_url: `https://api.dicebear.com/7.x/identicon/svg?seed=${walletAddress}`
                });
            }

            // B. Queue Activity Log (Guaranteed sync)
            SyncQueue.add('ACTIVITY', {
                wallet_address: walletAddress,
                username: profile?.username || `User ${walletAddress.slice(0, 4)}`,
                avatar_url: profile?.avatar_url || null,
                action: outcome === 'yes' ? 'YES' : 'NO',
                amount: usdValue,
                sol_amount: amount,
                shares: sim.sharesReceived,
                market_title: market.title,
                market_slug: slug,
                market_icon: market.icon,
                outcome_name: outcome.toUpperCase()
            });

            // C. Queue Bet Position (Guaranteed sync)
            SyncQueue.add('BET', {
                market_slug: slug,
                wallet_address: walletAddress,
                side: outcome === 'yes' ? 'YES' : 'NO',
                amount: usdValue,
                sol_amount: amount,
                shares: sim.sharesReceived,
                entry_price: safePrice * 100
            });

            // D. Queue Market Stats Update
            let newYesPrice = market.chance;
            if (outcome === 'yes') {
                newYesPrice = Math.min(99, market.chance + sim.priceImpact);
            } else {
                newYesPrice = Math.max(1, market.chance - sim.priceImpact);
            }
            SyncQueue.add('MARKET_UPDATE', { slug, price: newYesPrice, volume: usdValue });

            alert(`✅ Bet confirmed on-chain!\n\n${outcome.toUpperCase()}: ${amount} SOL\n\nTX: ${signature.slice(0, 8)}...\n\nSyncing to Global Feed...`);
            onClose();
            // Trigger refresh
            window.location.reload();

        } catch (error: any) {
            console.error('❌ Error:', error);
            setTxStatus('FAILED');
            alert(`Failed: ${error.message || 'Unknown error'}`);
        } finally {
            setIsLoading(false);
        }
    };

    if (!isOpen) return null;

    const isYes = outcome === 'yes';

    return (
        <>
            {/* Backdrop with Djinn pink glow */}
            <div
                className="fixed inset-0 bg-black/80 backdrop-blur-md z-50"
                onClick={onClose}
            />

            {/* Modal - Floating Card Style */}
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
                <div
                    className="pointer-events-auto w-full max-w-md animate-scale-in"
                    onClick={(e) => e.stopPropagation()}
                >
                    {/* Main Card */}
                    <div className="relative bg-[#0B0E14] border border-[#F492B7]/30 rounded-3xl overflow-hidden shadow-[0_0_60px_rgba(244,146,183,0.2)]">

                        {/* Pink Glow Top */}
                        <div className="absolute top-0 left-0 right-0 h-32 bg-gradient-to-b from-[#F492B7]/20 to-transparent pointer-events-none" />

                        {/* Sparkles */}
                        <span className="absolute top-4 right-8 text-[#F492B7] animate-ping text-xs">✦</span>
                        <span className="absolute top-8 left-6 text-[#F492B7] animate-pulse text-[10px]">✦</span>
                        <span className="absolute top-6 right-16 text-[#F492B7]/50 animate-bounce text-xs" style={{ animationDelay: '0.3s' }}>✦</span>

                        {/* Header */}
                        <div className="relative p-6 pb-4">
                            <div className="flex items-start justify-between">
                                <div className="flex items-center gap-4 flex-1">
                                    {/* Market Icon */}
                                    <div className="w-14 h-14 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-3xl overflow-hidden">
                                        {typeof market.icon === 'string' && market.icon.startsWith('data:image') ? (
                                            <img src={market.icon} alt="" className="w-full h-full object-cover" />
                                        ) : (
                                            market.icon || '🔮'
                                        )}
                                    </div>

                                    {/* Market Title */}
                                    <div className="flex-1 min-w-0">
                                        <h3 className="text-white font-bold text-lg leading-tight line-clamp-2">
                                            {market.title}
                                        </h3>
                                        <div className="flex items-center gap-2 mt-1">
                                            <span className="text-[#F492B7] font-black text-xl">{market.chance}%</span>
                                            <span className="text-gray-500 text-xs uppercase tracking-wider">chance</span>
                                        </div>
                                    </div>
                                </div>

                                {/* Close Button */}
                                <button
                                    onClick={onClose}
                                    className="w-8 h-8 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-gray-400 hover:text-white hover:border-[#F492B7]/50 transition-all"
                                >
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>
                            </div>
                        </div>

                        {/* Bet Type Indicator */}
                        <div className="px-6 pb-4">
                            <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-black uppercase tracking-wider ${isYes
                                ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400'
                                : 'bg-red-500/10 border border-red-500/30 text-red-400'
                                }`}>
                                <span className={`w-2 h-2 rounded-full ${isYes ? 'bg-emerald-400' : 'bg-red-400'} animate-pulse`} />
                                Betting {outcome.toUpperCase()}
                            </div>
                        </div>

                        {/* Amount Section */}
                        <div className="px-6 pb-4">
                            <div className="bg-white/5 border border-white/10 rounded-2xl p-4 hover:border-[#F492B7]/30 transition-colors">
                                <div className="flex items-center justify-between mb-4">
                                    <div className="flex items-baseline gap-2">
                                        <input
                                            type="number"
                                            value={amount}
                                            onChange={(e) => setAmount(Math.max(0.01, parseFloat(e.target.value) || 0))}
                                            className="bg-transparent text-4xl font-black text-white outline-none w-24"
                                            placeholder="0"
                                            step="0.1"
                                        />
                                        <span className="text-gray-500 text-lg font-bold">SOL</span>
                                    </div>

                                    {/* Quick Amount Buttons */}
                                    <div className="flex gap-2">
                                        {[0.5, 1, 5].map((val) => (
                                            <button
                                                key={val}
                                                onClick={() => setAmount(val)}
                                                className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all ${amount === val
                                                    ? 'bg-[#F492B7] text-black'
                                                    : 'bg-white/10 text-white hover:bg-[#F492B7]/20 hover:text-[#F492B7]'
                                                    }`}
                                            >
                                                {val}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Slider */}
                                <input
                                    type="range"
                                    min="0.01"
                                    max="10"
                                    step="0.01"
                                    value={amount}
                                    onChange={(e) => setAmount(parseFloat(e.target.value))}
                                    className="w-full h-2 rounded-lg appearance-none cursor-pointer djinn-slider"
                                />
                            </div>
                        </div>

                        {/* Calculations Section using CORE AMM */}
                        <div className="px-6 pb-4 space-y-3">
                            {/* Fee Breakdown */}
                            <div className="flex items-center justify-between text-xs">
                                <div className="flex items-center gap-1 text-gray-500">
                                    <span>Trading Fee</span>
                                    <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${sim.isEndgame ? 'bg-emerald-500/10 text-emerald-400' : 'bg-blue-500/10 text-blue-400'}`}>
                                        {sim.isEndgame ? 'Endgame 0.1%' : 'Standard 2.5%'}
                                    </span>
                                </div>
                                <span className="text-white font-mono">
                                    {sim.feeTotal.toFixed(4)} SOL
                                </span>
                            </div>

                            {/* Slippage Warning */}
                            {sim.warningSlippage && (
                                <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-2 flex items-center gap-2">
                                    <svg className="w-4 h-4 text-red-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                    </svg>
                                    <span className="text-red-400 text-xs font-bold">
                                        High Price Impact: {sim.priceImpact.toFixed(2)}%
                                    </span>
                                </div>
                            )}

                            {/* Net Payout Display (The Spec Requirement) */}
                            <div className="bg-white/5 rounded-xl p-3 border border-white/5">
                                <div className="flex justify-between items-center mb-1">
                                    <span className="text-gray-400 text-xs font-bold uppercase tracking-wider">Est. Net Payout</span>
                                    <span className={`text-sm font-black font-mono ${roi > 0 ? 'text-emerald-400' : 'text-gray-400'}`}>
                                        {estPayout.toFixed(2)} SOL
                                    </span>
                                </div>
                                <div className="flex justify-between items-center text-[10px] text-gray-500">
                                    <span>After 2% Resolution Fee</span>
                                    <span>Est. Shares: {sim.sharesReceived.toFixed(2)}</span>
                                </div>
                            </div>
                        </div>

                        {/* Action Button */}
                        <div className="p-6 pt-2">
                            <button
                                onClick={handleDeposit}
                                disabled={isLoading || amount <= 0}
                                className={`
                  w-full py-4 rounded-2xl font-black text-lg uppercase tracking-wider
                  transition-all duration-300 relative overflow-hidden group
                  disabled:opacity-50 disabled:cursor-not-allowed
                  ${isYes
                                        ? 'bg-gradient-to-r from-emerald-500 to-emerald-600 text-white shadow-[0_0_30px_rgba(16,185,129,0.4)]'
                                        : 'bg-gradient-to-r from-red-500 to-pink-600 text-white shadow-[0_0_30px_rgba(239,68,68,0.4)]'
                                    }
                  hover:scale-[1.02] active:scale-[0.98]
                `}
                            >
                                {/* Button Glow */}
                                <div className={`absolute inset-0 ${isYes ? 'bg-emerald-400' : 'bg-red-400'} opacity-0 group-hover:opacity-20 transition-opacity`} />

                                {isLoading ? (
                                    <span className="flex items-center justify-center gap-3">
                                        <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                        </svg>
                                        Processing...
                                    </span>
                                ) : (
                                    <>Place {amount} SOL on {outcome.toUpperCase()}</>
                                )}
                            </button>
                        </div>

                        {/* Footer */}
                        <div className="px-6 pb-6">
                            <p className="text-center text-xs text-gray-500">
                                You'll receive <span className="text-[#F492B7] font-bold">{outcome.toUpperCase()}</span> shares • Volume: <span className="text-white">{market.volume}</span>
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            <style jsx>{`
        @keyframes scale-in {
          from {
            opacity: 0;
            transform: scale(0.9) translateY(20px);
          }
          to {
            opacity: 1;
            transform: scale(1) translateY(0);
          }
        }
        .animate-scale-in {
          animation: scale-in 0.25s ease-out;
        }
        .djinn-slider {
          background: linear-gradient(to right, 
            #F492B7 0%, 
            #F492B7 ${(amount / 10) * 100}%, 
            rgba(255,255,255,0.1) ${(amount / 10) * 100}%, 
            rgba(255,255,255,0.1) 100%
          );
        }
        .djinn-slider::-webkit-slider-thumb {
          appearance: none;
          width: 20px;
          height: 20px;
          border-radius: 50%;
          background: #F492B7;
          cursor: pointer;
          box-shadow: 0 0 15px rgba(244,146,183,0.6);
          border: 2px solid white;
        }
        .djinn-slider::-moz-range-thumb {
          width: 20px;
          height: 20px;
          border-radius: 50%;
          background: #F492B7;
          cursor: pointer;
          box-shadow: 0 0 15px rgba(244,146,183,0.6);
          border: 2px solid white;
        }
      `}</style>
        </>
    );
}
