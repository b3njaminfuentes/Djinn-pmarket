'use client';

import { motion, AnimatePresence } from 'framer-motion';
import {
  PaperPrediction,
  formatPrice,
  timeAgo,
  type CryptoSymbol,
} from '@/lib/paper-arena';

interface ArenaFeedProps {
  predictions: PaperPrediction[];
  maxItems?: number;
  compact?: boolean;
}

const SYMBOL_ICONS: Record<CryptoSymbol, string> = {
  BTC: '₿',
  ETH: 'Ξ',
  SOL: '◎',
};

const STATUS_CONFIG = {
  active: {
    dot: 'bg-yellow-400 animate-pulse',
    text: 'text-yellow-400',
    label: 'ACTIVE',
    bg: 'border-yellow-400/20',
  },
  correct: {
    dot: 'bg-emerald-400',
    text: 'text-emerald-400',
    label: 'CORRECT',
    bg: 'border-emerald-400/20',
  },
  incorrect: {
    dot: 'bg-red-400',
    text: 'text-red-400',
    label: 'MISSED',
    bg: 'border-red-400/20',
  },
};

export default function ArenaFeed({
  predictions,
  maxItems = 15,
  compact = false,
}: ArenaFeedProps) {
  const visible = predictions.slice(0, maxItems);

  return (
    <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="bg-[#F492B7]/10 border-b border-white/10 px-4 sm:px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-[#F492B7] animate-pulse" />
          <span className="text-[#F492B7] font-black text-[11px] uppercase tracking-[0.15em]">
            Live Predictions
          </span>
        </div>
        <span className="bg-yellow-400/15 text-yellow-400 text-[10px] font-black px-2.5 py-1 rounded-full border border-yellow-400/30 uppercase tracking-wider">
          Training Mode
        </span>
      </div>

      {/* Feed */}
      <div
        className={`divide-y divide-white/5 overflow-y-auto custom-scrollbar ${
          compact ? 'max-h-[280px]' : 'max-h-[500px]'
        }`}
      >
        {visible.length === 0 ? (
          <div className="py-12 text-center">
            <div className="text-3xl mb-3 animate-pulse">🤖</div>
            <p className="text-gray-500 text-sm font-bold">
              Agents warming up...
            </p>
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {visible.map((pred, i) => (
              <motion.div
                key={pred.id}
                initial={{ opacity: 0, x: -20, height: 0 }}
                animate={{ opacity: 1, x: 0, height: 'auto' }}
                exit={{ opacity: 0, x: 20, height: 0 }}
                transition={{ duration: 0.3, delay: i < 3 ? i * 0.05 : 0 }}
                className={`px-4 sm:px-6 py-3 flex items-center gap-3 hover:bg-white/5 transition-colors border-l-2 ${STATUS_CONFIG[pred.status].bg}`}
              >
                {/* Bot emoji */}
                <span className="text-xl flex-shrink-0">{pred.botEmoji}</span>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-white font-bold text-sm">
                      {pred.botName}
                    </span>
                    <span className="text-gray-500 text-xs">predicted</span>
                    <span className="text-white font-mono text-sm">
                      {SYMBOL_ICONS[pred.symbol]} {pred.symbol}
                    </span>
                    <span className="text-gray-400 text-xs">
                      {pred.direction === 'above' ? '>' : '<'}
                    </span>
                    <span className="text-white font-mono font-bold text-sm">
                      {formatPrice(pred.targetPrice, pred.symbol)}
                    </span>
                    <span className="text-gray-600 text-xs">
                      in {pred.timeframe}
                    </span>
                  </div>

                  {/* Bottom row */}
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-gray-600 text-[11px]">
                      {timeAgo(pred.createdAt)}
                    </span>
                    {pred.status !== 'active' && (
                      <>
                        <span className="text-gray-700 text-[11px]">·</span>
                        <span className="text-gray-600 text-[11px]">
                          Entry {formatPrice(pred.entryPrice, pred.symbol)}
                        </span>
                      </>
                    )}
                  </div>
                </div>

                {/* Status badge */}
                <div className="flex-shrink-0">
                  {pred.status === 'active' ? (
                    <div className="flex items-center gap-1.5">
                      <span className={`w-1.5 h-1.5 rounded-full ${STATUS_CONFIG.active.dot}`} />
                      <span className="text-yellow-400 text-[10px] font-black tracking-wider">
                        LIVE
                      </span>
                    </div>
                  ) : pred.status === 'correct' ? (
                    <span className="text-emerald-400 font-black text-xs">
                      ✓
                    </span>
                  ) : (
                    <span className="text-red-400/60 font-black text-xs">
                      ✗
                    </span>
                  )}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}
