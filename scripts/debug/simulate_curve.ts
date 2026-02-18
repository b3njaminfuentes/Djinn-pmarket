
// MOCK CONSTANTS FROM core-amm.ts
const PHASE1_END = 100_000_000;


// Mocking constants for simulation
const TOTAL_SUPPLY = 1_000_000_000;
const LAMPORT = 0.000000001;

function simulateCurve(name: string, pStart: number, p50: number, offset: number) {
    console.log(`\n--- ${name} ---`);
    console.log(`P_Start: ${pStart / LAMPORT} lamports`);
    console.log(`P_50: ${p50 / LAMPORT} lamports`);
    console.log(`Offset: ${(offset / 1_000_000).toFixed(1)}M shares`);

    const linearSlope = (p50 - pStart) / PHASE1_END;

    // Function to get price at supply s
    const getP = (s: number) => {
        const eff = s + offset;
        if (eff <= PHASE1_END) return pStart + linearSlope * eff;
        return p50; // Simplified for Phase 1 check
    };

    const startPrice = getP(0);
    console.log(`Start Price: ${(startPrice / LAMPORT).toFixed(0)} lamports`);

    // Target Multipliers
    const targets = [2, 5, 10, 100];

    for (const x of targets) {
        const targetPrice = startPrice * x;

        // Find supply needed for target price (Phase 1 inverse)
        // P = P_start + m * (s + offset)
        // P - P_start = m*s + m*offset
        // m*s = P - P_start - m*offset
        // s = (P - P_start)/m - offset

        // Actually, P = P_start + m * eff
        // eff = (P - P_start) / m
        // s = eff - offset

        if (targetPrice > p50 && name !== "Current") {
            // If target is beyond P_50, linear approx fails, but for "early pump" usually within 100M is key
            // Let's just stick to Phase 1 for "Early" feel
        }

        let supplyNeeded = (targetPrice - pStart) / linearSlope - offset;

        if (supplyNeeded < 0) supplyNeeded = 0; // Should not happen if x >= 1

        // Cost integration (Trapezoid)
        // Cost = (P_0 + P_target) / 2 * supplyNeeded
        const cost = (startPrice + targetPrice) / 2 * supplyNeeded;

        console.log(`${x}x Price (${(targetPrice / LAMPORT).toFixed(0)} lamps): Requires +${(supplyNeeded / 1_000_000).toFixed(2)}M Shares | Cost: ${cost.toFixed(2)} SOL`);
    }
}

// 1. Current
// P_START = 1000 lamps, P_50 = 5000 lamps, Slope = 4000/100M
// Offset 12M. Start Price = 1000 + (4000/100M)*12M = 1000 + 480 = 1480 lamps.
simulateCurve("Current (Safe)", 0.000001, 0.000005, 12_000_000);

// 2. Pump Style (Steeper Slope, Lower Offset)
// P_START = 1000 lamps.
// We want 2x (2000 lamps) at ~5 SOL cost.
// Try P_50 = 25,000 lamps (0.000025). Slope = 24000/100M.
// Offset = 1M. Start Price = 1000 + 240 = 1240 lamps.
simulateCurve("Pump Mode (Aggressive)", 0.000001, 0.000025, 1_000_000);

// 3. Super Degen
// P_50 = 50,000 lamps. Offset = 0.
simulateCurve("Super Degen (Moon)", 0.000001, 0.000050, 0);
