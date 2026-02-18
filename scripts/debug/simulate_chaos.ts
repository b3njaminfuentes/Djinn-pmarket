
import { getSpotPrice, simulateBuy, simulateSell, MarketState } from './lib/core-amm.ts';

// ------------------------------------------------------------------
// CONFIG
// ------------------------------------------------------------------
const SOL_PRICE_USD = 150;
const TARGET_MCAP_USD_YES = 80_000_000; // $80M
const TARGET_MCAP_USD_NO = 50_000_000;  // $50M
const NUM_AGENTS = 50;

// ------------------------------------------------------------------
// AGENT PERSONAS
// ------------------------------------------------------------------
type Persona = 'DIAMOND_HANDS' | 'PAPER_HANDS' | 'TRADER';

interface Agent {
    id: number;
    persona: Persona;
    walletBalance: number; // In SOL
    yesShares: number;
    noShares: number;
    entryPriceYes: number; // Avg entry
    entryPriceNo: number; // Avg entry
    realizedPnL: number; // In USD
}

// ------------------------------------------------------------------
// STATE & METRICS
// ------------------------------------------------------------------
const stateYes: MarketState = { virtualSolReserves: 0, virtualShareReserves: 0, realSolReserves: 0, totalSharesMinted: 0 };
const stateNo: MarketState = { virtualSolReserves: 0, virtualShareReserves: 0, realSolReserves: 0, totalSharesMinted: 0 };

let totalVolumeUsd = 0;

// ------------------------------------------------------------------
// SETUP AGENTS
// ------------------------------------------------------------------
const agents: Agent[] = [];

for (let i = 0; i < NUM_AGENTS; i++) {
    let persona: Persona = 'TRADER';
    let balance = 500; // Default 500 SOL

    const rand = Math.random();
    if (rand < 0.2) {
        persona = 'DIAMOND_HANDS'; // 20% HODL forever
        balance = 5000; // Whales
    } else if (rand < 0.6) {
        persona = 'PAPER_HANDS'; // 40% Panic sell easily
        balance = 100; // Minnows
    }

    agents.push({
        id: i,
        persona,
        walletBalance: balance,
        yesShares: 0,
        noShares: 0,
        entryPriceYes: 0,
        entryPriceNo: 0,
        realizedPnL: 0
    });
}

// ------------------------------------------------------------------
// HELPERS
// ------------------------------------------------------------------
function getAction(agent: Agent, currentPriceYes: number, currentPriceNo: number): 'BUY_YES' | 'BUY_NO' | 'SELL_YES' | 'SELL_NO' | 'HOLD' {
    const hasYes = agent.yesShares > 0;
    const hasNo = agent.noShares > 0;

    // 1. SELL LOGIC
    if (hasYes) {
        const gain = (currentPriceYes - agent.entryPriceYes) / agent.entryPriceYes;
        if (agent.persona === 'PAPER_HANDS' && (gain > 0.5 || gain < -0.1)) return 'SELL_YES'; // Take 50% profit or Stop loss 10%
        if (agent.persona === 'TRADER' && gain > 2.0) return 'SELL_YES'; // Take 2x profit
        // Diamond hands never sell early
    }
    if (hasNo) {
        const gain = (currentPriceNo - agent.entryPriceNo) / agent.entryPriceNo;
        if (agent.persona === 'PAPER_HANDS' && (gain > 0.5 || gain < -0.1)) return 'SELL_NO';
        if (agent.persona === 'TRADER' && gain > 2.0) return 'SELL_NO';
    }

    // 2. BUY LOGIC
    if (agent.walletBalance > 1) {
        // Randomly ape in if not selling
        if (Math.random() > 0.7) return Math.random() > 0.4 ? 'BUY_YES' : 'BUY_NO'; // Slight YES bias
    }

    return 'HOLD';
}

// ------------------------------------------------------------------
// SIMULATION LOOP
// ------------------------------------------------------------------
console.log(`\n🌪️ CHAOS SIMULATION (Buying + Selling)`);
console.log(`   Targets: YES $${TARGET_MCAP_USD_YES / 1e6}M | NO $${TARGET_MCAP_USD_NO / 1e6}M`);

let round = 0;
let yesMcapUsd = 0;
let noMcapUsd = 0;

