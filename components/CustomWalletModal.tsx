'use client';

import React, { useMemo } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletReadyState, WalletName } from '@solana/wallet-adapter-base';
import { X, Zap } from 'lucide-react';
import { useWalletConnection } from '@/hooks/useWalletConnection';
import { motion, AnimatePresence } from 'framer-motion';

interface CustomWalletModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export default function CustomWalletModal({ isOpen, onClose }: CustomWalletModalProps) {
    const { wallets } = useWallet();
    const { connectWallet, isConnecting, error, canRetry, retry } = useWalletConnection();

    const uniqueWallets = useMemo(() => {
        const seen = new Set();
        const list = [];
        const preferredOrder = ['Phantom', 'Solflare', 'Backpack', 'Jupiter'];
        // MetaMask is EVM-only, not compatible with Solana - exclude it
        const blocklist = ['MetaMask'];

        for (const w of wallets) {
            if (seen.has(w.adapter.name)) continue;
            if (blocklist.includes(w.adapter.name)) continue;
            const isReady = w.readyState === WalletReadyState.Installed || w.readyState === WalletReadyState.Loadable;
            if (isReady) {
                seen.add(w.adapter.name);
                list.push(w);
            }
        }

        return list.sort((a: any, b: any) => {
            const idxA = preferredOrder.indexOf(a.adapter.name);
            const idxB = preferredOrder.indexOf(b.adapter.name);
            return (idxA === -1 ? 999 : idxA) - (idxB === -1 ? 999 : idxB);
        });
    }, [wallets]);

    const handleWalletClick = async (walletName: WalletName) => {
        const result = await connectWallet(walletName);
        if (result.success) {
            onClose();
        }
    };

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-[9999] flex items-center justify-center h-screen w-screen p-4 overflow-hidden">
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="absolute inset-0 bg-black/70"
                        onClick={onClose}
                    />

                    {/* Modal */}
                    <motion.div
                        initial={{ opacity: 0, y: 50, rotate: -2 }}
                        animate={{ opacity: 1, y: 0, rotate: 0 }}
                        exit={{ opacity: 0, y: 40, rotate: 1 }}
                        transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                        className="relative w-full max-w-[380px] flex flex-col max-h-[90vh] z-10"
                    >
                        {/* Offset shadow layer */}
                        <div className="absolute inset-0 bg-[#FF69B4] rounded-[2.5rem] translate-x-[8px] translate-y-[8px]" />

                        {/* Main card */}
                        <div className="relative bg-white border-[3px] border-black rounded-[2.5rem] overflow-hidden">

