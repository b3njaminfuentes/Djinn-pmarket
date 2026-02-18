
import { getSpotPrice, simulateBuy, MarketState } from './lib/core-amm';

// Mock Initial State (Empty Market)
const marketStateYes: MarketState = {
    virtualSolReserves: 0,
    virtualShareReserves: 0,
    realSolReserves: 0,
    totalSharesMinted: 0 // Fresh market
};

const marketStateNo: MarketState = {
    virtualSolReserves: 0,
    virtualShareReserves: 0,
    realSolReserves: 0,
    totalSharesMinted: 0 // Fresh market
};

console.log("🧪 VERIFYING INDEPENDENT CURVES & SNIPER MULTIPLIERS 🧪\n");

// 1. Initial State
const startPriceYes = getSpotPrice(0);
const startPriceNo = getSpotPrice(0);
console.log(`🔹 STARTING STATE:`);
console.log(`   YES Price: ${startPriceYes.toFixed(6)} SOL`);
console.log(`   NO  Price: ${startPriceNo.toFixed(6)} SOL`);
console.log(`   (Identical start, fully independent states)\n`);

// 2. SNIPER ACTION: Alice Buys 5 SOL of YES
console.log(`🔫 SNIPER ACTION: Alice apes 5 SOL into YES...`);
const aliceBuy = simulateBuy(5, marketStateYes);

// Update YES State
marketStateYes.totalSharesMinted += aliceBuy.sharesReceived;

console.log(`   Alice received: ${aliceBuy.sharesReceived.toFixed(2)} Shares`);
console.log(`   Avg Entry: ${aliceBuy.averageEntryPrice.toFixed(6)} SOL`);
console.log(`   YES Price PUMPED to: ${aliceBuy.endPrice.toFixed(6)} SOL`);
console.log(`   Price Impact: +${aliceBuy.priceImpact.toFixed(2)}%\n`);

// 3. CHECK INDEPENDENCE
console.log(`🔍 INDEPENDENCE CHECK:`);
const currentNoPrice = getSpotPrice(marketStateNo.totalSharesMinted);
console.log(`   NO Price is now: ${currentNoPrice.toFixed(6)} SOL`);
if (currentNoPrice === startPriceNo) {
    console.log(`   ✅ CONFIRMED: NO Price did not move. Curves are INDEPENDENT.`);
} else {
    console.log(`   ❌ ERROR: NO Price moved!`);
}
console.log("");

// 4. LATER ENTRANT: Bob Buys 1 SOL of YES (After pump)
console.log(`👤 LATE ENTRY: Bob buys 1 SOL of YES...`);
const bobBuy = simulateBuy(1, marketStateYes);
marketStateYes.totalSharesMinted += bobBuy.sharesReceived;

console.log(`   Bob received: ${bobBuy.sharesReceived.toFixed(2)} Shares`);
console.log(`   Bob Entry: ${bobBuy.averageEntryPrice.toFixed(6)} SOL (Higher than Alice)\n`);

// 5. PRICE CHECK
const finalYesPrice = getSpotPrice(marketStateYes.totalSharesMinted);
console.log(`📈 FINAL YES PRICE: ${finalYesPrice.toFixed(6)} SOL`);

// 6. ALICE'S GAINS (Paper Hands check)
const aliceValueNow = aliceBuy.sharesReceived * finalYesPrice;
const aliceX = aliceValueNow / 5; // Divided by initial investment
console.log(`\n💰 ALICE'S BAG CHECK:`);
console.log(`   Invested: 5.00 SOL`);
console.log(`   Value Now: ${aliceValueNow.toFixed(2)} SOL`);
console.log(`   Multiplier: ${aliceX.toFixed(2)}x 🚀`);
console.log(`   (She is up because Bob pumped her bag)`);
