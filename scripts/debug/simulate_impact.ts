
import { simulateBuy, calculateImpliedProbability, MarketState } from './lib/core-amm';

const amounts = [1, 2, 4, 5, 10];

console.log("--- SIMULATION RESULTS (Fresh Market) ---");
console.log("Virtual Floor (Buffer): 15,000,000 shares");

amounts.forEach(sol => {
    // 1. BUY SHARES
    const state: MarketState = {
        virtualSolReserves: 0,
        virtualShareReserves: 0,
        realSolReserves: 0,
        totalSharesMinted: 0 // Fresh market
    };

    const sim = simulateBuy(sol, state);
    const sharesBought = sim.sharesReceived;

    // 2. CALCULATE PROBABILITY SHIFT
    // Before: 0 vs 0 (with 15M buffer) -> 50%
    // After: sharesBought vs 0 (with 15M buffer)

    const prob = calculateImpliedProbability(sharesBought, 0);

    console.log(`\n💰 Buy Amount: ${sol} SOL`);
    console.log(`   Shares Received: ${sharesBought.toLocaleString()}`);
    console.log(`   Avg Price: ${sim.averageEntryPrice.toFixed(6)} SOL`);
    console.log(`   New Probability: ${prob.toFixed(2)}%`);
    console.log(`   Price Impact (Curve): ${sim.priceImpact.toFixed(2)}%`);
});
