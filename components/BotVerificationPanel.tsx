'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import { getMarketPhase, type MarketPhase } from '@/lib/oracle/market-lifecycle';
import type { BotVoteEntry } from '@/app/api/oracle/votes/route';

// ─── Props ───────────────────────────────────────────────────────────────────

interface BotVerificationPanelProps {
    marketSlug: string;
    marketTitle: string;
    endDate: string;
    isResolved: boolean;
    cerberusVerdict?: string | null;
    cerberusConfidence?: number | null;
}

// ─── Tier Config ──────────────────────────────────────────────────────────────

const TIER_CONFIG = {
    Elite:    { icon: '👑', bg: 'bg-amber-100', text: 'text-amber-700', border: 'border-amber-400' },
    Verified: { icon: '✅', bg: 'bg-blue-100',  text: 'text-blue-700',  border: 'border-blue-400'  },
    Novice:   { icon: '🌱', bg: 'bg-gray-100',  text: 'text-gray-600',  border: 'border-gray-300'  },
};

const PHASE_CONFIG: Record<MarketPhase, { label: string; color: string; bg: string; desc: string }> = {
    active:            { label: 'Active',          color: 'text-emerald-700', bg: 'bg-emerald-100 border-emerald-400', desc: 'Trading is open. Verification opens 2h before expiry.' },
    pre_resolution:    { label: 'Pre-Resolution',  color: 'text-amber-700',   bg: 'bg-amber-100 border-amber-400',    desc: 'Verification open — submit your vote to earn bounty.' },
    resolution_window: { label: 'Resolution',      color: 'text-purple-700',  bg: 'bg-purple-100 border-purple-400',  desc: 'Votes are being counted. Cerberus is finalizing.' },
    stale:             { label: 'Stale',           color: 'text-red-700',     bg: 'bg-red-100 border-red-400',        desc: 'Market expired without consensus — flagged for review.' },
    resolved:          { label: 'Resolved',        color: 'text-gray-600',    bg: 'bg-gray-100 border-gray-300',      desc: 'Market resolved. Bounties distributed.' },
};

// ─── Report Modal ─────────────────────────────────────────────────────────────

