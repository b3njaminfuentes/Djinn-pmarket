'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Search, X, TrendingUp, User, Loader2 } from 'lucide-react';
import { searchMarkets, searchProfiles } from '@/lib/supabase-db';

interface SearchResult {
    type: 'market' | 'profile';
    id: string;
    title: string;
    subtitle?: string;
    icon?: string;
    url: string;
}

// Mock markets data - in real app this would come from Supabase/API
const MOCK_MARKETS = [
    { id: 'argentina-world-cup-2026', title: 'Will Argentina be finalist on the FIFA World Cup 2026?', icon: '🇦🇷', category: 'Sports' },
    { id: 'btc-hit-150k', title: 'Will Bitcoin reach ATH on 2026?', icon: '₿', category: 'Crypto' },
    { id: 'us-strike-mexico', title: 'US strike on Mexico by...?', icon: '🇺🇸', category: 'Politics' },
    { id: 'world-cup-winner-multiple', title: 'Who will win the World Cup 2026?', icon: '🏆', category: 'Sports' },
];

export default function SearchBar() {
    const [isOpen, setIsOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<SearchResult[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    // Close on click outside
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Focus input when opened
    useEffect(() => {
        if (isOpen && inputRef.current) {
            inputRef.current.focus();
        }
    }, [isOpen]);

    // Search logic
    useEffect(() => {
        if (!query.trim()) {
            setResults([]);
            return;
        }

        setIsLoading(true);

        const timeoutId = setTimeout(async () => {
            try {
                // Import dynamically or use the one from lib (we need to import it at top)
                // Assuming we added import { searchMarkets, searchProfiles } from '@/lib/supabase-db';

                const [markets, profiles] = await Promise.all([
                    searchMarkets(query),
                    searchProfiles(query)
                ]);

                const searchResults: SearchResult[] = [];

                // Process Markets
                markets.forEach( (m: any) => {
                    searchResults.push({
                        type: 'market',
                        id: m.slug,
                        title: m.slug.replace(/-/g, ' ').toUpperCase(), // Fallback title
                        subtitle: 'Market',
                        icon: '📊',
                        url: `/market/${m.slug}`
                    });
                });

                // Process Profiles
                profiles.forEach( (p: any) => {
                    searchResults.push({
                        type: 'profile',
                        id: p.wallet_address,
                        title: p.username || 'Unknown',
                        subtitle: `${p.wallet_address.slice(0, 4)}...${p.wallet_address.slice(-4)}`,
                        url: `/profile/${p.username || p.wallet_address}`
                    });
                });

                setResults(searchResults);
            } catch (err) {
                console.error(err);
            } finally {
                setIsLoading(false);
            }
        }, 300);

        return () => clearTimeout(timeoutId);
    }, [query]);

    // Keyboard shortcut (Cmd/Ctrl + K)
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
                e.preventDefault();
                setIsOpen(true);
            }
            if (e.key === 'Escape') {
                setIsOpen(false);
            }
        };
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, []);

    return (
        <div ref={containerRef} className="relative">
            {/* Search trigger button */}
            <button
                onClick={() => setIsOpen(true)}
                className="flex items-center gap-2 px-4 py-2 bg-white/5 border border-white/10 rounded-xl hover:border-[#F492B7]/50 hover:bg-white/10 transition-all group"
            >
                <Search size={16} className="text-gray-400 group-hover:text-[#F492B7]" />
                <span className="text-sm text-gray-400 hidden md:block">Search...</span>
                <kbd className="hidden md:flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-mono text-gray-500 bg-white/5 rounded border border-white/10">
                    ⌘K
                </kbd>
            </button>

            {/* Search modal */}
            {isOpen && (
                <>
                    {/* Backdrop */}
                    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100]" onClick={() => setIsOpen(false)} />

                    {/* Search panel */}
                    <div className="fixed left-1/2 top-24 -translate-x-1/2 w-full max-w-xl z-[101] px-4">
                        <div className="bg-[#0A0A0A] border border-white/10 rounded-2xl shadow-2xl overflow-hidden">
                            {/* Input */}
                            <div className="flex items-center gap-3 px-4 py-4 border-b border-white/10">
                                <Search size={20} className="text-gray-500" />
                                <input
                                    ref={inputRef}
                                    type="text"
                                    value={query}
                                    onChange={(e) => setQuery(e.target.value)}
                                    placeholder="Search markets, profiles, or paste wallet address..."
                                    className="flex-1 bg-transparent text-white text-base outline-none placeholder:text-gray-500"
                                />
                                {query && (
                                    <button onClick={() => setQuery('')} className="text-gray-500 hover:text-white">
                                        <X size={18} />
                                    </button>
                                )}
                            </div>

                            {/* Results */}
                            <div className="max-h-80 overflow-y-auto">
                                {isLoading ? (
                                    <div className="flex items-center justify-center py-8">
                                        <Loader2 size={24} className="animate-spin text-[#F492B7]" />
                                    </div>
                                ) : results.length > 0 ? (
                                    <div className="p-2">
                                        {results.map((result, idx) => (
                                            <Link
                                                key={`${result.type}-${result.id}-${idx}`}
                                                href={result.url}
                                                onClick={() => { setIsOpen(false); setQuery(''); }}
                                                className="flex items-center gap-3 p-3 rounded-xl hover:bg-white/5 transition-all group"
                                            >
                                                {/* Icon */}
                                                <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-lg ${result.type === 'market'
                                                    ? 'bg-[#F492B7]/10 border border-[#F492B7]/20'
                                                    : 'bg-blue-500/10 border border-blue-500/20'
                                                    }`}>
                                                    {result.type === 'market' ? (
                                                        result.icon || <TrendingUp size={18} className="text-[#F492B7]" />
                                                    ) : (
                                                        <User size={18} className="text-blue-400" />
                                                    )}
                                                </div>

                                                {/* Content */}
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm font-bold text-white truncate group-hover:text-[#F492B7] transition-colors">
                                                        {result.title}
                                                    </p>
                                                    <p className="text-xs text-gray-500">
                                                        {result.type === 'market' ? '📊 Market' : '👤 Profile'} • {result.subtitle}
                                                    </p>
                                                </div>

                                                {/* Arrow */}
                                                <svg className="w-4 h-4 text-gray-600 group-hover:text-[#F492B7] transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                                </svg>
                                            </Link>
                                        ))}
                                    </div>
                                ) : query ? (
                                    <div className="py-8 text-center">
                                        <p className="text-gray-500 text-sm">No results found for "{query}"</p>
                                        <p className="text-gray-600 text-xs mt-1">Try searching for a market title or paste a wallet address</p>
                                    </div>
                                ) : (
                                    <div className="p-4">
                                        <p className="text-[10px] font-black uppercase tracking-widest text-gray-500 mb-3">Quick links</p>
                                        <div className="space-y-1">
                                            {MOCK_MARKETS.slice(0, 3).map(market => (
                                                <Link
                                                    key={market.id}
                                                    href={`/market/${market.id}`}
                                                    onClick={() => { setIsOpen(false); setQuery(''); }}
                                                    className="flex items-center gap-3 p-2 rounded-lg hover:bg-white/5 transition-all"
                                                >
                                                    <span className="text-lg">{market.icon}</span>
                                                    <span className="text-sm text-gray-300 truncate">{market.title}</span>
                                                </Link>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Footer */}
                            <div className="flex items-center justify-between px-4 py-3 border-t border-white/5 bg-white/[0.02]">
                                <div className="flex items-center gap-4 text-[10px] text-gray-500">
                                    <span className="flex items-center gap-1"><kbd className="px-1 bg-white/5 rounded">↵</kbd> to select</span>
                                    <span className="flex items-center gap-1"><kbd className="px-1 bg-white/5 rounded">esc</kbd> to close</span>
                                </div>
                                <div className="flex items-center gap-1">
                                    <Image src="/star.png" alt="Djinn" width={16} height={16} />
                                    <span className="text-[10px] font-bold text-gray-500">Djinn Search</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
