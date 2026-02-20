'use client';

import { useState } from 'react';
import { useDjinnProtocol } from '@/hooks/useDjinnProtocol';
import { PublicKey } from '@solana/web3.js';
import { useWallet } from '@solana/wallet-adapter-react';
import { Activity, ShieldCheck, Gavel, Play, AlertTriangle } from 'lucide-react';

export default function SimulationPanel({ marketPda, marketSlug }: { marketPda: string; marketSlug: string }) {
    const { buyShares, program, resolveMarket } = useDjinnProtocol();
    const { publicKey } = useWallet();
    const [logs, setLogs] = useState<string[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isOpen, setIsOpen] = useState(false);

    const log = (msg: string) => setLogs( (prev: any) => [`[${new Date().toISOString().slice(11, 19)}] ${msg}`, ...prev]);

    // 1. PUMP TO THRESHOLD
    const runPump = async (side: 'YES' | 'NO', amountSol: number = 0.5) => { // Increased amount to hit threshold faster
        if (!marketPda || !program || !publicKey) return;
        setIsLoading(true);
        log(`🚀 PUMPING ${side} with ${amountSol} SOL...`);

        const outcomeIndex = side === 'YES' ? 0 : 1;

        try {
            const marketAccount = await (program.account as any).market.fetch(new PublicKey(marketPda));
            const marketCreator = marketAccount.creator as PublicKey;

            const tx = await buyShares(
                new PublicKey(marketPda),
                outcomeIndex,
                amountSol,
                marketCreator,
                0
            );
            log(`✅ Pump Success: ${tx.slice(0, 8)}...`);
        } catch (e: any) {
            log(`❌ Pump Failed: ${e.message}`);
        } finally {
            setIsLoading(false);
        }
    };

    // 2. TRIGGER ORACLE (Force Backend Check)
    const triggerOracle = async () => {
        setIsLoading(true);
        log(`🦁 Waking up Cerberus...`);
        try {
            const res = await fetch('/api/oracle/trigger', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ slug: marketSlug, force: true }) // Assuming API accepts force
            });
            const data = await res.json();
            log(`📡 Oracle Response: ${JSON.stringify(data)}`);
        } catch (e: any) {
            log(`❌ Oracle Trigger Failed: ${e.message}`);
        } finally {
            setIsLoading(false);
        }
    };

    // 3. FORCE RESOLVE (Admin Override)
    const forceResolve = async (outcome: 'yes' | 'no') => {
        if (!marketPda || !program || !publicKey) return;
        setIsLoading(true);
        log(`⚖️ Force Resolving: ${outcome.toUpperCase()}...`);

        try {
            const signature = await resolveMarket(new PublicKey(marketPda), outcome);
            log(`✅ Resolved: ${signature.slice(0, 8)}...`);
            window.location.reload();
        } catch (e: any) {
            log(`❌ Resolution Failed: ${e.message}`);
        } finally {
            setIsLoading(false);
        }
    };

    if (!publicKey) return null;

    if (!isOpen) {
        return (
            <button
                onClick={() => setIsOpen(true)}
                className="fixed bottom-4 right-4 z-50 bg-black text-[#FFD600] p-3 rounded-full border-2 border-[#FFD600] shadow-[4px_4px_0px_#FFD600] hover:-translate-y-1 transition-transform"
            >
                <Activity size={24} />
            </button>
        );
    }

    return (
        <div className="fixed bottom-4 right-4 z-50 w-80 bg-black border-2 border-[#FFD600] rounded-xl p-4 shadow-[8px_8px_0px_rgba(0,0,0,0.5)] font-mono text-xs text-white">
            <div className="flex justify-between items-center mb-4 border-b border-gray-800 pb-2">
                <h3 className="text-[#FFD600] font-bold uppercase flex items-center gap-2">
                    <ShieldCheck size={16} /> God Mode
                </h3>
                <button onClick={() => setIsOpen(false)} className="text-gray-500 hover:text-white">Close</button>
            </div>

            <div className="space-y-4">
                {/* Step 1: Pump */}
                <div className="space-y-2">
                    <span className="text-gray-400 font-bold uppercase text-[10px]">1. Pump Volume (Hit Threshold)</span>
                    <div className="flex gap-2">
                        <button
                            onClick={() => runPump('YES')}
                            disabled={isLoading}
                            className="flex-1 bg-emerald-900/30 border border-emerald-500/50 text-emerald-400 py-2 rounded hover:bg-emerald-500/20 disabled:opacity-50 flex items-center justify-center gap-1"
                        >
                            <Play size={12} /> Pump YES
                        </button>
                        <button
                            onClick={() => runPump('NO')}
                            disabled={isLoading}
                            className="flex-1 bg-rose-900/30 border border-rose-500/50 text-rose-400 py-2 rounded hover:bg-rose-500/20 disabled:opacity-50 flex items-center justify-center gap-1"
                        >
                            <Play size={12} /> Pump NO
                        </button>
                    </div>
                </div>

                {/* Step 2: Trigger Oracle */}
                <div className="space-y-2">
                    <span className="text-gray-400 font-bold uppercase text-[10px]">2. Trigger Cerberus</span>
                    <button
                        onClick={triggerOracle}
                        disabled={isLoading}
                        className="w-full bg-[#FFD600]/10 border border-[#FFD600] text-[#FFD600] py-2 rounded hover:bg-[#FFD600]/20 disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                        <AlertTriangle size={12} /> Force Oracle Check
                    </button>
                </div>

                {/* Step 3: Resolve */}
                <div className="space-y-2">
                    <span className="text-gray-400 font-bold uppercase text-[10px]">3. Force Resolve (Admin)</span>
                    <div className="flex gap-2">
                        <button
                            onClick={() => forceResolve('yes')}
                            disabled={isLoading}
                            className="flex-1 bg-white/10 border border-white/20 text-white py-2 rounded hover:bg-white/20 disabled:opacity-50 flex items-center justify-center gap-1"
                        >
                            <Gavel size={12} /> Win YES
                        </button>
                        <button
                            onClick={() => forceResolve('no')}
                            disabled={isLoading}
                            className="flex-1 bg-white/10 border border-white/20 text-white py-2 rounded hover:bg-white/20 disabled:opacity-50 flex items-center justify-center gap-1"
                        >
                            <Gavel size={12} /> Win NO
                        </button>
                    </div>
                </div>
            </div>

            {/* Logs using a standard HTML element instead of Radix ScrollArea for simplicity in this dev tool */}
            <div className="mt-4 h-32 overflow-y-auto bg-black/50 rounded border border-gray-800 p-2 text-[10px] space-y-1 font-mono">
                {logs.length === 0 && <span className="text-gray-600 italic">Systems Ready...</span>}
                {logs.map((L, i) => (
                    <div key={i} className="text-gray-300 break-all border-b border-gray-800/50 pb-1 last:border-0">{L}</div>
                ))}
            </div>
        </div>
    );
}
