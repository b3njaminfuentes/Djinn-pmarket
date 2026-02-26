'use client';

/**
 * MarketChart — Primary market probability chart (Liveline, 60fps canvas)
 *
 * Replaces the previous lightweight-charts area chart with a Liveline real-time renderer.
 * Same props API, drop-in replacement.
 */

import React, { useMemo } from 'react';
import TradeBubbles from './TradeBubbles';
import LivelineChart from '@/components/LivelineChart';

interface MarketChartProps {
    data?: { time: string | number; value: number }[];
    series?: any[]; // LivelineSeries[]
    color?: string;
    hasPosition?: boolean;
    lastTrade?: { amount: number; side: 'YES' | 'NO' } | null;
}

const TIME_WINDOWS = [
    { label: '1m', secs: 60 },
    { label: '5m', secs: 300 },
    { label: '15m', secs: 900 },
    { label: '1H', secs: 3600 },
    { label: '6H', secs: 21600 },
    { label: '1D', secs: 86400 },
    { label: '1W', secs: 604800 },
];

export default function MarketChart({ data, series, color, lastTrade }: MarketChartProps) {
    const points = useMemo(() => {
        if (!data || data.length === 0) return [];
        return data.map(d => ({
            // MarketChart passes time as string — convert if needed
            time: typeof d.time === 'string' && !isNaN(Number(d.time))
                ? Number(d.time)
                : typeof d.time === 'number'
                    ? d.time
                    : Math.floor(Date.now() / 1000),
            value: d.value,
        }));
    }, [data]);

    const liveValue = points.length > 0 ? points[points.length - 1].value : 50;

    return (
        <div className="relative w-full overflow-hidden">
            {/* Real-time trade bubbles overlay */}
            <TradeBubbles trigger={lastTrade || null} />

            <LivelineChart
                data={points.length > 0 ? points : undefined}
                series={series}
                value={series ? undefined : liveValue}
                color={color}
                height={320}
                degen
                windows={TIME_WINDOWS}
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
