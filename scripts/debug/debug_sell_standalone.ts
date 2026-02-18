
// STANDALONE DEBUG SCRIPT with INLINED LOGIC

// --- CONSTANTS ---
const TOTAL_SUPPLY = 1_000_000_000;
const VIRTUAL_OFFSET = 1_000_000;   // 1M
const PHASE1_END = 100_000_000;
const PHASE2_END = 200_000_000;
const PHASE3_START = 200_000_000;

const P_START = 0.000001;
const P_50 = 0.000025;
const P_90 = 0.00025;
const P_MAX = 0.95;

const LINEAR_SLOPE = (P_50 - P_START) / PHASE1_END;

// --- MATH ---
function getSpotPrice(sharesSupply: number): number {
    const effectiveSupply = sharesSupply + VIRTUAL_OFFSET;

    if (effectiveSupply <= PHASE1_END) {
        return P_START + LINEAR_SLOPE * effectiveSupply;
    } else if (effectiveSupply <= PHASE2_END) {
        const progress = effectiveSupply - PHASE1_END;
        const range = PHASE2_END - PHASE1_END;
        const ratio = progress / range;
        const ratio_sq = ratio * ratio;
        const price_delta = (P_90 - P_50) * ratio_sq;
        return P_50 + price_delta;
    } else {
        const x_rel = effectiveSupply - PHASE3_START;
        const kz = 1.25 * x_rel;
        const norm_sig = Math.min(1_000_000_000, Math.max(0, kz));
        const price_delta = (P_MAX - P_90) * norm_sig / 1_000_000_000;
        return P_90 + price_delta;
    }
}

function getCostInContract(supplyOld: number, supplyNew: number): number {
    if (supplyNew <= supplyOld) return 0;
    const pOld = getSpotPrice(supplyOld);
    const pNew = getSpotPrice(supplyNew);
    const delta = supplyNew - supplyOld;
    return (pOld + pNew) / 2 * delta;
}

function solveForShares(currentSupply: number, netSolInvested: number): number {
    let low = currentSupply;
    let high = TOTAL_SUPPLY;
    for (let i = 0; i < 50; i++) {
        const mid = (low + high) / 2;
        const cost = getCostInContract(currentSupply, mid);
        if (cost < netSolInvested) {
            low = mid;
        } else {
            high = mid;
        }
        if (high - low < 0.001) break;
    }
    return low - currentSupply;
}

// --- SIMULATION ---
function simulateBuy(amountSol: number, currentSupply: number) {
    const feeRateTotal = 0.01;
    const feeTotal = amountSol * feeRateTotal;
    const netInvestedSol = amountSol - feeTotal;
    const rawShares = solveForShares(currentSupply, netInvestedSol);
    const sharesReceived = rawShares * 0.95; // Safety buffer
    return { sharesReceived };
}

function simulateSell(sharesToSell: number, currentSupply: number) {
    if (sharesToSell > currentSupply) sharesToSell = currentSupply;

    // Exact logic from contract
    const grossSolReturned = getCostInContract(currentSupply - sharesToSell, currentSupply);

    const feeRateTotal = 0.01;
    const feeTotal = grossSolReturned * feeRateTotal;
    const netSolOut = grossSolReturned - feeTotal;

    return { netInvested: grossSolReturned, sharesReceived: netSolOut };
}

// --- EXECUTION ---
async function runDebug() {
    console.log("--- DEBUG SELL SCENARIO ---");
    console.log(`VIRTUAL_OFFSET: ${VIRTUAL_OFFSET}`);
    console.log(`P_50: ${P_50}`);

    let currentSupply = 0;

    // 1. User A buys 1 SOL
    console.log("\n1. Buying 1 SOL (User A)...");
    const buy1 = simulateBuy(1.0, currentSupply);
    console.log(`Shares Received: ${buy1.sharesReceived}`);
    console.log(`User A Holds: ${buy1.sharesReceived} shares`);
    currentSupply += buy1.sharesReceived;
    console.log(`Global Supply: ${currentSupply}`);

    // 2. User B buys 40 SOL
    console.log("\n2. Buying 40 SOL (User B)...");
    const buy2 = simulateBuy(40.0, currentSupply);
    console.log(`Shares Received: ${buy2.sharesReceived}`);
    currentSupply += buy2.sharesReceived;
    console.log(`Global Supply: ${currentSupply}`);
    console.log(`Current Spot Price: ${getSpotPrice(currentSupply)} SOL`);

    // 3. User A sells their shares
    const sharesToSell = 883200; // From screenshot
    console.log(`\n3. Selling ${sharesToSell} shares (User A)...`);

    const sellSim = simulateSell(sharesToSell, currentSupply);

    console.log(`Gross SOL Returned: ${sellSim.netInvested}`);
    console.log(`Net SOL Returned (User Get): ${sellSim.sharesReceived}`);

    if (sellSim.sharesReceived > 100) {
        console.error("\n❌ ERROR: PROFIT IS IMPOSSIBLY HIGH! (Bug Repro)");
    } else {
        console.log("\n✅ Result seems plausible.");
    }
}

runDebug();
