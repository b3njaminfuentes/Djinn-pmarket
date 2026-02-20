'use client';

import { useEffect, useRef, useState } from 'react';
import { OracleLog, subscribeToLogs } from '../../lib/oracle';
import { Terminal as TerminalIcon, Pause, Play, Search, Brain, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';

interface OracleTerminalProps {
    initialLogs: OracleLog[];
}

const TYPE_COLORS: Record<string, string> = {
    system: 'text-blue-400',
    fetch: 'text-cyan-400',
    analyze: 'text-yellow-400',
    suggest: 'text-purple-400',
    approve: 'text-emerald-400',
    reject: 'text-red-400',
    error: 'text-red-500',
    warning: 'text-orange-400',
};

const TYPE_ICONS: Record<string, React.ReactNode> = {
    system: <TerminalIcon className="w-4 h-4" />,
    fetch: <Search className="w-4 h-4" />,
    analyze: <Brain className="w-4 h-4" />,
    suggest: <AlertTriangle className="w-4 h-4" />,
    approve: <CheckCircle className="w-4 h-4" />,
    reject: <XCircle className="w-4 h-4" />,
    error: <XCircle className="w-4 h-4" />,
    warning: <AlertTriangle className="w-4 h-4" />,
};

export function OracleTerminal({ initialLogs }: OracleTerminalProps) {
    const [logs, setLogs] = useState<OracleLog[]>(initialLogs);
    const [isPaused, setIsPaused] = useState(false);
    const terminalRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const channel = subscribeToLogs((newLog: OracleLog) => {
            setLogs((prev: OracleLog[]) => [newLog, ...prev].slice(0, 200));
        });

        return () => {
            channel.unsubscribe();
        };
    }, []);

    useEffect(() => {
        if (!isPaused && terminalRef.current) {
            terminalRef.current.scrollTop = 0;
        }
    }, [logs, isPaused]);

    const formatTimestamp = (ts: string) => {
        const date = new Date(ts);
        return date.toLocaleTimeString('en-US', {
            hour12: false,
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
    };

    return (
        <div className="border border-white/10 rounded-3xl overflow-hidden bg-gradient-to-br from-white/5 to-transparent">
            {/* Terminal Header */}
            <div className="flex items-center justify-between px-6 py-4 bg-black/40 border-b border-white/10">
                <div className="flex items-center gap-4">
                    <div className="flex gap-2">
                        <div className="w-3 h-3 rounded-full bg-red-500" />
                        <div className="w-3 h-3 rounded-full bg-yellow-500" />
                        <div className="w-3 h-3 rounded-full bg-emerald-500" />
                    </div>
                    <div className="flex items-center gap-2">
                        <TerminalIcon className="w-4 h-4 text-[#F492B7]" />
                        <span className="text-white font-bold">Live Activity Feed</span>
                    </div>
                    {!isPaused && logs.length > 0 && (
                        <div className="flex items-center gap-2 text-emerald-400 text-sm">
                            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                            Live
                        </div>
                    )}
                </div>
                <button
                    onClick={() => setIsPaused(!isPaused)}
                    className={`flex items-center gap-2 px-4 py-2 text-sm font-bold rounded-xl transition-all ${isPaused
                        ? 'bg-[#F492B7]/20 text-[#F492B7] border border-[#F492B7]/30 hover:bg-[#F492B7]/30'
                        : 'bg-white/5 text-gray-400 hover:text-white border border-white/10 hover:border-white/20'
                        }`}
                >
                    {isPaused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
                    {isPaused ? 'Resume' : 'Pause'}
                </button>
            </div>

            {/* Terminal Body */}
            <div
                ref={terminalRef}
                onMouseEnter={() => setIsPaused(true)}
                onMouseLeave={() => setIsPaused(false)}
                className="h-[400px] overflow-y-auto bg-[#0a0d12] font-mono text-sm p-4"
            >
                {logs.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-gray-500">
                        <Search className="w-12 h-12 mb-4 opacity-50" />
                        <p className="font-bold">No activity yet</p>
                        <p className="text-xs mt-1">Start the bot to begin monitoring markets</p>
                    </div>
                ) : (
                    logs.map((log) => (
                        <div
                            key={log.id}
                            className="flex items-start gap-4 py-2 px-3 rounded-lg hover:bg-white/5 transition-colors group"
                        >
                            <span className="text-gray-600 shrink-0 font-mono">
                                {formatTimestamp(log.created_at)}
                            </span>

                            <span className={`shrink-0 ${TYPE_COLORS[log.type] || 'text-gray-400'}`}>
                                {TYPE_ICONS[log.type] || <TerminalIcon className="w-4 h-4" />}
                            </span>

                            <span className="shrink-0 px-2 py-0.5 rounded-md bg-white/10 text-gray-400 text-xs font-medium min-w-[60px] text-center">
                                {log.source || 'system'}
                            </span>

                            <span className={`${TYPE_COLORS[log.type] || 'text-gray-300'} flex-1`}>
                                {log.message}
                            </span>
                        </div>
                    ))
                )}
            </div>

            {/* Terminal Footer with Input */}
            <div className="px-6 py-3 bg-black/40 border-t border-white/10">
                <div className="flex items-center gap-2 mb-2">
                    <span className="text-emerald-500 font-bold animate-pulse">{'>'}</span>
                    <input
                        type="text"
                        placeholder="Enter command (e.g. 'status', 'help', 'scan <slug>')"
                        className="w-full bg-transparent border-none outline-none text-emerald-400 font-mono text-sm placeholder-emerald-900/50"
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                                const cmd = e.currentTarget.value.trim();
                                if (!cmd) return;

                                // Add command to logs
                                const newLog = {
                                    id: Math.random().toString(),
                                    type: 'system',
                                    source: 'user',
                                    message: `> ${cmd}`,
                                    created_at: new Date().toISOString()
                                };
                                setLogs( (prev: any) => [newLog as OracleLog, ...prev]);

                                // Process Command (Mock logic for UI interaction)
                                let responseMsg = '';
                                const [command, arg] = cmd.toLowerCase().split(' ');

                                switch (command) {
                                    case 'status':
                                        // Mock status report based on active simulation
                                        const statusReport = [
                                            '⚡ ORACLE SYSTEM STATUS: ONLINE',
                                            '--------------------------------',
                                            '📡 ACTIVE SOURCES:',
                                            '   [✓] Google Search (API v1)',
                                            '   [✓] Yahoo FinanceStream',
                                            '   [✓] DexScreener (Solana)',
                                            '   [✓] Twitter/X Sentinel',
                                            '',
                                            '👀 ACTIVELY MONITORING:',
                                            '   > Argentina vs France (Sports)',
                                            '   > Bitcoin $100k (Crypto)',
                                            '   > GTA 6 Delay (Gaming)',
                                            '',
                                            '🤖 AI AGENT: GEMINI-PRO (Latency: 120ms)',
                                            '🔄 Next Fetch Cycle: 45s'
                                        ].join('\n');
                                        responseMsg = statusReport;
                                        break;
                                    case 'help':
                                        responseMsg = 'Available commands: status, help, scan <market_slug>, clear';
                                        break;
                                    case 'clear':
                                        setLogs([]);
                                        e.currentTarget.value = '';
                                        return;
                                    case 'scan':
                                        responseMsg = arg ? `Initiating deep scan for: ${arg}...` : 'Error: Missing market slug.';
                                        if (arg) {
                                            fetch('/api/oracle/monitor', {
                                                method: 'POST',
                                                headers: { 'Content-Type': 'application/json' },
                                                body: JSON.stringify({ slug: arg })
                                            });
                                        }
                                        break;
                                    case 'hello':
                                        responseMsg = 'Hello, Protocol Authority. I am ready.';
                                        break;
                                    default:
                                        responseMsg = `Command not recognized: ${command}`;
                                }

                                // Add response to logs
                                setTimeout(() => {
                                    setLogs( (prev: any) => [{
                                        id: Math.random().toString(),
                                        type: 'system',
                                        source: 'oracle',
                                        message: responseMsg,
                                        created_at: new Date().toISOString()
                                    } as OracleLog, ...prev]);
                                }, 500);

                                e.currentTarget.value = '';
                            }
                        }}
                    />
                </div>
                <div className="flex justify-between text-xs text-gray-600 font-mono">
                    <span>{logs.length} events logged</span>
                    <span>{isPaused ? 'PAUSED' : 'LIVE'}</span>
                </div>
            </div>
        </div>
    );
}
