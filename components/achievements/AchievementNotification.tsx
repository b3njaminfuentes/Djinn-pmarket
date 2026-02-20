'use client';

import React, { useEffect, useState } from 'react';
import Image from 'next/image';
import { useWallet } from '@solana/wallet-adapter-react';
import { supabase } from '@/lib/supabase';
import { Achievement } from '@/lib/supabase-db';

// const supabase = createClientComponentClient(); // Removed to use shared instance

export default function AchievementNotification() {
    const { publicKey } = useWallet();
    const [queue, setQueue] = useState<Achievement[]>([]);
    const [current, setCurrent] = useState<Achievement | null>(null);
    const [isVisible, setIsVisible] = useState(false);

    // Subscribe to new achievements
    useEffect(() => {
        if (!publicKey) return;

        const channel = supabase
            .channel('achievement-unlocks')
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'user_achievements',
                    filter: `user_wallet=eq.${publicKey.toBase58()}`
                },
                async (payload) => {
                    const newUnlock = payload.new;
                    // Fetch details
                    const { data: achievement } = await supabase
                        .from('achievements')
                        .select('*')
                        .eq('code', newUnlock.achievement_code)
                        .single();

                    if (achievement) {
                        setQueue( (prev: any) => [...prev, achievement]);
                    }
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [publicKey]);

    // Process Queue
    useEffect(() => {
        if (queue.length > 0 && !current) {
            setCurrent(queue[0]);
            setQueue( (prev: any) => prev.slice(1));
            setIsVisible(true);

            // Auto hide after 5 seconds
            const timer = setTimeout(() => {
                setIsVisible(false);
                setTimeout(() => setCurrent(null), 500); // Wait for exit animation
            }, 6000);
            return () => clearTimeout(timer);
        }
    }, [queue, current]);

    if (!current) return null;

    return (
        <div className={`fixed inset-0 pointer-events-none flex items-center justify-center z-[100] transition-all duration-500 ${isVisible ? 'opacity-100' : 'opacity-0'}`}>
            {/* Backdrop blur */}
            <div className={`absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-500 ${isVisible ? 'opacity-100' : 'opacity-0'}`} />

            {/* Notification Card */}
            <div
                className={`relative bg-gradient-to-br from-[#1a1a1a] to-black border border-[#F492B7] p-8 rounded-3xl shadow-[0_0_50px_rgba(244,146,183,0.3)] text-center transform transition-all duration-700 ${isVisible ? 'scale-100 translate-y-0' : 'scale-50 translate-y-20'}`}
                style={{ maxWidth: '400px' }}
            >
                {/* Confetti / Ray Effect */}
                <div className="absolute inset-0 overflow-hidden rounded-3xl">
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[200%] h-[200%] bg-[conic-gradient(from_0deg,transparent_0deg,#F492B7_20deg,transparent_40deg,transparent_360deg)] opacity-10 animate-spin-slow" />
                </div>

                {/* Badge Icon */}
                <div className="relative mb-6 mx-auto w-32 h-32 animate-bounce-gentle">
                    <div className="absolute inset-0 bg-[#F492B7] blur-3xl opacity-20" />
                    <div className="relative w-full h-full rounded-full border-4 border-[#F492B7] bg-black overflow-hidden shadow-2xl">
                        {current.image_url && <Image src={current.image_url} alt={current.name} fill className="object-cover" />}
                        {/* Fallback if no image */}
                        {!current.image_url && (
                            <div className="w-full h-full flex items-center justify-center text-4xl">🏆</div>
                        )}
                    </div>
                    {/* Sparkles */}
                    <div className="absolute -top-2 -right-2 text-2xl animate-pulse">✨</div>
                    <div className="absolute bottom-0 -left-2 text-xl animate-pulse delay-75">✨</div>
                </div>

                {/* Text */}
                <h3 className="text-[#F492B7] font-black uppercase tracking-widest text-sm mb-2 animate-pulse">Achievement Unlocked!</h3>
                <h2 className="text-3xl font-bold text-white mb-2" style={{ fontFamily: 'var(--font-adriane), serif' }}>{current.name}</h2>
                <p className="text-gray-400 text-sm mb-6">{current.description}</p>

                {/* XP Pill */}
                <div className="inline-block px-4 py-1 rounded-full bg-[#F492B7]/10 border border-[#F492B7]/30 text-[#F492B7] font-bold font-mono text-xs">
                    +{current.xp} XP
                </div>
            </div>

            <style jsx>{`
                @keyframes spin-slow {
                    from { transform: translate(-50%, -50%) rotate(0deg); }
                    to { transform: translate(-50%, -50%) rotate(360deg); }
                }
                @keyframes bounce-gentle {
                    0%, 100% { transform: translateY(0); }
                    50% { transform: translateY(-10px); }
                }
                .animate-spin-slow {
                    animation: spin-slow 10s linear infinite;
                }
                .animate-bounce-gentle {
                    animation: bounce-gentle 2s ease-in-out infinite;
                }
            `}</style>
        </div>
    );
}
