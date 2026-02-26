'use client';

/**
 * MarketChart — Primary market probability chart (Liveline, 60fps canvas)
 *
 * Single-series chart with:
 * - Time window buttons (1m → 1W)
 * - Reference line showing the period open (previous close)
 * - Live value that flows between trades via `liveValue` prop
 */

import React, { useState, useMemo, useCallback } from 'react';
import TradeBubbles from './TradeBubbles';
import LivelineChart from '@/components/LivelineChart';

interface MarketChartProps {
    data?: { time: string | number; value: number }[];
    series?: any[]; // LivelineSeries[]
    color?: string;
    hasPosition?: boolean;
    lastTrade?: { amount: number; side: 'YES' | 'NO' } | null;
    /** Current live probability (0-100) — keeps chart flowing between trades */
    liveValue?: number;
}

const TIME_WINDOWS = [
    { label: '1m',  secs: 60 },
    { label: '5m',  secs: 300 },
    { label: '15m', secs: 900 },
    { label: '1H',  secs: 3600 },
    { label: '6H',  secs: 21600 },
    { label: '1D',  secs: 86400 },
    { label: '1W',  secs: 604800 },
];

const DEFAULT_WINDOW_SECS = 3600; // 1H

export default function MarketChart({ data, series, color, lastTrade, liveValue }: MarketChartProps) {
    const [activeWindowSecs, setActiveWindowSecs] = useState(DEFAULT_WINDOW_SECS);

    // Normalize timestamps to unix seconds
    const points = useMemo(() => {
        if (!data || data.length === 0) return [];
        return data.map(d => ({
            time: typeof d.time === 'string' && !isNaN(Number(d.time))
                ? Number(d.time)
                : typeof d.time === 'number'
                    ? (d.time > 1e10 ? Math.floor(d.time / 1000) : d.time)
                    : Math.floor(Date.now() / 1000),
            value: d.value,
        }));
    }, [data]);

    // Current live value (prefer explicit prop, then last data point)
    const currentValue = liveValue ?? (points.length > 0 ? points[points.length - 1].value : 50);

    // Reference line = value at the start of the active window (period open / previous close)
    const referenceLine = useMemo(() => {
        if (points.length === 0) return undefined;
        if (activeWindowSecs === 0) {
            return { value: points[0].value, label: 'Open' };
        }
        const windowStart = Math.floor(Date.now() / 1000) - activeWindowSecs;
        let openValue = points[0].value;
        for (const p of points) {
            if (p.time <= windowStart) openValue = p.value;
            else break;
        }
        return { value: openValue, label: 'Open' };
    }, [points, activeWindowSecs]);

    const handleWindowChange = useCallback((secs: number) => {
        setActiveWindowSecs(secs);
    }, []);

    return (
        <div className="relative w-full overflow-hidden">
            {/* Real-time trade bubbles overlay */}
            <TradeBubbles trigger={lastTrade || null} />

            <LivelineChart
                data={points.length > 0 ? points : undefined}
                series={series}
                value={series ? undefined : currentValue}
                color={color}
                height={320}
                degen
                windows={TIME_WINDOWS}
                onWindowChange={handleWindowChange}
                referenceLine={series ? undefined : referenceLine}
                formatValue={(v) => `${v.toFixed(1)}%`}
                className="rounded-2xl"
            />

            {/* Watermark */}
            <div className="absolute top-4 right-4 opacity-20 pointer-events-none">
                <span className="text-[10px] font-black uppercase tracking-widest text-white">Djinn Live</span>
            </div>
        </div>
    );
}
