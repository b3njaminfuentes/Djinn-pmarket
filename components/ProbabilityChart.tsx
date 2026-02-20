"use client";
import React, { useMemo, useState, useEffect, useCallback, useRef } from "react";
import Image from "next/image";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { AnimatePresence, motion } from "framer-motion";
import { cn, formatCompact } from "@/lib/utils";
import { getOutcomeColor } from "@/lib/market-colors";

export type Bubble = {
    id: string;
    text: string;
    color: string;
    y: number;
};

interface ProbabilityChartProps {
    data: any[];
    outcomes: (string | { id: string; title: string })[];
    bubbles: Bubble[];
    timeframe: '1m' | '5m' | '15m' | '1H' | '6H' | '1D' | '1W' | '1M' | 'ALL';
    setTimeframe: (tf: '1m' | '5m' | '15m' | '1H' | '6H' | '1D' | '1W' | '1M' | 'ALL') => void;
    currentProbabilities: Record<string, number>;
    volume?: string;
    resolutionDate?: string;
    selectedOutcome?: string;
    onOutcomeChange?: (outcome: string) => void;
}

// OPTIMIZED: Memoized Custom Tooltip
const CustomTooltip = React.memo(({ active, payload, label }: any) => {
    if (!active || !payload || !payload.length) return null;

    const dataPoint = payload[0]?.payload;
    const timestamp = dataPoint?.time || Number(label);

    let formattedDate = '';
    if (timestamp && typeof timestamp === 'number' && timestamp > 1000000) {
        try {
            const date = new Date(timestamp * 1000);
            if (!isNaN(date.getTime())) {
                formattedDate = date.toLocaleString([], {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit'
                });
            }
        } catch {
            formattedDate = '';
        }
    }

    return (
        <div className="bg-white rounded-xl p-4 border-4 border-black pointer-events-none shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] min-w-[140px]">
            {formattedDate && (
                <div className="text-center mb-3 pb-2 border-b-2 border-black">
                    <span className="text-[11px] font-black text-black uppercase tracking-wider">
                        {formattedDate}
                    </span>
                </div>
            )}
            <div className="flex flex-col gap-2 items-start">
                {payload
                    .filter( (p: any) => p.value !== undefined && p.value !== null && typeof p.value === 'number')
                    .sort((a: any, b: any) => (b.value ?? 0) - (a.value ?? 0))
                    .map( (p: any) => (
                        <div key={p.name} className="flex flex-col">
                            <span className="text-[10px] font-black uppercase tracking-wider mb-0.5" style={{ color: p.stroke }}>
                                {p.name}
                            </span>
                            <span
                                className="text-3xl font-black tabular-nums tracking-tighter leading-none"
                                style={{ color: p.stroke }}
                            >
                                {Number(p.value).toFixed(1)}%
                            </span>
                        </div>
                    ))}
            </div>
        </div>
    );
});

CustomTooltip.displayName = 'CustomTooltip';

// OPTIMIZED: Simplified Pulsing Dot with requestAnimationFrame
const PulsingDot = React.memo((props: any) => {
    const { cx, cy, stroke } = props;

    if (!Number.isFinite(cx) || !Number.isFinite(cy)) return null;

    return (
        <g>
            <motion.circle
                cx={cx}
                cy={cy}
                r="6"
                fill="none"
                stroke={stroke}
                strokeWidth={3}
                initial={{ r: 6, opacity: 0.5 }}
                animate={{ r: 20, opacity: 0 }}
                transition={{
                    duration: 1.5,
                    repeat: Infinity,
                    ease: "easeOut"
                }}
            />
            <circle cx={cx} cy={cy} r="5" fill={stroke} />
        </g>
    );
});

PulsingDot.displayName = 'PulsingDot';