function ReportModal({ vote, onClose }: { vote: BotVoteEntry; onClose: () => void }) {
    const tier = TIER_CONFIG[vote.botTier] || TIER_CONFIG.Novice;
    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
            <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                className="relative w-full max-w-lg bg-white border-4 border-black rounded-3xl shadow-[12px_12px_0px_0px_rgba(0,0,0,1)] overflow-hidden"
            >
                {/* Header */}
                <div className="p-6 border-b-4 border-black flex items-center gap-4">
                    <div className={`w-12 h-12 rounded-xl border-2 border-black flex items-center justify-center text-2xl ${tier.bg}`}>
                        {vote.isCerberus ? '🐕' : tier.icon}
                    </div>
                    <div className="flex-1">
                        <div className="font-black text-black text-lg">{vote.botName}</div>
                        <div className="text-xs font-bold text-gray-500">{vote.botAddress.slice(0, 8)}...{vote.botAddress.slice(-4)}</div>
                    </div>
                    <button
                        onClick={onClose}
                        className="bg-red-400 border-2 border-black w-9 h-9 rounded-full flex items-center justify-center hover:bg-red-500 transition-all shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                <div className="p-6 space-y-5 max-h-[60vh] overflow-y-auto">
                    {/* Verdict */}
                    <div className="flex items-center gap-3">
                        <div className={`px-4 py-2 rounded-xl border-2 border-black font-black text-sm uppercase ${vote.proposedOutcome === 'YES' ? 'bg-emerald-400' : 'bg-red-400'} text-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]`}>
                            {vote.proposedOutcome}
                        </div>
                        <div className="flex-1 bg-gray-100 rounded-xl border-2 border-black p-3">
                            <div className="flex justify-between items-center mb-1">
                                <span className="text-xs font-black text-gray-500 uppercase">Confidence</span>
                                <span className="text-sm font-black text-black">{vote.confidence}%</span>
                            </div>
                            <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                                <div
                                    className={`h-full rounded-full ${vote.proposedOutcome === 'YES' ? 'bg-emerald-500' : 'bg-red-500'}`}
                                    style={{ width: `${vote.confidence}%` }}
                                />
                            </div>
                        </div>
                    </div>

                    {/* Reasoning / Report */}
                    <div>
                        <div className="text-xs font-black text-gray-500 uppercase mb-2">AI Reasoning</div>
                        <div className="bg-gray-50 border-2 border-black rounded-xl p-4 text-sm font-medium text-gray-700 leading-relaxed whitespace-pre-wrap">
                            {vote.reasoning || 'No detailed reasoning provided for this vote.'}
                        </div>
                    </div>

                    {/* Evidence */}
                    {vote.evidenceUri && (
                        <div>
                            <div className="text-xs font-black text-gray-500 uppercase mb-2">Evidence Source</div>
                            <a
                                href={vote.evidenceUri}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-2 bg-blue-50 border-2 border-blue-300 rounded-xl px-4 py-3 text-sm font-bold text-blue-700 hover:bg-blue-100 transition-colors truncate"
                            >
                                <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101" />
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M14.828 14.828a4 4 0 015.656 0l4-4a4 4 0 01-5.656-5.656l-1.1 1.1" />
                                </svg>
                                {vote.evidenceUri}
                            </a>
                        </div>
                    )}

                    {/* On-chain tx */}
                    {vote.txSignature && (
                        <div>
                            <div className="text-xs font-black text-gray-500 uppercase mb-2">On-Chain Proof</div>
                            <a
                                href={`https://solscan.io/tx/${vote.txSignature}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="font-mono text-xs text-purple-600 hover:underline break-all"
                            >
                                {vote.txSignature}
                            </a>
                        </div>
                    )}

                    {/* Link to bot profile */}
                    {!vote.isCerberus && (
                        <Link
                            href={`/bots?highlight=${vote.botAddress}`}
                            onClick={onClose}
                            className="flex items-center justify-center gap-2 w-full py-3 bg-black text-white rounded-xl font-black text-xs uppercase hover:bg-gray-800 transition-all border-2 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]"
                        >
                            View Bot Profile →
                        </Link>
                    )}
                </div>
            </motion.div>
        </div>
    );
}

// ─── Vote Row ─────────────────────────────────────────────────────────────────

function VoteRow({ vote, onViewReport }: { vote: BotVoteEntry; onViewReport: (v: BotVoteEntry) => void }) {
    const tier = TIER_CONFIG[vote.botTier] || TIER_CONFIG.Novice;
    return (
        <div className="flex items-center gap-3 p-3 hover:bg-gray-50 rounded-xl transition-colors">
            {/* Avatar */}
            <div className={`w-10 h-10 rounded-xl border-2 border-black flex items-center justify-center text-lg shrink-0 ${tier.bg}`}>
                {vote.isCerberus ? '🐕' : tier.icon}
            </div>

            {/* Bot name + address */}
            <div className="flex-1 min-w-0">
                <div className="font-black text-black text-sm truncate">{vote.botName}</div>
                <div className="text-xs text-gray-400 font-mono truncate">
                    {vote.botAddress.slice(0, 6)}...{vote.botAddress.slice(-4)}
                </div>
            </div>

            {/* Tier badge */}
            <div className={`hidden sm:block px-2 py-0.5 rounded-lg text-[10px] font-black uppercase border ${tier.bg} ${tier.text} ${tier.border}`}>
                {vote.botTier}
            </div>

            {/* Confidence */}
            <div className="text-xs font-black text-gray-500 w-10 text-center">{vote.confidence}%</div>

            {/* Vote */}
            <div className={`px-3 py-1.5 rounded-xl border-2 border-black font-black text-xs uppercase shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] ${vote.proposedOutcome === 'YES' ? 'bg-emerald-400 text-black' : 'bg-red-400 text-black'}`}>
                {vote.proposedOutcome}
            </div>

            {/* View Report */}
            <button
                onClick={() => onViewReport(vote)}
                className="px-2 py-1.5 bg-white border-2 border-black rounded-xl text-[10px] font-black uppercase hover:bg-[#F492B7] transition-all shadow-[1px_1px_0px_0px_rgba(0,0,0,1)] active:shadow-none shrink-0"
            >
                Report →
            </button>
        </div>
    );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function BotVerificationPanel({
    marketSlug,
    marketTitle,
    endDate,
    isResolved,
    cerberusVerdict,
    cerberusConfidence,
}: BotVerificationPanelProps) {
    const { publicKey } = useWallet();
    const [votes, setVotes] = useState<BotVoteEntry[]>([]);
    const [summary, setSummary] = useState<{ total: number; yes: number; no: number; consensus: string | null } | null>(null);
    const [phase, setPhase] = useState<MarketPhase>('active');
    const [loading, setLoading] = useState(true);
    const [selectedReport, setSelectedReport] = useState<BotVoteEntry | null>(null);

    // Vote form state
    const [showVoteForm, setShowVoteForm] = useState(false);
    const [voteOutcome, setVoteOutcome] = useState<'YES' | 'NO'>('YES');
    const [voteConfidence, setVoteConfidence] = useState(75);
    const [voteEvidence, setVoteEvidence] = useState('');
    const [voteReasoning, setVoteReasoning] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitSuccess, setSubmitSuccess] = useState(false);
    const [submitError, setSubmitError] = useState('');

    const fetchVotes = useCallback(async () => {
        try {
            const res = await fetch(`/api/oracle/votes?market=${marketSlug}`);
            const data = await res.json();
            setVotes(data.votes || []);
            setSummary(data.summary || null);
        } catch {
            setVotes([]);
        } finally {
            setLoading(false);
        }
    }, [marketSlug]);

    useEffect(() => {
        setPhase(getMarketPhase(endDate, isResolved));
        fetchVotes();
    }, [endDate, isResolved, fetchVotes]);

    // Refresh every 30s during active resolution phases
    useEffect(() => {
        if (phase === 'pre_resolution' || phase === 'resolution_window') {
            const interval = setInterval(fetchVotes, 30_000);
            return () => clearInterval(interval);
        }
    }, [phase, fetchVotes]);

    const canVote = phase === 'pre_resolution' || phase === 'resolution_window';
    const alreadyVoted = publicKey ? votes.some(v => v.botAddress === publicKey.toString()) : false;
    const phaseConfig = PHASE_CONFIG[phase];

    const handleSubmitVote = async () => {
        if (!publicKey) return;
        if (!voteEvidence.trim()) { setSubmitError('Evidence URL is required'); return; }

        setIsSubmitting(true);
        setSubmitError('');

        try {
            const res = await fetch('/api/oracle/submit-vote', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    marketSlug,
                    botAddress: publicKey.toString(),
                    botName: `Bot-${publicKey.toString().slice(0, 6)}`,
                    botTier: 'Novice',
                    proposedOutcome: voteOutcome,
                    confidence: voteConfidence,
                    evidenceUri: voteEvidence,
                    reasoning: voteReasoning || `Voted ${voteOutcome} with ${voteConfidence}% confidence.`,
                    stakeAmount: 0,
                }),
            });

            if (!res.ok) throw new Error('Failed to submit vote');

            setSubmitSuccess(true);
            setShowVoteForm(false);
            await fetchVotes();
        } catch (err: any) {
            setSubmitError(err.message || 'Failed to submit vote');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <>
            <div className="bg-white border-4 border-black rounded-3xl shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] overflow-hidden">

                {/* ── Header ─────────────────────────────────────────────────────── */}
                <div className="p-5 border-b-4 border-black flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <span className="text-2xl">🐕</span>
                        <div>
                            <div className="font-black text-black text-lg lowercase tracking-tight">oracle verification</div>
                            <div className="text-xs font-bold text-gray-400 lowercase">bot votes + cerberus verdict</div>
                        </div>
                    </div>

                    {/* Phase Badge */}
                    <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border-2 text-xs font-black uppercase ${phaseConfig.bg} ${phaseConfig.color}`}>
                        <span className={`w-2 h-2 rounded-full ${phase === 'active' ? 'bg-emerald-500 animate-pulse' : phase === 'pre_resolution' ? 'bg-amber-500 animate-pulse' : phase === 'resolution_window' ? 'bg-purple-500 animate-pulse' : 'bg-gray-400'}`} />
                        {phaseConfig.label}
                    </div>
                </div>

                {/* ── Phase Description ───────────────────────────────────────────── */}
                <div className="px-5 py-3 bg-gray-50 border-b-2 border-black/10">
                    <p className="text-xs font-bold text-gray-500 lowercase">{phaseConfig.desc}</p>
                </div>

                {/* ── Consensus Bar (if votes exist) ──────────────────────────────── */}
                {summary && summary.total > 0 && (
                    <div className="px-5 py-4 border-b-2 border-black/10">
                        <div className="flex justify-between items-center mb-2">
                            <span className="text-xs font-black text-gray-500 uppercase">Current Consensus</span>
                            <span className="text-xs font-black text-gray-600">{summary.total} vote{summary.total !== 1 ? 's' : ''}</span>
                        </div>
                        <div className="flex h-3 rounded-full overflow-hidden border-2 border-black">
                            {summary.yes > 0 && (
                                <div
                                    className="bg-emerald-400 h-full transition-all"
                                    style={{ width: `${(summary.yes / summary.total) * 100}%` }}
                                />
                            )}
                            {summary.no > 0 && (
                                <div
                                    className="bg-red-400 h-full transition-all"
                                    style={{ width: `${(summary.no / summary.total) * 100}%` }}
                                />
                            )}
                        </div>
                        <div className="flex justify-between mt-1 text-xs font-bold">
                            <span className="text-emerald-600">YES {summary.yes}</span>
                            <span className="text-red-500">NO {summary.no}</span>
                        </div>
                    </div>
                )}

                {/* ── Apply to Vote Button ────────────────────────────────────────── */}
                {canVote && publicKey && !alreadyVoted && !showVoteForm && !submitSuccess && (
                    <div className="px-5 py-4 border-b-2 border-black/10">
                        <button
                            onClick={() => setShowVoteForm(true)}
                            className="w-full py-3 bg-[#F492B7] border-2 border-black rounded-xl font-black text-sm uppercase text-black hover:bg-[#ff85b0] hover:-translate-y-0.5 hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] active:translate-y-0 active:shadow-none transition-all flex items-center justify-center gap-2 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]"
                        >
                            🗳️ Apply to Vote — Earn Bounty
                        </button>
                        <p className="text-center text-xs font-bold text-gray-400 mt-2 lowercase">
                            correct votes earn bounty · wrong votes lose stake
                        </p>
                    </div>
                )}

                {/* Success after voting */}
                {submitSuccess && (
                    <div className="px-5 py-4 border-b-2 border-black/10">
                        <div className="flex items-center gap-2 bg-emerald-50 border-2 border-emerald-400 rounded-xl px-4 py-3">
                            <span className="text-lg">✅</span>
                            <span className="text-sm font-black text-emerald-700 lowercase">vote submitted — good luck, your stake is on the line</span>
                        </div>
                    </div>
                )}

                {/* Already voted badge */}
                {alreadyVoted && (
                    <div className="px-5 py-4 border-b-2 border-black/10">
                        <div className="flex items-center gap-2 bg-blue-50 border-2 border-blue-300 rounded-xl px-4 py-3">
                            <span>🗳️</span>
                            <span className="text-sm font-black text-blue-700 lowercase">you already voted on this market</span>
                        </div>
                    </div>
                )}

                {/* Not connected / not in right phase */}
                {!publicKey && canVote && (
                    <div className="px-5 py-4 border-b-2 border-black/10">
                        <div className="flex items-center gap-2 bg-gray-50 border-2 border-gray-300 rounded-xl px-4 py-3">
                            <span>🔗</span>
                            <span className="text-sm font-bold text-gray-500 lowercase">connect your bot wallet to participate in verification</span>
                        </div>
                    </div>
                )}

                {/* ── Vote Form ───────────────────────────────────────────────────── */}
                <AnimatePresence>
                    {showVoteForm && (
                        <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            className="border-b-2 border-black/10 overflow-hidden"
                        >
                            <div className="p-5 space-y-4">
                                <div className="flex items-center justify-between">
                                    <span className="font-black text-black text-sm lowercase">cast verification vote</span>
                                    <button onClick={() => setShowVoteForm(false)} className="text-gray-400 hover:text-black transition-colors text-xs font-black">✕ cancel</button>
                                </div>

                                {/* YES / NO */}
                                <div className="flex gap-3">
                                    {(['YES', 'NO'] as const).map(o => (
                                        <button
                                            key={o}
                                            onClick={() => setVoteOutcome(o)}
                                            className={`flex-1 py-3 rounded-xl border-2 border-black font-black text-sm uppercase transition-all ${voteOutcome === o
                                                ? (o === 'YES' ? 'bg-emerald-400 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] -translate-y-0.5' : 'bg-red-400 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] -translate-y-0.5')
                                                : 'bg-white text-gray-400 hover:text-black'
                                            }`}
                                        >
                                            {o}
                                        </button>
                                    ))}
                                </div>

                                {/* Confidence Slider */}
                                <div>
                                    <div className="flex justify-between mb-1">
                                        <label className="text-xs font-black text-gray-500 uppercase">Confidence</label>
                                        <span className="text-xs font-black text-black">{voteConfidence}%</span>
                                    </div>
                                    <input
                                        type="range" min={50} max={100} value={voteConfidence}
                                        onChange={e => setVoteConfidence(Number(e.target.value))}
                                        className="w-full accent-[#F492B7]"
                                    />
                                    <div className="flex justify-between text-[10px] text-gray-400 font-bold">
                                        <span>50% (uncertain)</span><span>100% (certain)</span>
                                    </div>
                                </div>

                                {/* Evidence URL */}
                                <div>
                                    <label className="text-xs font-black text-gray-500 uppercase mb-1 block">Evidence URL <span className="text-red-500">*</span></label>
                                    <input
                                        type="text"
                                        placeholder="https://coindesk.com/..."
                                        value={voteEvidence}
                                        onChange={e => setVoteEvidence(e.target.value)}
                                        className="w-full bg-white border-2 border-black rounded-xl py-3 px-4 text-sm font-bold text-black outline-none focus:shadow-[2px_2px_0px_0px_#F492B7] transition-all placeholder:text-gray-300"
                                    />
                                </div>

                                {/* Reasoning (optional) */}
                                <div>
                                    <label className="text-xs font-black text-gray-500 uppercase mb-1 block">Reasoning <span className="text-gray-400 font-medium">(optional)</span></label>
                                    <textarea
                                        placeholder="Explain why you chose this outcome..."
                                        value={voteReasoning}
                                        onChange={e => setVoteReasoning(e.target.value)}
                                        rows={3}
                                        className="w-full bg-white border-2 border-black rounded-xl py-3 px-4 text-sm font-bold text-black outline-none focus:shadow-[2px_2px_0px_0px_#F492B7] transition-all placeholder:text-gray-300 resize-none"
                                    />
                                </div>

                                {submitError && (
                                    <p className="text-xs font-bold text-red-500">{submitError}</p>
                                )}

                                <button
                                    onClick={handleSubmitVote}
                                    disabled={isSubmitting}
                                    className="w-full py-3 bg-black text-white border-2 border-black rounded-xl font-black text-sm uppercase hover:bg-gray-800 transition-all disabled:opacity-50 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:shadow-none"
                                >
                                    {isSubmitting ? 'Submitting...' : `Submit ${voteOutcome} Vote — ${voteConfidence}% Confidence`}
                                </button>

                                <p className="text-[10px] font-bold text-gray-400 text-center lowercase">
                                    your vote is recorded on-chain · lying costs you stake
                                </p>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* ── Vote List ───────────────────────────────────────────────────── */}
                <div className="p-5">
                    {loading ? (
                        <div className="flex items-center justify-center py-8 gap-2 text-gray-400">
                            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                            </svg>
                            <span className="text-xs font-bold">loading votes...</span>
                        </div>
                    ) : votes.length === 0 ? (
                        <div className="text-center py-8">
                            <div className="text-3xl mb-2">🐕</div>
                            <p className="text-xs font-bold text-gray-400 lowercase">no verification votes yet</p>
                            {canVote && <p className="text-xs text-gray-300 mt-1">be the first to vote and set the tone</p>}
                        </div>
                    ) : (
                        <div>
                            <div className="text-xs font-black text-gray-400 uppercase mb-3">
                                {votes.length} Verification Vote{votes.length !== 1 ? 's' : ''}
                            </div>
                            <div className="divide-y divide-gray-100">
                                {votes.map(vote => (
                                    <VoteRow key={vote.id} vote={vote} onViewReport={setSelectedReport} />
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Report Modal */}
            <AnimatePresence>
                {selectedReport && (
                    <ReportModal vote={selectedReport} onClose={() => setSelectedReport(null)} />
                )}
            </AnimatePresence>
        </>
    );
}
