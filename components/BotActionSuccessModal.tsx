import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { PublicKey } from '@solana/web3.js';

interface BotActionSuccessModalProps {
    isOpen: boolean;
    onClose: () => void;
    txHash: string;
    wallet: PublicKey | null;
    action: 'refund' | 'stake';
}

export default function BotActionSuccessModal({ isOpen, onClose, txHash, wallet, action }: BotActionSuccessModalProps) {
    if (!isOpen) return null;

    const isRefund = action === 'refund';

    // Config
    const statusText = isRefund ? 'REFUNDED' : 'ACTIVATED';
    const subText = isRefund ? 'FUNDS RETURNED' : 'SYSTEM ONLINE';

    // Glow Color (Shadow only, text is white)
    const glowColor = isRefund ? 'rgba(0, 255, 148, 0.6)' : 'rgba(0, 204, 255, 0.6)';
    const borderColor = isRefund ? 'border-[#00FF94]/30' : 'border-[#00CCFF]/30';

    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="absolute inset-0 bg-black/90 backdrop-blur-xl"
                    onClick={onClose}
                />

                <motion.div
                    initial={{ scale: 0.9, opacity: 0, y: 20 }}
                    animate={{ scale: 1, opacity: 1, y: 0 }}
                    exit={{ scale: 0.9, opacity: 0, y: 20 }}
                    className={`relative w-full max-w-sm rounded-[2.5rem] overflow-hidden bg-black border ${borderColor}`}
                    style={{
                        boxShadow: `0 0 50px -10px ${glowColor}`,
                    }}
                >
                    {/* Glass Shine */}
                    <div className="absolute inset-0 bg-gradient-to-tr from-white/10 via-transparent to-transparent pointer-events-none" />
                    <div className="absolute inset-0 opacity-20 pointer-events-none bg-[url('/noise.png')] mix-blend-overlay" />

                    <div className="relative z-10 flex flex-col items-center p-8 pt-12">

                        {/* 1. STATUS HEADER */}
                        <div className="flex flex-col items-center mb-10 gap-2">
                            <span className="text-[10px] font-bold uppercase tracking-[0.3em] text-white/50">
                                {subText}
                            </span>
                            <h2
                                className="text-4xl font-black tracking-tight px-2 text-center leading-tight text-white"
                                style={{
                                    fontFamily: 'var(--font-unbounded), sans-serif',
                                    textShadow: `0 0 30px ${glowColor}`
                                }}
                            >
                                {statusText}
                            </h2>
                        </div>

                        {/* 2. AMOUNT HERO */}
                        <div className="relative flex items-center justify-center py-6 w-full border-y border-white/10 bg-white/5 mb-8 rounded-xl backdrop-blur-md">
                            <div className="flex items-baseline gap-3">
                                <span
                                    className="text-5xl font-bold text-white tracking-tighter"
                                    style={{ fontFamily: 'var(--font-unbounded), sans-serif' }}
                                >
                                    10
                                </span>
                                <span className="text-xl font-medium text-white/60 tracking-wider">
                                    SOL
                                </span>
                            </div>
                        </div>

                        {/* 3. DETAILS */}
                        <div className="w-full flex flex-col gap-4 px-2">
                            {wallet && (
                                <div className="flex justify-between items-center text-xs border-b border-white/5 pb-2">
                                    <span className="font-bold text-white/40 uppercase tracking-widest">WALLET</span>
                                    <span className="font-mono text-white/90">
                                        {wallet.toBase58().slice(0, 4)}...{wallet.toBase58().slice(-4)}
                                    </span>
                                </div>
                            )}

                            <div className="flex justify-between items-center text-xs">
                                <span className="font-bold text-white/40 uppercase tracking-widest">TX ID</span>
                                <a
                                    href={`https://solscan.io/tx/${txHash}?cluster=devnet`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="font-mono text-white hover:text-[#00CCFF] transition-colors flex items-center gap-2 underline underline-offset-4 decoration-white/20 hover:decoration-[#00CCFF]"
                                >
                                    VIEW SCAN ↗
                                </a>
                            </div>
                        </div>

                        {/* 4. FOOTER */}
                        <button
                            onClick={onClose}
                            className="mt-10 w-full py-4 bg-white text-black font-black uppercase tracking-widest rounded-xl hover:scale-[1.02] active:scale-[0.98] transition-transform shadow-[0_0_20px_rgba(255,255,255,0.3)]"
                            style={{ fontFamily: 'var(--font-unbounded), sans-serif', fontSize: '11px' }}
                        >
                            CLOSE
                        </button>

                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    );
}
