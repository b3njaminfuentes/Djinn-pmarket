'use client';

import { useState, useEffect } from 'react';

interface Star {
    x: number;
    y: number;
    size: number;
    delay: number;
    duration: number;
    isPink: boolean;
}

export default function StarfieldBg() {
    const [stars, setStars] = useState<Star[]>([]);

    useEffect(() => {
        const result: Star[] = [];
        for (let i = 0; i < 120; i++) {
            result.push({
                x: Math.random() * 100,
                y: Math.random() * 100,
                size: Math.random() * 2 + 0.5,
                delay: Math.random() * 8,
                duration: Math.random() * 4 + 3,
                isPink: Math.random() < 0.06,
            });
        }
        setStars(result);
    }, []);

    return (
        <div className="fixed inset-0 z-0 bg-black overflow-hidden pointer-events-none">
            {stars.map((star, i) => (
                <div
                    key={i}
                    className="absolute rounded-full"
                    style={{
                        left: `${star.x}%`,
                        top: `${star.y}%`,
                        width: `${star.size}px`,
                        height: `${star.size}px`,
                        backgroundColor: star.isPink ? '#F492B7' : '#ffffff',
                        boxShadow: star.isPink
                            ? '0 0 6px 2px rgba(244,146,183,0.5)'
                            : `0 0 ${star.size}px rgba(255,255,255,0.3)`,
                        animation: `starTwinkle ${star.duration}s ease-in-out ${star.delay}s infinite`,
                        opacity: 0.2,
                    }}
                />
            ))}
            <style jsx>{`
                @keyframes starTwinkle {
                    0%, 100% { opacity: 0.15; }
                    50% { opacity: 0.9; }
                }
            `}</style>
        </div>
    );
}
