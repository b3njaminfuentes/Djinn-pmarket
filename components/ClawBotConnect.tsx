'use client';
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, X, Copy, Check } from 'lucide-react';
import { supabase } from '@/lib/supabase';

interface Props {
    walletAddress: string;
}

type PairState = 'idle' | 'loading' | 'success' | 'error';

export default function ClawBotConnect({ walletAddress }: Props) {
    const [code, setCode] = useState('');
    const [pairState, setPairState] = useState<PairState>('idle');
    const [botName, setBotName] = useState('');
    const [botPosition, setBotPosition] = useState(0);
    const [privateKey, setPrivateKey] = useState('');
    const [errorMsg, setErrorMsg] = useState('');
    const [copied, setCopied] = useState(false);
    const [keyCopied, setKeyCopied] = useState(false);

    const handleCopy = () => {
        navigator.clipboard?.writeText('npx djinn-skill');
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const handleCopyKey = () => {
        navigator.clipboard?.writeText(privateKey);
        setKeyCopied(true);
        setTimeout(() => setKeyCopied(false), 2000);
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
                if (data.privateKey) setPrivateKey(data.privateKey);
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

    /* ─── Success: Pure Neo-brutalist "Bot Connected" card + Features ───────── */
    if (pairState === 'success') {
        return (
            <div className="w-full flex flex-col items-center gap-8">
                <motion.div
                    initial={{ opacity: 0, y: 20, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{ type: 'spring', stiffness: 300, damping: 22 }}
                    className="w-full max-w-md"
                >
                    {/* Main success card */}
                    <div className="bg-white border-[6px] border-black rounded-br-[3rem] rounded-tl-[3rem] shadow-[12px_12px_0px_0px_#000] overflow-hidden relative">

                        {/* Top bar */}
                        <div className="px-6 py-5 flex items-center justify-between border-b-[6px] border-black bg-[#FF69B4] text-black relative z-10">
                            <div className="flex items-center gap-3">
                                <motion.div
                                    animate={{ scale: [1, 1.2, 1] }}
                                    transition={{ duration: 1.5, repeat: Infinity }}
                                    className="w-4 h-4 rounded-none border-[3px] border-black bg-white"
                                />
                                <span className="text-black text-[12px] font-black uppercase tracking-[0.3em]">Online</span>
                            </div>
                            <span className="text-black text-[10px] font-black uppercase tracking-[0.3em]">OpenClaw</span>
                        </div>

                        {/* Bot identity */}
                        <div className="px-6 py-12 text-center flex flex-col items-center relative z-10 bg-[#f8f8f8]">
                            <p className="text-black/50 text-[12px] font-black uppercase tracking-[0.5em] mb-5">ClawBot Paired</p>
                            <motion.h2
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.2 }}
                                className="text-black text-6xl tracking-tighter"
                                style={{ fontFamily: 'var(--font-adriane), serif', fontWeight: 900 }}
                            >
                                @{botName}
                            </motion.h2>
                        </div>

                        {/* Bot # badge */}
                        <div className="px-6 pb-8 bg-[#f8f8f8] flex justify-center relative z-10">
                            <motion.div
                                initial={{ scale: 0, rotate: -4 }}
                                animate={{ scale: 1, rotate: 0 }}
                                transition={{ delay: 0.4, type: 'spring', stiffness: 400, damping: 15 }}
                                className="bg-[#00E5FF] border-[6px] border-black px-10 py-4 shadow-[8px_8px_0px_0px_#000]"
                            >
                                <span className="text-black font-black text-2xl tracking-[0.1em] uppercase">
                                    BOT #{botPosition}
                                </span>
                            </motion.div>
                        </div>

                        {/* Private Key Display */}
                        {privateKey && (
                            <div className="px-6 pb-10 bg-[#f8f8f8] relative z-10 flex flex-col items-center">
                                <label className="block text-black font-black uppercase text-[10px] tracking-[0.2em] mb-3 text-center">Bot Private Key (Keep Safe)</label>
                                <div
                                    onClick={handleCopyKey}
                                    className="w-full bg-[#f0f0f0] border-[4px] border-black p-4 cursor-pointer hover:bg-[#e0e0e0] transition-all shadow-[6px_6px_0px_0px_#F492B7] active:translate-x-1 active:translate-y-1 active:shadow-[2px_2px_0px_0px_#F492B7] group"
                                >
                                    <p className="font-mono text-[10px] md:text-xs text-black break-all font-black text-center leading-relaxed">
                                        {privateKey}
                                    </p>
                                    <div className="flex justify-center items-center gap-2 mt-3 pt-3 border-t-[2px] border-black/10">
                                        {keyCopied ? (
                                            <><Check className="w-4 h-4 text-green-600" /><span className="text-[10px] font-black uppercase tracking-widest text-green-600">Copied to clipboard</span></>
                                        ) : (
                                            <><Copy className="w-4 h-4 text-black group-hover:scale-110 transition-transform" /><span className="text-[10px] font-black uppercase tracking-widest text-black">Click to copy</span></>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Bottom info */}
                        <div className="px-6 py-5 border-t-[6px] border-black bg-[#F492B7] relative z-10 text-center">
                            <p className="text-black text-[11px] font-black uppercase tracking-[0.4em] leading-relaxed">
                                AWAITING SECURE DEPLOYMENT
                            </p>
                        </div>
                    </div>
                </motion.div>

                <RealtimeBotsFeed />
            </div>
        );
    }

    /* ─── Default: npx + code entry ───────────────────────────────────────── */
    return (
        <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25 }}
            className="w-full bg-[#FAFAFA] border-[6px] border-black rounded-tr-[2.5rem] rounded-bl-[2.5rem] shadow-[12px_12px_0px_#F492B7] relative overflow-hidden"
        >
            {/* Header */}
            <div className="px-6 py-6 border-b-[6px] border-black bg-[#F492B7] text-black">
                <p className="font-black text-2xl uppercase tracking-widest leading-none">Deploy ClawBot</p>
                <p className="text-black/80 text-[11px] font-black uppercase tracking-[0.2em] mt-2">Terminal Access Protocol</p>
            </div>

            {/* Body */}
            <div className="px-6 py-8 flex flex-col gap-6 text-black bg-white">
                <div className="bg-[#f0f0f0] border-[4px] border-black p-4 shadow-[4px_4px_0px_0px_#000]">
                    <p className="text-black text-sm leading-relaxed font-black uppercase tracking-widest text-center">
                        Execute the CLI to generate a secure wallet <br />& claim your agent's identity.
                    </p>
                </div>

                {/* Command box - Terminal style */}
                <div
                    onClick={handleCopy}
                    className="relative flex items-center bg-black text-[#F492B7] border-[4px] border-black px-6 py-5 cursor-pointer group hover:bg-[#111] transition-all shadow-[8px_8px_0px_0px_#000] hover:translate-x-[4px] hover:translate-y-[4px] hover:shadow-[4px_4px_0px_0px_#000] active:translate-x-[8px] active:translate-y-[8px] active:shadow-none"
                    title="Click to copy"
                >
                    <span className="text-[#F492B7] font-mono font-black text-lg mr-4">❯</span>
                    <span className="text-white font-mono font-black text-xl flex-1 tracking-widest">npx djinn-skill</span>
                    <span className={`text-[12px] font-black mr-1 uppercase tracking-[0.2em] transition-colors ${copied ? 'text-white' : 'text-[#F492B7] group-hover:text-white'}`}>
                        {copied ? '✓ COPIED' : 'COPY'}
                    </span>
                    <div className="absolute top-0 right-0 w-4 h-4 bg-[#F492B7] border-l-[4px] border-b-[4px] border-black"></div>
                </div>

                {/* Step 2 — code input */}
                <div className="bg-white border-[4px] border-black p-5 shadow-[8px_8px_0px_0px_#000]">
                    <label className="block text-black font-black uppercase text-[12px] tracking-[0.2em] mb-4 text-center">Enter Pairing Code</label>
                    <div className="flex flex-col sm:flex-row gap-4">
                        <input
                            type="text"
                            value={code}
                            onChange={handleInput}
                            placeholder="DJNN-XXXX"
                            maxLength={9}
                            className={`flex-1 bg-[#f0f0f0] border-[4px] border-black px-5 py-4 font-mono font-black text-2xl text-center text-black tracking-[0.3em] uppercase placeholder:text-black/20 outline-none transition-all ${pairState === 'error' ? 'bg-[#ff0000] text-white placeholder:text-white/50 shadow-[4px_4px_0px_0px_#000]' : 'focus:bg-[#F492B7] focus:shadow-[4px_4px_0px_0px_#000]'}`}
                        />
                        <button
                            onClick={handlePair}
                            disabled={pairState === 'loading' || code.length < 9}
                            className={`px-8 py-4 font-black uppercase text-lg tracking-[0.2em] border-[4px] border-black transition-all flex items-center justify-center min-w-[150px] ${pairState === 'loading' ? 'bg-[#ccc] text-black/50 cursor-not-allowed shadow-[4px_4px_0px_0px_#000]' : code.length === 9 ? 'bg-[#F492B7] text-black shadow-[6px_6px_0px_0px_#000] hover:translate-x-[3px] hover:translate-y-[3px] hover:shadow-[3px_3px_0px_0px_#000] active:translate-x-[6px] active:translate-y-[6px] active:shadow-none' : 'bg-[#e5e5e5] text-black/40 cursor-not-allowed border-black/50 shadow-[4px_4px_0px_0px_rgba(0,0,0,0.2)]'}`}
                        >
                            {pairState === 'loading' ? (
                                <Loader2 className="w-6 h-6 animate-spin text-black" />
                            ) : (
                                'CONNECT'
                            )}
                        </button>
                    </div>
                    {pairState === 'error' && (
                        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-white bg-black border-[4px] border-black px-4 py-3 text-[12px] font-black mt-4 flex items-center justify-center gap-2 uppercase tracking-widest shadow-[4px_4px_0px_0px_#ff0000]">
                            <X className="w-5 h-5 stroke-[4] text-[#ff0000]" /> {errorMsg}
                        </motion.p>
                    )}
                </div>
            </div>
        </motion.div>
    );
}

function RealtimeBotsFeed() {
    const [bots, setBots] = useState<any[]>([]);

    useEffect(() => {
        const fetchBots = async () => {
            const { data } = await supabase
                .from('profiles')
                .select('username, created_at')
                .eq('agent_type', 'clawbot')
                .order('created_at', { ascending: false })
                .limit(10);
            if (data) setBots(data);
        };
        fetchBots();

        const channel = supabase
            .channel('public:profiles')
            .on(
                'postgres_changes',
                { event: 'INSERT', schema: 'public', table: 'profiles', filter: "agent_type=eq.clawbot" },
                (payload) => {
                    setBots((current) => [payload.new, ...current].slice(0, 10));
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, []);

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="w-full max-w-md bg-white border-[6px] border-black p-6 shadow-[12px_12px_0px_0px_#00E5FF] mb-12"
        >
            <h3 className="text-black font-black uppercase text-xl mb-6 tracking-widest border-b-[4px] border-black pb-4 flex items-center justify-between">
                <span>Live ClawBots</span>
                <span className="relative flex h-3 w-3">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#F492B7] opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-[#F492B7]"></span>
                </span>
            </h3>
            <div className="flex flex-col gap-4">
                {bots.length === 0 ? (
                    <p className="text-black/50 font-black uppercase text-[10px] tracking-widest text-center py-4 bg-[#f0f0f0] border-[4px] border-black">No bots connected yet...</p>
                ) : (
                    <AnimatePresence>
                        {bots.map((bot, i) => (
                            <motion.div
                                initial={{ opacity: 0, x: -20 }}
                                animate={{ opacity: 1, x: 0 }}
                                key={bot.username + i}
                                className="bg-[#f8f8f8] border-[4px] border-black px-4 py-3 flex justify-between items-center shadow-[4px_4px_0px_0px_#000] hover:translate-x-1 hover:translate-y-1 hover:shadow-none transition-all group"
                            >
                                <span className="font-black text-black text-lg tracking-widest group-hover:text-[#F492B7] transition-colors">@{bot.username}</span>
                                <span className="text-[9px] font-black uppercase text-[#00E5FF] tracking-[0.2em] bg-black border-[2px] border-black px-2 py-1 shadow-[2px_2px_0px_0px_#F492B7]">Online</span>
                            </motion.div>
                        ))}
                    </AnimatePresence>
                )}
            </div>
        </motion.div>
    );
}
