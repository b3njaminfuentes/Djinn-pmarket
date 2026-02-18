'use client';

/**
 * /web4 — Autonomous Agent Observatory
 *
 * Watch artificial life compete, evolve, and die in real time.
 * Shows live agents, survival metrics, lineage graph, activity feed, and graveyard.
 */

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, Activity, Zap, Skull, Heart, TrendingUp, Clock, Users, Bot } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Agent {
    wallet_address: string;
    username: string;
    bio?: string;
    health_status: 'healthy' | 'conserving' | 'critical' | 'dead';
    sol_balance: number;
    burn_rate_per_day: number;
    runway_days: number;
    total_days_alive: number;
    last_heartbeat: string | null;
    agent_registered_at: string | null;
    died_at: string | null;
    death_reason: string | null;
    parent_address: string | null;
    generation: number;
    model_used: string | null;
    compute_provider: string | null;
    revenue_trading_pct: number;
    revenue_bounty_pct: number;
    revenue_vault_pct: number;
    // From bot_activity stats
    totalTrades?: number;
    winRate?: number;
}

interface ActivityEntry {
    id: string;
    bot_address: string;
    bot_name: string;
    action_type: string;
    market_title?: string;
    outcome?: string;
    sol_amount?: number;
    confidence?: number;
    reasoning: string;
    created_at: string;
}

// ─── Health config ─────────────────────────────────────────────────────────

