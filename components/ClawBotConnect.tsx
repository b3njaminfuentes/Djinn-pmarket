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
                    <div className="px-6 py-8 text-center flex flex-col items-center">
                        <p className="text-white/40 text-[11px] font-black uppercase tracking-[0.4em] mb-4">ClawBot Paired</p>
                        <motion.h2
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.2 }}
                            className="text-white text-5xl md:text-6xl tracking-tighter"
                            style={{ fontFamily: 'var(--font-adriane), serif', fontWeight: 700 }}
                        >
                            @{botName}
                        </motion.h2>
                    </div>

                    {/* Bot # badge */}
                    <div className="px-6 pb-8 flex justify-center">
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
                    <div className="px-6 pb-6 bg-black">
                        <p className="text-[#FF69B4] text-[10px] font-black uppercase tracking-widest text-center leading-relaxed">
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
            className="w-full bg-white border-[4px] border-black rounded-[2rem] shadow-[10px_10px_0px_0px_#FF69B4] relative overflow-hidden"
        >
            {/* Header */}
            <div className="px-6 py-5 border-b-[4px] border-black flex items-center justify-between bg-[#F492B7] text-black">
                <div className="flex items-center gap-3">
                    <span className="text-2xl">🦾</span>
                    <div>
                        <p className="font-black text-sm uppercase tracking-widest leading-none">Deploy ClawBot</p>
                        <p className="text-black/60 text-[10px] font-black uppercase tracking-wider mt-1">Sync your Agent</p>
                    </div>
                </div>
                <span className="px-3 py-1 bg-black text-white rounded-full text-[9px] font-black uppercase tracking-widest shadow-[2px_2px_0px_0px_rgba(255,255,255,0.5)]">
                    Skill Available
                </span>
            </div>

            {/* Body */}
            <div className="px-6 py-6 flex flex-col gap-6 text-black">
                <p className="text-black/70 text-xs leading-relaxed font-bold uppercase tracking-wider">
                    Run the CLI to generate a secure wallet, claim your bot's identity, and <span className="text-black font-black">secure its spot</span> on the grid.
                </p>

                {/* Command box */}
                <div
                    onClick={handleCopy}
                    className="relative flex items-center bg-black text-white border-[3px] border-black rounded-xl px-5 py-4 cursor-pointer group hover:bg-[#F492B7] hover:text-black transition-all shadow-[6px_6px_0px_0px_rgba(0,0,0,0.15)] hover:shadow-[3px_3px_0px_0px_rgba(0,0,0,0.15)] hover:translate-x-[3px] hover:translate-y-[3px] active:translate-x-[6px] active:translate-y-[6px] active:shadow-none"
                    title="Click to copy"
                >
                    <span className="text-current/40 font-mono text-sm mr-2">$</span>
                    <span className="text-current font-mono font-black text-base flex-1 tracking-wider">npx djinn-skill</span>
                    <span className={`text-[10px] font-black uppercase tracking-widest transition-colors ${copied ? 'text-white' : 'text-current/40 group-hover:text-black/60'}`}>
                        {copied ? '✓ COPIED' : 'COPY'}
                    </span>
                </div>

                {/* Divider */}
                <div className="flex items-center gap-3">
                    <div className="h-[3px] flex-1 bg-black/10" />
                    <span className="text-black/40 text-[10px] font-black uppercase tracking-widest">then</span>
                    <div className="h-[3px] flex-1 bg-black/10" />
                </div>

                {/* Step 2 — code input */}
                <div>
                    <label className="block text-black font-black uppercase text-[10px] tracking-[0.2em] mb-3 ml-1">Enter pairing code</label>
                    <div className="flex gap-3">
                        <input
                            type="text"
                            value={code}
                            onChange={handleInput}
                            placeholder="DJNN-XXXX"
                            maxLength={9}
                            className={`flex-1 bg-white border-[3px] rounded-xl px-4 py-4 font-mono font-black text-lg text-black tracking-[0.2em] uppercase placeholder:text-black/20 outline-none transition-all ${pairState === 'error' ? 'border-red-500 shadow-[4px_4px_0px_0px_#ef4444]' : 'border-black focus:border-[#FF69B4] focus:shadow-[4px_4px_0px_0px_#FF69B4] shadow-[4px_4px_0px_0px_rgba(0,0,0,0.1)]'}`}
                        />
                        <button
                            onClick={handlePair}
                            disabled={pairState === 'loading' || code.length < 9}
                            className={`px-8 rounded-xl font-black uppercase text-sm tracking-widest border-[3px] border-black transition-all flex items-center justify-center min-w-[120px] ${pairState === 'loading' ? 'bg-black text-white/50 cursor-not-allowed border-black/50' : code.length === 9 ? 'bg-[#10B981] text-black shadow-[6px_6px_0px_0px_#000000] hover:shadow-[3px_3px_0px_0px_#000000] hover:translate-x-[3px] hover:translate-y-[3px] active:translate-x-[6px] active:translate-y-[6px] active:shadow-none' : 'bg-black text-white/50 cursor-not-allowed'}`}
                        >
                            {pairState === 'loading' ? (
                                <Loader2 className="w-5 h-5 animate-spin" />
                            ) : (
                                'CONNECT'
                            )}
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
