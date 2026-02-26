"use client";

/**
 * MiniProbabilityChart — Compact live chart for MarketCards (Liveline)
 *
 * Replaces the previous Recharts LineChart with a Liveline canvas renderer.
 * Shows the primary outcome (YES) live probability. 60fps, zero CSS imports.
 */

import React, { useMemo } from 'react';
import { MiniLiveline } from '@/components/LivelineChart';
import { getOutcomeColor } from '@/lib/market-colors';

interface MiniProbabilityChartProps {
    data?: any[];
    series?: any[]; // LivelineSeries[]
    outcomes?: (string | { id: string; title: string })[];
}

export default function MiniProbabilityChart({ data = [], series, outcomes = [] }: MiniProbabilityChartProps) {
    const outcomeKeys = outcomes.map(o => typeof o === 'string' ? o : o.title);

    // Use the primary (YES) outcome as the main Liveline series
    const primaryKey = outcomeKeys[0] || 'YES';
    const primaryColor = getOutcomeColor(primaryKey, 0);

    const points = useMemo(() => {
        if (series) return [];
        const safeData = data.length > 0 ? data : [
            { time: Math.floor(Date.now() / 1000) - 3600, [primaryKey]: 50 },
            { time: Math.floor(Date.now() / 1000), [primaryKey]: 50 },
        ];
        return safeData.map((d: any) => ({
            time: typeof d.time === 'number' && d.time > 1e10
                ? Math.floor(d.time / 1000)
                : Number(d.time) || Math.floor(Date.now() / 1000),
            value: Number(d[primaryKey] ?? d['YES'] ?? 50),
        }));
    }, [data, primaryKey, series]);

    const liveValue = points.length > 0 ? points[points.length - 1].value : 50;

    return (
        <div className="w-full h-full min-h-[160px]">
            <MiniLiveline
                data={points.length > 0 ? points : undefined}
                series={series}
                value={series ? undefined : liveValue}
                color={primaryColor}
                height={160}
                className="w-full"
            />
        </div>
    );
}
