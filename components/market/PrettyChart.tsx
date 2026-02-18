'use client';

import React, { useMemo, useCallback } from 'react';
import { LinePath, Bar, Line, Circle } from '@visx/shape'; // Added Circle for End Dots
import { curveStepAfter } from '@visx/curve'; // Step Interpolation (Polymarket Style)
import { scaleTime, scaleLinear } from '@visx/scale';
import { Group } from '@visx/group';
import { GridRows } from '@visx/grid'; // Grid Lines
import { ParentSize } from '@visx/responsive';
import { useTooltip, TooltipWithBounds, defaultStyles } from '@visx/tooltip';
import { localPoint } from '@visx/event';
import TradeBubbles from './TradeBubbles';
import { bisector } from 'd3-array';
import { MiniLiveline } from '@/components/LivelineChart';

// --- HYBRID PALETTE ---
const THEME = {
    BG: '#1a1d2e', // Polymarket Dark
    GRID: '#2a2d3e',
    CROSSHAIR: 'rgba(255, 255, 255, 0.4)',
    TEXT: '#ffffff',
    TOOLTIP_BG: '#1e2130',
    TOOLTIP_BORDER: '#374151',
};

interface DataPoint {
    date: number;
    value: number;
}

interface OutcomeSeries {
    name: string;
    color?: string;
    data: DataPoint[];
}

// Bisector
const bisectDate = bisector<DataPoint, Date>(d => new Date(d.date)).left;

const tooltipStyles = {
    ...defaultStyles,
    background: THEME.TOOLTIP_BG,
    border: `1px solid ${THEME.TOOLTIP_BORDER}`,
    color: 'white',
    padding: '0',
    borderRadius: '8px',
    boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
    zIndex: 100,
};

