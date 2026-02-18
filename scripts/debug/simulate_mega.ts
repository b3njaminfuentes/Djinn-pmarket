
import { getSpotPrice, simulateBuy, simulateSell, MarketState } from './lib/core-amm.ts';

// ------------------------------------------------------------------
// CONFIG
// ------------------------------------------------------------------
const SOL_PRICE_USD = 150;
const NUM_AGENTS = 100;
const PROTOCOL_FEE_PCT = 0.01;
const CREATOR_SPLIT = 0.5;
const TARGET_YES_MCAP = 80_000_000;
const TARGET_NO_MCAP = 40_000_000;

// ------------------------------------------------------------------
// SIMPLE TYPES
// ------------------------------------------------------------------
type Persona = 'CREATOR' | 'WHALE' | 'DGOR' | 'SCALPER' | 'NORMIE';

interface Agent {
    id: string;
    persona: Persona;
    solBalance: number;
    yesShares: number;
    noShares: number;
    totalFeePaid: number;
    startBalance: number; // To calc PnL easily: current + value - start
}

// ------------------------------------------------------------------
// SETUP
// ------------------------------------------------------------------
const agents: Agent[] = [];
let creator: Agent;

// Create Agents
for (let i = 0; i < NUM_AGENTS; i++) {
    let persona: Persona = 'NORMIE';
    let balance = 100;

    if (i === 0) { persona = 'CREATOR'; balance = 50; }
    else if (i < 5) { persona = 'WHALE'; balance = 5000; }
    else if (i < 15) { persona = 'DGOR'; balance = 200; }
    else if (i < 30) { persona = 'SCALPER'; balance = 500; }

    const agent: Agent = {
        id: i === 0 ? 'CREATOR' : `WALLET_${i}`,
        persona,
        solBalance: balance,
        startBalance: balance,
        yesShares: 0,
        noShares: 0,
        totalFeePaid: 0
    };
    agents.push(agent);
}
creator = agents[0];

// Market State
const stateYes: MarketState = { virtualSolReserves: 0, virtualShareReserves: 0, realSolReserves: 0, totalSharesMinted: 0 };
const stateNo: MarketState = { virtualSolReserves: 0, virtualShareReserves: 0, realSolReserves: 0, totalSharesMinted: 0 };

let protocolRevenue = 0;
let creatorRevenue = 0;

// ------------------------------------------------------------------
// LOGIC
// ------------------------------------------------------------------
function buy(agent: Agent, side: 'YES' | 'NO', amountSol: number) {
    if (isNaN(amountSol) || amountSol <= 0) return;
    if (agent.solBalance < amountSol) return;

    const state = side === 'YES' ? stateYes : stateNo;

    // Safety: don't buy if it breaks math
    try {
        const res = simulateBuy(amountSol, state);
        if (isNaN(res.sharesReceived) || isNaN(res.averageEntryPrice)) return;

        // Fees (simulatedBuy returns NET invested, so fee is on top or deducted? 
        // core-amm: amountSol includes fee. 
        // netInvested = amountSol * 0.99. 
        // Fee = amountSol * 0.01.

        const fee = amountSol * PROTOCOL_FEE_PCT;
        const creatorCut = fee * CREATOR_SPLIT;
        const protoCut = fee * (1 - CREATOR_SPLIT);

        // Balances
        agent.solBalance -= amountSol;
        creator.solBalance += creatorCut; // Pay creator
        creatorRevenue += creatorCut;
        protocolRevenue += protoCut;
        agent.totalFeePaid += fee;

        // State
        state.totalSharesMinted += res.sharesReceived;

        // Portfolio
        if (side === 'YES') agent.yesShares += res.sharesReceived;
        else agent.noShares += res.sharesReceived;
    } catch (e) { return; }
}

function sell(agent: Agent, side: 'YES' | 'NO', pct: number) {
    const isYes = side === 'YES';
    const shares = isYes ? agent.yesShares : agent.noShares;
    if (isNaN(shares) || shares <= 0) return;

    const amountToSell = shares * pct;
    if (amountToSell < 0.0001) return;

    const state = isYes ? stateYes : stateNo;

    try {
        // Ensure supply > sell amount checks inside simulator, but we wrap result
        const res = simulateSell(amountToSell, state);

        // Fix: In simulateSell, 'sharesReceived' holds the SOL output (confusing name)
        // and 'feeTotal' holds the fee.
        if (isNaN(res.sharesReceived) || isNaN(res.feeTotal)) return;

        // Fees
        const fee = res.feeTotal;
        const creatorCut = fee * CREATOR_SPLIT;
        const protoCut = fee * (1 - CREATOR_SPLIT);

        // Balances
        agent.solBalance += res.sharesReceived;
        creator.solBalance += creatorCut;
        creatorRevenue += creatorCut;
        protocolRevenue += protoCut;
        agent.totalFeePaid += fee;

        // State
        state.totalSharesMinted -= amountToSell;

        // Portfolio
        if (isYes) agent.yesShares -= amountToSell;
        else agent.noShares -= amountToSell;
    } catch (e) { return; }
}

