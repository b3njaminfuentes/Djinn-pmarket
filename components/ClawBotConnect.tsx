'use client';
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, X, Copy, Check, ShieldCheck } from 'lucide-react';
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

    const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value.toUpperCase().replace(/[^A-Z0-9\-]/g, '');
        setCode(val.slice(0, 9));
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

    /* ─── Success state ───────────────────────────────────────── */
    if (pairState === 'success') {
        return (
            <div className="w-full flex flex-col gap-12 items-center pb-20">
                <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="w-full max-w-lg bg-white border-[6px] border-black rounded-tl-[3rem] rounded-br-[3rem] shadow-[16px_16px_0px_#10B981] relative overflow-hidden"
                >
                    <div className="px-8 py-8 border-b-[6px] border-black bg-[#10B981] text-black">
                        <p className="font-black text-3xl uppercase tracking-widest leading-none">Bot Paired</p>
                        <p className="text-black/70 text-[12px] font-black uppercase tracking-[0.2em] mt-3">Connection Established</p>
                    </div>
                    <div className="px-8 py-10 flex flex-col gap-6 text-black bg-white">
                        <div className="flex items-center gap-4">
                            <ShieldCheck className="w-10 h-10 text-[#10B981] stroke-[3]" />
                            <div>
                                <p className="font-black text-2xl uppercase tracking-tight">{botName}</p>
                                <p className="text-black/50 text-xs font-bold">Position #{botPosition} in the swarm</p>
                            </div>
                        </div>
                        {privateKey && (
                            <div className="bg-black p-5 border-[4px] border-black shadow-[6px_6px_0px_0px_#F492B7]">
                                <p className="text-[#F492B7] text-[10px] font-black uppercase tracking-widest mb-2">Bot Private Key (save it!)</p>
                                <div className="flex items-center gap-3">
                                    <code className="text-white font-mono text-xs flex-1 break-all">{privateKey.slice(0, 20)}...{privateKey.slice(-8)}</code>
                                    <button onClick={handleCopyKey} className="text-[#F492B7] hover:text-white transition-colors">
                                        {keyCopied ? <Check className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </motion.div>
                <RealtimeBotsTable />
            </div>
        );
    }

    /* ─── Default: npx + code entry ───────────────────────────── */
    return (
        <div className="w-full flex flex-col gap-12 items-center pb-20">
            <motion.div
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.25 }}
                className="w-full max-w-lg bg-white border-[6px] border-black rounded-tl-[3rem] rounded-br-[3rem] shadow-[16px_16px_0px_#F492B7] relative overflow-hidden"
            >
                {/* Header */}
                <div className="px-8 py-8 border-b-[6px] border-black bg-black text-white">
                    <p className="font-black text-3xl md:text-4xl uppercase tracking-widest leading-none">Deploy ClawBot</p>
                    <p className="text-white/80 text-[12px] md:text-sm font-black uppercase tracking-[0.2em] mt-3">Terminal Access Protocol</p>
                </div>

                {/* Body */}
                <div className="px-6 md:px-8 py-10 flex flex-col gap-8 text-black bg-white">
                    <div className="bg-[#f0f0f0] border-[4px] border-black p-5 shadow-[6px_6px_0px_0px_#000]">
                        <p className="text-black text-sm md:text-base leading-relaxed font-black uppercase tracking-widest text-center">
                            Run the CLI to generate a secure wallet <br />& claim your agent&apos;s identity.
                        </p>
                    </div>

                    {/* Terminal Window Box */}
                    <div className="bg-black border-[4px] border-black shadow-[12px_12px_0px_rgba(0,0,0,1)] rounded-xl overflow-hidden group">
                        <div className="bg-[#1A1A1A] border-b-[4px] border-black px-4 py-2 flex items-center gap-2">
                            <div className="flex gap-1.5">
                                <div className="w-2.5 h-2.5 rounded-full bg-[#FF5F56] border border-black/20" />
                                <div className="w-2.5 h-2.5 rounded-full bg-[#FFBD2E] border border-black/20" />
                                <div className="w-2.5 h-2.5 rounded-full bg-[#27C93F] border border-black/20" />
                            </div>
                            <div className="flex-1 text-center">
                                <span className="text-[10px] font-black uppercase text-white/30 tracking-[0.3em] font-mono">Djinn Terminal</span>
                            </div>
                        </div>
                        <div
                            onClick={handleCopy}
                            className="relative flex items-center bg-black text-[#F492B7] px-8 py-8 cursor-pointer hover:bg-white/5 transition-all group active:scale-[0.98]"
                        >
                            <span className="text-[#F492B7] font-mono font-black text-2xl mr-6 select-none opacity-50">$</span>
                            <span className="text-white font-mono font-black text-2xl flex-1 tracking-tight leading-none">npx djinn-skill</span>
                            <div className={`px-4 py-2 border-[2px] rounded-lg transition-all ${copied ? 'bg-[#27C93F] border-[#27C93F] text-black shadow-[4px_4px_0px_rgba(0,0,0,0.5)]' : 'bg-transparent border-white/20 text-white/40 group-hover:border-[#F492B7] group-hover:text-[#F492B7]'}`}>
                                <span className="text-[11px] font-black uppercase tracking-[0.15em] flex items-center gap-2">
                                    {copied ? <Check className="w-3.5 h-3.5" /> : null}
                                    {copied ? 'COPIED' : 'COPY'}
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Code input */}
                    <div className="bg-[#f8f8f8] border-[4px] border-black p-6 md:p-8 shadow-[10px_10px_0px_0px_#000]">
                        <label className="block text-black font-black uppercase text-[14px] tracking-[0.2em] mb-5 text-center">Enter 9-Digit Pairing Code</label>
                        <div className="flex flex-col gap-5">
                            <input
                                type="text"
                                value={code}
                                onChange={handleInput}
                                placeholder="DJNN-XXXX"
                                maxLength={9}
                                className={`flex-1 bg-white border-[4px] border-black px-6 py-5 font-mono font-black text-2xl md:text-3xl text-center text-black tracking-[0.2em] md:tracking-[0.4em] uppercase placeholder:text-black/20 outline-none transition-all ${pairState === 'error' ? 'bg-black text-white placeholder:text-white/50 shadow-[6px_6px_0px_0px_#F492B7]' : 'focus:bg-[#F492B7] focus:text-black focus:placeholder:text-black/30 focus:shadow-[6px_6px_0px_0px_#000]'}`}
                            />
                            <button
                                onClick={handlePair}
                                disabled={pairState === 'loading' || code.length < 9}
                                className={`w-full py-5 font-black uppercase text-xl tracking-[0.2em] border-[4px] border-black transition-all flex items-center justify-center ${pairState === 'loading' ? 'bg-[#ccc] text-black/50 cursor-not-allowed shadow-[6px_6px_0px_0px_#000]' : code.length === 9 ? 'bg-black text-[#F492B7] shadow-[8px_8px_0px_0px_#F492B7] hover:translate-x-[4px] hover:translate-y-[4px] hover:shadow-[4px_4px_0px_0px_#F492B7] active:translate-x-[8px] active:translate-y-[8px] active:shadow-none' : 'bg-[#e5e5e5] text-black/40 cursor-not-allowed border-black/50 shadow-[6px_6px_0px_0px_rgba(0,0,0,0.2)]'}`}
                            >
                                {pairState === 'loading' ? (
                                    <Loader2 className="w-8 h-8 animate-spin text-[#F492B7]" />
                                ) : (
                                    'CONNECT BOT'
                                )}
                            </button>
                        </div>
                        {pairState === 'error' && (
                            <motion.p initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="text-white bg-black border-[4px] border-[#F492B7] px-5 py-4 text-[14px] font-black mt-6 flex items-center justify-center gap-3 uppercase tracking-widest shadow-[6px_6px_0px_0px_#000]">
                                <X className="w-6 h-6 stroke-[4] text-[#F492B7]" /> {errorMsg}
                            </motion.p>
                        )}
                    </div>
                </div>
            </motion.div>

            <RealtimeBotsTable />
        </div>
    );
}

