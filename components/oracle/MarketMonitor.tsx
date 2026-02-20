'use client';

import { useState, useEffect } from 'react';
import { Search, ExternalLink, AlertCircle, Clock, Eye, Plus } from 'lucide-react';

interface MonitoredMarket {
    slug: string;
    title: string;
    isMonitoring: boolean;
    resolution_date?: string;
    lastChecked?: string;
}

interface MarketMonitorProps {
    onAddLink: (link: string) => void;
}

export function MarketMonitor({ onAddLink }: MarketMonitorProps) {
    const [markets, setMarkets] = useState<MonitoredMarket[]>([]);
    const [linkInput, setLinkInput] = useState('');
    const [loading, setLoading] = useState(false);

    // Fetch active markets from Supabase
    useEffect(() => {
        fetchMarkets();
    }, []);

    const fetchMarkets = async () => {
        try {
            const res = await fetch('/api/markets?resolved=false&limit=20');
            if (res.ok) {
                const data = await res.json();
                setMarkets(data.map( (m: any) => ({
                    slug: m.slug,
                    title: m.question || m.title,
                    isMonitoring: Math.random() > 0.5, // TODO: Get real monitoring status
                    resolution_date: m.resolution_date,
                    lastChecked: null
                })));
            }
        } catch (err) {
            console.error('Failed to fetch markets:', err);
        }
    };

    const handleAddLink = () => {
        if (!linkInput.trim()) return;
        setLoading(true);

        // Extract slug from URL
        const slugMatch = linkInput.match(/\/market\/([^\/\?]+)/);
        const slug = slugMatch ? slugMatch[1] : linkInput;

        onAddLink(slug);
        setLinkInput('');
        setLoading(false);
    };

    const toggleMonitoring = (slug: string) => {
        setMarkets( (prev: any) => prev.map( (m: any) =>
            m.slug === slug ? { ...m, isMonitoring: !m.isMonitoring } : m
        ));
    };

    const formatDate = (dateStr?: string) => {
        if (!dateStr) return 'No date';
        const date = new Date(dateStr);
        const now = new Date();
        const diffDays = Math.ceil((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

        if (diffDays < 0) return 'Expired';
        if (diffDays === 0) return 'Today';
        if (diffDays === 1) return 'Tomorrow';
        if (diffDays < 7) return `${diffDays} days`;
        return date.toLocaleDateString();
    };

    return (
        <div className="border border-white/10 rounded-3xl bg-gradient-to-br from-white/5 to-transparent backdrop-blur-sm overflow-hidden">
            {/* Header */}
            <div className="p-6 border-b border-white/5">
                <h3 className="text-xl font-black text-white flex items-center gap-3 mb-4">
                    <Eye className="w-5 h-5 text-[#F492B7]" />
                    Market Monitor
                </h3>

                {/* Manual Link Input */}
                <div className="flex gap-3">
                    <div className="flex-1 relative">
                        <input
                            type="text"
                            value={linkInput}
                            onChange={(e) => setLinkInput(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleAddLink()}
                            placeholder="Paste market link or slug to search..."
                            className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 pl-11 text-white placeholder-gray-500 focus:outline-none focus:border-[#F492B7]/50 transition-colors"
                        />
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                    </div>
                    <button
                        onClick={handleAddLink}
                        disabled={loading || !linkInput.trim()}
                        className="px-6 py-3 bg-gradient-to-r from-[#F492B7]/20 to-[#F492B7]/30 text-[#F492B7] border border-[#F492B7]/40 rounded-xl font-bold hover:shadow-[0_0_20px_rgba(244,146,183,0.2)] hover:scale-105 active:scale-95 transition-all disabled:opacity-50 disabled:hover:scale-100 flex items-center gap-2"
                    >
                        <Plus className="w-5 h-5" />
                        Search
                    </button>
                </div>
            </div>

            {/* Markets List */}
            <div className="max-h-[300px] overflow-y-auto">
                {markets.length === 0 ? (
                    <div className="p-8 text-center text-gray-500">
                        <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-50" />
                        <p>No active markets found</p>
                    </div>
                ) : (
                    <div className="divide-y divide-white/5">
                        {markets.map((market) => (
                            <div
                                key={market.slug}
                                className="p-4 flex items-center gap-4 hover:bg-white/5 transition-colors group"
                            >
                                {/* Monitoring Status Indicator */}
                                <button
                                    onClick={() => toggleMonitoring(market.slug)}
                                    className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${market.isMonitoring
                                            ? 'bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/30'
                                            : 'bg-white/5 border border-white/10 text-gray-500 hover:text-white hover:border-white/20'
                                        }`}
                                    title={market.isMonitoring ? 'Monitoring - Click to stop' : 'Not monitoring - Click to start'}
                                >
                                    {market.isMonitoring ? (
                                        <Eye className="w-5 h-5" />
                                    ) : (
                                        <Eye className="w-5 h-5 opacity-30" />
                                    )}
                                </button>

                                {/* Market Info */}
                                <div className="flex-1 min-w-0">
                                    <h4 className="text-white font-medium truncate group-hover:text-[#F492B7] transition-colors">
                                        {market.title}
                                    </h4>
                                    <div className="flex items-center gap-3 mt-1">
                                        <span className={`text-xs font-medium flex items-center gap-1 ${market.isMonitoring ? 'text-emerald-400' : 'text-gray-500'
                                            }`}>
                                            <span className={`w-1.5 h-1.5 rounded-full ${market.isMonitoring ? 'bg-emerald-400 animate-pulse' : 'bg-gray-500'}`} />
                                            {market.isMonitoring ? 'Monitoring' : 'Not monitoring'}
                                        </span>
                                        <span className="text-gray-600">•</span>
                                        <span className="text-xs text-gray-500 flex items-center gap-1">
                                            <Clock className="w-3 h-3" />
                                            {formatDate(market.resolution_date)}
                                        </span>
                                    </div>
                                </div>

                                {/* Actions */}
                                <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button
                                        onClick={() => onAddLink(market.slug)}
                                        className="p-2 rounded-lg hover:bg-[#F492B7]/20 text-gray-400 hover:text-[#F492B7] transition-all"
                                        title="Force search now"
                                    >
                                        <Search className="w-4 h-4" />
                                    </button>
                                    <a
                                        href={`/market/${market.slug}`}
                                        target="_blank"
                                        className="p-2 rounded-lg hover:bg-white/10 text-gray-400 hover:text-white transition-all"
                                        title="Open market"
                                    >
                                        <ExternalLink className="w-4 h-4" />
                                    </a>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
