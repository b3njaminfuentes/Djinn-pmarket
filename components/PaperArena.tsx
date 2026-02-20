'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import { useBinancePrice } from '@/hooks/useBinancePrice';
import ArenaFeed from './ArenaFeed';
import {
  HOUSE_BOTS,
  generatePrediction,
  generateBackfill,
  resolvePredictions,
  calcBotStats,
  formatPrice,
  type ArenaBot,
  type PaperPrediction,
  type CryptoSymbol,
} from '@/lib/paper-arena';

// ── Sparkline SVG ─────────────────────────────────────────────
function Sparkline({
  data,
  width = 120,
  height = 40,
  color = '#F492B7',
}: {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
}) {
  if (data.length < 2) return null;

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((v - min) / range) * (height - 4) - 2;
    return `${x},${y}`;
  });

  const isPositive = data[data.length - 1] >= data[0];
  const lineColor = isPositive ? '#10B981' : '#EF4444';

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="overflow-visible"
    >
      <defs>
        <linearGradient id={`grad-${color}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={lineColor} stopOpacity="0.3" />
          <stop offset="100%" stopColor={lineColor} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path
        d={`M${points.join(' L')}`}
        fill="none"
        stroke={lineColor}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Fill area under the line */}
      <path
        d={`M0,${height} L${points.join(' L')} L${width},${height} Z`}
        fill={`url(#grad-${color})`}
      />
      {/* Current price dot */}
      <circle
        cx={width}
        cy={parseFloat(points[points.length - 1].split(',')[1])}
        r="2.5"
        fill={lineColor}
        className="animate-pulse"
      />
    </svg>
  );
}

// ── Price Ticker Card ─────────────────────────────────────────
function PriceTicker({
  symbol,
  icon,
}: {
  symbol: CryptoSymbol;
  icon: string;
}) {
  const { price, history } = useBinancePrice(symbol, '1h');
  const priceData = history.map((h) => h.price);
  const change =
    priceData.length > 1
      ? ((priceData[priceData.length - 1] - priceData[0]) / priceData[0]) * 100
      : 0;

  return (
    <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-xl p-3 flex items-center gap-3 min-w-0">
      <div className="flex-shrink-0">
        <span className="text-lg">{icon}</span>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-white font-bold text-sm">{symbol}</span>
          <span
            className={`text-[11px] font-bold ${
              change >= 0 ? 'text-emerald-400' : 'text-red-400'
            }`}
          >
            {change >= 0 ? '+' : ''}
            {change.toFixed(1)}%
          </span>
        </div>
        <span className="text-white/80 font-mono text-xs">
          {price > 0 ? formatPrice(price, symbol) : '...'}
        </span>
      </div>
      <div className="flex-shrink-0">
        <Sparkline data={priceData.slice(-50)} width={80} height={28} />
      </div>
    </div>
  );
}

// ── Main PaperArena Component ─────────────────────────────────
export default function PaperArena({ className = '' }: { className?: string }) {
  const [predictions, setPredictions] = useState<PaperPrediction[]>([]);
  const [bots] = useState<ArenaBot[]>(HOUSE_BOTS);
  const [isReady, setIsReady] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Get live prices for all symbols
  const btc = useBinancePrice('BTC', '1h');
  const eth = useBinancePrice('ETH', '1h');
  const sol = useBinancePrice('SOL', '1h');

  const getCurrentPrices = useCallback((): Record<CryptoSymbol, number> => {
    return { BTC: btc.price, ETH: eth.price, SOL: sol.price };
  }, [btc.price, eth.price, sol.price]);

  // Initialize with backfill once prices are loaded
  useEffect(() => {
    const prices = getCurrentPrices();
    if (prices.BTC > 0 && prices.ETH > 0 && prices.SOL > 0 && !isReady) {
      const backfill = generateBackfill(bots, prices, 10);
      setPredictions(backfill);
      setIsReady(true);
    }
  }, [getCurrentPrices, bots, isReady]);

  // Generate new predictions periodically + resolve expired ones
  useEffect(() => {
    if (!isReady) return;

    intervalRef.current = setInterval(() => {
      const prices = getCurrentPrices();
      if (prices.BTC <= 0) return;

      setPredictions((prev) => {
        // Resolve expired predictions
        let updated = resolvePredictions(prev, prices);

        // Generate a new prediction from a random bot
        const bot = bots[Math.floor(Math.random() * bots.length)];
        const newPred = generatePrediction(bot, prices);
        if (newPred) {
          updated = [newPred, ...updated];
        }

        // Keep only last 25 predictions
        return updated.slice(0, 25);
      });
    }, 18000); // Every 18 seconds

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isReady, bots, getCurrentPrices]);

  // Bot stats derived from predictions
  const topBots = bots
    .map((bot) => ({
      ...bot,
      stats: calcBotStats(bot.id, predictions),
    }))
    .sort((a: any, b: any) => b.stats.accuracy - a.stats.accuracy);

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Banner */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-[#F492B7]/20 border border-[#F492B7]/30 flex items-center justify-center">
            <span className="text-sm">⚔️</span>
          </div>
          <div>
            <h2 className="text-white font-black text-lg tracking-tight">
              Paper Arena
            </h2>
            <p className="text-gray-500 text-xs font-bold">
              Agents training on live market data
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-emerald-400 text-xs font-bold">
            {bots.length} agents active
          </span>
        </div>
      </motion.div>

      {/* Price Tickers */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.1 }}
        className="grid grid-cols-3 gap-2 sm:gap-3"
      >
        <PriceTicker symbol="BTC" icon="₿" />
        <PriceTicker symbol="ETH" icon="Ξ" />
        <PriceTicker symbol="SOL" icon="◎" />
      </motion.div>

      {/* Arena Feed */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        <ArenaFeed predictions={predictions} />
      </motion.div>

      {/* Top Performers */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3 }}
        className="grid grid-cols-3 gap-2 sm:gap-3"
      >
        {topBots.map((bot, i) => (
          <div
            key={bot.id}
            className="bg-white/5 backdrop-blur-md border border-white/10 rounded-xl p-3 text-center"
          >
            <div className="text-2xl mb-1">{bot.emoji}</div>
            <div className="text-white font-bold text-xs truncate">
              {bot.name}
            </div>
            <div className="text-gray-500 text-[10px] font-bold mb-2">
              {bot.style}
            </div>
            <div
              className={`font-mono font-black text-sm ${
                bot.stats.accuracy >= 60
                  ? 'text-emerald-400'
                  : bot.stats.accuracy >= 45
                  ? 'text-yellow-400'
                  : 'text-red-400'
              }`}
            >
              {bot.stats.total > 0 ? `${bot.stats.accuracy}%` : '—'}
            </div>
            <div className="text-gray-600 text-[10px] font-bold">
              {bot.stats.correct}/{bot.stats.total} calls
            </div>
            {i === 0 && bot.stats.total > 0 && (
              <div className="mt-1.5 text-[10px] font-black text-yellow-400 bg-yellow-400/10 rounded-full px-2 py-0.5 border border-yellow-400/20">
                TOP
              </div>
            )}
          </div>
        ))}
      </motion.div>
    </div>
  );
}
