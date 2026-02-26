'use client';
import { useEffect, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, AlertTriangle, X, ExternalLink, ChevronDown, ChevronUp, Loader2, Brain, Activity, ShieldAlert, Users, UserCheck, Twitter, Calendar } from 'lucide-react';
import CerberusThought from '@/components/admin/CerberusThought';

const ADMIN_WALLET = "C31JQfZBVRsnvFqiNptD95rvbEx8fsuPwdZn62yEWx9X";

// Premium Status Badge with Pink Check for Verified
const MarketStatusBadge = ({ status }: { status: string }) => {
    const s = status ? status.toUpperCase() : 'PENDING';

    if (s === 'VERIFIED') return (
        <span className="inline-flex items-center gap-1.5 bg-[#F492B7]/10 border border-[#F492B7]/50 px-3 py-1 rounded-full text-xs font-black text-[#F492B7] shadow-[0_0_15px_rgba(244,146,183,0.3)]">
            <Check size={14} strokeWidth={3} />
            VERIFIED
        </span>
    );
    if (s === 'REJECTED') return (
        <span className="inline-flex items-center gap-1.5 bg-red-500/10 border border-red-500/50 px-3 py-1 rounded-full text-xs font-black text-red-500">
            <X size={14} strokeWidth={3} />
            REJECTED
        </span>
    );
    if (s === 'UNCERTAIN' || s === 'MANUAL_REQUIRED') return (
        <span className="inline-flex items-center gap-1.5 bg-amber-500/10 border border-amber-500/50 px-3 py-1 rounded-full text-xs font-black text-amber-500 animate-pulse">
            <AlertTriangle size={14} strokeWidth={3} />
            NEEDS REVIEW
        </span>
    );
    if (s === 'ANALYZING' || s === 'PENDING') return (
        <span className="inline-flex items-center gap-1.5 bg-blue-500/10 border border-blue-500/50 px-3 py-1 rounded-full text-xs font-black text-blue-500">
            <Loader2 size={14} className="animate-spin" />
            ANALYZING...
        </span>
    );
    return <span className="text-gray-500 text-xs font-mono">{s}</span>;
};

