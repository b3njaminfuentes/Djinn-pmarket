
"use client";

import React, { useMemo } from 'react';
import { formatCompact } from '@/lib/utils';
import { getSpotPrice } from '@/lib/core-amm';
import { getOutcomeColor } from '@/lib/market-colors';
import { Bet } from '@/lib/supabase-db';
import { motion } from 'framer-motion';

interface HoldingsSectionProps {
    bets: Bet[];
    outcomeSupplies?: number[]; // Array of current supplies
    marketOutcomes?: any[];
}

export default function HoldingsSection({ bets, outcomeSupplies, marketOutcomes }: HoldingsSectionProps) {

    // Group bets by Outcome Name
    const holdings = useMemo(() => {
        if (!bets || bets.length === 0) return [];

        const groups: Record<string, { side: string, outcomeName: string, shares: number, invested: number, entryPrice: number, index: number }> = {};

        bets.forEach(bet => {
            const side = bet.side;
            const outcomeName = marketOutcomes ?
                (side === 'YES' ? (marketOutcomes[0]?.title || 'YES') :
                    (side === 'NO' ? (marketOutcomes[1]?.title || 'NO') : side))
                : side;

            const index = marketOutcomes ? marketOutcomes.findIndex(o => o.title === outcomeName) : (side === 'YES' ? 0 : 1);

            if (!groups[outcomeName]) {
                groups[outcomeName] = { side, outcomeName, shares: 0, invested: 0, entryPrice: 0, index: index === -1 ? 0 : index };
            }
            groups[outcomeName].shares += Number(bet.shares);
            groups[outcomeName].invested += Number(bet.sol_amount);
        });

        // Filter out effectively zero positions
        return Object.values(groups).filter(g => g.shares > 0.001);
    }, [bets, marketOutcomes]);

    if (holdings.length === 0) return null;

    // Pre-calculate all holdings data
    const holdingsData = holdings.map(h => {
        // Calculate ROI using the correct supply for this outcome
        let supply = 0;
        if (outcomeSupplies && outcomeSupplies[h.index] !== undefined) {
            supply = outcomeSupplies[h.index];
        }

        const currentSpot = getSpotPrice(supply);
        const currentValue = h.shares * currentSpot;
        const profitSol = currentValue - h.invested;
        const roiPercent = h.invested > 0 ? ((profitSol / h.invested) * 100) : 0;
        const isProfit = profitSol >= 0;

        const outcomeColor = getOutcomeColor(h.outcomeName, h.index);

        return {
            ...h,
            currentSpot,
            currentValue,
            profitSol,
            roiPercent,
            isProfit,
            outcomeColor
        };
    });

    // Sort by investment value or alphabetical
    const sortedHoldings = [...holdingsData].sort((a: any, b: any) => b.invested - a.invested);

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-4"
        >
            {/* Scrollable container for multi-outcome holdings */}
            <div className="flex flex-col gap-2">
                <div className="flex flex-col bg-white rounded-2xl border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] overflow-hidden">
                    {sortedHoldings.map((h, idx) => (
                        <div
                            key={idx}
                            className={`p-4 ${idx > 0 ? 'border-t-2 border-black' : ''} relative group flex flex-row items-center justify-between hover:bg-[#F492B7] transition-colors`}
                        >
                            <div className="flex flex-row items-center gap-6 flex-1">
                                {/* Outcome name with matched color */}
                                <div className="flex flex-col min-w-[120px]">
                                    <span className="text-[10px] font-black uppercase tracking-widest text-gray-500 mb-0.5">Position</span>
                                    <span
                                        className="text-xl font-black italic tracking-tighter truncate"
                                        style={{ color: h.outcomeColor }}
                                    >
                                        {h.outcomeName}
                                    </span>
                                </div>

                                {/* Shares */}
                                <div className="flex flex-col">
                                    <span className="text-[10px] font-black uppercase tracking-widest text-gray-500 mb-0.5">Shares</span>
                                    <span className="text-lg text-black font-black tabular-nums">
                                        {formatCompact(h.shares)}
                                    </span>
                                </div>

                                {/* Current Value SOL */}
                                <div className="flex flex-col">
                                    <span className="text-[10px] font-black uppercase tracking-widest text-gray-500 mb-0.5">Value</span>
                                    <span className="text-lg text-black/60 font-medium tabular-nums">
                                        {formatCompact(h.currentValue)} <span className="text-[10px]">SOL</span>
                                    </span>
                                </div>
                            </div>

                            {/* ROI & Profit Block */}
                            <div className="flex flex-col items-end">
                                <div className="flex items-center gap-1.5">
                                    <span className={`text-xl font-black tabular-nums ${h.isProfit ? 'text-[#10B981]' : 'text-[#EF4444]'}`}>
                                        {h.roiPercent > 0 ? '↑' : '↓'} {Math.abs(h.roiPercent).toFixed(1)}%
                                    </span>
                                </div>
                                <div className={`text-[11px] font-black tracking-wider uppercase opacity-80 tabular-nums ${h.isProfit ? 'text-[#10B981]' : 'text-[#EF4444]'}`}>
                                    {h.profitSol >= 0 ? '+' : ''}{h.profitSol.toFixed(3)} SOL
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </motion.div>
    );
}