const Chart = ({ series, width, height }: { series: OutcomeSeries[]; width: number; height: number }) => {
    const {
        showTooltip,
        hideTooltip,
        tooltipData,
        tooltipLeft,
        tooltipTop,
    } = useTooltip<any>();

    // 1. SCALES
    const allData = useMemo(() => series.flatMap(s => s.data), [series]);

    // POLYMARKET STYLE FIX: If only 1 point (new market), create a fake start point 24h ago
    // This draws a flat line instead of a single dot
    const processedSeries = useMemo(() => {
        return series.map(s => {
            if (s.data.length === 1) {
                const now = s.data[0].date;
                const yesterday = now - (24 * 60 * 60 * 1000);
                return {
                    ...s,
                    data: [
                        { date: yesterday, value: s.data[0].value },
                        { date: now, value: s.data[0].value }
                    ]
                };
            }
            return s;
        });
    }, [series]);

    const processedData = useMemo(() => processedSeries.flatMap(s => s.data), [processedSeries]);
    const minDate = Math.min(...processedData.map(d => d.date));
    const maxDate = Math.max(...processedData.map(d => d.date));

    const xScale = useMemo(() => scaleTime({
        domain: [minDate, maxDate],
        range: [0, width],
    }), [minDate, maxDate, width]);

    // Fixed 0-100% Y-Scale
    const yScale = useMemo(() => scaleLinear({
        domain: [0, 100],
        range: [height, 0],
    }), [height]);

    // 2. INTERACTION
    const handleTooltip = useCallback((event: React.MouseEvent | React.TouchEvent) => {
        const { x } = localPoint(event) || { x: 0 };
        const x0 = xScale.invert(x);

        // Find closest point for EACH series
        const hoverData = processedSeries.map(s => {
            const index = bisectDate(s.data, x0, 1);
            const d0 = s.data[index - 1];
            const d1 = s.data[index];
            let d = d0;
            if (d1 && d0) {
                d = x0.getTime() - d0.date > d1.date - x0.getTime() ? d1 : d0;
            } else if (d1) {
                d = d1;
            }
            if (!d) return null;
            return { name: s.name, color: s.color, value: d.value, date: d.date };
        }).filter(Boolean);

        if (hoverData.length > 0) {
            // Snap to the YES line timestamp (assuming synchronized data)
            const snapX = xScale(hoverData[0]!.date);
            showTooltip({
                tooltipData: hoverData, // Array of ALL outcomes at this timestamp
                tooltipLeft: snapX,
                tooltipTop: 0, // Not used for positioning list
            });
        }
    }, [xScale, processedSeries, showTooltip]);

    return (
        <div className="relative">
            <svg width={width} height={height}>
                <rect width={width} height={height} fill={THEME.BG} rx={14} />

                {/* Horizontal Grid Lines (0, 25, 50, 75, 100) */}
                <GridRows
                    scale={yScale}
                    width={width}
                    tickValues={[0, 25, 50, 75, 100]}
                    stroke={THEME.GRID}
                    strokeDasharray="4 4"
                />

                {/* Series Lines & Dots */}
                {processedSeries.map((s, i) => {
                    const lastPoint = s.data[s.data.length - 1];
                    return (
                        <g key={`series-${i}`}>
                            <LinePath
                                data={s.data}
                                x={d => xScale(d.date) || 0}
                                y={d => yScale(d.value) || 0}
                                stroke={s.color || '#fff'}
                                strokeWidth={3} // 3px Sharp
                                curve={curveStepAfter} // Step Interpolation
                            />
                            {/* Live Indicator Dot with Pulse Animation */}
                            {lastPoint && (
                                <g>
                                    {/* Pulse Ring (Outer Glow) */}
                                    <Circle
                                        cx={xScale(lastPoint.date)}
                                        cy={yScale(lastPoint.value)}
                                        r={8}
                                        fill="transparent"
                                        stroke={s.color || '#fff'}
                                        strokeWidth={1}
                                        opacity={0.4}
                                        className="animate-ping"
                                        style={{ transformOrigin: `${xScale(lastPoint.date)}px ${yScale(lastPoint.value)}px` }}
                                    />
                                    {/* Main Dot */}
                                    <Circle
                                        cx={xScale(lastPoint.date)}
                                        cy={yScale(lastPoint.value)}
                                        r={5}
                                        fill={s.color || '#fff'}
                                        stroke={THEME.BG}
                                        strokeWidth={2}
                                    />
                                </g>
                            )}
                        </g>
                    );
                })}

                {/* Vertical Crosshair */}
                {tooltipData && (
                    <Line
                        from={{ x: tooltipLeft, y: 0 }}
                        to={{ x: tooltipLeft, y: height }}
                        stroke={THEME.CROSSHAIR}
                        strokeWidth={1}
                        pointerEvents="none"
                    />
                )}

                {/* Interaction Overlay */}
                <Bar
                    width={width}
                    height={height}
                    fill="transparent"
                    onMouseMove={handleTooltip}
                    onTouchMove={handleTooltip}
                    onMouseLeave={hideTooltip}
                />
            </svg>

            {/* Custom Tooltip (Hybrid Poly/Kalshi) */}
            {tooltipData && (
                <TooltipWithBounds
                    key={Math.random()} // Force re-render for position updates if needed
                    top={10} // Fixed top position or float? Let's try floating near cursor
                    left={tooltipLeft}
                    style={tooltipStyles}
                >
                    <div className="min-w-[180px]">
                        {/* Header: Timestamp */}
                        <div className="bg-[#2a2d3e] px-3 py-2 border-b border-gray-700 text-xs text-gray-400 font-mono">
                            {new Date(tooltipData[0].date).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </div>

                        {/* Body: Outcomes */}
                        <div className="p-3 flex flex-col gap-3">
                            {tooltipData.map((d: any, i: number) => (
                                <div key={i} className="flex flex-col">
                                    <div className="flex items-center gap-2 mb-0.5">
                                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: d.color }} />
                                        <span className="text-xs font-bold text-gray-300">{d.name}</span>
                                    </div>
                                    <span className="text-xl font-black tracking-tight" style={{ color: d.color }}>
                                        {d.value.toFixed(1)}%
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                </TooltipWithBounds>
            )}
        </div>
    );
};

export default function PrettyChartWrapper({ series, trigger }: { series: OutcomeSeries[]; trigger?: { amount: number; side: 'YES' | 'NO' } | null }) {
    if (!series || series.length === 0) return (
        <div className="h-[400px] flex items-center justify-center text-white/20 bg-[#1a1d2e] rounded-3xl">
            Initializing Market Data...
        </div>
    );

    // Build Liveline data from the primary series (YES outcome) for the live strip
    const primarySeries = series[0];
    const livePoints = primarySeries?.data.map(d => ({
        time: Math.floor(d.date / 1000), // d.date is ms → convert to seconds
        value: d.value,
    })) || [];
    const liveValue = livePoints.length > 0 ? livePoints[livePoints.length - 1].value : 50;
    const liveColor = primarySeries?.color || '#22c55e';

    return (
        <div className="w-full rounded-3xl overflow-hidden shadow-2xl border border-gray-800" style={{ backgroundColor: THEME.BG }}>
            {/* ── Liveline Live Strip (60fps real-time indicator) ── */}
            <div className="px-2 pt-2">
                <MiniLiveline
                    data={livePoints}
                    value={liveValue}
                    color={liveColor}
                    height={72}
                    className="rounded-xl overflow-hidden opacity-80"
                />
            </div>

            {/* ── Historical Chart (Visx / Polymarket style) ── */}
            <div className="relative h-[340px]">
                <TradeBubbles trigger={trigger || null} />

                <ParentSize>
                    {({ width, height }) => <Chart series={series} width={width} height={height} />}
                </ParentSize>

                {/* Platform Watermark */}
                <div className="absolute inset-0 pointer-events-none flex items-center justify-center opacity-[0.05]">
                    <div className="relative w-64 h-64 grayscale">
                        <img src="/djinn-logo.png" alt="Djinn Seal" className="w-full h-full object-contain" />
                    </div>
                </div>
            </div>
        </div>
    );
}
