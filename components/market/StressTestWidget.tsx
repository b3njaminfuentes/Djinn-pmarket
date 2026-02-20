'use client';

import { useState } from 'react';
import { useDjinnProtocol } from '@/hooks/useDjinnProtocol';
import { PublicKey } from '@solana/web3.js';
import { useWallet } from '@solana/wallet-adapter-react';

export default function StressTestWidget({ marketPda }: { marketPda: string }) {
    const { buyShares, program } = useDjinnProtocol();
    const { publicKey } = useWallet();
    const [logs, setLogs] = useState<string[]>([]);
    const [isLoading, setIsLoading] = useState(false);

    const log = (msg: string) => setLogs( (prev: any) => [...prev, `${new Date().toISOString().slice(11, 19)} ${msg}`]);

    const runStressTest = async (side: 'YES' | 'NO', iterations: number) => {
        if (!marketPda || !program || !publicKey) return;
        setIsLoading(true);
        log(`🚀 STARTING STRESS TEST: ${iterations}x BUYS on ${side}`);

        const outcomeIndex = side === 'YES' ? 0 : 1;
        const amount = 0.01; // Small amount for stress testing

        try {
            // Fetch creator
            const marketAccount = await (program.account as any).market.fetch(new PublicKey(marketPda));
            const marketCreator = marketAccount.creator as PublicKey;

            for (let i = 0; i < iterations; i++) {
                log(`[${i + 1}/${iterations}] Buying ${amount} SOL of ${side}...`);
                try {
                    const tx = await buyShares(
                        new PublicKey(marketPda),
                        outcomeIndex,
                        amount,
                        marketCreator,
                        0
                    );
                    log(`✅ Success: ${tx.slice(0, 8)}...`);
                    // Wait a bit to prevent rate limits
                    await new Promise( (r: any) => setTimeout(r, 1000));
                } catch (e: any) {
                    log(`❌ Failed: ${e.message}`);
                }
            }
            log(`🏁 STRESS TEST COMPLETE`);
        } catch (e: any) {
            log(`❌ CRITICAL ERROR: ${e.message}`);
        } finally {
            setIsLoading(false);
        }
    };

    if (!publicKey) return null;

    return (
        <div className="fixed bottom-4 right-4 z-50 w-80 bg-black/90 border border-red-500/50 rounded-xl p-4 shadow-2xl overflow-hidden font-mono text-xs">
            <div className="flex justify-between items-center mb-2 border-b border-white/10 pb-2">
                <h3 className="text-red-500 font-bold uppercase">⚠️ Dev Stress Test</h3>
                <button onClick={() => setLogs([])} className="text-gray-500 hover:text-white">Clear</button>
            </div>

            <div className="flex gap-2 mb-4">
                <button
                    onClick={() => runStressTest('YES', 5)}
                    disabled={isLoading}
                    className="flex-1 bg-green-900/50 border border-green-500/30 text-green-400 py-2 rounded hover:bg-green-500/20 disabled:opacity-50"
                >
                    Pump YES (5x)
                </button>
                <button
                    onClick={() => runStressTest('NO', 5)}
                    disabled={isLoading}
                    className="flex-1 bg-red-900/50 border border-red-500/30 text-red-400 py-2 rounded hover:bg-red-500/20 disabled:opacity-50"
                >
                    Pump NO (5x)
                </button>
            </div>

            <div className="h-40 overflow-y-auto bg-black/50 rounded p-2 border border-white/5 space-y-1">
                {logs.length === 0 && <span className="text-gray-600 italic">Ready to verify independent curves...</span>}
                {logs.map((L, i) => (
                    <div key={i} className="text-gray-300 break-all">{L}</div>
                ))}
            </div>
        </div>
    );
}