                            {isConnecting ? (
                                <div className="flex flex-col items-center justify-center py-16 px-8 text-center space-y-8 bg-[#FF69B4] text-white">
                                    <motion.div
                                        className="relative w-24 h-24 flex items-center justify-center"
                                        animate={{ rotate: 360 }}
                                        transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }}
                                    >
                                        <div className="absolute inset-0 rounded-full border-[6px] border-black/20 border-t-white border-l-white" />
                                        <Zap className="w-10 h-10 text-white fill-white" strokeWidth={0} />
                                    </motion.div>
                                    <div className="space-y-3">
                                        <h3
                                            className="text-3xl font-black uppercase tracking-tighter"
                                            style={{ fontFamily: 'var(--font-unbounded), sans-serif' }}
                                        >
                                            Connecting
                                        </h3>
                                        <p className="text-white/80 text-xs font-bold uppercase tracking-[0.2em] px-4 py-2 border-[2px] border-black bg-black shadow-[4px_4px_0px_#000]">
                                            Approve in Wallet
                                        </p>
                                    </div>
                                </div>
                            ) : (
                                <>
                                    {/* Header */}
                                    <div className="bg-black px-6 py-4 flex items-center justify-end rounded-t-[calc(2.5rem-3px)]">
                                        <button
                                            onClick={onClose}
                                            className="bg-white/10 text-white w-8 h-8 rounded-xl flex items-center justify-center hover:bg-[#FF69B4] hover:scale-110 transition-all duration-150"
                                        >
                                            <X size={14} strokeWidth={3} />
                                        </button>
                                    </div>

                                    {/* Logo ONLY */}
                                    <div className="flex flex-col items-center pt-8 pb-6 px-6">
                                        <img
                                            src="/djinn-logo.png"
                                            alt="Djinn Logo"
                                            className="w-28 h-28 md:w-32 md:h-32 object-contain drop-shadow-md"
                                        />
                                    </div>

                                    {/* Divider */}
                                    <div className="mx-6 border-t-[3px] border-black/10 rounded-full" />

                                    {/* Error */}
                                    {error && (
                                        <motion.div
                                            initial={{ opacity: 0, y: -10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            className="mx-5 mt-4"
                                        >
                                            <div className="p-3 rounded-2xl bg-red-50 border-[3px] border-red-400 shadow-[4px_4px_0px_#dc2626]">
                                                <p className="text-red-600 text-[11px] font-black uppercase tracking-wide text-center">
                                                    {error}
                                                </p>
                                                {canRetry && (
                                                    <button
                                                        onClick={retry}
                                                        className="w-full mt-2 py-2 bg-red-500 text-white text-[10px] font-black uppercase tracking-widest rounded-xl border-[2px] border-black shadow-[3px_3px_0px_#000] hover:shadow-none hover:translate-x-[3px] hover:translate-y-[3px] transition-all duration-100"
                                                    >
                                                        Try Again
                                                    </button>
                                                )}
                                            </div>
                                        </motion.div>
                                    )}

                                    {/* Wallet List */}
                                    <div className="p-5 pb-8 space-y-2.5 overflow-y-auto max-h-[40vh]">
                                        {uniqueWallets.map((w, i) => (
                                            <motion.button
                                                key={w.adapter.name}
                                                initial={{ opacity: 0, x: -16 }}
                                                animate={{ opacity: 1, x: 0 }}
                                                transition={{ delay: i * 0.06, type: 'spring', stiffness: 500, damping: 30 }}
                                                onClick={() => handleWalletClick(w.adapter.name as WalletName)}
                                                className="w-full bg-white rounded-3xl p-3.5 flex items-center justify-between
                                                    border-[3px] border-black
                                                    shadow-[5px_5px_0px_#000000]
                                                    hover:shadow-[2px_2px_0px_#FF69B4] hover:translate-x-[3px] hover:translate-y-[3px] hover:border-[#FF69B4]
                                                    active:shadow-none active:translate-x-[5px] active:translate-y-[5px]
                                                    transition-all duration-100 group cursor-pointer"
                                            >
                                                <div className="flex items-center gap-3.5">
                                                    <div className="flex items-center justify-center w-8 h-8 group-hover:scale-110 transition-transform duration-200">
                                                        <img src={w.adapter.icon} alt={w.adapter.name} className="w-full h-full object-contain" />
                                                    </div>
                                                    <div className="flex flex-col items-start gap-0.5">
                                                        <span className="font-black text-black text-lg tracking-[0.05em] capitalize">
                                                            {w.adapter.name}
                                                        </span>
                                                        {w.readyState === WalletReadyState.Installed && (
                                                            <span className="text-[9px] font-bold text-black/25 uppercase tracking-widest">
                                                                Detected
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    {w.readyState === WalletReadyState.Installed && (
                                                        <span className="w-3 h-3 rounded-full bg-[#00FF41] border-[2px] border-black" />
                                                    )}
                                                    <span className="text-black/15 group-hover:text-[#FF69B4] group-hover:translate-x-1 transition-all duration-150 font-black text-base">
                                                        &rarr;
                                                    </span>
                                                </div>
                                            </motion.button>
                                        ))}

                                        {uniqueWallets.length === 0 && (
                                            <div className="text-center py-10 px-4">
                                                <p className="text-black/40 text-xs font-black uppercase tracking-wider">
                                                    No wallets found
                                                </p>
                                                <p className="text-black/20 text-[10px] mt-2 font-bold">
                                                    Install a Solana wallet extension
                                                </p>
                                            </div>
                                        )}
                                    </div>


                                </>
                            )}
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
}
