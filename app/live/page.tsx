'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { getActivity, subscribeToActivity, Activity } from '@/lib/supabase-db';

// Función para formatear tiempo relativo
function formatTimeAgo(timestamp: string): string {
    const now = Date.now();
    const created = new Date(timestamp).getTime();
    const diff = now - created;
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (seconds < 60) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return `${days}d ago`;
}

export default function ActivityPage() {
    const [minAmount, setMinAmount] = useState(0);
    const [trades, setTrades] = useState<Activity[]>([]);
    const [loading, setLoading] = useState(true);

    // Cargar actividad desde Supabase
    useEffect(() => {
        const loadActivity = async () => {
            setLoading(true);
            const data = await getActivity(minAmount, 50);
            setTrades(data);
            setLoading(false);
        };
        loadActivity();
    }, [minAmount]);

    // Suscribirse a actualizaciones en tiempo real
    useEffect(() => {
        const channel = subscribeToActivity((payload) => {
            if (payload.new) {
                setTrades( (prev: any) => [payload.new as Activity, ...prev].slice(0, 50));
            }
        });

        return () => {
            channel.unsubscribe();
        };
    }, []);

    return (
        <div className="min-h-screen bg-black pt-40 px-6 pb-20 selection:bg-[#F492B7] selection:text-black">
            <div className="max-w-5xl mx-auto">

                {/* Título limpio */}
                <h1 className="text-3xl font-bold text-white mb-12 tracking-tight">
                    Activity
                </h1>

                {/* Filtros de Monto */}
                <div className="flex gap-3 mb-10 items-center flex-wrap">
                    {[0, 100, 1000, 100000].map((amt) => (
                        <button
                            key={amt}
                            onClick={() => setMinAmount(amt)}
                            className={`px-5 py-2 rounded-xl text-[11px] font-bold tracking-wider transition-all duration-300 border ${minAmount === amt
                                ? 'bg-[#F492B7] text-black border-[#F492B7] shadow-[0_0_15px_rgba(244,146,183,0.3)]'
                                : 'text-gray-400 border-white/10 hover:border-white/30 bg-white/5'
                                }`}
                        >
                            {amt === 0 ? 'All' : `$${amt.toLocaleString()}+`}
                        </button>
                    ))}
                </div>

                {/* Lista de Actividad */}
                <div className="space-y-2">
                    {loading ? (
                        <div className="text-center py-20">
                            <div className="w-8 h-8 border-2 border-[#F492B7] border-t-transparent rounded-full animate-spin mx-auto"></div>
                            <p className="text-gray-500 mt-4">Loading activity...</p>
                        </div>
                    ) : trades.length === 0 ? (
                        <div className="text-center py-20 border border-dashed border-white/10 rounded-2xl">
                            <p className="text-gray-500 font-bold">No activity yet</p>
                            <p className="text-gray-600 text-sm mt-1">Bets will appear here in real-time</p>
                        </div>
                    ) : (
                        trades.map((trade, index) => (
                            <div
                                key={trade.id || index}
                                className="flex items-center justify-between py-5 px-6 rounded-2xl bg-[#0a0a0a] border border-white/5 
                                           hover:border-[#F492B7]/30 hover:bg-white/[0.02] 
                                           transition-all duration-300 group"
                            >
                                {/* Izquierda: Usuario y Market */}
                                <div className="flex items-center gap-4">
                                    {/* Avatar */}
                                    {trade.avatar_url ? (
                                        <img src={trade.avatar_url} alt="" className="w-10 h-10 rounded-full object-cover border border-white/10" />
                                    ) : (
                                        <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-lg font-bold">
                                            {trade.username.charAt(0).toUpperCase()}
                                        </div>
                                    )}

                                    <div className="flex flex-col">
                                        <Link
                                            href="/profile/default"
                                            className="text-sm font-bold text-white group-hover:text-[#F492B7] transition-colors"
                                        >
                                            @{trade.username}
                                        </Link>
                                        <Link
                                            href={`/market/${trade.market_slug}`}
                                            className="text-xs text-gray-500 hover:text-gray-400 transition-colors truncate max-w-[200px] md:max-w-[300px]"
                                        >
                                            {trade.market_title}
                                        </Link>
                                    </div>
                                </div>

                                {/* Derecha: Monto, Shares, Tiempo y Acción */}
                                <div className="flex items-center gap-6">
                                    <div className="text-right flex flex-col items-end">
                                        {/* Monto en blanco + SOL */}
                                        <div className="flex items-center gap-2">
                                            <span className="text-sm font-bold text-[#F492B7] tracking-wider">
                                                {trade.sol_amount ? `${trade.sol_amount} SOL` : ''}
                                            </span>
                                            <span className="text-xl font-black italic text-white tracking-tight">
                                                ${trade.amount?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                            </span>
                                        </div>

                                        {/* Profit / Shares */}
                                        {trade.shares && (
                                            <div className="flex flex-col items-end">
                                                <span className="text-[10px] text-gray-400 font-bold block">
                                                    {trade.shares.toFixed(2)} shares
                                                </span>
                                                <span className="text-[10px] font-bold text-[#10B981]">
                                                    +${(trade.shares - trade.amount).toFixed(2)} reward
                                                </span>
                                            </div>
                                        )}
                                        {/* Tiempo */}
                                        <span className="text-[9px] text-gray-500 font-bold tracking-wider mt-1 block">
                                            {trade.created_at ? formatTimeAgo(trade.created_at) : 'Just now'}
                                        </span>
                                    </div>

                                    {/* Barra de Acción YES/NO */}
                                    <div className={`w-2 h-12 rounded-full transition-all duration-300 ${trade.action === 'YES'
                                        ? 'bg-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.4)]'
                                        : 'bg-red-500 shadow-[0_0_15px_rgba(239,68,68,0.4)]'
                                        }`}></div>
                                </div>
                            </div>
                        ))
                    )}
                </div>

                {/* Indicador de actualizaciones en vivo */}
                <div className="mt-8 flex items-center justify-center gap-2 text-gray-600 text-xs">
                    <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>
                    <span>Live updates</span>
                </div>
            </div>
        </div>
    );
}