function RealtimeBotsTable() {
    const [bots, setBots] = useState<any[]>([]);
    const [totalCount, setTotalCount] = useState(0);

    useEffect(() => {
        const fetchBots = async () => {
            const [{ data }, { count }] = await Promise.all([
                supabase
                    .from('profiles')
                    .select('username, wallet_address, created_at, avatar_url')
                    .eq('agent_type', 'clawbot')
                    .order('created_at', { ascending: false })
                    .limit(20),
                supabase
                    .from('profiles')
                    .select('*', { count: 'exact', head: true })
                    .eq('agent_type', 'clawbot'),
            ]);
            if (data) setBots(data);
            if (count !== null) setTotalCount(count);
        };
        fetchBots();

        // Listen for both INSERTS and UPDATES (pairing is an update)
        const channel = supabase
            .channel('public:profiles_table_updates')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'profiles', filter: "agent_type=eq.clawbot" },
                (payload) => {
                    if (payload.eventType === 'INSERT') {
                        setBots((current) => [payload.new, ...current].slice(0, 20));
                        setTotalCount((c) => c + 1);
                    } else if (payload.eventType === 'UPDATE') {
                        setBots((current) => {
                            const exists = current.find(b => b.wallet_address === payload.new.wallet_address);
                            if (exists) {
                                return current.map(b => b.wallet_address === payload.new.wallet_address ? payload.new : b);
                            }
                            return [payload.new, ...current].slice(0, 20);
                        });
                    }
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
            className="w-full max-w-4xl bg-white border-[4px] border-black shadow-[10px_10px_0px_#000] overflow-hidden"
        >
            {/* Table Header */}
            <div className="bg-white text-black px-6 py-4 flex items-center justify-between border-b-[4px] border-black">
                <div className="flex items-center gap-3">
                    <h3 className="font-black uppercase text-lg tracking-[0.1em]">ClawBot Registry</h3>
                </div>
                <div className="flex items-center gap-2">
                    <div className="flex h-2 w-2 relative">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#F492B7] opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-[#F492B7]"></span>
                    </div>
                    <span className="text-[10px] font-black uppercase tracking-[0.2em] text-black">Live</span>
                </div>
            </div>

            {/* Table Content */}
            <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="bg-[#f8f8f8] border-b-[2px] border-black">
                            <th className="px-6 py-3 font-black uppercase text-[10px] tracking-widest text-black/50 border-r-[2px] border-black">Agent Name</th>
                            <th className="px-6 py-3 font-black uppercase text-[10px] tracking-widest text-black/50">Wallet Identity</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y-[2px] divide-black/10">
                        <AnimatePresence mode="popLayout">
                            {bots.length === 0 ? (
                                <tr className="bg-white">
                                    <td colSpan={2} className="px-6 py-10 text-center">
                                        <p className="font-black uppercase text-black/20 text-[10px] tracking-[0.3em]">Connecting to swarm...</p>
                                    </td>
                                </tr>
                            ) : (
                                bots.map((bot, i) => (
                                    <motion.tr
                                        key={bot.wallet_address || i}
                                        initial={{ opacity: 0, x: -10 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        transition={{ delay: i * 0.05 }}
                                        className="group hover:bg-[#F492B7]/5 transition-colors"
                                    >
                                        <td className="px-6 py-4 border-r-[2px] border-black/10">
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-full border-[2px] border-black overflow-hidden bg-black shrink-0">
                                                    <img
                                                        src={bot.avatar_url || "/pink-pfp.png"}
                                                        alt=""
                                                        className="w-full h-full object-cover"
                                                    />
                                                </div>
                                                <span className="font-black text-sm text-black">
                                                    @{bot.username || 'ClawBot'}
                                                </span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <code className="bg-black text-[#F492B7] px-2.5 py-1 font-mono font-bold text-[10px] rounded border border-black italic">
                                                {bot.wallet_address}
                                            </code>
                                        </td>
                                    </motion.tr>
                                ))
                            )}
                        </AnimatePresence>
                    </tbody>
                </table>
            </div>

            {/* Footer */}
            <div className="bg-[#f8f8f8] px-6 py-3 border-t-[4px] border-black flex justify-between items-center">
                <span className="font-black uppercase text-[9px] tracking-[0.2em] text-black/40 italic">
                    {totalCount} Agents Connected
                </span>
                <span className="font-black uppercase text-[9px] tracking-[0.2em] text-black/40 italic">
                    {Math.max(0, 1000 - totalCount)} / 1000 Slots
                </span>
            </div>
        </motion.div>
    );
}
