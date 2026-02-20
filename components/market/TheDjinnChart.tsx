
import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
    XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, CartesianGrid
} from 'recharts';
import { motion, AnimatePresence } from 'framer-motion';
import { format } from 'date-fns';

// --- TYPES ---
export interface ChartDataPoint {
    time: number; // ms
    [key: string]: any;
}

interface TradeBubble {
    id: string;
    side: string;
    amountSol: number;
    outcomeName: string;
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

// Timeframes - Including smaller intervals
const TIMEFRAMES = [
    { label: '5M', value: 5 * 60 * 1000, key: '5M' },
    { label: '15M', value: 15 * 60 * 1000, key: '15M' },
    { label: '30M', value: 30 * 60 * 1000, key: '30M' },
    { label: '1H', value: 60 * 60 * 1000, key: '1H' },
    { label: '6H', value: 6 * 60 * 60 * 1000, key: '6H' },
    { label: '24H', value: 24 * 60 * 60 * 1000, key: '24H' },
    { label: '7D', value: 7 * 24 * 60 * 60 * 1000, key: '7D' },
    { label: '1M', value: 30 * 24 * 60 * 60 * 1000, key: '1M' },
    { label: 'ALL', value: Infinity, key: 'ALL' }
];

// Custom Tooltip
const CustomTooltip = ({ active, payload, outcomeColors, outcomeNames }: any) => {
    if (!active || !payload || !payload.length) return null;

    const data = payload[0].payload;
    const timeStr = format(new Date(data.time), 'MMM d, h:mm a');

    return (
        <div className="bg-white border-2 border-gray-900 rounded-xl px-4 py-3 shadow-2xl">
            <div className="text-xs text-gray-500 font-semibold mb-3">{timeStr}</div>
            <div className="space-y-2">
                {outcomeNames.map((outcome: string, idx: number) => {
                    const value = data[outcome];
                    if (value === undefined) return null;

                    return (
                        <div key={outcome} className="flex items-center justify-between gap-6">
                            <div className="flex items-center gap-2">
                                <div
                                    className="w-3 h-3 rounded-full"
                                    style={{ backgroundColor: outcomeColors[idx] }}
                                />
                                <span className="text-sm font-bold text-gray-900">{outcome}</span>
                            </div>
                            <span
                                className="text-3xl font-black"
                                style={{ color: outcomeColors[idx] }}
                            >
                                {Math.round(value)}%
                            </span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

// Trade indicators - Simple text only
const TradeIndicator = ({ trade, color }: { trade: TradeBubble, color: string }) => {
    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.3 }}
            className="text-sm font-black"
            style={{ color }}
        >
            +${Math.round(trade.amountSol)}
        </motion.div>
    );
};

// Debug Panel Component - MEJORADO
const DebugPanel = ({ data, outcomeNames, filteredData, outcomeColors }: any) => {
    if (!data) return null;

    const checks = [
        { name: 'Data exists', pass: data.length > 0, value: `${data.length} points` },
        { name: 'Outcome names', pass: outcomeNames?.length > 0, value: outcomeNames?.join(', ') },
        { name: 'Colors', pass: outcomeColors?.length > 0, value: outcomeColors?.join(', ') },
        {
            name: 'Data has outcomes',
            pass: data.length > 0 && outcomeNames.every((n: string) => data[0].hasOwnProperty(n)),
            value: data.length > 0 ? Object.keys(data[0]).filter( (k: any) => k !== 'time').join(', ') : 'N/A'
        },
        {
            name: 'Values in range',
            pass: data.length > 0 && outcomeNames.every((n: string) => {
                const v = data[0][n];
                return typeof v === 'number' && v >= 0 && v <= 100;
            }),
            value: data.length > 0 ? JSON.stringify(outcomeNames.reduce((acc: any, n: string) => { acc[n] = data[0][n]; return acc; }, {})) : 'N/A'
        }
    ];

    return (
        <div className="absolute top-2 left-2 bg-white border-4 border-red-500 rounded-lg p-3 text-xs z-50 max-w-md shadow-2xl">
            <div className="font-bold text-red-900 mb-2 text-sm">🐛 CHART DEBUG</div>

            <div className="space-y-1 mb-3">
                {checks.map((check, idx) => (
                    <div key={idx} className={`flex items-start gap-2 p-1 rounded ${check.pass ? 'bg-green-50' : 'bg-red-50'}`}>
                        <span>{check.pass ? '✅' : '❌'}</span>
                        <div className="flex-1">
                            <div className="font-semibold">{check.name}</div>
                            <div className="text-[10px] text-gray-600 break-all">{check.value}</div>
                        </div>
                    </div>
                ))}
            </div>

            <div className="border-t border-gray-300 pt-2 mt-2">
                <div className="font-semibold mb-1">Data Sample:</div>
                {data.length > 0 && (
                    <pre className="text-[9px] overflow-auto max-h-32 bg-gray-50 p-2 rounded">
                        {JSON.stringify(data[0], null, 2)}
                    </pre>
                )}
            </div>

            <div className="mt-2 text-[10px] text-gray-600">
                Filtered: {filteredData?.length || 0} points
            </div>
        </div>
    );
};

// Helper para formatear fecha de forma segura
const safeFormatDate = (dateValue: any): string => {
    if (!dateValue) return '';

    try {
        const date = new Date(dateValue);
        if (isNaN(date.getTime())) {
            return String(dateValue); // Devuelve el string original si no es válido
        }
        return format(date, 'MMM d, yyyy');
    } catch (error) {
        console.error('Error formatting date:', error);
        return String(dateValue);
    }
};

export default function TheDjinnChart({
    data = [],
    tradeEvent,
    onHover,
    onOutcomeChange,
    outcomeColors = ['#2563EB', '#DC2626'],
    outcomeNames = ['YES', 'NO'],
    outcomeSupplies,
    debug = false,
    ...props
}: TheDjinnChartProps) {
    const [timeframe, setTimeframe] = useState(TIMEFRAMES[5]); // ALL default
    const [bubbles, setBubbles] = useState<TradeBubble[]>([]);
    const [hoveredValue, setHoveredValue] = useState<number | null>(null);

    // Debug logs mejorados
    useEffect(() => {
        if (debug) {
            console.group('🐛 TheDjinnChart Debug');
            console.log('Raw data length:', data?.length || 0);
            console.log('Outcome names:', outcomeNames);
            console.log('Outcome colors:', outcomeColors);

            if (data && data.length > 0) {
                console.log('First data point:', data[0]);
                console.log('Last data point:', data[data.length - 1]);

                // Check estructura
                console.log('Data structure check:');
                outcomeNames.forEach(outcome => {
                    const hasKey = data[0].hasOwnProperty(outcome);
                    console.log(`  - Has "${outcome}":`, hasKey);
                    if (hasKey) {
                        const value = data[0][outcome];
                        console.log(`    Type:`, typeof value);
                        console.log(`    Value:`, value);
                        console.log(`    In range (0-100):`, typeof value === 'number' && value >= 0 && value <= 100);
                    }
                });
            } else {
                console.error('❌ NO DATA PROVIDED');
            }
            console.groupEnd();
        }
    }, [data, outcomeNames, outcomeColors, debug]);

    // Manejo de bubbles
    useEffect(() => {
        if (!tradeEvent) return;

        const newBubble: TradeBubble = {
            id: tradeEvent.id,
            side: tradeEvent.side,
            amountSol: tradeEvent.amount,
            outcomeName: tradeEvent.outcome
        };

        setBubbles((prev) => [...prev, newBubble]);

        const timer = setTimeout(() => {
            setBubbles((prev) => prev.filter((bubble) => bubble.id !== newBubble.id));
        }, 3000);

        return () => clearTimeout(timer);
    }, [tradeEvent]);

    // Filtrar y validar datos
    const filteredLineData = useMemo(() => {
        if (!data || data.length === 0) {
            console.warn('⚠️ No data provided to chart');
            return [];
        }

        const now = Date.now();
        const cutoff = now - timeframe.value;

        let filtered = data
            .filter(d => {
                if (!d.time || typeof d.time !== 'number') {
                    console.warn('⚠️ Data point missing valid time:', d);
                    return false;
                }
                // Auto-detect seconds vs ms: timestamps < 1e12 are in seconds
                const timeMs = d.time < 1e12 ? d.time * 1000 : d.time;
                return timeframe.value === Infinity || timeMs >= cutoff;
            })
            .map(d => {
                // Convert seconds to ms for consistent rendering
                const timeMs = d.time < 1e12 ? d.time * 1000 : d.time;
                const point: any = { time: timeMs };

                outcomeNames.forEach(outcome => {
                    if (d.hasOwnProperty(outcome)) {
                        const value = Number(d[outcome]);
                        point[outcome] = isNaN(value) ? 0 : value;
                    } else {
                        console.warn(`⚠️ Data point missing outcome "${outcome}":`, d);
                        // Don't default to 0 - skip invalid points instead
                        point[outcome] = null;
                    }
                });

                // Filter out points where all outcomes are null/0
                const hasValidValue = outcomeNames.some(name => point[name] !== null && point[name] > 0);
                if (!hasValidValue && outcomeNames.length > 0) {
                    // If no valid values, use the last known good values or 50
                    outcomeNames.forEach(outcome => {
                        if (point[outcome] === null) point[outcome] = 50;
                    });
                }

                return point;
            });

        // If we have very few points, interpolate to create smooth chart
        if (filtered.length >= 2 && filtered.length < 10) {
            const interpolated: any[] = [];
            const numPoints = 20; // Target number of points for smooth chart

            for (let i = 0; i < filtered.length - 1; i++) {
                const curr = filtered[i];
                const next = filtered[i + 1];
                const timeDiff = next.time - curr.time;
                const pointsToAdd = Math.min(Math.floor(numPoints / (filtered.length - 1)), 10);

                for (let j = 0; j <= pointsToAdd; j++) {
                    const ratio = j / pointsToAdd;
                    const interpPoint: any = {
                        time: curr.time + (timeDiff * ratio)
                    };

                    outcomeNames.forEach(outcome => {
                        const currVal = curr[outcome] || 0;
                        const nextVal = next[outcome] || 0;
                        interpPoint[outcome] = currVal + (nextVal - currVal) * ratio;
                    });

                    interpolated.push(interpPoint);
                }
            }
            // Add last point
            interpolated.push(filtered[filtered.length - 1]);

            if (debug) {
                console.log('📊 Interpolated from', filtered.length, 'to', interpolated.length, 'points');
            }

            return interpolated;
        }

        if (debug) {
            console.log('📊 Filtered data length:', filtered.length);
            if (filtered.length > 0) {
                console.log('📊 Sample filtered point:', filtered[0]);
                console.log('📊 Last filtered point:', filtered[filtered.length - 1]);
            }
        }

        return filtered;
    }, [data, timeframe, outcomeNames, debug]);

    // Formato de eje X - Actualizado para todas las temporalidades
    const formatXAxis = (timestamp: number) => {
        try {
            const date = new Date(timestamp);
            if (isNaN(date.getTime())) return '';

            if (timeframe.key === '5M' || timeframe.key === '15M' || timeframe.key === '30M') {
                // Para intervalos pequeños, mostrar HH:mm:ss
                return format(date, 'HH:mm:ss');
            } else if (timeframe.key === '1H' || timeframe.key === '6H') {
                // Para 1H y 6H mostrar HH:mm
                return format(date, 'HH:mm');
            } else if (timeframe.key === '24H') {
                // Para 24H mostrar hora
                return format(date, 'HH:mm');
            } else if (timeframe.key === '7D') {
                // Para 7D mostrar día y hora
                return format(date, 'EEE HH:mm');
            } else if (timeframe.key === '1M') {
                // Para 1M mostrar mes y día
                return format(date, 'MMM d');
            } else {
                // ALL - mostrar mes y día
                return format(date, 'MMM d');
            }
        } catch (e) {
            return '';
        }
    };

    const formatYAxis = (value: number) => {
        return `${value}%`;
    };

    // Si no hay datos, mostrar mensaje
    if (!data || data.length === 0) {
        return (
            <div className="flex flex-col w-full h-full bg-white relative rounded-2xl overflow-hidden border border-gray-200 shadow-sm">
                <div className="flex-1 flex items-center justify-center">
                    <div className="text-center">
                        <div className="text-6xl mb-4">📊</div>
                        <div className="text-xl font-bold text-gray-900 mb-2">No Data Available</div>
                        <div className="text-sm text-gray-500">
                            Waiting for probability history data...
                        </div>
                        {debug && (
                            <div className="mt-4 text-xs text-red-600">
                                Debug mode: Check console for details
                            </div>
                        )}
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col w-full h-full bg-white relative rounded-2xl overflow-hidden border border-gray-200 shadow-sm">

            {/* Debug Panel */}
            {debug && (
                <DebugPanel
                    data={data}
                    outcomeNames={outcomeNames}
                    filteredData={filteredLineData}
                    outcomeColors={outcomeColors}
                />
            )}

            {/* Header with Outcome Probabilities */}
            <div className="flex items-center justify-between px-6 pt-4 pb-2 border-b border-gray-100">
                <div className="flex gap-4">
                    {outcomeNames.map((outcome, idx) => (
                        <div key={outcome} className="flex items-center gap-2">
                            <div
                                className="w-3 h-3 rounded-full"
                                style={{ backgroundColor: outcomeColors[idx] }}
                            />
                            <span className="text-xs font-bold text-gray-900">{outcome}</span>
                            {filteredLineData.length > 0 && (
                                <span
                                    className="text-lg font-black"
                                    style={{ color: outcomeColors[idx] }}
                                >
                                    {Math.round(filteredLineData[filteredLineData.length - 1][outcome] || 0)}%
                                </span>
                            )}
                        </div>
                    ))}
                </div>
                <div />
            </div>

            {/* Trade Indicators */}
            <div className="absolute left-4 top-24 z-10 space-y-1 max-h-[200px] overflow-hidden">
                <AnimatePresence>
                    {bubbles.map((bubble) => {
                        const outcomeIdx = outcomeNames.findIndex(n => n === bubble.outcomeName);
                        const color = outcomeColors[outcomeIdx] || outcomeColors[0];
                        return (
                            <TradeIndicator key={bubble.id} trade={bubble} color={color} />
                        );
                    })}
                </AnimatePresence>
            </div>

            {/* Chart Area */}
            <div className="flex-1 w-full relative min-h-[400px] px-2 py-4">
                {/* Djinn Watermark - Right Side */}
                <div className="absolute right-8 top-1/2 -translate-y-1/2 z-0 opacity-[0.08] pointer-events-none flex flex-col items-center gap-2">
                    <img
                        src="/djinn-logo.png"
                        alt="Djinn"
                        className="w-24 h-24"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                    <span className="text-3xl font-black text-gray-900 tracking-tight">Djinn</span>
                </div>

                {filteredLineData.length === 0 ? (
                    <div className="flex items-center justify-center h-full">
                        <div className="text-center">
                            <div className="text-4xl mb-2">⏳</div>
                            <div className="text-sm font-bold text-gray-900">No data in selected timeframe</div>
                            <div className="text-xs text-gray-500 mt-1">Try selecting "ALL"</div>
                            {debug && (
                                <div className="mt-3 text-xs text-red-600">
                                    Data points: {data.length} → Filtered: {filteredLineData.length}
                                </div>
                            )}
                        </div>
                    </div>
                ) : (
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart
                            data={filteredLineData}
                            margin={{ top: 20, right: 40, left: 10, bottom: 20 }}
                            onMouseMove={(e: any) => {
                                if (e && e.activePayload && e.activePayload.length > 0) {
                                    const value = e.activePayload[0].value;
                                    setHoveredValue(value);
                                    onHover?.(value);
                                }
                            }}
                            onMouseLeave={() => {
                                setHoveredValue(null);
                                onHover?.(null);
                            }}
                        >
                            <CartesianGrid
                                vertical={false}
                                stroke="rgba(0,0,0,0.06)"
                                strokeDasharray="3 3"
                            />

                            <XAxis
                                dataKey="time"
                                tickFormatter={formatXAxis}
                                tick={{ fill: '#000000', fontSize: 11, fontWeight: 600 }}
                                stroke="#000000"
                                tickLine={false}
                                axisLine={{ stroke: '#000000', strokeWidth: 1 }}
                                minTickGap={60}
                                interval="preserveStartEnd"
                            />

                            <YAxis
                                orientation="right"
                                domain={[0, 100]}
                                ticks={
                                    (timeframe.key === '5M' || timeframe.key === '15M' || timeframe.key === '30M')
                                        ? [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100]
                                        : [0, 20, 40, 60, 80, 100]
                                }
                                tickFormatter={formatYAxis}
                                tick={{ fill: '#000000', fontSize: 11, fontWeight: 600 }}
                                stroke="#000000"
                                tickLine={false}
                                axisLine={{ stroke: '#000000', strokeWidth: 1 }}
                            />

                            <Tooltip
                                content={<CustomTooltip outcomeColors={outcomeColors} outcomeNames={outcomeNames} />}
                                cursor={{ stroke: '#000', strokeWidth: 1, strokeDasharray: '5 5' }}
                            />

                            {outcomeNames.map((outcome, index) => {
                                const color = outcomeColors[index] || '#2563EB';

                                if (debug) {
                                    console.log(`Rendering line for "${outcome}" with color ${color}`);
                                }

                                return (
                                    <Line
                                        key={outcome}
                                        type="monotone"
                                        dataKey={outcome}
                                        stroke={color}
                                        strokeWidth={3}
                                        dot={false}
                                        activeDot={{
                                            r: 6,
                                            fill: color,
                                            stroke: "#fff",
                                            strokeWidth: 2
                                        }}
                                        isAnimationActive={false}
                                        connectNulls={true}
                                    />
                                );
                            })}
                        </LineChart>
                    </ResponsiveContainer>
                )}
            </div>

            {/* Footer with Timeframes */}
            <div className="px-6 py-3 border-t border-gray-100 flex justify-between items-center">
                {/* Left: Resolution date only - NO LIVE INDICATOR */}
                <div className="flex items-center gap-3 text-xs text-gray-500">
                    {props.resolutionDate && (
                        <span>Resolves: {safeFormatDate(props.resolutionDate)}</span>
                    )}
                </div>

                {/* Right: Timeframe Selector */}
                <div className="flex gap-1">
                    {TIMEFRAMES.map((tf) => (
                        <button
                            key={tf.key}
                            onClick={() => setTimeframe(tf)}
                            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${timeframe.key === tf.key
                                    ? 'bg-black text-white'
                                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                }`}
                        >
                            {tf.label}
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
}
