'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import LivelineChart from '@/components/LivelineChart';
import type { LivelineSeries } from 'liveline';
import TradeBubbles from './TradeBubbles';

// --- TYPES ---
export interface ChartDataPoint {
    time: number; // ms or seconds
    [key: string]: any;
}

interface TheDjinnChartProps {
    data: ChartDataPoint[];
    volume?: string;
    onHover?: (val: number | null) => void;
    tradeEvent?: { id: string; side: string, amount: number, outcome: string } | null;
    outcomeNames?: string[];
    selectedOutcome?: string;
    onOutcomeChange?: (name: string) => void;
    outcomeSupplies?: Record<string, number>;
    resolutionDate?: string;
    outcomeColors?: string[];
    debug?: boolean;
}

const TIMEFRAMES = [
    { label: '5M', secs: 300 },
    { label: '15M', secs: 900 },
    { label: '1H', secs: 3600 },
    { label: '6H', secs: 21600 },
    { label: '24H', secs: 86400 },
    { label: '7D', secs: 604800 },
    { label: 'ALL', secs: 0 },
];

export default function TheDjinnChart({
    data = [],
    tradeEvent,
    onHover,
    onOutcomeChange,
    outcomeColors = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b'],
    outcomeNames = ['YES', 'NO'],
    debug = false,
}: TheDjinnChartProps) {
    const [currentTimeframe, setCurrentTimeframe] = useState(TIMEFRAMES[4]); // 24H default

    // Convert flat data to LivelineSeries format
    const series = useMemo<LivelineSeries[]>(() => {
        if (!data || data.length === 0 || !outcomeNames) return [];

        return outcomeNames.map((name, idx) => {
            const seriesData = data
                .filter(d => d[name] !== undefined)
                .map(d => ({
                    time: d.time < 1e12 ? d.time : Math.floor(d.time / 1000),
                    value: Number(d[name])
                }));

            const latestValue = seriesData.length > 0 ? seriesData[seriesData.length - 1].value : 50;

            return {
                id: name,
                label: name,
                color: outcomeColors[idx] || '#ccc',
                data: seriesData,
                value: latestValue
            };
        });
    }, [data, outcomeNames, outcomeColors]);

    return (
        <div className="flex flex-col w-full h-full bg-[#0a0a0a] relative rounded-3xl overflow-hidden border border-white/5 shadow-2xl">
            {/* Header: Outcome Probabilities */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/5 bg-black/20 backdrop-blur-md z-20">
                <div className="flex flex-wrap gap-6">
                    {series.map((s) => (
                        <div key={s.id} className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: s.color }} />
                            <span className="text-[10px] font-black uppercase tracking-widest text-white/40">{s.label}</span>
                            <span className="text-xl font-black tabular-nums" style={{ color: s.color }}>
                                {Math.round(s.value)}%
                            </span>
                        </div>
                    ))}
                </div>
            </div>

            {/* Chart Area */}
            <div className="flex-1 w-full relative min-h-[400px]">
                <TradeBubbles trigger={tradeEvent || null} />

                <LivelineChart
                    series={series}
                    height={400}
                    degen
                    windows={TIMEFRAMES}
                    className="mt-4"
                    formatValue={(v) => `${v.toFixed(1)}%`}
                />

                {/* Watermark */}
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none opacity-[0.03] z-0">
                    <img src="/djinn-logo.png" alt="Djinn" className="w-64 h-64 grayscale" />
                </div>
            </div>

            {/* Footer with Info */}
            <div className="px-6 py-4 border-t border-white/5 flex justify-between items-center bg-black/20">
                <div className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                    <span className="text-[10px] font-bold text-white/30 uppercase tracking-tighter">Live Network Feed</span>
                </div>
                <div className="text-[10px] font-bold text-white/20 uppercase tracking-widest">
                    60FPS High-Precision Engine
                </div>
            </div>
        </div>
    );
}
