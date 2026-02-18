
import { getSpotPrice, simulateBuy, MarketState } from './lib/core-amm.ts';

// ------------------------------------------------------------------
// CONFIG
// ------------------------------------------------------------------
const SOL_PRICE_USD = 150;
const TARGET_MCAP_USD_YES = 30_000_000; // $30M
const TARGET_MCAP_USD_NO = 20_000_000;  // $20M
const NUM_AGENTS = 30;

// ------------------------------------------------------------------
// AGENT TYPES
// ------------------------------------------------------------------
type AgentType = 'WHALE' | 'MID' | 'MINNOW';

interface Agent {
    id: number;
    type: AgentType;
    name: string;
    walletBalance: number; // In SOL
    yesShares: number;
    noShares: number;
    investedSolYes: number;
    investedSolNo: number;
}

// ------------------------------------------------------------------
// STATE
// ------------------------------------------------------------------
const stateYes: MarketState = {
    virtualSolReserves: 0,
    virtualShareReserves: 0,
    realSolReserves: 0,
    totalSharesMinted: 0
};
const stateNo: MarketState = {
    virtualSolReserves: 0,
    virtualShareReserves: 0,
    realSolReserves: 0,
    totalSharesMinted: 0
};

// Global Metrics
let totalProtocolFees = 0; // 0.5%
let totalCreatorFees = 0;  // 0.5%
let totalTvSol = 0;        // Total SOL trapped in curves

// ------------------------------------------------------------------
// SETUP AGENTS
// ------------------------------------------------------------------
const agents: Agent[] = [];

// Distribution: 3 Whales, 10 Mid, 17 Minnows
for (let i = 0; i < NUM_AGENTS; i++) {
    let type: AgentType = 'MINNOW';
    let balance = 100; // $15k

    if (i < 3) {
        type = 'WHALE';
        balance = 50000; // $7.5M Budget
    } else if (i < 13) {
        type = 'MID';
        balance = 2000; // $300k Budget
    }

    agents.push({
        id: i,
        type,
        name: `${type}_${i}`,
        walletBalance: balance,
        yesShares: 0,
        noShares: 0,
        investedSolYes: 0,
        investedSolNo: 0
    });
}

function getBuyAmount(agent: Agent): number {
    // Whales buy big chunks, Minnows buy scraps
    switch (agent.type) {
        case 'WHALE': return 500 + Math.random() * 2000; // 500-2500 SOL
        case 'MID': return 50 + Math.random() * 150;     // 50-200 SOL
        case 'MINNOW': return 1 + Math.random() * 9;     // 1-10 SOL
    }
}

// ------------------------------------------------------------------
// SIMULATION LOOP
// ------------------------------------------------------------------
console.log(`\n🌍 MARKET LIFECYCLE SIMULATION (30 AGENTS)`);
console.log(`   Target YES: $${TARGET_MCAP_USD_YES / 1e6}M | Target NO: $${TARGET_MCAP_USD_NO / 1e6}M`);
console.log(`   Price Basis: $${SOL_PRICE_USD}/SOL\n`);

let round = 0;
let yesMcapUsd = 0;
let noMcapUsd = 0;

while (yesMcapUsd < TARGET_MCAP_USD_YES || noMcapUsd < TARGET_MCAP_USD_NO) {
    round++;

    // Pick specific agent round-robin for fairness, or random?
    // Let's do completely random pick to simulate chaos
    const agentIdx = Math.floor(Math.random() * NUM_AGENTS);
    const agent = agents[agentIdx];

    // Decide Side (Weighted by how far from target)
    let side: 'YES' | 'NO' = 'YES';
    if (yesMcapUsd >= TARGET_MCAP_USD_YES && noMcapUsd < TARGET_MCAP_USD_NO) {
        side = 'NO';
    } else if (noMcapUsd >= TARGET_MCAP_USD_NO && yesMcapUsd < TARGET_MCAP_USD_YES) {
        side = 'YES';
    } else {
        // Both need pumping, 60/40 Split favoring YES generally
        side = Math.random() > 0.4 ? 'YES' : 'NO';

        // 5% chance a "Sniper" buys the underlying side just in case
        if (agent.type === 'WHALE' && Math.random() < 0.1) side = side === 'YES' ? 'NO' : 'YES';
    }

    // Skip if target met
    if (side === 'YES' && yesMcapUsd >= TARGET_MCAP_USD_YES) continue;
    if (side === 'NO' && noMcapUsd >= TARGET_MCAP_USD_NO) continue;

    // Execute Trade
    const amount = getBuyAmount(agent);

    // Safety check on wallet
    // In this sim, we assume they refill or have "infinite" for the sake of reaching the target
    // But let's track their "Spend"

    const state = side === 'YES' ? stateYes : stateNo;
    const res = simulateBuy(amount, state);

    // Update State
    state.totalSharesMinted += res.sharesReceived;

    // Update Agent
    if (side === 'YES') {
        agent.yesShares += res.sharesReceived;
        agent.investedSolYes += res.netInvested;
    } else {
        agent.noShares += res.sharesReceived;
        agent.investedSolNo += res.netInvested;
    }

    // Update Globals
    totalProtocolFees += res.feeProtocol;
    totalCreatorFees += res.feeCreator;
    totalTvSol += res.netInvested; // Pure TVL (fees are gone)

    // Recalc MCAPs
    const pYes = getSpotPrice(stateYes.totalSharesMinted);
    const pNo = getSpotPrice(stateNo.totalSharesMinted);
    yesMcapUsd = pYes * stateYes.totalSharesMinted * SOL_PRICE_USD;
    noMcapUsd = pNo * stateNo.totalSharesMinted * SOL_PRICE_USD;

    // Log significant milestones
    if (round % 50 === 0) {
        // console.log(`   Round ${round}: YES $${(yesMcapUsd/1e6).toFixed(2)}M | NO $${(noMcapUsd/1e6).toFixed(2)}M | TVL: ${(totalTvSol).toFixed(0)} SOL`);
    }
}