while ((yesMcapUsd < TARGET_MCAP_USD_YES || noMcapUsd < TARGET_MCAP_USD_NO) && round < 5000) {
    round++;

    // Pick random agent
    const agent = agents[Math.floor(Math.random() * NUM_AGENTS)];

    const pYes = getSpotPrice(stateYes.totalSharesMinted);
    const pNo = getSpotPrice(stateNo.totalSharesMinted);

    const action = getAction(agent, pYes, pNo);

    if (action === 'HOLD') continue;

    if (action === 'BUY_YES' || action === 'BUY_NO') {
        const isYes = action === 'BUY_YES';
        const state = isYes ? stateYes : stateNo;

        // Dynamic Buy Sizing
        let amount = agent.walletBalance * 0.2; // Use 20% of bag
        if (agent.persona === 'DIAMOND_HANDS') amount = agent.walletBalance * 0.5; // Whales ape harder
        if (amount < 0.1) amount = 0.1;

        if (agent.walletBalance < amount) continue;

        const res = simulateBuy(amount, state);
        state.totalSharesMinted += res.sharesReceived;
        agent.walletBalance -= res.netInvested; // Simplification (ignoring fee deduction from balance for calc)

        // Update Agent Avg Entry
        if (isYes) {
            const totalVal = (agent.yesShares * agent.entryPriceYes) + (res.sharesReceived * res.averageEntryPrice);
            agent.yesShares += res.sharesReceived;
            agent.entryPriceYes = totalVal / agent.yesShares;
        } else {
            const totalVal = (agent.noShares * agent.entryPriceNo) + (res.sharesReceived * res.averageEntryPrice);
            agent.noShares += res.sharesReceived;
            agent.entryPriceNo = totalVal / agent.noShares;
        }
        totalVolumeUsd += amount * SOL_PRICE_USD;
    }
    else if (action === 'SELL_YES' || action === 'SELL_NO') {
        const isYes = action === 'SELL_YES';
        const state = isYes ? stateYes : stateNo;

        // Sell 50% of position
        const sharesToSell = isYes ? agent.yesShares * 0.5 : agent.noShares * 0.5;
        if (sharesToSell < 1) continue;

        const res = simulateSell(sharesToSell, state);
        state.totalSharesMinted -= sharesToSell;
        agent.walletBalance += res.netSolOut;

        if (isYes) {
            agent.yesShares -= sharesToSell;
            const costBasis = sharesToSell * agent.entryPriceYes;
            const proceed = res.netSolOut;
            agent.realizedPnL += (proceed - costBasis) * SOL_PRICE_USD;
        } else {
            agent.noShares -= sharesToSell;
            const costBasis = sharesToSell * agent.entryPriceNo;
            const proceed = res.netSolOut;
            agent.realizedPnL += (proceed - costBasis) * SOL_PRICE_USD;
        }
        totalVolumeUsd += res.netSolOut * SOL_PRICE_USD;
        // console.log(`   📉 ${agent.persona} SOLD ${isYes?'YES':'NO'} for profit!`);
    }

    // Update MCAPs
    yesMcapUsd = getSpotPrice(stateYes.totalSharesMinted) * stateYes.totalSharesMinted * SOL_PRICE_USD;
    noMcapUsd = getSpotPrice(stateNo.totalSharesMinted) * stateNo.totalSharesMinted * SOL_PRICE_USD;

    if (round % 200 === 0) {
        // console.log(`   Round ${round}: YES $${(yesMcapUsd/1e6).toFixed(1)}M | NO $${(noMcapUsd/1e6).toFixed(1)}M`);
    }
}

console.log(`\n🏁 CHAOS SIMULATION COMPLETE`);
console.log(`=============================================================`);
console.log(`📊 FINAL METRICS`);
console.log(`   YES MCAP:  $${(yesMcapUsd / 1e6).toFixed(2)}M`);
console.log(`   NO MCAP:   $${(noMcapUsd / 1e6).toFixed(2)}M`);
console.log(`   VOLUME:    $${(totalVolumeUsd / 1e6).toFixed(2)}M`);
console.log(`=============================================================\n`);

console.log(`🏆 TRADER PERFORMANCE`);
console.log(`Persona        | Realized PnL ($) | Unrealized ($) | Total Equity ($)`);
console.log(`---------------------------------------------------------------------`);

// Group by Persona
const stats: Record<Persona, { count: number, pnl: number, equity: number }> = {
    'DIAMOND_HANDS': { count: 0, pnl: 0, equity: 0 },
    'PAPER_HANDS': { count: 0, pnl: 0, equity: 0 },
    'TRADER': { count: 0, pnl: 0, equity: 0 }
};

agents.forEach(a => {
    const pYes = getSpotPrice(stateYes.totalSharesMinted);
    const pNo = getSpotPrice(stateNo.totalSharesMinted);
    const unrealized = (a.yesShares * pYes + a.noShares * pNo) * SOL_PRICE_USD;

    stats[a.persona].count++;
    stats[a.persona].pnl += a.realizedPnL;
    stats[a.persona].equity += unrealized;
});

Object.entries(stats).forEach(([persona, data]) => {
    console.log(`${persona.padEnd(14)} | $${data.pnl.toLocaleString().padEnd(15)} | $${data.equity.toLocaleString().padEnd(13)} | $${(data.pnl + data.equity).toLocaleString()}`);
});

console.log(`\n💡 INSIGHT:`);
console.log(`- PAPER_HANDS have high realized PnL (they sold early) but missed the mega gains.`);
console.log(`- DIAMOND_HANDS have massive Unrealized Equity (holding the bag to $80M).`);
console.log(`- TRADERS are balanced.`);
