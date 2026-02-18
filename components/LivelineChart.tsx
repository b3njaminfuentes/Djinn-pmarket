'use client';

/**
 * LivelineChart — Universal Liveline wrapper for Djinn
 *
 * Drop-in chart component that renders a 60fps canvas-based live probability line.
 * Works for both market charts and mini card previews.
 *
 * Usage:
 *   <LivelineChart
 *     data={probabilityHistory}   // { time: unixSecs, value: 0-100 }[]
 *     value={currentProbability}  // latest number (smoothly interpolated by Liveline)
 *     color="#22c55e"             // outcome color
 *     height={320}
 *   />
 */

import React, { useMemo } from 'react';
import { Liveline } from 'liveline';
import type { LivelinePoint } from 'liveline';

export interface LivelineChartPoint {
    time: number;   // unix seconds
    value: number;  // 0–100 (probability %)
}

interface LivelineChartProps {
    /** Historical data array */
    data: LivelineChartPoint[];
    /** Current live value (0–100) */
    value: number;
    /** Accent color (hex or CSS color) */
    color?: string;
    /** Container height in px */
    height?: number;
    /** Show large live value overlay */
    showValue?: boolean;
    /** Enable degen particles on big moves */
    degen?: boolean;
    /** Tight Y-axis — small moves fill the chart height */
    exaggerate?: boolean;
    /** Show time-window buttons */
    windows?: { label: string; secs: number }[];
    /** className on container */
    className?: string;
    /** Format the value badge label */
    formatValue?: (v: number) => string;
    /** Show orderbook overlay */
    orderbook?: { bids: [number, number][]; asks: [number, number][] };
}

export default function LivelineChart({
    data,
    value,
    color = '#22c55e',
    height = 320,
    showValue = false,
    degen = false,
    exaggerate = false,
    windows,
    className = '',
    formatValue,
    orderbook,
}: LivelineChartProps) {
    // Convert to LivelinePoint[] — Liveline expects { time: unixSeconds, value: number }
    const points = useMemo<LivelinePoint[]>(() => {
        if (!data || data.length === 0) {
            // Synthetic seed so the chart draws something even for brand-new markets
            const now = Math.floor(Date.now() / 1000);
            return [
                { time: now - 3600, value: 50 },
                { time: now, value: value ?? 50 },
            ];
        }
        return data.map(d => ({
            time: d.time > 1e10 ? Math.floor(d.time / 1000) : d.time, // normalise ms → sec
            value: d.value,
        }));
    }, [data, value]);

    const liveValue = value ?? points[points.length - 1]?.value ?? 50;

    const fmt = formatValue ?? ((v: number) => `${v.toFixed(1)}%`);

    return (
        <div className={`w-full ${className}`} style={{ height }}>
            <Liveline
                data={points}
                value={liveValue}
                color={color}
                theme="dark"
                fill
                pulse
                badge
                badgeVariant="default"
                badgeTail
                grid
                momentum
                scrub
                showValue={showValue}
                valueMomentumColor={showValue}
                degen={degen}
                exaggerate={exaggerate}
                windows={windows}
                formatValue={fmt}
                orderbook={orderbook}
            />
        </div>
    );
}

// ─── Mini variant — used on MarketCard / BotVerificationPanel ────────────────

interface MiniLivelineProps {
    data: LivelineChartPoint[];
    value: number;
    color?: string;
    height?: number;
    className?: string;
}

export function MiniLiveline({ data, value, color = '#22c55e', height = 80, className = '' }: MiniLivelineProps) {
    const points = useMemo<LivelinePoint[]>(() => {
        if (!data || data.length === 0) {
            const now = Math.floor(Date.now() / 1000);
            return [
                { time: now - 3600, value: 50 },
                { time: now, value: value ?? 50 },
            ];
        }
        return data.map(d => ({
            time: d.time > 1e10 ? Math.floor(d.time / 1000) : d.time,
            value: d.value,
        }));
    }, [data, value]);

    return (
        <div className={`w-full ${className}`} style={{ height }}>
            <Liveline
                data={points}
                value={value ?? points[points.length - 1]?.value ?? 50}
                color={color}
                theme="dark"
                fill
                pulse={false}
                badge={false}
                grid={false}
                momentum={false}
                scrub={false}
                exaggerate
            />
        </div>
    );
}
