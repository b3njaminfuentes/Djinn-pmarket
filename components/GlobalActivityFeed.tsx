'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Activity as ActivityIcon, TrendingUp, TrendingDown } from 'lucide-react';
import * as supabaseDb from '@/lib/supabase-db';


export default function GlobalActivityFeed() {
    const [activities, setActivities] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        loadActivity();

        // Subscribe to real-time updates
        const channel = supabaseDb.subscribeToActivity((payload: any) => {
            if (payload.new) {
                setActivities( (prev: any) => [payload.new, ...prev].slice(0, 50));
            }
        });

        return () => {
            channel.unsubscribe();
        };
    }, []);

    const loadActivity = async () => {
        try {
            const data = await supabaseDb.getActivity(0, 50);
            setActivities(data);
            setIsLoading(false);
        } catch (error) {
            console.error('Error loading activity:', error);
            setIsLoading(false);
        }
    };

    const formatTimeAgo = (timestamp: string) => {
        const now = Date.now();
        const created = new Date(timestamp).getTime();
        if (isNaN(created) || created > now) return 'Just now';

        const diff = now - created;
        const seconds = Math.floor(diff / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);

        if (seconds < 60) return 'Just now';
        if (minutes < 60) return `${minutes}m ago`;
        if (hours < 24) return `${hours}h ago`;
        return `${days}d ago`;
    };

    if (isLoading) {
        return (
            <div className="bg-[#0E0E0E] border border-white/10 rounded-[2rem] p-8">
                <div className="flex items-center gap-3 mb-6">
                    <ActivityIcon className="w-5 h-5 text-[#F492B7]" />
                    <h3 className="text-xl font-black uppercase">Global Activity</h3>
                </div>
                <div className="text-center py-12 text-gray-500">Loading...</div>
            </div>
        );
    }

    return (
        <div className="bg-[#0E0E0E] border border-white/10 rounded-[2rem] p-8 relative overflow-hidden">


            <div className="relative z-10">
                <div className="flex items-center gap-3 mb-6">
                    <ActivityIcon className="w-5 h-5 text-[#F492B7]" />
                    <h3 className="text-xl font-black uppercase">Global Activity</h3>
                    <span className="ml-auto text-xs bg-white/10 text-gray-400 px-3 py-1 rounded-full font-bold">
                        {activities.length} trades
                    </span>
                </div>

                {activities.length === 0 ? (
                    <div className="text-center py-12 text-gray-600 italic">
                        No activity yet. Be the first to trade!
                    </div>
                ) : (
                    <div className="space-y-3 max-h-[600px] overflow-y-auto custom-scrollbar">
                        {activities.map((activity, index) => (
                            <div
                                key={activity.id || index}
                                className="flex items-center justify-between p-4 bg-white/[0.02] hover:bg-white/[0.05] rounded-xl border border-white/5 transition-all group"
                            >
                                <div className="flex items-center gap-4 flex-1 min-w-0">
                                    {/* Avatar */}
                                    <div className="w-10 h-10 rounded-full bg-black/20 flex-shrink-0 overflow-hidden border border-white/10">
                                        <img
                                            src={activity.avatar_url || "/pink-pfp.png"}
                                            className="w-full h-full object-cover"
                                            alt=""
                                            onError={(e) => (e.currentTarget.src = "/pink-pfp.png")}
                                        />
                                    </div>

                                    {/* Activity Info */}
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-1">
                                            <Link
                                                href={`/profile/${activity.username}`}
                                                className="text-sm font-bold text-white hover:text-[#F492B7] transition-colors truncate"
                                            >
                                                {activity.username}
                                            </Link>
                                            <span className={`text-xs font-black uppercase px-2 py-0.5 rounded-md ${activity.action === 'YES'
                                                ? 'bg-[#10B981]/20 text-[#10B981] border border-[#10B981]/30'
                                                : 'bg-red-500/20 text-red-500 border border-red-500/30'
                                                }`}>
                                                {activity.action}
                                            </span>
                                        </div>
                                        <Link
                                            href={`/market/${activity.market_slug}`}
                                            className="text-xs text-gray-500 hover:text-gray-300 transition-colors line-clamp-1"
                                        >
                                            {activity.market_title}
                                        </Link>
                                    </div>
                                </div>

                                {/* Amount & Time */}
                                <div className="text-right flex-shrink-0 ml-4">
                                    <div className="flex items-center gap-2 justify-end mb-1">
                                        {activity.action === 'YES' ? (
                                            <TrendingUp className="w-3 h-3 text-[#10B981]" />
                                        ) : (
                                            <TrendingDown className="w-3 h-3 text-red-500" />
                                        )}
                                        <span className="text-sm font-bold text-white">
                                            ${activity.amount?.toLocaleString() || '0'}
                                        </span>
                                    </div>
                                    <span className="text-xs text-gray-600 font-mono">
                                        {formatTimeAgo(activity.created_at)}
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* Close z-10 wrapper */}
            </div>

            <style jsx>{`
                .custom-scrollbar::-webkit-scrollbar {
                    width: 6px;
                }
                .custom-scrollbar::-webkit-scrollbar-track {
                    background: rgba(255, 255, 255, 0.02);
                    border-radius: 10px;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb {
                    background: rgba(244, 146, 183, 0.3);
                    border-radius: 10px;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover {
                    background: rgba(244, 146, 183, 0.5);
                }
            `}</style>
        </div>
    );
}
