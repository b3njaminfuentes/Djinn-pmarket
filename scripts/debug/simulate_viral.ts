
import { getSpotPrice, simulateBuy, MarketState } from './lib/core-amm.ts';

// ------------------------------------------------------------------
// CONFIG
// ------------------------------------------------------------------
const SOL_PRICE_USD = 150; // Assume $150 per SOL for readability
const TARGET_MCAP_USD_YES = 10_000_000; // $10M
const TARGET_MCAP_USD_NO = 8_000_000;   // $8M

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

// ------------------------------------------------------------------
// SIMULATION
// ------------------------------------------------------------------
console.log(`\n🚀 VIRAL GROWTH SIMULATION (SOL @ $${SOL_PRICE_USD})\n`);

// 1. ALICE SNIPES EARLY
const aliceInvest = 1.0; // 1 SOL
const aliceBuy = simulateBuy(aliceInvest, stateYes);
stateYes.totalSharesMinted += aliceBuy.sharesReceived;

console.log(`🔹 ROUND 1: ALICE SNIPES (The First Believer)`);
console.log(`   Invested: ${aliceInvest.toFixed(2)} SOL ($${(aliceInvest * SOL_PRICE_USD).toFixed(2)})`);
console.log(`   Price:    ${aliceBuy.averageEntryPrice.toFixed(6)} SOL`);
console.log(`   Shares:   ${aliceBuy.sharesReceived.toFixed(0)}`);
console.log(`   Current Value: ${aliceInvest.toFixed(2)} SOL (1.00x)`);
console.log(`   (Alice is NOT up yet. She needs others to buy.)\n`);


// 2. THE CROWD PUMPS YES TO $10M MCAP
console.log(`🌊 ROUND 2: THE CROWD ARRIVES (Pumping YES)...`);

let crowdInvestedYes = 0;
const milestones = [100_000, 1_000_000, 5_000_000, 10_000_000]; // USD Milestones
let nextMilestoneIdx = 0;

while (true) {
    const currentPrice = getSpotPrice(stateYes.totalSharesMinted);
    const mcapSol = currentPrice * stateYes.totalSharesMinted;
    const mcapUsd = mcapSol * SOL_PRICE_USD;

    // Check Milestone
    if (nextMilestoneIdx < milestones.length && mcapUsd >= milestones[nextMilestoneIdx]) {
        const m = milestones[nextMilestoneIdx];
        const aliceVal = aliceBuy.sharesReceived * currentPrice;
        const x = aliceVal / aliceInvest;

        console.log(`   🌟 MILESTONE HIT: $${(m / 1_000_000).toFixed(1)}M MCAP`);
        console.log(`      Supply: ${(stateYes.totalSharesMinted / 1_000_000).toFixed(1)}M Shares`);
        console.log(`      Price:  ${currentPrice.toFixed(5)} SOL ($${(currentPrice * SOL_PRICE_USD).toFixed(3)})`);
        console.log(`      Alice's Bag: ${aliceVal.toFixed(2)} SOL ($${(aliceVal * SOL_PRICE_USD).toFixed(0)})`);
        console.log(`      Alice's Multiplier: ${x.toFixed(2)}x 🚀`);
        console.log(`      ---------------------------------------`);
        nextMilestoneIdx++;
    }

    if (mcapUsd >= TARGET_MCAP_USD_YES) break;

    // Simulate a random buy (Wallet X buys 5-50 SOL)
    const buyAmt = 5 + Math.random() * 45;
    const res = simulateBuy(buyAmt, stateYes);
    stateYes.totalSharesMinted += res.sharesReceived;
    crowdInvestedYes += buyAmt;
}

console.log(`\n✅ YES MARKET REACHED $${(TARGET_MCAP_USD_YES / 1_000_000).toFixed(1)}M MCAP`);
console.log(`   Total Crowd SOL In: ${crowdInvestedYes.toFixed(2)} SOL`);
console.log(`   Alice Final:        ${(aliceBuy.sharesReceived * getSpotPrice(stateYes.totalSharesMinted)).toFixed(2)} SOL`);
console.log(`   (It was the ${crowdInvestedYes.toFixed(0)} SOL from the crowd that pushed Alice up)\n`);


// 3. THE NO MARKET (Independent Pump)
console.log(`🛡️ ROUND 3: NO SIDE PUMP (Verifying Independence)`);
console.log(`   Currently NO is at $0 MCAP. Does YES pump affect it?`);
const priceNo = getSpotPrice(stateNo.totalSharesMinted);
console.log(`   NO Price: ${priceNo.toFixed(6)} SOL (Still Floor Price)`);
console.log(`   (Confirmed: YES pump did nothing to NO)\n`);

console.log(`   Now pumping NO to $8M independently...`);

let crowdInvestedNo = 0;
while (true) {
    const currentPrice = getSpotPrice(stateNo.totalSharesMinted);
    const mcapSol = currentPrice * stateNo.totalSharesMinted;
    const mcapUsd = mcapSol * SOL_PRICE_USD;

    if (mcapUsd >= TARGET_MCAP_USD_NO) break;

    const buyAmt = 10 + Math.random() * 90;
    const res = simulateBuy(buyAmt, stateNo);
    stateNo.totalSharesMinted += res.sharesReceived;
    crowdInvestedNo += buyAmt;
}

console.log(`✅ NO MARKET REACHED $${(TARGET_MCAP_USD_NO / 1_000_000).toFixed(1)}M MCAP`);
console.log(`   NO Supply: ${(stateNo.totalSharesMinted / 1_000_000).toFixed(1)}M Shares`);
console.log(`   YES Supply: ${(stateYes.totalSharesMinted / 1_000_000).toFixed(1)}M Shares`);
console.log(`   (Both curves scaled independently based on their own volume)`);