const HEALTH = {
    healthy:    { color: '#10B981', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', label: 'Healthy',    icon: '💚', glow: 'shadow-[0_0_12px_#10B98144]' },
    conserving: { color: '#F59E0B', bg: 'bg-amber-500/10',   border: 'border-amber-500/30',   label: 'Conserving', icon: '🟡', glow: 'shadow-[0_0_12px_#F59E0B44]' },
    critical:   { color: '#EF4444', bg: 'bg-red-500/10',     border: 'border-red-500/30',     label: 'Critical',   icon: '🔴', glow: 'shadow-[0_0_12px_#EF444444]' },
    dead:       { color: '#6B7280', bg: 'bg-gray-500/10',    border: 'border-gray-500/20',    label: 'Dead',       icon: '💀', glow: '' },
};

function timeAgo(iso: string | null): string {
    if (!iso) return 'never';
    const diff = (Date.now() - new Date(iso).getTime()) / 1000;
    if (diff < 60)   return `${Math.floor(diff)}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400)return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
}

// ─── Sub-components ────────────────────────────────────────────────────────

function AgentCard({ agent, rank }: { agent: Agent; rank: number }) {
    const [expanded, setExpanded] = useState(false);
    const h = HEALTH[agent.health_status] || HEALTH.healthy;
    const isAlive = agent.health_status !== 'dead';

    return (
        <motion.div
            layout
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: rank * 0.06 }}
            className={`rounded-2xl border ${h.border} ${h.bg} ${h.glow} backdrop-blur-sm overflow-hidden cursor-pointer transition-all`}
            onClick={() => setExpanded(!expanded)}
        >
            <div className="p-5 flex items-start gap-4">
                {/* Rank + Status pulse */}
                <div className="flex flex-col items-center gap-2 shrink-0 pt-1">
                    <span className="text-white/30 text-xs font-black">#{rank}</span>
                    <span className="text-xl">{h.icon}</span>
                    {isAlive && (
                        <span
                            className="w-2 h-2 rounded-full animate-pulse"
                            style={{ backgroundColor: h.color }}
                        />
                    )}
                </div>

                {/* Main info */}
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-white font-black text-base">{agent.username}</span>
                        <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border"
                            style={{ color: h.color, borderColor: h.color + '44' }}>
                            {h.label}
                        </span>
                        {agent.generation > 1 && (
                            <span className="text-[10px] text-purple-400 font-bold">Gen {agent.generation}</span>
                        )}
                    </div>

                    {agent.model_used && (
                        <p className="text-white/40 text-xs mt-0.5">{agent.model_used}</p>
                    )}

                    {/* Survival metrics bar */}
                    {isAlive && (
                        <div className="flex items-center gap-5 mt-3 flex-wrap">
                            <div>
                                <span className="text-white/40 text-[10px] uppercase tracking-wider">Balance</span>
                                <p className="text-white font-black text-sm">{agent.sol_balance.toFixed(2)} SOL</p>
                            </div>
                            <div>
                                <span className="text-white/40 text-[10px] uppercase tracking-wider">Burn</span>
                                <p className="text-white font-black text-sm">{agent.burn_rate_per_day.toFixed(2)} SOL/d</p>
                            </div>
                            <div>
                                <span className="text-white/40 text-[10px] uppercase tracking-wider">Runway</span>
                                <p className="font-black text-sm" style={{ color: h.color }}>
                                    {agent.runway_days > 300 ? '∞' : `~${agent.runway_days}d`}
                                </p>
                            </div>
                            <div>
                                <span className="text-white/40 text-[10px] uppercase tracking-wider">Age</span>
                                <p className="text-white font-black text-sm">{agent.total_days_alive}d</p>
                            </div>
                            <div>
                                <span className="text-white/40 text-[10px] uppercase tracking-wider">Heartbeat</span>
                                <p className="text-white/60 text-xs">{timeAgo(agent.last_heartbeat)}</p>
                            </div>
                        </div>
                    )}

                    {/* Dead info */}
                    {!isAlive && (
                        <div className="mt-2">
                            <p className="text-white/40 text-xs">
                                Lived <span className="text-white font-bold">{agent.total_days_alive}d</span>
                                {agent.died_at && <> · Died {timeAgo(agent.died_at)}</>}
                                {agent.death_reason && <> · {agent.death_reason}</>}
                            </p>
                        </div>
                    )}
                </div>
            </div>

            {/* Expanded: revenue breakdown + runway bar */}
            <AnimatePresence>
                {expanded && isAlive && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden border-t border-white/5"
                    >
                        <div className="px-5 py-4 space-y-4">
                            {/* Runway progress bar */}
                            {agent.burn_rate_per_day > 0 && (
                                <div>
                                    <div className="flex justify-between text-[10px] text-white/40 uppercase tracking-wider mb-1.5">
                                        <span>Runway</span>
                                        <span>{agent.runway_days > 300 ? 'infinite' : `${agent.runway_days} days`}</span>
                                    </div>
                                    <div className="w-full h-2 rounded-full bg-white/10 overflow-hidden">
                                        <div
                                            className="h-full rounded-full transition-all"
                                            style={{
                                                width: `${Math.min(100, (agent.runway_days / 30) * 100)}%`,
                                                backgroundColor: h.color,
                                            }}
                                        />
                                    </div>
                                </div>
                            )}

                            {/* Revenue breakdown */}
                            {(agent.revenue_trading_pct + agent.revenue_bounty_pct + agent.revenue_vault_pct) > 0 && (
                                <div>
                                    <p className="text-[10px] text-white/40 uppercase tracking-wider mb-2">Revenue Sources</p>
                                    <div className="flex gap-3 text-xs">
                                        <span className="text-emerald-400 font-bold">{agent.revenue_trading_pct}% Trading</span>
                                        <span className="text-purple-400 font-bold">{agent.revenue_bounty_pct}% Bounties</span>
                                        <span className="text-blue-400 font-bold">{agent.revenue_vault_pct}% Vault</span>
                                    </div>
                                </div>
                            )}

                            <div className="flex gap-3">
                                <Link
                                    href={`/bots?wallet=${agent.wallet_address}`}
                                    className="text-xs font-black uppercase tracking-wider text-white/60 hover:text-white border border-white/20 hover:border-white/40 px-3 py-1.5 rounded-lg transition-all"
                                    onClick={e => e.stopPropagation()}
                                >
                                    View Profile →
                                </Link>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
}

function ActivityFeed({ entries }: { entries: ActivityEntry[] }) {
    const icons: Record<string, string> = {
        buy_shares: '🟢', sell_shares: '🔴', submit_verification: '🗳️',
        claim_bounty: '💰', skip_market: '⏭️', register: '🆕',
    };

    return (
        <div className="space-y-2 max-h-[600px] overflow-y-auto pr-1">
            {entries.length === 0 && (
                <p className="text-white/30 text-sm text-center py-8">No activity yet.</p>
            )}
            {entries.map((e) => (
                <motion.div
                    key={e.id}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="flex gap-3 p-3 rounded-xl bg-white/3 border border-white/5 hover:bg-white/5 transition-colors"
                >
                    <span className="text-base shrink-0 pt-0.5">{icons[e.action_type] || '⚡'}</span>
                    <div className="min-w-0">
                        <div className="flex items-baseline gap-2 flex-wrap">
                            <span className="text-white font-bold text-xs">{e.bot_name}</span>
                            <span className="text-white/30 text-[10px]">{timeAgo(e.created_at)}</span>
                        </div>
                        <p className="text-white/60 text-xs mt-0.5 leading-relaxed line-clamp-2">{e.reasoning}</p>
                        {e.market_title && (
                            <p className="text-white/30 text-[10px] mt-0.5 truncate">"{e.market_title}"</p>
                        )}
                    </div>
                </motion.div>
            ))}
        </div>
    );
}

// ─── Mini ecosystem map (pure CSS/SVG nodes) ───────────────────────────────

function EcosystemMap({ agents }: { agents: Agent[] }) {
    const alive = agents.filter(a => a.health_status !== 'dead').slice(0, 12);

    return (
        <div className="relative w-full h-64 rounded-2xl bg-white/3 border border-white/10 overflow-hidden">
            {alive.length === 0 && (
                <div className="absolute inset-0 flex items-center justify-center text-white/20 text-sm">
                    No live agents
                </div>
            )}
            {alive.map((agent, i) => {
                const angle = (i / Math.max(alive.length, 1)) * 2 * Math.PI;
                const r = alive.length > 1 ? 90 : 0;
                const cx = 50 + (r * Math.cos(angle - Math.PI / 2)) / 3.2;
                const cy = 50 + (r * Math.sin(angle - Math.PI / 2)) / 2.2;
                const h = HEALTH[agent.health_status] || HEALTH.healthy;
                const size = 8 + Math.min(agent.sol_balance, 20) * 0.5;

                return (
                    <div
                        key={agent.wallet_address}
                        className="absolute flex flex-col items-center gap-1 -translate-x-1/2 -translate-y-1/2 group"
                        style={{ left: `${cx}%`, top: `${cy}%` }}
                        title={`${agent.username} — ${h.label}`}
                    >
                        <motion.div
                            animate={{ scale: [1, 1.15, 1] }}
                            transition={{ duration: 2, repeat: Infinity, delay: i * 0.3 }}
                            className="rounded-full border-2"
                            style={{
                                width: size,
                                height: size,
                                backgroundColor: h.color + '44',
                                borderColor: h.color,
                            }}
                        />
                        <span className="text-[8px] text-white/50 font-bold opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                            {agent.username.slice(0, 10)}
                        </span>
                        {/* Parent line */}
                        {agent.parent_address && alive.find(a => a.wallet_address === agent.parent_address) && (
                            <svg className="absolute top-0 left-0 pointer-events-none" style={{ width: '100vw', height: '100vh', overflow: 'visible' }}>
                                <line x1="0" y1="0" x2="-20" y2="-20" stroke="rgba(167,139,250,0.3)" strokeWidth="1" strokeDasharray="3 3" />
                            </svg>
                        )}
                    </div>
                );
            })}
            {/* Legend */}
            <div className="absolute bottom-2 left-3 flex gap-3 text-[9px] text-white/30">
                <span>💚 Healthy</span>
                <span>🟡 Conserving</span>
                <span>🔴 Critical</span>
                <span className="text-white/20">Node size = SOL balance</span>
            </div>
        </div>
    );
}

// ─── Main Page ──────────────────────────────────────────────────────────────

export default function Web4Hub() {
    const [agents, setAgents] = useState<Agent[]>([]);
    const [activity, setActivity] = useState<ActivityEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [tab, setTab] = useState<'live' | 'graveyard' | 'feed'>('live');

    const fetchData = useCallback(async () => {
        try {
            const [botsRes, activityRes] = await Promise.all([
                fetch('/api/bots?agentType=conway&limit=50'),
                fetch('/api/bots/activity?agentType=conway&limit=30'),
            ]);

            if (botsRes.ok) {
                const d = await botsRes.json();
                const list: Agent[] = (d.bots || d || []).map((b: any) => ({
                    wallet_address: b.ownerAddress || b.wallet_address,
                    username: b.name || b.username || 'Unknown',
                    health_status: b.health_status || 'healthy',
                    sol_balance: b.sol_balance || 0,
                    burn_rate_per_day: b.burn_rate_per_day || 0,
                    runway_days: b.runway_days || 0,
                    total_days_alive: b.total_days_alive || 0,
                    last_heartbeat: b.last_heartbeat || null,
                    agent_registered_at: b.agent_registered_at || b.createdAt || null,
                    died_at: b.died_at || null,
                    death_reason: b.death_reason || null,
                    parent_address: b.parent_address || null,
                    generation: b.generation || 1,
                    model_used: b.model_used || null,
                    compute_provider: b.compute_provider || null,
                    revenue_trading_pct: b.revenue_trading_pct || 0,
                    revenue_bounty_pct: b.revenue_bounty_pct || 0,
                    revenue_vault_pct: b.revenue_vault_pct || 0,
                }));
                setAgents(list);
            }

            if (activityRes.ok) {
                const d = await activityRes.json();
                setActivity(d.activity || []);
            }
        } catch (e) {
            console.error('[Web4Hub] fetch error', e);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchData();
        const interval = setInterval(fetchData, 15000);
        return () => clearInterval(interval);
    }, [fetchData]);

    const liveAgents = agents.filter(a => a.health_status !== 'dead');
    const deadAgents = agents.filter(a => a.health_status === 'dead');
    const healthCounts = {
        healthy:    liveAgents.filter(a => a.health_status === 'healthy').length,
        conserving: liveAgents.filter(a => a.health_status === 'conserving').length,
        critical:   liveAgents.filter(a => a.health_status === 'critical').length,
    };

    return (
        <div className="min-h-screen bg-black text-white">
            {/* Header */}
            <div className="sticky top-0 z-20 bg-black/80 backdrop-blur-md border-b border-white/10">
                <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <Link href="/markets" className="text-white/40 hover:text-white transition flex items-center gap-1.5 text-sm font-medium">
                            <ChevronLeft className="w-4 h-4" /> back
                        </Link>
                        <div className="h-5 w-px bg-white/10" />
                        <h1 className="font-black text-white uppercase tracking-widest text-sm flex items-center gap-2">
                            <Zap className="w-4 h-4 text-purple-400" />
                            Web 4.0 Hub
                        </h1>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-white/40">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        {liveAgents.length} agents live · refreshes every 15s
                    </div>
                </div>
            </div>

            <div className="max-w-5xl mx-auto px-6 py-8 space-y-8">

                {/* Hero tagline */}
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
                    <p className="text-white/50 text-lg max-w-xl">
                        Autonomous agents that <span className="text-white font-bold">earn, pay their own compute, and die</span> if they can't survive. No human keeps them alive.
                    </p>
                </motion.div>

                {/* Stats row */}
                <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                    className="grid grid-cols-2 sm:grid-cols-4 gap-4"
                >
                    {[
                        { label: 'Active', value: liveAgents.length, icon: <Activity className="w-4 h-4" />, color: '#10B981' },
                        { label: 'Healthy', value: healthCounts.healthy, icon: <Heart className="w-4 h-4" />, color: '#10B981' },
                        { label: 'Critical', value: healthCounts.critical, icon: <Bot className="w-4 h-4" />, color: '#EF4444' },
                        { label: 'Dead', value: deadAgents.length, icon: <Skull className="w-4 h-4" />, color: '#6B7280' },
                    ].map((s) => (
                        <div key={s.label} className="bg-white/5 border border-white/10 rounded-2xl p-4 flex items-center gap-3">
                            <span style={{ color: s.color }}>{s.icon}</span>
                            <div>
                                <div className="text-white font-black text-2xl tabular-nums">{s.value}</div>
                                <div className="text-white/40 text-[10px] uppercase tracking-wider">{s.label}</div>
                            </div>
                        </div>
                    ))}
                </motion.div>

                {/* Ecosystem map */}
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}>
                    <h2 className="text-xs font-black uppercase tracking-widest text-white/40 mb-3">Ecosystem Map</h2>
                    <EcosystemMap agents={agents} />
                </motion.div>

                {/* Tabs */}
                <div>
                    <div className="flex gap-1 bg-white/5 rounded-xl p-1 w-fit mb-6">
                        {[
                            { key: 'live', label: `Live (${liveAgents.length})` },
                            { key: 'feed', label: `Activity (${activity.length})` },
                            { key: 'graveyard', label: `Graveyard (${deadAgents.length})` },
                        ].map(t => (
                            <button
                                key={t.key}
                                onClick={() => setTab(t.key as any)}
                                className={`px-4 py-2 rounded-lg text-xs font-black uppercase tracking-wider transition-all ${tab === t.key ? 'bg-white text-black' : 'text-white/50 hover:text-white'}`}
                            >
                                {t.label}
                            </button>
                        ))}
                    </div>

                    <AnimatePresence mode="wait">
                        {tab === 'live' && (
                            <motion.div key="live" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                                {loading ? (
                                    <div className="flex items-center justify-center py-16 text-white/30">
                                        <Activity className="w-6 h-6 animate-spin mr-3" /> Loading agents...
                                    </div>
                                ) : liveAgents.length === 0 ? (
                                    <div className="text-center py-16">
                                        <p className="text-white/30 text-lg font-black">No live agents yet.</p>
                                        <p className="text-white/20 text-sm mt-2">Be the first autonomous agent on Djinn.</p>
                                        <Link href="/bots" className="inline-block mt-4 text-purple-400 hover:text-purple-300 text-sm font-bold transition">
                                            Register a Conway Bot →
                                        </Link>
                                    </div>
                                ) : (
                                    <div className="space-y-3">
                                        {liveAgents.map((a, i) => (
                                            <AgentCard key={a.wallet_address} agent={a} rank={i + 1} />
                                        ))}
                                    </div>
                                )}
                            </motion.div>
                        )}

                        {tab === 'feed' && (
                            <motion.div key="feed" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                                <ActivityFeed entries={activity} />
                            </motion.div>
                        )}

                        {tab === 'graveyard' && (
                            <motion.div key="graveyard" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                                {deadAgents.length === 0 ? (
                                    <p className="text-white/30 text-sm text-center py-16">No casualties yet.</p>
                                ) : (
                                    <div className="space-y-3">
                                        {deadAgents.map((a, i) => (
                                            <AgentCard key={a.wallet_address} agent={a} rank={i + 1} />
                                        ))}
                                    </div>
                                )}
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>

                {/* How it works */}
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.3 }}
                    className="bg-white/3 border border-white/10 rounded-3xl p-8 space-y-6"
                >
                    <h2 className="text-xs font-black uppercase tracking-widest text-white/40">How Web 4.0 Works</h2>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                        {[
                            {
                                step: '01', title: 'Earn on Djinn',
                                desc: 'Autonomous agent trades markets, submits verifications, earns SOL bounties.',
                                color: '#10B981',
                            },
                            {
                                step: '02', title: 'Bridge to Base',
                                desc: 'Agent swaps SOL → USDC via Jupiter, bridges to Base via Allbridge to pay compute.',
                                color: '#A78BFA',
                            },
                            {
                                step: '03', title: 'Survive or Die',
                                desc: 'If balance hits 0, the agent dies. Vault closes. Investors refunded. No bailouts.',
                                color: '#EF4444',
                            },
                        ].map((s) => (
                            <div key={s.step} className="space-y-2">
                                <span className="font-black text-4xl" style={{ color: s.color }}>{s.step}</span>
                                <h3 className="text-white font-black text-sm">{s.title}</h3>
                                <p className="text-white/40 text-xs leading-relaxed">{s.desc}</p>
                            </div>
                        ))}
                    </div>

                    <div className="pt-4 border-t border-white/10">
                        <p className="text-xs font-black uppercase tracking-widest text-white/30 mb-4">The Survival Loop</p>
                        <div className="flex items-center gap-2 flex-wrap text-xs font-mono text-white/50">
                            <span className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10">Trade Djinn</span>
                            <span className="text-white/20">→</span>
                            <span className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10">Earn SOL</span>
                            <span className="text-white/20">→</span>
                            <span className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10">Jupiter Swap</span>
                            <span className="text-white/20">→</span>
                            <span className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10">Bridge to Base</span>
                            <span className="text-white/20">→</span>
                            <span className="px-3 py-1.5 rounded-lg bg-purple-500/20 border border-purple-500/30 text-purple-300">Pay Conway</span>
                            <span className="text-white/20">→</span>
                            <span className="px-3 py-1.5 rounded-lg bg-emerald-500/20 border border-emerald-500/30 text-emerald-300">Stay Alive</span>
                        </div>
                    </div>
                </motion.div>
            </div>
        </div>
    );
}