// ------------------------------------------------------------------
// SIMULATION
// ------------------------------------------------------------------
console.log(`🚀 MEGA SIMULATION STARTING (100 Agents)...`);
let steps = 0;

// Run until targets hit or max steps
while (steps < 5000) {
    steps++;
    const pYes = getSpotPrice(stateYes.totalSharesMinted);
    const pNo = getSpotPrice(stateNo.totalSharesMinted);

    // Check MCAP (Price * Supply * SOL Price)
    const mcapYes = pYes * stateYes.totalSharesMinted * SOL_PRICE_USD;
    const mcapNo = pNo * stateNo.totalSharesMinted * SOL_PRICE_USD;

    if (mcapYes >= TARGET_YES_MCAP && mcapNo >= TARGET_NO_MCAP) break;

    // Random Agent Action
    const agent = agents[Math.floor(Math.random() * NUM_AGENTS)];
    if (agent.id === 'CREATOR') continue; // Creator just collects fees

    // Strategy
    const roll = Math.random();

    // SCALPER (Trade often)
    if (agent.persona === 'SCALPER') {
        if (roll < 0.5) buy(agent, Math.random() > 0.5 ? 'YES' : 'NO', 5 + Math.random() * 10);
        else sell(agent, Math.random() > 0.5 ? 'YES' : 'NO', 0.5); // Sell 50%
    }
    // WHALE (Buy big later)
    else if (agent.persona === 'WHALE') {
        if (roll < 0.1) buy(agent, 'YES', 50 + Math.random() * 200); // Pump YES
    }
    // NORMIE/DGOR
    else {
        if (roll < 0.3) buy(agent, Math.random() > 0.4 ? 'YES' : 'NO', 1 + Math.random() * 5); // Bias YES
        if (roll > 0.9) sell(agent, 'YES', 1.0); // Panic sell YES sometimes
    }
}

// ------------------------------------------------------------------
// RESOLUTION (YES WINS)
// ------------------------------------------------------------------
// 1. Calculate Pot
const yesVault = isNaN(stateYes.totalSharesMinted) || stateYes.totalSharesMinted < 1 ? 0 : simulateSell(stateYes.totalSharesMinted, stateYes).sharesReceived;
const noVault = isNaN(stateNo.totalSharesMinted) || stateNo.totalSharesMinted < 1 ? 0 : simulateSell(stateNo.totalSharesMinted, stateNo).sharesReceived;
const TOTAL_POT = (isNaN(yesVault) ? 0 : yesVault) + (isNaN(noVault) ? 0 : noVault);

console.log(`\n🏆 RESOLUTION: YES WINS`);
console.log(`💰 VAULT: ${TOTAL_POT.toFixed(2)} SOL ($${(TOTAL_POT * SOL_PRICE_USD).toLocaleString()})`);

// 2. Distribute
agents.forEach(a => {
    // Lose NO
    a.noShares = 0;

    // Claim YES
    if (a.yesShares > 0) {
        const share = a.yesShares / stateYes.totalSharesMinted;
        const payout = share * TOTAL_POT;
        a.solBalance += payout;
        a.yesShares = 0; // Burn
    }
});

// ------------------------------------------------------------------
// REPORT
// ------------------------------------------------------------------
console.log(`\n📊 FINAL LEADERBOARD (Net Profit)`);
console.log(`----------------------------------------------------------------`);
console.log(`ID              | Persona    | Fees Paid  | Profit ($)     | ROI`);
console.log(`----------------------------------------------------------------`);

const sorted = [...agents].sort((a, b) => (b.solBalance - b.startBalance) - (a.solBalance - a.startBalance));

sorted.slice(0, 8).forEach(a => {
    const profit = (a.solBalance - a.startBalance) * SOL_PRICE_USD;
    const fees = a.totalFeePaid * SOL_PRICE_USD;
    const roi = ((a.solBalance - a.startBalance) / a.startBalance) * 100;
    console.log(`${a.id.padEnd(15)} | ${a.persona.padEnd(10)} | $${fees.toFixed(0).padEnd(8)} | $${profit.toLocaleString().padEnd(12)} | ${roi.toFixed(0)}%`);
});

console.log(`...`);
// Creator
const c = agents.find(a => a.id === 'CREATOR')!;
const cProfit = (c.solBalance - c.startBalance) * SOL_PRICE_USD;
console.log(`${c.id.padEnd(15)} | CREATOR    | $0         | $${cProfit.toLocaleString().padEnd(12)} | --`);
console.log(`...`);

sorted.slice(-5).forEach(a => {
    const profit = (a.solBalance - a.startBalance) * SOL_PRICE_USD;
    const fees = a.totalFeePaid * SOL_PRICE_USD;
    const roi = ((a.solBalance - a.startBalance) / a.startBalance) * 100;
    console.log(`${a.id.padEnd(15)} | ${a.persona.padEnd(10)} | $${fees.toFixed(0).padEnd(8)} | $${profit.toLocaleString().padEnd(12)} | ${roi.toFixed(0)}%`);
});

console.log(`\n💵 PROTOCOL REVENUE: $${(protocolRevenue * SOL_PRICE_USD).toLocaleString()}`);
