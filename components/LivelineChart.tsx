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
import type { LivelinePoint, LivelineSeries, CandlePoint } from 'liveline';

export interface LivelineChartPoint {
    time: number;   // unix seconds
    value: number;  // any number
}

interface LivelineChartProps {
    /** Historical data array (single series) */
    data?: LivelineChartPoint[];
    /** Current live value (single series) */
    value?: number;
    /** Multi-series support */
    series?: LivelineSeries[];
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
    /** Loading state */
    loading?: boolean;
    /** Paused state */
    paused?: boolean;
    /** Empty state text */
    emptyText?: string;
    /** Chart mode: line or candle */
    mode?: 'line' | 'candle';
    /** Candlestick data */
    candles?: CandlePoint[];
    /** Width of each candle in pixels */
    candleWidth?: number;
    /** Toggle series visibility callback */
    onSeriesToggle?: (id: string, visible: boolean) => void;
    /** Compact series toggles */
    seriesToggleCompact?: boolean;
    /** Callback when user selects a time window (secs) */
    onWindowChange?: (secs: number) => void;
    /** Show area fill under the line */
    fill?: boolean;
    /** Show pulse effect at the current point */
    pulse?: boolean;
    /** Show price badge */
    badge?: boolean;
    /** Show line connecting badge to point */
    badgeTail?: boolean;
    /** Show background grid */
    grid?: boolean;
    /** Show momentum arrows */
    momentum?: boolean;
    /** Enable interactive scrubbing */
    scrub?: boolean;
    /** Reference line (e.g. strike price) */
    referenceLine?: { value: number; label?: string; color?: string };
}

export default function LivelineChart({
    data,
    value,
    series,
    color = '#22c55e',
    height = 320,
    showValue = false,
    degen = false,
    exaggerate = false,
    windows,
    className = '',
    formatValue,
    orderbook,
    loading,
    paused,
    emptyText,
    mode = 'line',
    candles,
    candleWidth,
    onSeriesToggle,
    seriesToggleCompact,
    onWindowChange,
    fill = true,
    pulse = true,
    badge = true,
    badgeTail = true,
    grid = true,
    momentum = true,
    scrub = true,
    referenceLine,
}: LivelineChartProps) {
    // Convert to LivelinePoint[] — Liveline expects { time: unixSeconds, value: number }
    const points = useMemo<LivelinePoint[]>(() => {
        if (series) return []; // Multi-series uses series prop instead
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
    }, [data, value, series]);

    const liveValue = value ?? points[points.length - 1]?.value ?? 50;

    const fmt = formatValue ?? ((v: number) => `${v.toFixed(1)}%`);

    return (
        <div className={`w-full ${className}`} style={{ height }}>
            <Liveline
                data={points}
                value={liveValue}
                series={series}
                color={color}
                theme="dark"
                fill={fill}
                pulse={pulse}
                badge={badge}
                badgeVariant="default"
                badgeTail={badgeTail}
                grid={grid}
                momentum={momentum}
                scrub={scrub}
                referenceLine={referenceLine}
                showValue={showValue}
                valueMomentumColor={showValue}
                degen={degen}
                exaggerate={exaggerate}
                windows={windows}
                onWindowChange={onWindowChange}
                formatValue={fmt}
                orderbook={orderbook}
                loading={loading}
                paused={paused}
                emptyText={emptyText}
                mode={mode}
                candles={candles}
                candleWidth={candleWidth}
                onSeriesToggle={onSeriesToggle}
                seriesToggleCompact={seriesToggleCompact}
            />
        </div>
    );
}

// ─── Mini variant — used on MarketCard / BotVerificationPanel ────────────────

interface MiniLivelineProps {
    data?: LivelineChartPoint[];
    series?: LivelineSeries[];
    value?: number;
    color?: string;
    height?: number;
    className?: string;
}

export function MiniLiveline({ data, series, value, color = '#22c55e', height = 80, className = '' }: MiniLivelineProps) {
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
                series={series}
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
