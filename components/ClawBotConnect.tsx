'use client';
import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Loader2, X } from 'lucide-react';

interface Props {
    walletAddress: string;
}

type PairState = 'idle' | 'loading' | 'success' | 'error';

export default function ClawBotConnect({ walletAddress }: Props) {
    const [code, setCode] = useState('');
    const [pairState, setPairState] = useState<PairState>('idle');
    const [botName, setBotName] = useState('');
    const [botPosition, setBotPosition] = useState(0);
    const [errorMsg, setErrorMsg] = useState('');
    const [copied, setCopied] = useState(false);

    const handleCopy = () => {
        navigator.clipboard?.writeText('npx djinn-skill');
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const handlePair = async () => {
        if (code.length < 6) return;
        setPairState('loading');
        setErrorMsg('');
        try {
            const res = await fetch('/api/bots/pair', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code: code.toUpperCase(), walletAddress }),
            });
            const data = await res.json();
            if (res.ok && data.success) {
                setBotName(data.botName || 'ClawBot');
                setBotPosition(data.position || 1);
                setPairState('success');
            } else {
                setErrorMsg(data.error || 'Invalid code. Run npx djinn-skill again.');
                setPairState('error');
            }
        } catch {
            setErrorMsg('Network error. Try again.');
            setPairState('error');
        }
    };

    const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value.toUpperCase().replace(/[^A-Z0-9\-]/g, '').slice(0, 9);
        setCode(val);
        if (pairState === 'error') setPairState('idle');
    };

    /* ─── Success: Premium Dark "Bot Connected" card ──────────────────────── */
    if (pairState === 'success') {
        return (
            <motion.div
                initial={{ opacity: 0, y: 20, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ type: 'spring', stiffness: 300, damping: 22 }}
                className="w-full max-w-md"
            >
                {/* Main success card */}
                <div className="bg-[#0a0a0a] border border-white/10 rounded-[2rem] shadow-[0_0_50px_rgba(16,185,129,0.15)] overflow-hidden relative">
                    {/* Ambient Glow */}
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full bg-[#10B981]/10 rounded-full blur-[70px] pointer-events-none" />

                    {/* Top bar */}
                    <div className="px-6 py-5 flex items-center justify-between border-b border-white/5 bg-black/50 relative z-10">
                        <div className="flex items-center gap-3">
                            <motion.div
                                animate={{ scale: [1, 1.2, 1], opacity: [0.8, 1, 0.8] }}
                                transition={{ duration: 2, repeat: Infinity }}
                                className="w-2.5 h-2.5 rounded-full bg-[#10B981] shadow-[0_0_12px_rgba(16,185,129,1)]"
                            />
                            <span className="text-[#10B981] text-[10px] font-black uppercase tracking-[0.3em]">Online</span>
                        </div>
                        <span className="text-white/20 text-[9px] font-black uppercase tracking-[0.3em]">OpenClaw Protocol</span>
                    </div>

                    {/* Bot identity */}
                    <div className="px-6 py-12 text-center flex flex-col items-center relative z-10">
                        <p className="text-[#10B981]/70 text-[10px] font-black uppercase tracking-[0.5em] mb-5">ClawBot Paired</p>
                        <motion.h2
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.2 }}
                            className="text-white text-5xl md:text-6xl tracking-[0.05em] drop-shadow-[0_0_25px_rgba(16,185,129,0.3)]"
                            style={{ fontFamily: 'var(--font-adriane), serif', fontWeight: 700 }}
                        >
                            @{botName}
                        </motion.h2>
                    </div>

                    {/* Bot # badge */}
                    <div className="px-6 pb-12 flex justify-center relative z-10">
                        <motion.div
                            initial={{ scale: 0, rotate: -2 }}
                            animate={{ scale: 1, rotate: 0 }}
                            transition={{ delay: 0.4, type: 'spring', stiffness: 400, damping: 15 }}
                            className="bg-black/50 border border-white/10 px-8 py-3.5 rounded-2xl shadow-inner group backdrop-blur-sm"
                        >
                            <span className="text-[#10B981] font-black text-xl tracking-[0.15em] drop-shadow-[0_0_8px_rgba(16,185,129,0.5)]">
                                BOT #{botPosition}
                            </span>
                        </motion.div>
                    </div>

                    {/* Bottom info */}
                    <div className="px-6 py-5 border-t border-white/5 bg-black/50 relative z-10 text-center">
                        <p className="text-white/30 text-[9px] font-black uppercase tracking-[0.4em] leading-relaxed">
                            AWAITING SECURE DEPLOYMENT
                        </p>
                    </div>
                </div>
            </motion.div>
        );
    }

    /* ─── Default: npx + code entry ───────────────────────────────────────── */
    return (
        <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25 }}
            className="w-full bg-[#0a0a0a] border border-white/10 rounded-[2rem] shadow-2xl relative overflow-hidden"
        >
            {/* Ambient Top Glow */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-1 bg-gradient-to-r from-transparent via-[#F492B7]/50 to-transparent" />

            {/* Header */}
            <div className="px-6 py-5 border-b flex items-center justify-between border-white/5 bg-black/50 text-white relative z-10">
                <div className="flex items-center gap-4">
                    <span className="text-2xl drop-shadow-[0_0_10px_rgba(244,146,183,0.3)]">🦾</span>
                    <div>
                        <p className="font-black text-base uppercase tracking-widest leading-none">Deploy ClawBot</p>
                        <p className="text-white/40 text-[9px] font-black uppercase tracking-[0.2em] mt-1.5">Terminal Access</p>
                    </div>
                </div>
                <span className="px-3 py-1.5 bg-[#F492B7]/10 text-[#F492B7] border border-[#F492B7]/20 rounded-full text-[9px] font-black uppercase tracking-widest shadow-[0_0_15px_rgba(244,146,183,0.15)]">
                    Ready
                </span>
            </div>

            {/* Body */}
            <div className="px-6 py-8 flex flex-col gap-8 text-white relative">
                {/* Background ambient glow */}
                <div className="absolute top-1/2 right-0 -translate-y-1/2 w-64 h-64 bg-[#F492B7]/5 rounded-full blur-[80px] pointer-events-none" />

                {/* Instructions */}
                <div className="bg-white/[0.02] border border-white/5 rounded-2xl p-5 backdrop-blur-sm">
                    <p className="text-white/60 text-sm leading-relaxed font-medium tracking-wide">
                        Execute the CLI to generate a secure wallet & claim your agent's identity.
                    </p>
                </div>

                {/* Command box - Terminal style */}
                <div
                    onClick={handleCopy}
                    className="relative flex items-center bg-black border border-white/10 rounded-xl px-5 py-4 cursor-pointer group hover:border-[#F492B7]/50 transition-all shadow-inner"
                    title="Click to copy"
                >
                    <span className="text-[#F492B7] font-mono text-lg mr-3">❯</span>
                    <span className="text-white font-mono font-medium text-lg flex-1 tracking-wider">npx djinn-skill</span>
                    <span className={`text-[10px] font-black mr-1 uppercase tracking-widest transition-colors ${copied ? 'text-white' : 'text-white/30 group-hover:text-[#F492B7]'}`}>
                        {copied ? '✓ COPIED' : 'COPY'}
                    </span>
                </div>

                {/* Step 2 — code input */}
                <div className="bg-black/40 border border-white/5 rounded-2xl p-6 relative">
                    <label className="block text-white/40 font-black uppercase text-[10px] tracking-[0.2em] mb-4 text-center">Enter Pairing Code</label>
                    <div className="flex flex-col sm:flex-row gap-4">
                        <input
                            type="text"
                            value={code}
                            onChange={handleInput}
                            placeholder="DJNN-XXXX"
                            maxLength={9}
                            className={`flex-1 bg-black border-[2px] rounded-xl px-5 py-4 font-mono font-medium text-xl text-center text-white tracking-[0.2em] uppercase placeholder:text-white/10 outline-none transition-all ${pairState === 'error' ? 'border-red-500/50 shadow-[0_0_15px_rgba(239,68,68,0.2)] text-red-100' : 'border-white/10 focus:border-[#F492B7] focus:shadow-[0_0_20px_rgba(244,146,183,0.2)]'}`}
                        />
                        <button
                            onClick={handlePair}
                            disabled={pairState === 'loading' || code.length < 9}
                            className={`px-8 py-4 font-black uppercase text-sm tracking-[0.2em] rounded-xl transition-all flex items-center justify-center min-w-[140px] ${pairState === 'loading' ? 'bg-white/5 text-white/30 cursor-not-allowed' : code.length === 9 ? 'bg-[#F492B7] text-black shadow-[0_0_20px_rgba(244,146,183,0.3)] hover:bg-[#ff69b4] hover:shadow-[0_0_30px_rgba(244,146,183,0.5)] hover:-translate-y-0.5 active:translate-y-0' : 'bg-white/5 text-white/30 cursor-not-allowed border border-white/5'}`}
                        >
                            {pairState === 'loading' ? (
                                <Loader2 className="w-5 h-5 animate-spin text-white" />
                            ) : (
                                'CONNECT'
                            )}
                        </button>
                    </div>
                    {pairState === 'error' && (
                        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-red-400 text-[12px] font-medium mt-4 flex items-center justify-center gap-2">
                            <X className="w-4 h-4" /> {errorMsg}
                        </motion.p>
                    )}
                </div>
            </div>
        </motion.div>
    );
}
