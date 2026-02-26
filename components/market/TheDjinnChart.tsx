'use client';

import React, { useState, useMemo, useCallback } from 'react';
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
    /** Live probabilities (0-100) per outcome — keeps chart flowing between trades */
    liveValues?: number[];
    debug?: boolean;
}

const TIMEFRAMES = [
    { label: '5M',  secs: 300 },
    { label: '15M', secs: 900 },
    { label: '1H',  secs: 3600 },
    { label: '6H',  secs: 21600 },
    { label: '24H', secs: 86400 },
    { label: '7D',  secs: 604800 },
    { label: 'ALL', secs: 0 },
];

const DEFAULT_WINDOW_SECS = 86400; // 24H

export default function TheDjinnChart({
    data = [],
    tradeEvent,
    onHover,
    onOutcomeChange,
    outcomeColors = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b'],
    outcomeNames = ['YES', 'NO'],
    liveValues,
    debug = false,
}: TheDjinnChartProps) {
    const [activeWindowSecs, setActiveWindowSecs] = useState(DEFAULT_WINDOW_SECS);

    // Normalize data timestamps to unix seconds
    const normalizedData = useMemo(() => {
        return data.map(d => ({
            ...d,
            time: d.time > 1e12 ? Math.floor(d.time / 1000) : d.time,
        }));
    }, [data]);

    // Convert flat data to LivelineSeries format
    const series = useMemo<LivelineSeries[]>(() => {
        if (!outcomeNames || outcomeNames.length === 0) return [];

        const now = Math.floor(Date.now() / 1000);

        // No historical data — generate synthetic flat series from liveValues so chart is never blank
        if (!normalizedData || normalizedData.length === 0) {
            return outcomeNames.map((name, idx) => {
                const val = liveValues?.[idx] ?? (100 / outcomeNames.length);
                return {
                    id: name,
                    label: name,
                    color: outcomeColors[idx] || '#ccc',
                    data: [
                        { time: now - 3600, value: val },
                        { time: now, value: val },
                    ],
                    value: val,
                };
            });
        }

        return outcomeNames.map((name, idx) => {
            const seriesData = normalizedData
                .filter(d => (d as any)[name] !== undefined)
                .map(d => ({
                    time: d.time as number,
                    value: Number((d as any)[name]),
                }));

            // Fallback if no matching keys in data — flat line at liveValue
            if (seriesData.length === 0) {
                const val = liveValues?.[idx] ?? (100 / outcomeNames.length);
                return {
                    id: name,
                    label: name,
                    color: outcomeColors[idx] || '#ccc',
                    data: [
                        { time: now - 3600, value: val },
                        { time: now, value: val },
                    ],
                    value: val,
                };
            }

            // Use liveValues prop if provided (keeps chart flowing between trades)
            const latestValue = liveValues?.[idx]
                ?? seriesData[seriesData.length - 1].value;

            return {
                id: name,
                label: name,
                color: outcomeColors[idx] || '#ccc',
                data: seriesData,
                value: latestValue,
            };
        });
    }, [normalizedData, outcomeNames, outcomeColors, liveValues]);

    // Compute "period open" reference line — the YES value at the start of the active window
    const referenceLine = useMemo(() => {
        if (!series[0]?.data || series[0].data.length === 0) return undefined;
        const points = series[0].data;

        if (activeWindowSecs === 0) {
            // ALL view — reference is the inception value (first point)
            return { value: points[0].value, label: 'Open' };
        }

        const windowStart = Math.floor(Date.now() / 1000) - activeWindowSecs;
        // Find the closest data point just before (or at) windowStart
        let openValue = points[0].value;
        for (let i = 0; i < points.length; i++) {
            if (points[i].time <= windowStart) {
                openValue = points[i].value;
            } else {
                break;
            }
        }
        return { value: openValue, label: 'Open' };
    }, [series, activeWindowSecs]);

    const handleWindowChange = useCallback((secs: number) => {
        setActiveWindowSecs(secs);
    }, []);

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
                    onWindowChange={handleWindowChange}
                    referenceLine={referenceLine}
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
