'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

// Simplified Single Bubble
interface BubbleData {
    id: number;
    text: string;
    side: string;
}

export default function TradeBubbles({ trigger }: { trigger: { amount: number; side: string } | null }) {
    const [bubble, setBubble] = useState<BubbleData | null>(null);

    useEffect(() => {
        if (trigger && trigger.amount > 0) {
            // New trigger replaces old one immediately
            setBubble({
                id: Date.now(),
                text: `$${trigger.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
                side: trigger.side
            });

            // Auto-hide after 3s
            const timer = setTimeout(() => {
                setBubble(null);
            }, 3000);
            return () => clearTimeout(timer);
        }
    }, [trigger]);

    return (
        <div className="absolute top-4 left-6 z-20 pointer-events-none">
            <AnimatePresence>
                {bubble && (
                    <motion.div
                        key={bubble.id}
                        initial={{ opacity: 0, x: -20, scale: 0.9 }}
                        animate={{ opacity: 1, x: 0, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.9, filter: 'blur(10px)' }}
                        transition={{ type: "spring", stiffness: 300, damping: 20 }}
                        className={`
                            px-4 py-2 
                            border
                            text-white text-sm font-bold
                            rounded-xl shadow-2xl
                            backdrop-blur-md
                            flex items-center gap-3
                            ${bubble.side.toUpperCase() === 'YES' || bubble.side.toUpperCase() === 'BUY'
                                ? 'bg-[#10B981]/20 border-[#10B981]/40 shadow-[#10B981]/20'
                                : 'bg-[#EF4444]/20 border-[#EF4444]/40 shadow-[#EF4444]/20'}
                        `}
                    >
                        <div className={`w-2 h-2 rounded-full ${bubble.side.toUpperCase() === 'YES' || bubble.side.toUpperCase() === 'BUY' ? 'bg-[#10B981]' : 'bg-[#EF4444]'}`} />
                        <span className="opacity-80 font-medium">Bought {bubble.side}</span>
                        <span className={`font-black ${bubble.side === 'YES' ? 'text-[#10B981]' : 'text-[#EF4444]'}`}>
                            {bubble.text}
                        </span>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
