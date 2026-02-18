
import { simulateSell, simulateBuy, getSpotPrice, MarketState, VIRTUAL_OFFSET, P_50, P_90 } from './lib/core-amm.ts';

async function runDebug() {
    console.log("--- DEBUG SELL SCENARIO ---");
    console.log(`VIRTUAL_OFFSET: ${VIRTUAL_OFFSET}`);
    console.log(`P_50: ${P_50}`);
    console.log(`P_90: ${P_90}`);

    // Scenario 1: Fresh Market.
    // User A buys 1 SOL.
    const startState: MarketState = {
        virtualSolReserves: 0,
        virtualShareReserves: 0,
        realSolReserves: 0,
        totalSharesMinted: 0
    };

    console.log("\n1. Buying 1 SOL (User A)...");
    const buy1 = simulateBuy(1.0, startState);
    console.log(`Shares Received: ${buy1.sharesReceived}`);
    console.log(`New Supply: ${buy1.sharesReceived}`);
    console.log(`Price Impact: ${buy1.priceImpact}%`);

    // Update State
    let currentSupply = buy1.sharesReceived;

    // Scenario 2: User B buys 40 SOL.
    console.log("\n2. Buying 40 SOL (User B)...");
    const buy2 = simulateBuy(40.0, { ...startState, totalSharesMinted: currentSupply });
    console.log(`Shares Received: ${buy2.sharesReceived}`);
    console.log(`Price Impact: ${buy2.priceImpact}%`);

    currentSupply += buy2.sharesReceived;
    console.log(`Total Supply after pump: ${currentSupply}`);
    console.log(`Current Spot Price: ${getSpotPrice(currentSupply)} SOL`);

    // Scenario 3: User A sells their shares.
    const sharesToSell = buy1.sharesReceived; // Sell exact amount bought
    // Or simpler: 883,200 shares as in screenshot
    const sharesManual = 883200;

    console.log(`\n3. Selling ${sharesManual} shares (User A)...`);

    const sellSim = simulateSell(sharesManual, { ...startState, totalSharesMinted: currentSupply });

    console.log(`Gross SOL Returned: ${sellSim.netInvested}`);
    console.log(`Net SOL Returned (User Get): ${sellSim.sharesReceived}`);

    // Sanity Check
    if (sellSim.sharesReceived > 100) {
        console.error("\n❌ ERROR: PROFIT IS IMPOSSIBLY HIGH!");
    } else {
        console.log("\n✅ Result seems plausible (within liquidity).");
    }
}

runDebug();
