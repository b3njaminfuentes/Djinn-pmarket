'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useWallet } from '@solana/wallet-adapter-react';
import { AnimatePresence, motion } from 'framer-motion';
import Hero from '@/components/Hero';
import MarketCard from '@/components/MarketCard';
import { MarketGridSkeleton } from '@/components/ui/Skeletons';
import { useCategory } from '@/lib/CategoryContext';
import { getMarkets as getSupabaseMarkets, subscribeToMarkets, getAllMarketData, subscribeToAllMarketData } from '@/lib/supabase-db';
import { formatCompact } from '@/lib/utils';
import PumpEffect from '@/components/PumpEffect';
import { ADMIN_WALLETS } from '@/lib/whitelist';
import TheGreatPyramid from '@/components/TheGreatPyramid';
import { useSound } from '@/components/providers/SoundProvider';
import StarfieldBg from '@/components/StarfieldBg';

// Fresh start timestamp - hide markets created before this (filtering for clean view)
// Default to 0 (disabled) so all markets show when env var is not set
const FRESH_START_TIMESTAMP = process.env.NEXT_PUBLIC_FRESH_START_TIMESTAMP
  ? parseInt(process.env.NEXT_PUBLIC_FRESH_START_TIMESTAMP)
  : 0;


export default function Home() {
  const { activeCategory, activeSubcategory } = useCategory();
  const { publicKey } = useWallet();
  const { play } = useSound();
  const router = useRouter();

  // 1. Mercados iniciales con categorías
  // 1. Mercados iniciales LIMPIOS (Solo se verán los creados por el usuario)
  const initialStaticMarkets: any[] = [];

  const [markets, setMarkets] = useState<any[]>(initialStaticMarkets);
  const [isLoading, setIsLoading] = useState(true);

  // NEW: Batched Real-time updates to prevent render floods
  const updatesRef = useRef<Record<string, any>>({});

  // 2. Cargamos mercados de Supabase + fallback a estáticos
  useEffect(() => {
    const loadMarkets = async () => {
      try {
        // 1. Fetch Supabase (Primary Source)
        const supabaseMarkets = await getSupabaseMarkets();
        let finalMarkets: any[] = [];

        // 1b. Fetch Market Data (Live Prices/Volume)
        const marketDataMap = await getAllMarketData().then(data => {
          const map: Record<string, any> = {};
          data.forEach(d => map[d.slug] = d);
          return map;
        });

        // 2. Format Supabase Markets
        if (supabaseMarkets && supabaseMarkets.length > 0) {
          finalMarkets = supabaseMarkets.map((m, index) => {
            const liveData = marketDataMap[m.slug];
            const liveChance = liveData ? Math.round(liveData.live_price) : null;
            const liveVolume = liveData ? `$${formatCompact(liveData.volume)}` : null;
            const poolValue = Number(m.total_yes_pool || 0) + Number(m.total_no_pool || 0);

            return {
              id: m.id || `sb-${index}`,
              title: m.title,
              icon: m.banner_url || '🔮', // Use uploaded image as icon
              chance: liveChance ?? (Math.round((m.total_yes_pool / (m.total_yes_pool + m.total_no_pool + 1)) * 100) || 50),
              volume: liveVolume ?? `$${formatCompact(Math.abs(poolValue))}`,
              totalPool: poolValue,
              mcap: liveData ? liveData.volume : poolValue, // Use volume as proxy for mcap or pool
              type: 'binary',
              category: (m as any).category || 'Trending',
              endDate: m.end_date ? new Date(m.end_date) : new Date('2026-12-31'),
              slug: m.slug,
              createdAt: m.created_at ? new Date(m.created_at).getTime() : Date.now(),
              resolved: m.resolved,
              winningOutcome: m.winning_outcome,
              resolutionSource: m.resolution_source,
              options: m.options?.map((opt: string, idx: number) => ({
                title: opt,
                chance: 0,
                color: m.outcome_colors?.[idx]
              })),
              marketPDA: m.market_pda
            };
          });
        }

        // 3. MERGE LOCAL STORAGE (Optimistic updates for just-created markets)
        const createdMarkets = localStorage.getItem('djinn_created_markets');
        let localMarkets = [];
        if (createdMarkets) {
          try {
            localMarkets = JSON.parse(createdMarkets);
          } catch (e) { console.error("Error parsing local markets", e); }
        }

        // Dedupe: Use slug as unique key
        const slugSet = new Set(finalMarkets.map( (m: any) => m.slug));
        const uniqueLocal = localMarkets.filter( (m: any) => !slugSet.has(m.slug));

        finalMarkets = [...uniqueLocal, ...finalMarkets];

        // 4. Fallback/Static if empty (Only if absolutely no markets)
        if (finalMarkets.length === 0) {
          console.log('ℹ️ No markets found, using defaults');
          finalMarkets = [...initialStaticMarkets];
        }

        setMarkets(finalMarkets);
        console.log(`✅ Loaded ${finalMarkets.length} markets (Supabase + Local)`);
      } catch (e) {
        console.error("Error loading markets from Supabase:", e);
        // Fallback to static + localStorage
        try {
          const createdMarkets = localStorage.getItem('djinn_created_markets');
          let customMarkets = [];
          if (createdMarkets) customMarkets = JSON.parse(createdMarkets);

          setMarkets([...customMarkets, ...initialStaticMarkets]);
        } catch (localError) {
          console.error("Error with localStorage fallback:", localError);
        }
      } finally {
        setTimeout(() => setIsLoading(false), 300);
      }
    };

    loadMarkets();

    // NEW: Real-time subscription to markets table
    const channel = subscribeToMarkets((payload) => {
      if (payload.eventType === 'INSERT' && payload.new) {
        console.log("🔴 LIVE: New market created!", payload.new);
        const newMarket = {
          id: payload.new.id,
          title: payload.new.title,
          chance: Math.round((payload.new.total_yes_pool / (payload.new.total_yes_pool + payload.new.total_no_pool + 1)) * 100) || 50,
          volume: `$${formatCompact(Math.abs(Number(payload.new.total_yes_pool || 0) + Number(payload.new.total_no_pool || 0)))}`,
          type: 'binary',
          category: payload.new.category || 'Trending',
          endDate: payload.new.end_date ? new Date(payload.new.end_date) : new Date('2026-12-31'),
          slug: payload.new.slug,
          createdAt: new Date(payload.new.created_at).getTime(),
          resolved: payload.new.resolved,
          winningOutcome: payload.new.winning_outcome,
          resolutionSource: payload.new.resolution_source,
          banner_url: payload.new.banner_url,
          options: payload.new.options?.map((opt: string, idx: number) => ({
            title: opt,
            chance: 0,
            color: payload.new.outcome_colors?.[idx]
          })),
          icon: payload.new.banner_url,
          isNew: true,
          justArrived: true // Flag for pump animation (10s)
        };

        setMarkets( (prev: any) => [newMarket, ...prev]);

        // Remove pump flag after 10 seconds
        setTimeout(() => {
          setMarkets( (prev: any) => prev.map( (m: any) =>
            m.slug === newMarket.slug ? { ...m, justArrived: false } : m
          ));
        }, 10000);
      }
    });
    // NEW: Real-time subscription to market_data table (Live Price/Volume)
    const dataChannel = subscribeToAllMarketData((payload) => {
      if (payload.new && payload.new.slug) {
        // Collect update in batch instead of setting state immediately
        updatesRef.current[payload.new.slug] = payload.new;
      }
    });

    const handleMarketCreated = (event: any) => {
      if (event.detail) {
        console.log("⚡ Optimistic UI Update: New Market", event.detail);
        setMarkets( (prev: any) => [event.detail, ...prev]);
      } else {
        loadMarkets();
      }
    };

    // ESCUCHAR EVENTOS DE CREACIÓN GLOBAL
    window.addEventListener('storage', loadMarkets);
    window.addEventListener('market-created', handleMarketCreated);

    return () => {
      channel.unsubscribe();
      dataChannel.unsubscribe();
      window.removeEventListener('storage', loadMarkets);
      window.removeEventListener('market-created', handleMarketCreated);
    };
  }, []);

  // NEW: Batched Real-time updates to prevent render floods
  useEffect(() => {
    const applyUpdates = () => {
      if (Object.keys(updatesRef.current).length === 0) return;

      setMarkets( (prev: any) => prev.map( (m: any) => {
        const update = updatesRef.current[m.slug];
        if (update) {
          return {
            ...m,
            chance: Math.round(update.live_price),
            volume: `$${formatCompact(Math.abs(update.volume))}`
          };
        }
        return m;
      }));

      updatesRef.current = {}; // Clear batch
    };

    const interval = setInterval(applyUpdates, 600); // Pulse every 600ms
    return () => clearInterval(interval);
  }, []);

  // 3. FUNCIÓN DE CREACIÓN PROTEGIDA
  const handleCreateMarket = (newMarket: any) => {
    // Agregar createdAt si no existe
    const marketWithTimestamp = {
      ...newMarket,
      createdAt: newMarket.createdAt || Date.now(),
      category: newMarket.category || 'Trending',
      options: newMarket.options?.map((opt: string, idx: number) => ({
        title: opt,
        chance: newMarket.chance || 50, // Use main market chance or 50 as default since per-outcome is not available
        color: newMarket.outcome_colors?.[idx]
      }))
    };
    setMarkets( (prev: any) => [marketWithTimestamp, ...prev]);

    try {
      const savedMarkets = JSON.parse(localStorage.getItem('djinn_markets') || '[]');
      const updatedSaved = [marketWithTimestamp, ...savedMarkets];
      localStorage.setItem('djinn_markets', JSON.stringify(updatedSaved));
    } catch (error) {
      console.error("LocalStorage is full!", error);
      alert("Mi Lord, local memory is full. Market created only for this session.");
    }
  };

  // 4. FILTRAR MARKETS SEGÚN CATEGORÍA Y SUBCATEGORÍA
  const now = Date.now();
  const oneDayAgo = now - 86400000; // 24 horas

  const filteredMarkets = useMemo(() => {
    return markets.filter(market => {
      // Hide archived markets
      if ((market as any).is_archived) return false;

      // Hide old markets before fresh start timestamp
      if (FRESH_START_TIMESTAMP > 0 && (market.createdAt || 0) < FRESH_START_TIMESTAMP) {
        return false;
      }

      const age = now - (market.createdAt || 0);
      const oneHour = 3600000;
      const twelveHours = 43200000;
      const oneDay = 86400000;

      if (activeCategory === 'Trending') return true; // Show mix

      // NEW: Real-time feed (Chronological)
      if (activeCategory === 'New') {
        return true;
      }

      // HOT: 1h - 12h range (High velocity zone)
      if (activeCategory === 'Hot') {
        return age > oneHour && age < twelveHours;
      }

      // STABLE: 24h+ (Consolidated markets)
      if (activeCategory === 'Stable') {
        return age > oneDay;
      }

      if (activeCategory === 'Earth') {
        if (activeSubcategory) return (market.region || '').toLowerCase() === activeSubcategory.toLowerCase();
        return (market.category || '').toLowerCase() === 'earth' || !!market.region;
      }
      return (market.category || '').toLowerCase() === activeCategory.toLowerCase();
    });
  }, [markets, activeCategory, activeSubcategory, now]);

  // Sorting Logic helpers
  const parseVolume = (volStr: string) => {
    if (!volStr) return 0;
    const clean = volStr.replace(/[$,]/g, '').toUpperCase();
    const val = parseFloat(clean);
    if (isNaN(val)) return 0;
    if (clean.endsWith('K')) return val * 1000;
    if (clean.endsWith('M')) return val * 1000000;
    if (clean.endsWith('B')) return val * 1000000000;
    return val;
  };

  const sortedMarkets = useMemo(() => {
    return [...filteredMarkets].sort((a: any, b: any) => {
      // NEW: Strictly by Time (Newest First)
      if (activeCategory === 'New') {
        return (b.createdAt || 0) - (a.createdAt || 0);
      }

      // TRENDING ALGORITHM: Volume > Total Pool > MCAP > Velocity
      const volA = parseVolume(a.volume);
      const volB = parseVolume(b.volume);

      if (volB !== volA) return volB - volA;

      const poolA = a.totalPool || 0;
      const poolB = b.totalPool || 0;
      if (poolB !== poolA) return poolB - poolA;

      const mcapA = a.mcap || 0;
      const mcapB = b.mcap || 0;
      if (mcapB !== mcapA) return mcapB - mcapA;

      // Secondary Sort: Newest First
      return (b.createdAt || 0) - (a.createdAt || 0);
    });
  }, [filteredMarkets, activeCategory]);

  // Título dinámico según categoría (sin emojis)
  const getCategoryTitle = () => {
    if (activeCategory === 'Earth' && activeSubcategory) {
      return `${activeSubcategory}`;
    }
    switch (activeCategory) {
      case 'New': return 'New';
      case 'Trending': return 'Trending';
      case 'Earth': return 'Earth';
      case 'Crypto': return 'Crypto';
      case 'Sports': return 'Sports';
      case 'Politics': return 'Politics';
      case 'Tech': return 'Tech';
      case 'AI': return 'AI';
      case 'Gaming': return 'Gaming';
      case 'Science': return 'Science';
      case 'Finance': return 'Finance';
      case 'Culture': return 'Culture';
      case 'Climate': return 'Climate';
      case 'Movies': return 'Movies';
      case 'Music': return 'Music';
      case 'Mentions': return 'Mentions';
      default: return activeCategory;
    }
  };

  // Calculate top 3 markets for The Great Pyramid Podium
  const top3Markets = useMemo(() => {
    if (markets.length === 0) return null;
    const sorted = [...markets].sort((a: any, b: any) => {
      // Same algorithm as main list
      const volA = parseVolume(a.volume);
      const volB = parseVolume(b.volume);
      if (volB !== volA) return volB - volA;

      const poolA = a.totalPool || 0;
      const poolB = b.totalPool || 0;
      if (poolB !== poolA) return poolB - poolA;

      const mcapA = a.mcap || 0;
      const mcapB = b.mcap || 0;
      if (mcapB !== mcapA) return mcapB - mcapA;

      return (b.createdAt || 0) - (a.createdAt || 0);
    });

    return sorted.slice(0, 3).map( (m: any) => ({
      ...m,
      betsCount: m.betsCount || Math.floor(Math.random() * 5000) + 500 // Mock if missing
    }));
  }, [markets]);

  return (
    <div className="min-h-screen w-full bg-black text-white font-sans selection:bg-[#F492B7] selection:text-black relative">
      <StarfieldBg />

      {/* Hero Section con Callback para crear mercados */}
      <div className="relative z-10">
        <Hero onMarketCreated={handleCreateMarket} />
      </div>

      {/* The Great Pyramid - Top 3 Podium */}
      {activeCategory === 'Trending' && top3Markets && top3Markets.length > 0 && (
        <div className="relative z-10">
          <TheGreatPyramid topMarkets={top3Markets} />
        </div>
      )}

      <section className="px-6 md:px-12 pb-20 max-w-[1600px] mx-auto mt-10 relative z-10">
        {!(activeCategory === 'Trending' && top3Markets && top3Markets.length > 0) && (
          <h2 className="text-2xl font-medium mb-8 tracking-tight text-gray-400 lowercase">
            {getCategoryTitle().toLowerCase()}
          </h2>
        )}

        {isLoading ? (
          <MarketGridSkeleton count={8} />
        ) : sortedMarkets.length === 0 ? (
          <div className="text-center py-32 border-2 border-dashed border-white/10 rounded-3xl bg-gradient-to-br from-[#0A0A0A] to-[#1A1A1A]">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="flex flex-col items-center gap-6"
            >
              {/* Pink Crystal Icon */}
              <div className="w-24 h-24 bg-gradient-to-br from-[#F492B7] to-[#FF007A] rounded-2xl rotate-45 flex items-center justify-center shadow-[0_0_60px_rgba(244,146,183,0.3)]">
                <span className="text-5xl -rotate-45">🔮</span>
              </div>

              <div>
                <p className="text-white text-2xl font-black uppercase tracking-widest">
                  No Markets Yet
                </p>
                <p className="text-gray-500 mt-3 text-lg">
                  Be the first to summon a prediction market
                </p>
              </div>

              <button
                onClick={() => {
                  window.dispatchEvent(new CustomEvent('open-create-modal'));
                  play('click');
                }}
                className="bg-[#F492B7] text-black text-lg font-black py-4 px-10 rounded-xl shadow-[0_0_30px_rgba(244,146,183,0.3)] hover:scale-105 active:scale-95 transition-all uppercase mt-4"
              >
                Create First Market
              </button>
            </motion.div>
          </div>
        ) : (
          <AnimatePresence mode="popLayout">
            <motion.div
              key={activeCategory}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 bg-transparent overflow-hidden"
            >
              {sortedMarkets
                .map((market, index) => {
                  const isPumping = (market as any).justArrived;

                  return (
                    <motion.div
                      key={`${market.slug}-${index}`}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{
                        duration: 0.2,
                        delay: index * 0.03
                      }}
                      className="h-full"
                    >
                      <PumpEffect isActive={isPumping}>
                        <MarketCard
                          {...market}
                          isNew={market.createdAt && market.createdAt > oneDayAgo}
                        />
                      </PumpEffect>
                    </motion.div>
                  );
                })}
            </motion.div>
          </AnimatePresence>
        )}
      </section>





    </div>
  );
}