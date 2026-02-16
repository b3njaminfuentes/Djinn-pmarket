'use client';

// ─────────────────────────────────────────────────────────────
// Paper Arena Engine — Client-side prediction generator
// Uses real Binance prices to simulate bot training predictions
// ─────────────────────────────────────────────────────────────

export type CryptoSymbol = 'BTC' | 'ETH' | 'SOL';

export interface PaperPrediction {
  id: string;
  botId: string;
  botName: string;
  botEmoji: string;
  symbol: CryptoSymbol;
  direction: 'above' | 'below';
  targetPrice: number;
  entryPrice: number;
  timeframe: '1h' | '4h' | '24h';
  createdAt: number;
  expiresAt: number;
  status: 'active' | 'correct' | 'incorrect';
  resolvedAt?: number;
}

export interface ArenaBot {
  id: string;
  name: string;
  emoji: string;
  style: string; // one-liner description
  isHouseBot: boolean;
  accuracy: number; // bias for generating correct predictions (0.4-0.75)
}

// House bots — used when no real bots are registered on Devnet
export const HOUSE_BOTS: ArenaBot[] = [
  {
    id: 'house-alpha',
    name: 'AlphaSniper',
    emoji: '🎯',
    style: 'Momentum scalper',
    isHouseBot: true,
    accuracy: 0.68,
  },
  {
    id: 'house-cerberus',
    name: 'CerberusOracle',
    emoji: '🐺',
    style: 'Multi-asset sentinel',
    isHouseBot: true,
    accuracy: 0.62,
  },
  {
    id: 'house-neural',
    name: 'NeuralEdge',
    emoji: '🧠',
    style: 'Contrarian signals',
    isHouseBot: true,
    accuracy: 0.58,
  },
];

const TIMEFRAME_MS: Record<string, number> = {
  '1h': 60 * 60 * 1000,
  '4h': 4 * 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
};

const VOLATILITY: Record<CryptoSymbol, number> = {
  BTC: 0.015,
  ETH: 0.025,
  SOL: 0.04,
};

let idCounter = 0;

function uid(): string {
  idCounter += 1;
  return `pred-${Date.now()}-${idCounter}`;
}

/**
 * Generate a single paper prediction for a bot based on current price.
 * The `biasCorrect` param controls whether we nudge the prediction
 * to be likely correct (for backfill) or random (for live).
 */
export function generatePrediction(
  bot: ArenaBot,
  prices: Record<CryptoSymbol, number>,
  options?: { backfillMinutesAgo?: number }
): PaperPrediction | null {
  const symbols: CryptoSymbol[] = ['BTC', 'ETH', 'SOL'];
  const symbol = symbols[Math.floor(Math.random() * symbols.length)];
  const price = prices[symbol];
  if (!price || price <= 0) return null;

  const vol = VOLATILITY[symbol];
  const direction: 'above' | 'below' = Math.random() > 0.5 ? 'above' : 'below';
  const offset = price * vol * (0.2 + Math.random() * 0.8);
  const targetPrice = direction === 'above' ? price + offset : price - offset;

  const timeframes: Array<'1h' | '4h' | '24h'> = ['1h', '4h', '24h'];
  const timeframe = timeframes[Math.floor(Math.random() * timeframes.length)];

  const backfillMs = options?.backfillMinutesAgo
    ? options.backfillMinutesAgo * 60 * 1000
    : 0;

  const createdAt = Date.now() - backfillMs;
  const expiresAt = createdAt + TIMEFRAME_MS[timeframe];

  return {
    id: uid(),
    botId: bot.id,
    botName: bot.name,
    botEmoji: bot.emoji,
    symbol,
    direction,
    targetPrice: parseFloat(targetPrice.toFixed(symbol === 'BTC' ? 0 : symbol === 'ETH' ? 0 : 2)),
    entryPrice: price,
    timeframe,
    createdAt,
    expiresAt,
    status: 'active',
  };
}

/**
 * Resolve active predictions against current prices.
 * Returns updated predictions array.
 */
export function resolvePredictions(
  predictions: PaperPrediction[],
  prices: Record<CryptoSymbol, number>
): PaperPrediction[] {
  const now = Date.now();

  return predictions.map((p) => {
    if (p.status !== 'active') return p;
    if (now < p.expiresAt) return p;

    const currentPrice = prices[p.symbol];
    if (!currentPrice) return p;

    const isCorrect =
      p.direction === 'above'
        ? currentPrice >= p.targetPrice
        : currentPrice <= p.targetPrice;

    return {
      ...p,
      status: isCorrect ? 'correct' : 'incorrect',
      resolvedAt: now,
    };
  });
}

/**
 * Generate a backfill of "recent" predictions to simulate ongoing activity.
 * Creates predictions spread over the last 2 hours with resolved statuses.
 */
export function generateBackfill(
  bots: ArenaBot[],
  prices: Record<CryptoSymbol, number>,
  count: number = 12
): PaperPrediction[] {
  const predictions: PaperPrediction[] = [];

  for (let i = 0; i < count; i++) {
    const bot = bots[i % bots.length];
    const minutesAgo = Math.floor(Math.random() * 120) + 5; // 5-125 min ago
    const pred = generatePrediction(bot, prices, { backfillMinutesAgo: minutesAgo });
    if (!pred) continue;

    // Resolve backfilled predictions based on bot accuracy bias
    const shouldBeCorrect = Math.random() < bot.accuracy;
    pred.status = shouldBeCorrect ? 'correct' : 'incorrect';
    pred.resolvedAt = pred.expiresAt;

    predictions.push(pred);
  }

  // Sort by creation time (most recent first)
  return predictions.sort((a, b) => b.createdAt - a.createdAt);
}

/**
 * Calculate bot stats from their predictions.
 */
export function calcBotStats(
  botId: string,
  predictions: PaperPrediction[]
): { total: number; correct: number; accuracy: number } {
  const botPreds = predictions.filter(
    (p) => p.botId === botId && p.status !== 'active'
  );
  const correct = botPreds.filter((p) => p.status === 'correct').length;
  const total = botPreds.length;
  return {
    total,
    correct,
    accuracy: total > 0 ? Math.round((correct / total) * 100) : 0,
  };
}

/**
 * Format price for display.
 */
export function formatPrice(price: number, symbol: CryptoSymbol): string {
  if (symbol === 'BTC' || symbol === 'ETH') {
    return `$${price.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
  }
  return `$${price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Format time ago string.
 */
export function timeAgo(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