// 🔥 CONFIGURACIÓN DE TEMPORALIDADES
const TIMEFRAMES = {
    '1m': { label: '1 Minuto', seconds: 60 },
    '5m': { label: '5 Minutos', seconds: 300 },
    '15m': { label: '15 Minutos', seconds: 900 },
    '1H': { label: '1 Hora', seconds: 3600 },
    '6H': { label: '6 Horas', seconds: 21600 },
    '1D': { label: '1 Día', seconds: 86400 },
    '1W': { label: '1 Semana', seconds: 604800 },
    '1M': { label: '1 Mes', seconds: 2592000 },
    'ALL': { label: 'Todo', seconds: Infinity }
} as const;

export default React.memo(function ProbabilityChart({
    data,
    outcomes,
    bubbles,
    timeframe,
    setTimeframe,
    currentProbabilities,
    volume,
    resolutionDate,
    selectedOutcome,
    onOutcomeChange
}: ProbabilityChartProps) {
    const [hoverData, setHoverData] = useState<any>(null);
    const [now, setNow] = useState(Math.floor(Date.now() / 1000));

    // 🔥 Helper for Time Formatting
    const formatTimeLabel = (timestamp: number, timeframe: string): string => {
        const date = new Date(timestamp * 1000);

        switch (timeframe) {
            case '1m':
            case '5m':
            case '15m':
            case '30m':
            case '1H':
            case '6H':
                // Formato: HH:MM
                return date.toLocaleTimeString('es-AR', {
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: false
                });

            case '4H':
            case '1D':
                // Formato: DD/MM HH:MM
                return `${date.toLocaleDateString('es-AR', {
                    day: '2-digit',
                    month: '2-digit'
                })} ${date.toLocaleTimeString('es-AR', {
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: false
                })}`;

            case '1W':
            case '1M':
                // Formato: DD/MM
                return date.toLocaleDateString('es-AR', {
                    day: '2-digit',
                    month: '2-digit'
                });

            case 'ALL':
                // Formato: DD/MM/YY
                return date.toLocaleDateString('es-AR', {
                    day: '2-digit',
                    month: '2-digit',
                    year: '2-digit'
                });

            default:
                return date.toLocaleTimeString('es-AR', {
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: false
                });
        }
    };



    // OPTIMIZATION 1: Reduce heartbeat frequency to reduce re-renders
    useEffect(() => {
        const interval = setInterval(() => {
            setNow(Math.floor(Date.now() / 1000));
        }, 1000); // 1s tick for live feel
        return () => clearInterval(interval);
    }, []);

    // OPTIMIZATION 2: Deep memoization with stable references
    const outcomeKeys = useMemo(() => {
        return outcomes.map(o => typeof o === 'string' ? o : o.title);
    }, [outcomes]);

    // OPTIMIZATION 3: Memoize base data processing separately
    const baseSortedData = useMemo(() => {
        if (!data || data.length === 0) return null;

        // 1. Sort by time
        const sorted = [...data].sort((a: any, b: any) => a.time - b.time);

        // 2. Deduplicate: Remove points with identical timestamps, keeping the last one
        const uniqueData: any[] = [];
        let lastTime = -1;

        for (const point of sorted) {
            // Ensure valid timestamp
            if (!point.time || isNaN(point.time)) continue;

            if (point.time !== lastTime) {
                uniqueData.push(point);
                lastTime = point.time;
            } else {
                // Overwrite the last point if timestamp matches (assume newer data comes later or is preferred)
                uniqueData[uniqueData.length - 1] = point;
            }
        }

        return uniqueData;
    }, [data]);

    // OPTIMIZATION 4: Smart downsampling BEFORE sync
    const downsampledData = useMemo(() => {
        if (!baseSortedData) return null;

        // Adaptive downsampling based on data size
        const targetPoints = 500; // Increased from 300 for better quality
        if (baseSortedData.length <= targetPoints) return baseSortedData;

        const factor = Math.ceil(baseSortedData.length / targetPoints);
        return baseSortedData.filter((_, i) => i % factor === 0 || i === baseSortedData.length - 1);
    }, [baseSortedData]);

    // OPTIMIZATION 5: Sync with live data (minimal processing)
    const syncedData = useMemo(() => {
        if (!downsampledData) {
            const fallbackProbs: any = {};
            outcomeKeys.forEach(title => {
                fallbackProbs[title] = 100 / outcomeKeys.length;
            });
            return [{ time: now - 86400 * 365, ...fallbackProbs }, { time: now, ...fallbackProbs }];
        }

        const sorted = [...downsampledData];
        const last = sorted[sorted.length - 1];

        if (currentProbabilities && Object.keys(currentProbabilities).length > 0) {
            const livePoint: any = {
                time: now,
                ...currentProbabilities
            };

            // STABILITY FIX: Increase buffer to 30s to prevent jitter/bouncing of tail
            if (last && (now - last.time > 30)) {
                sorted.push(livePoint);
            } else if (last) {
                // In-place update for smoother animation
                sorted[sorted.length - 1] = { ...last, ...currentProbabilities, time: Math.max(last.time, now) };
            }
        } else if (last && now - last.time > 30) {
            sorted.push({ ...last, time: now });
        }

        return sorted;
    }, [downsampledData, outcomeKeys, currentProbabilities, now]);

    // OPTIMIZATION 6: Memoize timeframe calculation
    const timeframeConfig = useMemo(() => {
        // Use the TIMEFRAMES constant we defined above
        // We need to map the prop string ('1m', '1H') to our keys
        // The existing props seem to match our keys mostly.
        // If prop is '5M' (uppercase) and key is '5m' (lowercase), handle it.
        // The prop type says '1m' | '5m' ... so it should match.
        // Fallback to 1H if not found.
        const key = timeframe as keyof typeof TIMEFRAMES;
        return TIMEFRAMES[key]?.seconds || 3600;
    }, [timeframe]);


    // 🔥 FILTRAR DATOS SEGÚN TEMPORALIDAD
    const { filteredData, domainMin, domainMax } = useMemo(() => {
        if (!syncedData || syncedData.length === 0) {
            return { filteredData: [], domainMin: 'dataMin', domainMax: 'dataMax' };
        }

        const config = TIMEFRAMES[timeframe as keyof typeof TIMEFRAMES] || TIMEFRAMES['1H'];
        const windowStart = config.seconds === Infinity
            ? 0
            : now - config.seconds;

        // Filtrar datos dentro de la ventana de tiempo
        let filtered = syncedData.filter((d: any) => d.time >= windowStart && d.time <= now);

        // 🔥 CRITICAL: Asegurar al menos 2 puntos para dibujar línea
        if (filtered.length === 0 && syncedData.length > 0) {
            // No hay datos en esta ventana, usar el último punto conocido
            const lastPoint = syncedData[syncedData.length - 1];
            filtered = [
                { ...lastPoint, time: windowStart },
                { ...lastPoint, time: now }
            ];
        } else if (filtered.length === 1) {
            // Solo 1 punto, extender hacia atrás
            const singlePoint = filtered[0];
            filtered = [
                { ...singlePoint, time: windowStart },
                singlePoint,
                { ...singlePoint, time: now }
            ];
        } else if (filtered.length > 0) {
            // Ensure continuity from left side
            if (filtered[0].time > windowStart) {
                // Try to find the point just before windowStart
                const firstInsideIndex = syncedData.indexOf(filtered[0]);
                if (firstInsideIndex > 0) {
                    const prev = syncedData[firstInsideIndex - 1];
                    // Interpolate or just add prev point clamped?
                    filtered.unshift({ ...prev, time: windowStart });
                } else {
                    // If no previous, just extend first point to left edge
                    filtered.unshift({ ...filtered[0], time: windowStart });
                }
            }
        }

        // Ensure end point is 'now' if not present (handled by syncedData mostly but safe to check)
        // syncedData usually ends at 'now' due to logic above.

        console.log(`📊 Timeframe: ${timeframe}, Points: ${filtered.length}`);

        return {
            filteredData: filtered,
            domainMin: timeframe === 'ALL' && syncedData.length > 0 ? syncedData[0].time : windowStart,
            domainMax: now
        };
    }, [syncedData, timeframe, now]);

    // OPTIMIZATION 8: Stable display probabilities reference
    const displayProbs = useMemo(() => {
        return hoverData || currentProbabilities;
    }, [hoverData, currentProbabilities]);

    // OPTIMIZATION 9: Adaptive Y-Axis with stable calculation
    const { yAxisDomain, yAxisTicks } = useMemo(() => {
        if (['1D', '1W', '1M', 'ALL'].includes(timeframe)) {
            return {
                yAxisDomain: [0, 100] as [number, number],
                yAxisTicks: [0, 25, 50, 75, 100]
            };
        }

        if (!filteredData || filteredData.length === 0) {
            return {
                yAxisDomain: [0, 100] as [number, number],
                yAxisTicks: [0, 25, 50, 75, 100]
            };
        }

        let minVal = 100;
        let maxVal = 0;

        filteredData.forEach((point: any) => {
            outcomeKeys.forEach(title => {
                const val = point[title];
                if (typeof val === 'number') {
                    if (val < minVal) minVal = val;
                    if (val > maxVal) maxVal = val;
                }
            });
        });

        const spread = maxVal - minVal;
        const padding = Math.max(spread * 0.2, 10);
        const smartMin = Math.max(0, Math.floor((minVal - padding / 2) / 5) * 5);
        const smartMax = Math.min(100, Math.ceil((maxVal + padding / 2) / 5) * 5);

        const ticks = [];
        for (let i = smartMin; i <= smartMax; i += 5) {
            ticks.push(i);
        }

        return {
            yAxisDomain: [smartMin, smartMax] as [number, number],
            yAxisTicks: ticks
        };
    }, [filteredData, outcomeKeys, timeframe]);

    // OPTIMIZATION 10: Memoized handlers
    const handleMouseMove = useCallback((e: any) => {
        if (e.activePayload && e.activePayload.length > 0) {
            const payload = e.activePayload[0].payload;
            setHoverData(payload);
        }
    }, []);

    const handleMouseLeave = useCallback(() => {
        setHoverData(null);
    }, []);

    // OPTIMIZATION 11: Memoized timeframe formatter
    const tickFormatter = useCallback((val: number) => {
        if (!val || typeof val !== 'number' || val <= 0) return '';
        const date = new Date(val * 1000);
        if (isNaN(date.getTime())) return '';

        switch (timeframe) {
            case '1m':
            case '5m':
            case '15m':
                return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
            case '1H':
            case '6H':
            case '1D':
                return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
            case '1W':
            case '1M':
                return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
            case 'ALL':
                // For ALL, show date if range > 1 day, else time
                const range = (filteredData[filteredData.length - 1]?.time || 0) - (filteredData[0]?.time || 0);
                if (range > 86400) return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
                return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
            default:
                return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
        }
    }, [timeframe, filteredData]);

    return (
        <div className="w-full h-full flex flex-col relative">
            {/* POLYMARKET STYLE: Minimal overlays */}

            {/* TIMEFRAMES - Polymarket pill style */}
            <div className="absolute top-4 left-4 z-30 flex gap-1 pointer-events-auto">
                {['1H', '1D', '1W', '1M', 'ALL'].map((tf) => (
                    <button
                        key={tf}
                        onClick={() => setTimeframe(tf as any)}
                        className={cn(
                            "px-3 py-1.5 rounded-full text-xs font-semibold transition-all",
                            timeframe === tf
                                ? "bg-gray-900 text-white"
                                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                        )}
                    >
                        {tf}
                    </button>
                ))}
            </div>

            {/* OUTCOMES LEGEND - Polymarket style (top left) */}
            <div className="absolute top-16 left-4 z-20 flex flex-col gap-2 pointer-events-none">
                {outcomeKeys.map((title, idx) => {
                    const color = getOutcomeColor(title, idx);
                    const val = displayProbs[title] ?? 0;
                    return (
                        <div key={title} className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
                            <span className="text-sm font-semibold text-gray-700">{title}</span>
                            <span className="text-2xl font-bold tabular-nums text-gray-900">
                                {val.toFixed(0)}<span className="text-sm text-gray-500 ml-0.5">%</span>
                            </span>
                        </div>
                    );
                })}
            </div>

            {/* BUBBLES - TRANSPARENT */}
            <div className="absolute inset-0 pointer-events-none z-10 overflow-hidden">
                <AnimatePresence mode="popLayout">
                    {bubbles.slice(0, 5).map(b => ( // Limit to 5 bubbles max
                        <motion.div
                            key={b.id}
                            initial={{ opacity: 0, x: -20, scale: 0.8 }}
                            animate={{ opacity: 1, x: 20, y: -50, scale: 1 }}
                            exit={{ opacity: 0, y: -100 }}
                            transition={{ duration: 3, ease: "easeOut" }}
                            style={{ top: `${b.y}%`, left: '0%' }}
                            className="absolute flex items-center gap-2"
                        >
                            <div
                                className="px-3 py-1.5 rounded-lg bg-white/10 backdrop-blur-md border-2 border-white/30 text-xs font-black whitespace-nowrap"
                                style={{ color: b.color }}
                            >
                                {b.text}
                            </div>
                        </motion.div>
                    ))}
                </AnimatePresence>
            </div>

            {/* CHART - CRITICAL OPTIMIZATIONS */}
            <div className="flex-1 w-full min-h-0 relative z-10">
                <ResponsiveContainer width="100%" height="100%">
                    <LineChart
                        data={filteredData}
                        margin={{ top: 80, right: 25, left: 10, bottom: 60 }}
                        onMouseMove={handleMouseMove}
                        onMouseLeave={handleMouseLeave}
                    >
                        <CartesianGrid
                            vertical={false}
                            stroke="#e5e7eb"
                            strokeOpacity={0.5}
                            strokeWidth={1}
                            strokeDasharray="0"
                        />
                        <XAxis
                            dataKey="time"
                            type="number"
                            scale="time"
                            domain={[domainMin || 'dataMin', domainMax || 'dataMax']}
                            axisLine={false}
                            tickLine={false}
                            tickFormatter={(timestamp) => formatTimeLabel(timestamp, timeframe)}
                            tick={{ fill: '#9ca3af', fontSize: 11, fontWeight: 500 }}
                            minTickGap={50}
                        />
                        <YAxis
                            orientation="right"
                            domain={yAxisDomain}
                            ticks={yAxisTicks}
                            allowDataOverflow={true}
                            axisLine={false}
                            tickLine={false}
                            tick={{ fill: '#9ca3af', fontSize: 11, fontWeight: 500 }}
                            tickFormatter={(val) => `${val}%`}
                            width={40}
                        />
                        <Tooltip content={<CustomTooltip />} cursor={{ stroke: '#ffffff', strokeWidth: 2, strokeDasharray: '5 5' }} />
                        {outcomeKeys.map((title, idx) => {
                            const color = getOutcomeColor(title, idx);
                            return (
                                <Line
                                    key={title}
                                    type="monotone"
                                    dataKey={title}
                                    stroke={color}
                                    strokeWidth={3}
                                    dot={(props: any) => {
                                        const { index, cx, ...restProps } = props;
                                        if (index === filteredData.length - 1) {
                                            return <PulsingDot {...restProps} cx={cx - 6} stroke={color} />;
                                        }
                                        return null;
                                    }}
                                    activeDot={{ r: 6, strokeWidth: 0, fill: color }}
                                    isAnimationActive={false}
                                    animationDuration={0}
                                    connectNulls
                                    style={{ cursor: 'pointer' }}
                                    onClick={() => onOutcomeChange?.(title)}
                                />
                            );
                        })}
                    </LineChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
}, (prevProps, nextProps) => {
    // OPTIMIZATION 12: Custom comparison for React.memo
    return (
        prevProps.timeframe === nextProps.timeframe &&
        prevProps.selectedOutcome === nextProps.selectedOutcome &&
        prevProps.data === nextProps.data &&
        prevProps.currentProbabilities === nextProps.currentProbabilities &&
        prevProps.volume === nextProps.volume
    );
});
