'use client';

import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

interface Achievement {
    code: string;
    name: string;
    description: string;
    image_url: string;
    xp: number;
}

interface AchievementToastProps {
    achievements: Achievement[];
    onClose: () => void;
}

export default function AchievementToast({ achievements, onClose }: AchievementToastProps) {
    const [current, setCurrent] = useState<Achievement | null>(null);
    const [queue, setQueue] = useState<Achievement[]>([]);

    useEffect(() => {
        if (achievements.length > 0) {
            setQueue( (prev: any) => [...prev, ...achievements]);
        }
    }, [achievements]);

    useEffect(() => {
        if (!current && queue.length > 0) {
            const next = queue[0];
            setCurrent(next);
            setQueue( (prev: any) => prev.slice(1));

            // Auto hide after 6 seconds
            const timer = setTimeout(() => {
                setCurrent(null);
                if (queue.length === 0) onClose();
            }, 6000);

            return () => clearTimeout(timer);
        }
    }, [current, queue, onClose]);

    if (!current) return null;

    return (
        <div className="fixed top-24 right-6 z-[200] pointer-events-none">
            <AnimatePresence>
                {current && (
                    <motion.div
                        key={current.code}
                        initial={{ x: 100, opacity: 0, scale: 0.8 }}
                        animate={{ x: 0, opacity: 1, scale: 1 }}
                        exit={{ x: 100, opacity: 0, scale: 0.8 }}
                        transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                        className="bg-[#0A0A0A]/90 backdrop-blur-xl border border-[#F492B7]/30 p-4 rounded-2xl shadow-[0_0_50px_rgba(244,146,183,0.2)] flex items-center gap-4 max-w-sm pointer-events-auto cursor-pointer"
                        onClick={() => setCurrent(null)}
                    >
                        {/* Medal Image with Glow */}
                        <div className="relative shrink-0">
                            <div className="w-16 h-16 rounded-full border-2 border-[#F492B7] bg-black overflow-hidden relative z-10">
                                <img src={current.image_url || '/medals/genesis.png'} alt={current.name} className="w-full h-full object-cover" />
                            </div>
                            <div className="absolute inset-0 bg-[#F492B7] blur-xl opacity-40 animate-pulse"></div>
                        </div>

                        {/* Text */}
                        <div>
                            <p className="text-[#F492B7] text-[10px] font-black uppercase tracking-widest mb-1">Medal Unlocked!</p>
                            <h3 className="text-white font-black text-lg leading-none mb-1">{current.name}</h3>
                            <p className="text-gray-400 text-xs font-medium leading-tight">{current.description}</p>
                            <div className="mt-2 flex items-center gap-1 text-[10px] text-gray-500 font-mono">
                                <span>+{current.xp} XP</span>
                                <span className="text-[#F492B7]">•</span>
                                <span>Added to Profile</span>
                            </div>
                        </div>

                        {/* Close Button */}
                        <button className="absolute top-2 right-2 text-gray-500 hover:text-white">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                                <path d="M18 6L6 18M6 6l12 12" />
                            </svg>
                        </button>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