console.log(`\n🏁 SIMULATION COMPLETE (Rounds: ${round})`);
console.log(`=============================================================`);
console.log(`📊 FINAL METRICS`);
console.log(`   YES MCAP:  $${(yesMcapUsd / 1e6).toFixed(2)}M  (${stateYes.totalSharesMinted.toLocaleString()} Shares)`);
console.log(`   NO MCAP:   $${(noMcapUsd / 1e6).toFixed(2)}M  (${stateNo.totalSharesMinted.toLocaleString()} Shares)`);
console.log(`   TOTAL POOL (TVL): ${totalTvSol.toLocaleString()} SOL ($${(totalTvSol * SOL_PRICE_USD / 1e6).toFixed(2)}M)`);
console.log(`   FEES GENERATED:   ${(totalCreatorFees + totalProtocolFees).toFixed(2)} SOL ($${((totalCreatorFees + totalProtocolFees) * SOL_PRICE_USD).toLocaleString()})`);
console.log(`=============================================================\n`);

console.log(`🏆 LEADERBOARD (ROI Analysis)`);
console.log(`Agent Type | Side | Invested (SOL) | Value Now (SOL) | ROI (x) | PnL ($)`);
console.log(`--------------------------------------------------------------------------------`);

// Calculate ROI for all agents
// We'll show top 5 winners and bottom 5 (though everyone should be up in a pump only sim)
// Actually early entrants > late entrants

const results = agents.map(a => {
    const pYes = getSpotPrice(stateYes.totalSharesMinted);
    const pNo = getSpotPrice(stateNo.totalSharesMinted);

    const valYes = a.yesShares * pYes;
    const valNo = a.noShares * pNo;
    const totalVal = valYes + valNo;
    const totalInv = a.investedSolYes + a.investedSolNo;

    const roi = totalInv > 0 ? totalVal / totalInv : 0;
    const pnl = (totalVal - totalInv) * SOL_PRICE_USD;

    return { ...a, totalVal, totalInv, roi, pnl };
});

// Sort by ROI
results.sort((a, b) => b.roi - a.roi);

// Show Top 5
results.slice(0, 5).forEach((r, i) => {
    console.log(`${r.name.padEnd(8)} | ALL  | ${r.totalInv.toFixed(1).padEnd(14)} | ${r.totalVal.toFixed(1).padEnd(15)} | ${r.roi.toFixed(2)}x   | +$${r.pnl.toLocaleString()}`);
});
console.log(`...`);
// Show Bottom 3 (Whales who bought the top often have lower ROI % but higher absolute PnL)
results.slice(-3).forEach((r, i) => {
    console.log(`${r.name.padEnd(8)} | ALL  | ${r.totalInv.toFixed(1).padEnd(14)} | ${r.totalVal.toFixed(1).padEnd(15)} | ${r.roi.toFixed(2)}x   | +$${r.pnl.toLocaleString()}`);
});

console.log(`\n💡 INSIGHT:`);
console.log(`- Top ROI are usually MINNOWS or MID who bought early (Round 1-10).`);
console.log(`- WHALES deployed massive capital later to confirm the trend, getting lower multipliers (2-3x) but making millions in absolute profit.`);
console.log(`- The TOTAL POOL (${totalTvSol.toFixed(0)} SOL) is less than the MCAP sum ($50M).`);
console.log(`  Ratio: $1 in the Pool supports ~$${((yesMcapUsd + noMcapUsd) / (totalTvSol * SOL_PRICE_USD)).toFixed(2)} of Market Cap.`);
