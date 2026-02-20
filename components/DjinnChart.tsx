"use client";

import React, { useState, useEffect, useMemo } from "react";
import dynamic from "next/dynamic";
import { formatCompact } from "@/lib/utils";
import { calculateImpliedProbability } from "@/lib/core-amm";
import { usePrice } from "@/lib/PriceContext";

// Dynamic Import for Probability Chart
const ProbabilityChart = dynamic(() => import("./ProbabilityChart"), {
    loading: () => <div className="w-full h-full flex items-center justify-center text-zinc-500 text-xs">Loading Chart...</div>,
    ssr: false
});

// --- TYPES & CONSTANTS ---
export type TradeEvent = { id: string; outcome: string; amount: number; color: string };

type Bubble = {
    id: string;
    text: string;
    color: string;
    y: number;
};

interface OutcomeObject {
    id: string;
    title: string;
    [key: string]: any;
}

// --- MAIN COMPONENT ---

interface TheDjinnChartProps {
    outcomes?: (string | OutcomeObject)[];
    probabilityData?: any[];
    tradeEvent?: TradeEvent | null;
    outcomeSupplies?: Record<string, number>;
    volume?: string;
    resolutionDate?: string;
    selectedOutcome?: string;
    onOutcomeChange?: (outcome: string) => void;
}

function TheDjinnChart({
    outcomes = ["YES", "NO"],
    probabilityData = [],
    tradeEvent,
    outcomeSupplies = {},
    volume,
    resolutionDate,
    selectedOutcome,
    onOutcomeChange
}: TheDjinnChartProps) {
    const [timeframe, setTimeframe] = useState<'1m' | '5m' | '15m' | '1H' | '6H' | '1D' | '1W' | '1M' | 'ALL'>('1H');
    const { solPrice } = usePrice();

    // Bubble State
    const [bubbles, setBubbles] = useState<Bubble[]>([]);
    const [lastProcessedEventId, setLastProcessedEventId] = useState<string | null>(null);

    // 1. Trade Event Effect (Bubbles) - Only 1 bubble per unique trade
    useEffect(() => {
        if (tradeEvent && tradeEvent.id !== lastProcessedEventId) {
            // Mark this event as processed to prevent duplicates
            setLastProcessedEventId(tradeEvent.id);

            const usdValue = tradeEvent.amount * (solPrice || 0);
            const newBubble: Bubble = {
                id: tradeEvent.id, // Use the trade event ID directly
                text: `${tradeEvent.outcome} +$${formatCompact(usdValue)}`,
                color: tradeEvent.color,
                y: Math.random() * 60 + 20 // 20% to 80% height
            };
            setBubbles([newBubble]); // Replace all bubbles with just the new one
            setTimeout(() => {
                setBubbles(prev => prev.filter((bubble) => bubble.id !== newBubble.id));
            }, 3500);
        }
    }, [tradeEvent, lastProcessedEventId]);

    // 2. Derived Data: Probability Line
    const safeProbData = useMemo(() => {
        let baseData = probabilityData.length > 0 ? [...probabilityData] : [];
        if (baseData.length === 1) {
            baseData = [{ ...baseData[0], dateStr: 'Start', time: baseData[0].time - 3600 }, baseData[0]];
        }
        if (baseData.length === 0) {
            const now = Math.floor(Date.now() / 1000);
            baseData = [{ time: now - 3600 }, { time: now }];
        }
        return baseData;
    }, [probabilityData]);

    // 3. Derived Data: Current Probabilities - Use core-amm function for consistency
    const currentProbabilities = useMemo(() => {
        const probs: Record<string, number> = {};

        if (!outcomeSupplies || Object.keys(outcomeSupplies).length === 0) {
            outcomes.forEach(o => {
                const title = typeof o === 'string' ? o : o.title;
                probs[title] = 100 / outcomes.length;
            });
            return probs;
        }

        // Case-insensitive normalization map
        const suppliesMapNormalized: Record<string, number> = {};
        Object.keys(outcomeSupplies).forEach( (k: any) => {
            suppliesMapNormalized[k.toLowerCase()] = outcomeSupplies[k];
        });

        // For binary (YES/NO), use the core-amm function directly
        const outcomeKeys = outcomes.map(o => typeof o === 'string' ? o : o.title);
        if (outcomeKeys.length === 2) {
            const yesKey = outcomeKeys.find( (k: any) => k.toUpperCase() === 'YES') || outcomeKeys[0];
            const noKey = outcomeKeys.find( (k: any) => k.toUpperCase() === 'NO') || outcomeKeys[1];

            const yesSupply = Number(outcomeSupplies[yesKey] || suppliesMapNormalized[yesKey.toLowerCase()] || 0);
            const noSupply = Number(outcomeSupplies[noKey] || suppliesMapNormalized[noKey.toLowerCase()] || 0);

            const yesProb = calculateImpliedProbability(yesSupply, noSupply);
            probs[yesKey] = yesProb;
            probs[noKey] = 100 - yesProb;
        } else {
            // Multi-outcome: use same VIRTUAL_FLOOR as core-amm (15_000_000)
            const VIRTUAL_FLOOR = 15_000_000;
            let totalAdjusted = 0;
            const adjustedSupplies: Record<string, number> = {};

            outcomes.forEach(o => {
                const title = typeof o === 'string' ? o : o.title;
                const raw = Number(outcomeSupplies[title] || suppliesMapNormalized[title.toLowerCase()] || 0);
                const adj = raw + VIRTUAL_FLOOR;
                adjustedSupplies[title] = adj;
                totalAdjusted += adj;
            });

            outcomes.forEach(o => {
                const title = typeof o === 'string' ? o : o.title;
                const probability = (adjustedSupplies[title] / totalAdjusted) * 100;
                probs[title] = probability;
            });
        }

        return probs;
    }, [outcomeSupplies, outcomes]);

    // ROI Calculation logic will move to inside ProbabilityChart or remain here to pass down
    // For now, passing necessary data to ProbabilityChart

    return (
        <div className="w-full max-w-4xl mx-auto overflow-hidden relative font-sans h-[700px]">
            {/* CHART AREA */}
            <div className="w-full h-full bg-transparent">
                <ProbabilityChart
                    data={safeProbData}
                    outcomes={outcomes}
                    bubbles={bubbles}
                    timeframe={timeframe}
                    setTimeframe={setTimeframe}
                    currentProbabilities={currentProbabilities}
                    volume={volume}
                    resolutionDate={resolutionDate}
                    selectedOutcome={selectedOutcome}
                    onOutcomeChange={onOutcomeChange}
                />
            </div>
        </div>
    );
}

export default React.memo(TheDjinnChart);