export default function DracoDashboard() {
    const { publicKey, connected } = useWallet();
    const [isLogged, setIsLogged] = useState(false);
    const [user, setUser] = useState('');
    const [pwd, setPwd] = useState('');
    const [secret, setSecret] = useState('');
    const [markets, setMarkets] = useState<any[]>([]);
    const [expandedLogs, setExpandedLogs] = useState<string | null>(null);
    const [processingQueue, setProcessingQueue] = useState<string[]>([]);
    const [activeTab, setActiveTab] = useState<'MARKETS' | 'BRAIN' | 'USERS'>('MARKETS');
    const [usersList, setUsersList] = useState<any[]>([]);
    const [loadingUsers, setLoadingUsers] = useState(false);

    const fetchMarkets = async () => {
        try {
            const res = await fetch('/api/markets', {
                headers: { 'x-admin-secret': secret }
            });
            const data = await res.json();
            if (Array.isArray(data)) setMarkets(data);
        } catch (e) {
            console.error('[DRACO] Failed to fetch markets:', e);
        }
    };

    const fetchUsers = async () => {
        setLoadingUsers(true);
        try {
            const res = await fetch('/api/admin/detailed-stats', {
                headers: { 'x-admin-secret': secret }
            });
            const data = await res.json();
            if (data.success) {
                setUsersList(data.profiles);
            }
        } catch (e) {
            console.error('[DRACO] Failed to fetch users:', e);
        } finally {
            setLoadingUsers(false);
        }
    };

    useEffect(() => {
        if (isLogged && connected && publicKey?.toString() === ADMIN_WALLET) {
            if (activeTab === 'MARKETS') {
                fetchMarkets();
                const interval = setInterval(fetchMarkets, 5000);
                return () => clearInterval(interval);
            } else if (activeTab === 'USERS') {
                fetchUsers();
            }
        }
    }, [isLogged, connected, publicKey, activeTab]);

    const handleLogin = (e: React.FormEvent) => {
        e.preventDefault();
        if (user === 'lord' && pwd === 'batman') {
            setIsLogged(true);
        } else {
            alert("ACCESS DENIED: Invalid credentials.");
        }
    };

    const updateStatus = async (id: string, status: string) => {
        setProcessingQueue((prev: any) => [...prev, id]);
        await fetch('/api/markets', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'x-admin-secret': secret
            },
            body: JSON.stringify({ id, status }),
        });
        setProcessingQueue((prev: any) => prev.filter((p: any) => p !== id));
        fetchMarkets();
    };

    // 🟢 PANTALLA 1: LOGIN MATRIX
    if (!isLogged) {
        return (
            <div className="min-h-screen bg-black flex flex-col items-center justify-center font-mono overflow-hidden relative">
                <div className="absolute inset-0 opacity-20 pointer-events-none">
                    <div className="h-full w-full bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-green-900 via-black to-black animate-pulse" />
                </div>
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="z-10 bg-black/80 border border-green-500/50 p-10 rounded-lg shadow-[0_0_50px_rgba(0,255,0,0.1)] max-w-md w-full"
                >
                    <div className="text-center mb-8">
                        <h1 className="text-5xl font-black text-green-500 tracking-[0.2em] mb-2 drop-shadow-[0_0_10px_rgba(34,197,94,0.5)]">DRACO</h1>
                        <p className="text-green-800 text-xs">// COMMAND_CENTER_V2.0</p>
                    </div>
                    <form onSubmit={handleLogin} className="space-y-6">
                        <div>
                            <label className="block text-green-500 text-xs mb-2 uppercase tracking-widest">Identifier</label>
                            <input
                                type="text" value={user} onChange={(e) => setUser(e.target.value)}
                                className="w-full bg-black border border-green-900 p-3 text-green-400 focus:outline-none focus:border-green-500 transition-colors"
                                placeholder="USER"
                            />
                        </div>
                        <div>
                            <label className="block text-green-500 text-xs mb-2 uppercase tracking-widest">Secret Key</label>
                            <input
                                type="password" value={secret} onChange={(e) => setSecret(e.target.value)}
                                className="w-full bg-black border border-green-900 p-3 text-green-400 focus:outline-none focus:border-green-500 transition-colors"
                                placeholder="ADMIN_SECRET"
                            />
                        </div>
                        <button type="submit" className="w-full bg-green-500 text-black font-black p-4 rounded hover:bg-green-400 transition-all uppercase tracking-widest">
                            Unlock System
                        </button>
                    </form>
                    <div className="mt-8 text-[10px] text-green-900 text-center uppercase tracking-tighter">
                        Warning: Unauthorized access will be detected and neutralized by Cerberus.
                    </div>
                </motion.div>
            </div>
        );
    }

    // 🟠 PANTALLA 2: WALLET CHECK
    if (!connected || publicKey?.toString() !== ADMIN_WALLET) {
        return (
            <div className="min-h-screen bg-black flex flex-col items-center justify-center font-mono p-8 animate-in fade-in duration-700">
                <div className="text-center max-w-lg">
                    <h2 className="text-3xl font-bold text-red-500 mb-6 tracking-tighter">SECURITY PROTOCOL ACTIVE</h2>
                    <p className="text-gray-400 mb-10 text-sm leading-relaxed">
                        Credentials valid, but the Master Wallet signature is required. Connect your device.
                    </p>
                    <div className="inline-block p-1 bg-gradient-to-r from-green-500 to-emerald-900 rounded-lg">
                        <div className="bg-black rounded-md p-4">
                            <WalletMultiButton />
                        </div>
                    </div>
                    <p className="mt-10 text-[10px] text-green-900">EXPECTED IDENTITY: {ADMIN_WALLET.slice(0, 10)}...</p>
                </div>
            </div>
        );
    }

    // 🐉 PANTALLA 3: DASHBOARD PRINCIPAL - HORIZONTAL LAYOUT
    const activeMarkets = markets.filter((m: any) => m.status === 'PENDING' || m.status === 'ANALYZING').slice(0, 2);
    const queuedMarkets = markets.filter((m: any) => m.status !== 'PENDING' && m.status !== 'ANALYZING' && m.status !== 'VERIFIED' && m.status !== 'REJECTED');
    const completedMarkets = markets.filter((m: any) => m.status === 'VERIFIED' || m.status === 'REJECTED');

    return (
        <div className="min-h-screen bg-[#030303] text-white font-sans pt-28 px-6 pb-12 selection:bg-green-500/30">
            {/* HEADER */}
            <header className="max-w-7xl mx-auto flex justify-between items-center mb-10 border-b border-white/5 pb-6">
                <div>
                    <h1 className="text-3xl font-black text-white italic tracking-tighter">
                        DRACO <span className="text-green-500">//</span> COMMAND CENTER
                    </h1>
                    <p className="text-xs text-green-500 font-mono mt-1 uppercase tracking-widest">
                        🐕 CERBERUS AI MONITORING SYSTEM
                    </p>
                </div>
                <div className="flex items-center gap-6">
                    <div className="flex bg-white/5 p-1 rounded-xl border border-white/10 gap-1">
                        <button
                            onClick={() => setActiveTab('MARKETS')}
                            className={`px-4 py-2 rounded-lg text-xs font-black uppercase tracking-widest transition-all ${activeTab === 'MARKETS' ? 'bg-green-500 text-black' : 'text-gray-500 hover:text-white'}`}
                        >
                            Markets
                        </button>
                        <button
                            onClick={() => setActiveTab('BRAIN')}
                            className={`px-4 py-2 rounded-lg text-xs font-black uppercase tracking-widest transition-all ${activeTab === 'BRAIN' ? 'bg-green-500 text-black' : 'text-gray-500 hover:text-white'}`}
                        >
                            Cognitive Trace
                        </button>
                        <button
                            onClick={() => setActiveTab('USERS')}
                            className={`px-4 py-2 rounded-lg text-xs font-black uppercase tracking-widest transition-all ${activeTab === 'USERS' ? 'bg-green-500 text-black' : 'text-gray-500 hover:text-white'}`}
                        >
                            Users
                        </button>
                    </div>
                    <div className="text-right font-mono">
                        <p className="text-[10px] text-gray-500 uppercase">Markets in Queue</p>
                        <p className="text-lg text-green-500 tabular-nums font-black">{markets.length}</p>
                    </div>
                </div>
            </header>

            <AnimatePresence mode="wait">
                {activeTab === 'MARKETS' ? (
                    <motion.div
                        key="markets"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        transition={{ duration: 0.3 }}
                    >
                        {/* ACTIVE PROCESSING SECTION */}
                        <section className="max-w-7xl mx-auto mb-10">
                            <div className="flex items-center gap-3 mb-4">
                                <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                                <h2 className="text-sm font-black text-gray-400 uppercase tracking-widest">Active Processing</h2>
                            </div>
                            {activeMarkets.length === 0 ? (
                                <div className="border border-dashed border-green-900/30 rounded-xl p-8 text-center text-green-900 font-mono text-sm">
                                    No markets currently being analyzed. Awaiting submissions...
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    {activeMarkets.map((m) => (
                                        <MarketRow key={m.id} market={m} expandedLogs={expandedLogs} setExpandedLogs={setExpandedLogs} updateStatus={updateStatus} processingQueue={processingQueue} secret={secret} />
                                    ))}
                                </div>
                            )}
                        </section>

                        {/* NEEDS REVIEW */}
                        {queuedMarkets.length > 0 && (
                            <section className="max-w-7xl mx-auto mb-10">
                                <div className="flex items-center gap-3 mb-4">
                                    <AlertTriangle size={14} className="text-amber-500" />
                                    <h2 className="text-sm font-black text-amber-500 uppercase tracking-widest">Needs Human Review</h2>
                                </div>
                                <div className="space-y-4">
                                    {queuedMarkets.map((m) => (
                                        <MarketRow key={m.id} market={m} expandedLogs={expandedLogs} setExpandedLogs={setExpandedLogs} updateStatus={updateStatus} processingQueue={processingQueue} secret={secret} />
                                    ))}
                                </div>
                            </section>
                        )}

                        {/* COMPLETED */}
                        {completedMarkets.length > 0 && (
                            <section className="max-w-7xl mx-auto">
                                <div className="flex items-center gap-3 mb-4">
                                    <Check size={14} className="text-[#F492B7]" />
                                    <h2 className="text-sm font-black text-gray-500 uppercase tracking-widest">Completed</h2>
                                </div>
                                <div className="space-y-3 opacity-60">
                                    {completedMarkets.slice(0, 10).map((m) => (
                                        <MarketRow key={m.id} market={m} expandedLogs={expandedLogs} setExpandedLogs={setExpandedLogs} updateStatus={updateStatus} processingQueue={processingQueue} isCompact secret={secret} />
                                    ))}
                                </div>
                            </section>
                        )}

                        {markets.length === 0 && (
                            <div className="h-[50vh] flex flex-col items-center justify-center opacity-30 grayscale saturate-0">
                                <div className="w-20 h-20 border-4 border-dashed border-green-500 rounded-full animate-spin mb-6" />
                                <p className="text-green-500 font-mono text-sm animate-pulse tracking-widest uppercase">Scanning empty sectors...</p>
                            </div>
                        )}
                    </motion.div>
                ) : activeTab === 'BRAIN' ? (
                    <motion.div
                        key="brain"
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        transition={{ duration: 0.4 }}
                        className="max-w-6xl mx-auto"
                    >
                        <div className="mb-8 flex items-center justify-between">
                            <div>
                                <h2 className="text-2xl font-black text-white uppercase tracking-tighter">Cerberus Live Reasoning</h2>
                                <p className="text-xs text-green-500 font-mono">Real-time simulation of self-correcting AI agent logic</p>
                            </div>
                            <div className="bg-white/5 border border-white/10 px-4 py-2 rounded-full flex items-center gap-2 text-[10px] font-bold text-gray-400">
                                <Activity size={12} className="text-green-500" /> SYSTEM_UPTIME: 99.9%
                            </div>
                        </div>
                        <CerberusThought />
                        <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-6 pb-20">
                            <div className="p-6 bg-green-500/5 border border-green-500/20 rounded-2xl">
                                <h3 className="text-sm font-black text-green-500 uppercase mb-3 flex items-center gap-2">
                                    <ShieldAlert size={14} /> Recovery Protocol
                                </h3>
                                <p className="text-xs text-gray-500 leading-relaxed font-mono">
                                    Cerberus identifies critical failures via the <span className="text-red-500">DRAW_TRACE</span> module. Upon detection, it triggers a recursive reflection loop to recalculate the optimal path (DAG) before final verification.
                                </p>
                            </div>
                            <div className="p-6 bg-white/5 border border-white/10 rounded-2xl">
                                <h3 className="text-sm font-black text-white uppercase mb-3 flex items-center gap-2">
                                    <Brain size={14} /> Cognitive Architecture
                                </h3>
                                <p className="text-xs text-gray-500 leading-relaxed font-mono">
                                    Built on aDirected Acyclic Graph (DAG) system, allowing for non-linear reasoning. Each node represents a discrete cognitive step in the verification process.
                                </p>
                            </div>
                        </div>
                    </motion.div>
                ) : (
                    <motion.div
                        key="users"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="max-w-7xl mx-auto"
                    >
                        <div className="flex items-center justify-between mb-8">
                            <div>
                                <h2 className="text-2xl font-black text-white uppercase tracking-tighter">User Directory</h2>
                                <p className="text-xs text-green-500 font-mono">Monitoring wallet connections and identity claims</p>
                            </div>
                            <button
                                onClick={fetchUsers}
                                className="bg-white/5 hover:bg-white/10 border border-white/10 px-4 py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest flex items-center gap-2"
                            >
                                <Activity size={12} className={loadingUsers ? 'animate-spin' : ''} /> Refresh List
                            </button>
                        </div>

                        <div className="bg-black/40 border border-white/5 rounded-2xl overflow-hidden">
                            <table className="w-full text-left border-collapse">
                                <thead className="bg-white/5 text-[10px] font-black text-gray-500 uppercase tracking-widest">
                                    <tr>
                                        <th className="px-6 py-4">Identity</th>
                                        <th className="px-6 py-4">Username</th>
                                        <th className="px-6 py-4">X/Twitter</th>
                                        <th className="px-6 py-4">Attributes</th>
                                        <th className="px-6 py-4">Joined</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-white/5">
                                    {usersList.length === 0 ? (
                                        <tr>
                                            <td colSpan={5} className="px-6 py-12 text-center text-gray-600 font-mono text-sm italic">
                                                No connections detected in current cycle.
                                            </td>
                                        </tr>
                                    ) : (
                                        usersList.map((u) => (
                                            <tr key={u.wallet_address} className="hover:bg-white/5 transition-colors group">
                                                <td className="px-6 py-4">
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-green-500/20 to-emerald-900/20 border border-green-500/30 flex items-center justify-center overflow-hidden shrink-0">
                                                            {u.avatar_url ? (
                                                                <img src={u.avatar_url} className="w-full h-full object-cover" />
                                                            ) : (
                                                                <Users size={14} className="text-green-500" />
                                                            )}
                                                        </div>
                                                        <div className="flex flex-col">
                                                            <span className="text-xs font-mono text-gray-400 group-hover:text-green-500 transition-colors">
                                                                {u.wallet_address.slice(0, 6)}...{u.wallet_address.slice(-4)}
                                                            </span>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <div className="flex items-center gap-2">
                                                        {u.hasClaimedUsername ? (
                                                            <span className="text-sm font-bold text-white flex items-center gap-1.5">
                                                                {u.username}
                                                                <UserCheck size={14} className="text-green-500" />
                                                            </span>
                                                        ) : (
                                                            <span className="text-xs text-gray-600 italic">{u.username || 'Anonymous'}</span>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    {u.hasLinkedX ? (
                                                        <a
                                                            href={`https://x.com/${u.twitter}`}
                                                            target="_blank"
                                                            className="inline-flex items-center gap-1.5 bg-blue-500/10 border border-blue-500/50 px-2 py-1 rounded text-[10px] font-black text-blue-400 hover:bg-blue-500 hover:text-white transition-all"
                                                        >
                                                            <Twitter size={12} /> @{u.twitter}
                                                        </a>
                                                    ) : (
                                                        <span className="text-[10px] font-bold text-gray-700 uppercase tracking-tighter">Not Linked</span>
                                                    )}
                                                </td>
                                                <td className="px-6 py-4">
                                                    <div className="flex gap-2">
                                                        {u.isBot ? (
                                                            <span className="text-[9px] font-black bg-purple-500/20 text-purple-400 border border-purple-500/30 px-2 py-0.5 rounded uppercase">Bot</span>
                                                        ) : (
                                                            <span className="text-[9px] font-black bg-blue-500/20 text-blue-400 border border-blue-500/30 px-2 py-0.5 rounded uppercase">Human</span>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <div className="flex items-center gap-2 text-gray-500 text-[10px] font-mono">
                                                        <Calendar size={12} />
                                                        {new Date(u.created_at).toLocaleDateString()}
                                                    </div>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </motion.div>
                    )}
                </AnimatePresence>
        </div>
    );
}

// HORIZONTAL MARKET ROW COMPONENT
function MarketRow({ market: m, expandedLogs, setExpandedLogs, updateStatus, processingQueue, isCompact = false, secret = '' }: any) {
    const isExpanded = expandedLogs === m.id;
    const isProcessing = processingQueue.includes(m.id);

    // Show buttons if: requiresHuman is true OR verdict is UNCERTAIN OR status is UNCERTAIN/PENDING
    const dog3Score = m.dog3Score || 0;
    const needsManualAction = m.requiresHuman === true || m.verdict === 'UNCERTAIN' || m.status === 'UNCERTAIN' || m.status === 'PENDING';
    const buttonsEnabled = needsManualAction && m.status !== 'VERIFIED' && m.status !== 'REJECTED';
    const needsReview = m.status === 'UNCERTAIN' || m.status === 'MANUAL_REQUIRED' || (m.status === 'PENDING' && m.requiresHuman);

    // Handle LORD Override
    const handleLordOverride = async (decision: 'VERIFIED' | 'REJECTED') => {
        await fetch('/api/markets', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'x-admin-secret': secret
            },
            body: JSON.stringify({
                id: m.id,
                status: decision,
                lordOverride: {
                    decision,
                    timestamp: Date.now(),
                    reason: 'Manual override by LORD'
                }
            }),
        });
    };

    return (
        <div className={`flex flex-col border rounded-xl overflow-hidden transition-all duration-300 ${m.status === 'VERIFIED' ? 'border-[#F492B7]/30 bg-[#F492B7]/5' : m.status === 'REJECTED' ? 'border-red-500/30 bg-red-500/5' : 'border-green-900/40 bg-black/50 hover:border-green-500/50'}`}>
            {/* MAIN ROW */}
            <div className={`flex items-center gap-6 ${isCompact ? 'p-3' : 'p-4'}`}>
                {/* 1. MARKET IMAGE */}
                <div className={`shrink-0 border border-green-500/20 rounded-lg overflow-hidden ${isCompact ? 'w-12 h-12' : 'w-16 h-16'}`}>
                    <img
                        src={m.imageUrl || '/placeholder-market.png'}
                        className="w-full h-full object-cover grayscale hover:grayscale-0 transition-all duration-500"
                        onError={(e) => { e.currentTarget.src = 'https://via.placeholder.com/64'; }}
                    />
                </div>

                {/* 2. INFO CENTRAL */}
                <div className="flex-1 min-w-0">
                    <h3 className={`text-white font-bold leading-tight truncate ${isCompact ? 'text-sm' : 'text-lg'}`}>{m.title}</h3>
                    <div className="flex flex-wrap gap-4 text-[10px] text-green-700 mt-1 font-mono">
                        <span className="cursor-pointer hover:text-green-400">BY: {m.creator || 'Unknown'}</span>
                        {m.sourceUrl && (
                            <a href={m.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline flex items-center gap-1">
                                <ExternalLink size={10} /> SOURCE
                            </a>
                        )}
                        <span className="text-gray-600">ID: {m.id?.slice(-8)}</span>
                    </div>

                    {/* DOG SCORES BAR */}
                    {!isCompact && (m.dog1Score > 0 || m.dog2Score > 0 || m.dog3Score > 0) && (
                        <div className="flex items-center gap-4 mt-2 font-mono text-[10px]">
                            <span className="text-green-600">
                                🐕₁ <span className={`font-bold ${m.dog1Score >= 70 ? 'text-green-400' : m.dog1Score >= 40 ? 'text-amber-400' : 'text-red-400'}`}>{m.dog1Score}</span>/100
                            </span>
                            <span className="text-green-600">
                                🐕₂ <span className={`font-bold ${m.dog2Score >= 70 ? 'text-green-400' : m.dog2Score >= 40 ? 'text-amber-400' : 'text-red-400'}`}>{m.dog2Score}</span>/100
                            </span>
                            <span className="text-green-600">
                                🐕₃ <span className={`font-bold ${dog3Score >= 90 ? 'text-[#F492B7]' : dog3Score >= 70 ? 'text-green-400' : dog3Score >= 40 ? 'text-amber-400' : 'text-red-400'}`}>{dog3Score}</span>/100
                            </span>
                            {dog3Score >= 90 && <span className="text-[#F492B7] text-[9px]">✓ AUTO-VERIFIED</span>}
                        </div>
                    )}
                </div>

                {/* 3. STATUS & ACTIONS */}
                <div className="flex items-center gap-4">
                    <MarketStatusBadge status={m.status} />

                    {/* Manual Buttons (Show when action needed) */}
                    {buttonsEnabled && !isCompact && (
                        <div className="flex gap-2">
                            <button
                                onClick={() => handleLordOverride('VERIFIED')}
                                disabled={isProcessing}
                                className="flex items-center gap-1.5 bg-[#F492B7]/10 border border-[#F492B7]/50 px-4 py-2 text-[#F492B7] text-xs font-black hover:bg-[#F492B7] hover:text-black transition-all rounded-lg disabled:opacity-50 animate-pulse"
                            >
                                <Check size={14} /> APPROVE
                            </button>
                            <button
                                onClick={() => handleLordOverride('REJECTED')}
                                disabled={isProcessing}
                                className="flex items-center gap-1.5 bg-red-500/10 border border-red-500/50 px-4 py-2 text-red-500 text-xs font-black hover:bg-red-500 hover:text-white transition-all rounded-lg disabled:opacity-50"
                            >
                                <X size={14} /> REJECT
                            </button>
                        </div>
                    )}

                    {/* Already verified/rejected - no buttons needed */}

                    {/* Log Toggle */}
                    <button
                        onClick={() => setExpandedLogs(isExpanded ? null : m.id)}
                        className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-gray-500 hover:text-white transition-colors"
                    >
                        {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </button>
                </div>
            </div>

            {/* 4. CERBERUS DOGS CONSOLE (Expandable) */}
            <AnimatePresence>
                {isExpanded && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="bg-green-900/5 border-t border-green-900/20 overflow-hidden"
                    >
                        <div className="p-4 font-mono text-[11px]">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                {/* DOG 1: HUNTER */}
                                <div className="border-r-0 md:border-r border-green-900/20 pr-0 md:pr-4">
                                    <div className="text-green-500 font-bold mb-2 flex items-center gap-2">
                                        🐕 <span className="tracking-widest">DOG_1: HUNTER</span>
                                    </div>
                                    <div className="text-green-800 space-y-1 max-h-32 overflow-y-auto custom-scrollbar">
                                        {m.logsDog1 ? (
                                            m.logsDog1.split('\n').map((line: string, i: number) => (
                                                <p key={i} className={line.includes('[OK]') ? 'text-green-500' : line.includes('[ERR]') ? 'text-red-500' : ''}>{line}</p>
                                            ))
                                        ) : (
                                            <p className="animate-pulse">Searching for sources...</p>
                                        )}
                                    </div>
                                </div>

                                {/* DOG 2: ANALYST */}
                                <div className="border-r-0 md:border-r border-green-900/20 pr-0 md:pr-4">
                                    <div className="text-green-500 font-bold mb-2 flex items-center gap-2">
                                        🐕 <span className="tracking-widest">DOG_2: ANALYST</span>
                                    </div>
                                    <div className="text-green-800 space-y-1 max-h-32 overflow-y-auto custom-scrollbar">
                                        {m.logsDog2 ? (
                                            m.logsDog2.split('\n').map((line: string, i: number) => (
                                                <p key={i}>{line}</p>
                                            ))
                                        ) : (
                                            <p className="text-gray-600">Awaiting data from DOG_1...</p>
                                        )}
                                    </div>
                                </div>

                                {/* DOG 3: JUDGE */}
                                <div>
                                    <div className="text-green-500 font-bold mb-2 flex items-center gap-2">
                                        🐕 <span className="tracking-widest">DOG_3: JUDGE</span>
                                    </div>
                                    <div className="text-green-800 space-y-1 max-h-32 overflow-y-auto custom-scrollbar">
                                        {m.logsDog3 ? (
                                            m.logsDog3.split('\n').map((line: string, i: number) => (
                                                <p key={i} className={line.includes('VERIFIED') ? 'text-[#F492B7] font-bold' : line.includes('REJECTED') ? 'text-red-500 font-bold' : line.includes('UNCERTAIN') ? 'text-amber-500 font-bold' : ''}>{line}</p>
                                            ))
                                        ) : (
                                            <p className="text-gray-600">Awaiting analysis from DOG_2...</p>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
