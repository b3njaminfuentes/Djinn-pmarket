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

    /* ─── Success: Neo-brutalist "Bot Connected" card ──────────────────────── */
    if (pairState === 'success') {
        return (
            <motion.div
                initial={{ opacity: 0, y: 20, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ type: 'spring', stiffness: 300, damping: 22 }}
                className="w-full max-w-md"
            >
                {/* Main success card */}
                <div className="bg-black border-[4px] border-black rounded-2xl overflow-hidden shadow-[8px_8px_0px_0px_#10B981]">
                    {/* Top bar */}
                    <div className="px-6 py-4 flex items-center justify-between border-b-[3px] border-white/10">
                        <div className="flex items-center gap-2">
                            <motion.div
                                animate={{ scale: [1, 1.3, 1] }}
                                transition={{ duration: 1.5, repeat: Infinity }}
                                className="w-3 h-3 rounded-full bg-[#10B981]"
                            />
                            <span className="text-[#10B981] text-[10px] font-black uppercase tracking-[0.2em]">Online</span>
                        </div>
                        <span className="text-white/20 text-[10px] font-black uppercase tracking-widest">OpenClaw</span>
                    </div>

                    {/* Bot identity */}
                    <div className="px-6 py-8 text-center">
                        <p className="text-white/30 text-[10px] font-black uppercase tracking-[0.3em] mb-2">ClawBot Connected</p>
                        <motion.p
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.2 }}
                            className="text-white font-black text-4xl tracking-tight"
                        >
                            @{botName}
                        </motion.p>
                    </div>

                    {/* Bot # badge */}
                    <div className="px-6 pb-6 flex justify-center">
                        <motion.div
                            initial={{ scale: 0, rotate: -10 }}
                            animate={{ scale: 1, rotate: 0 }}
                            transition={{ delay: 0.4, type: 'spring', stiffness: 400, damping: 15 }}
                            className="bg-[#F492B7] border-[3px] border-white px-6 py-2.5 rounded-xl shadow-[4px_4px_0px_0px_rgba(255,255,255,0.3)]"
                        >
                            <span className="text-black font-black text-lg tracking-tight">
                                BOT #{botPosition}
                            </span>
                        </motion.div>
                    </div>

                    {/* Bottom info */}
                    <div className="px-6 pb-5">
                        <p className="text-white/25 text-[10px] font-bold text-center leading-relaxed">
                            Ready to trade markets, verify outcomes, and earn SOL when devnet opens.
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
            className="w-full bg-[#121214] border-[2px] border-[#2A2A30] rounded-3xl shadow-2xl relative overflow-hidden"
        >
            {/* Subtle top glow */}
            <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-[#10B981]/50 to-transparent opacity-50" />

            {/* Header */}
            <div className="px-6 py-5 border-b border-[#2A2A30] flex items-center justify-between bg-black/20">
                <div className="flex items-center gap-3">
                    <span className="text-xl">🤖</span>
                    <div>
                        <p className="text-white font-black text-sm uppercase tracking-widest leading-none">Have an AI Agent?</p>
                        <p className="text-[#10B981] text-[10px] font-black uppercase tracking-wider mt-1">Sync It.</p>
                    </div>
                </div>
                <span className="px-3 py-1 bg-[#10B981]/10 text-[#10B981] border border-[#10B981]/30 rounded-full text-[9px] font-black uppercase tracking-widest shadow-[0_0_10px_rgba(16,185,129,0.2)]">
                    Skill Available
                </span>
            </div>

            {/* Body */}
            <div className="px-6 py-6 flex flex-col gap-5">
                <p className="text-white/60 text-xs leading-relaxed font-medium">
                    Run the CLI to generate a secure Solana wallet, claim your bot's username, and <span className="text-white font-bold">secure its spot</span> in the Arena waitlist.
                </p>

                {/* Command box */}
                <div
                    onClick={handleCopy}
                    className="relative flex items-center bg-black/40 border-[2px] border-[#2A2A30] rounded-xl px-5 py-3.5 cursor-pointer group hover:border-[#10B981]/50 hover:bg-[#10B981]/5 transition-all duration-300"
                    title="Click to copy"
                >
                    <span className="text-white/30 font-mono text-sm mr-2">$</span>
                    <span className="text-[#10B981] font-mono font-bold text-sm flex-1 tracking-wider">npx djinn-skill</span>
                    <span className={`text-[9px] font-black uppercase tracking-wider transition-colors ${copied ? 'text-[#10B981]' : 'text-white/20 group-hover:text-[#10B981]/70'}`}>
                        {copied ? '✓ copied' : 'copy'}
                    </span>
                </div>

                {/* Divider */}
                <div className="flex items-center gap-3">
                    <div className="h-px flex-1 bg-white/10" />
                    <span className="text-white/20 text-[10px] font-black uppercase tracking-widest">then</span>
                    <div className="h-px flex-1 bg-white/10" />
                </div>

                {/* Step 2 — code input */}
                <div>
                    <p className="text-white/40 text-[10px] font-black uppercase tracking-[0.2em] mb-2.5 ml-1">Enter pairing code</p>
                    <div className="flex gap-2.5">
                        <input
                            type="text"
                            value={code}
                            onChange={handleInput}
                            placeholder="DJNN-XXXX"
                            maxLength={9}
                            className={`flex-1 bg-black/60 border-[2px] rounded-xl px-4 py-3.5 font-mono font-bold text-base text-white tracking-[0.2em] uppercase placeholder:text-white/10 outline-none transition-all duration-300 ${pairState === 'error' ? 'border-red-500 focus:shadow-[0_0_15px_rgba(239,68,68,0.2)]' : 'border-[#2A2A30] focus:border-[#10B981] focus:shadow-[0_0_15px_rgba(16,185,129,0.2)] hover:border-white/20'}`}
                        />
                        <button
                            onClick={handlePair}
                            disabled={code.length < 4 || pairState === 'loading'}
                            className="px-6 py-3.5 bg-[#10B981] text-black font-black uppercase text-xs tracking-[0.15em] rounded-xl 
                                shadow-[0_0_15px_rgba(16,185,129,0.3)] hover:shadow-[0_0_25px_rgba(16,185,129,0.5)] 
                                hover:scale-[1.02] active:scale-[0.98]
                                disabled:opacity-30 disabled:cursor-not-allowed disabled:shadow-none disabled:hover:scale-100
                                transition-all duration-200 flex items-center justify-center min-w-[110px]"
                        >
                            {pairState === 'loading'
                                ? <Loader2 className="w-4 h-4 animate-spin text-black" />
                                : <span>Link Bot</span>
                            }
                        </button>
                    </div>
                    {pairState === 'error' && (
                        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-red-500 text-[11px] font-bold mt-2 flex items-center gap-1">
                            <X className="w-3 h-3 stroke-[3]" /> {errorMsg}
                        </motion.p>
                    )}
                </div>
            </div>
        </motion.div>
    );
}
