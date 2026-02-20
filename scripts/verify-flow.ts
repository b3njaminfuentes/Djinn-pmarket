import * as anchor from "@project-serum/anchor";
// @ts-ignore
import BN from "bn.js";
const Program = anchor.Program;
import { PublicKey, Keypair, SystemProgram, LAMPORTS_PER_SOL, Transaction, sendAndConfirmTransaction, SYSVAR_RENT_PUBKEY } from "@solana/web3.js";
import { getAssociatedTokenAddress, createAssociatedTokenAccountIdempotentInstruction, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import fs from 'fs';
import path from 'path';

// --- CONFIGURATION ---
const PROGRAM_ID = new PublicKey("9xXGnGG4hxwC4XTHavmy5BWAdb8MC2VJtTDMW9FfkGbg");
const G1_TREASURY = new PublicKey("G1NaEsx5Pg7dSmyYy6Jfraa74b7nTbmN9A9NuiK171Ma");
const IDL_PATH = path.resolve(process.cwd(), "lib/idl/djinn_market.json");

// Load IDL
const idl = JSON.parse(fs.readFileSync(IDL_PATH, 'utf8'));

// Setup Provider
// Using the local config wallet usually ~/.config/solana/id.json or the one in app
// We will use the 'deploy-wallet.json' if available, or default anchor env.
process.env.ANCHOR_WALLET = process.env.ANCHOR_WALLET || path.resolve(process.env.HOME || "/Users/benjaminfuentes", ".config/solana/id.json");
const provider = anchor.AnchorProvider.env();
anchor.setProvider(provider);

const program = new Program(idl, PROGRAM_ID, provider);
const connection = provider.connection;

// --- LOGGING UTILS ---
const log = (msg: string) => console.log(`[TEST] ${msg}`);
const divider = () => console.log("---------------------------------------------------");

async function getBalance(pubkey: PublicKey): Promise<number> {
    return await connection.getBalance(pubkey);
}

async function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function airDrop(to: PublicKey, amountSOL: number) {
    try {
        const sig = await connection.requestAirdrop(to, amountSOL * LAMPORTS_PER_SOL);
        await connection.confirmTransaction(sig);
        log(`Creating/Funding user: ${to.toBase58()} (+${amountSOL} SOL)`);
    } catch (e) {
        log(`Airdrop failed (Rate limit?). Assuming wallet has funds.`);
    }
}

// --- MAIN TEST FLOW ---
async function main() {
    divider();
    log("🚀 STARTING DJINN PROTOCOL VALIDATION (G1 ARCHITECTURE)");
    log(`Network: ${connection.rpcEndpoint}`);
    log(`Program ID: ${PROGRAM_ID.toBase58()}`);
    log(`G1 Treasury: ${G1_TREASURY.toBase58()}`);
    divider();

    // 1. Setup Test User (PROVIDER WALLET - FUNDED)
    const user = (provider.wallet as any).payer as Keypair;
    log(`User Wallet: ${user.publicKey.toBase58()}`);

    // airDrop disabled as we use funded wallet

    const startBalance = await getBalance(user.publicKey);
    log(`User Balance: ${(startBalance / LAMPORTS_PER_SOL).toFixed(4)} SOL`);

    // G1 Balance Baseline
    let g1BalanceBefore = await getBalance(G1_TREASURY);
    log(`G1 Treasury Baseline: ${(g1BalanceBefore / LAMPORTS_PER_SOL).toFixed(4)} SOL`);

    // --- STEP 1: CREATE MARKET ---
    divider();
    log("1. CREATING MARKET (Fee: 0.05 SOL to G1)");

    // Create Market
    const title = `Verification Test ${Date.now()}`;
    const slug = `test-market-${Date.now()}`;
    const [marketPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("market"), user.publicKey.toBuffer(), Buffer.from(title)],
        PROGRAM_ID
    );
    const [yesMint] = PublicKey.findProgramAddressSync([Buffer.from("yes_mint"), marketPda.toBuffer()], PROGRAM_ID);
    const [noMint] = PublicKey.findProgramAddressSync([Buffer.from("no_mint"), marketPda.toBuffer()], PROGRAM_ID);
    const [protocolStatePda] = PublicKey.findProgramAddressSync([Buffer.from("protocol")], PROGRAM_ID);

    // Ensure Protocol is initialized (Treasury check)
    try {
        const state = await (program.account as any).protocolState.fetch(protocolStatePda) as any;
        log(`Protocol State found. Authority: ${state.authority.toBase58()}`);
    } catch (e) {
        log("Protocol State not found. Initializing...");
        await program.methods.initializeProtocol().accounts({
            protocolState: protocolStatePda,
            authority: user.publicKey,
            treasury: G1_TREASURY,
            systemProgram: SystemProgram.programId
        }).rpc();
        log("Protocol Initialized.");
    }
    const endDate = new BN(Math.floor(Date.now() / 1000) + 3600 * 24); // 24h

    await program.methods.createMarket(title, 200, endDate)
        .accounts({
            market: marketPda,
            yesTokenMint: yesMint,
            noTokenMint: noMint,
            creator: user.publicKey,
            protocolState: protocolStatePda,
            protocolTreasury: G1_TREASURY, // Direct Pass
            tokenProgram: TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
            rent: SYSVAR_RENT_PUBKEY,
        })
        .signers([user])
        .rpc();

    log(`Market Created: ${marketPda.toBase58()}`);

    // Verify Creation Fee
    let g1BalanceAfter = await getBalance(G1_TREASURY);
    let delta = g1BalanceAfter - g1BalanceBefore;
    log(`G1 Balance Change: +${(delta / LAMPORTS_PER_SOL).toFixed(5)} SOL`);

    if (Math.abs(delta - 50000000) < 10000) { // 0.05 SOL = 50,000,000 lamports
        log("✅ CHECK PASS: 0.05 SOL Creation Fee received.");
    } else {
        log("❌ CHECK FAIL: Incorrect Creation Fee.");
    }
    g1BalanceBefore = g1BalanceAfter; // Reset Baseline

    // --- STEP 2: BUY (5 SOL) ---
    divider();
    log("2. BUYING SHARES (5 SOL) -> Fee Check (0.5% G1 / 0.5% Creator)");

    // Create ATAs
    const userYesATA = await getAssociatedTokenAddress(yesMint, user.publicKey);
    const userNoATA = await getAssociatedTokenAddress(noMint, user.publicKey);

    // Bundle ATA creation if needed (usually idempotent via hook, here we do manually if needed or let anchor handle?)
    // Anchor doesn't auto-create ATAs usually unless specified. We'll pre-create instruction in tx if possible or just use preInstructions.
    // Actually, let's just use a helper or trust idempotency if invoked via separate tx? Use simple logic.

    const buyAmountSol = 1;
    const buyAmountLamports = new BN(buyAmountSol * LAMPORTS_PER_SOL);

    // We expect Fee = 1% = 0.05 SOL.
    // G1 = 0.025 SOL.
    // Creator (User) = 0.025 SOL (Claimable). Since User is Creator, checking claimable balance of market or User SOL?
    // User pays 5 SOL. 4.95 goes to curve. 0.025 to G1. 0.025 stays in Market PDA (claimable).

    await program.methods.placeBet({ yes: {} }, buyAmountLamports, new BN(0))
        .accounts({
            market: marketPda,
            user: user.publicKey,
            yesTokenMint: yesMint,
            noTokenMint: noMint,
            userYesAccount: userYesATA,
            userNoAccount: userNoATA,
            protocolTreasury: G1_TREASURY,
            tokenProgram: TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
        })
        .preInstructions([
            createAssociatedTokenAccountIdempotentInstruction(user.publicKey, userYesATA, user.publicKey, yesMint),
            createAssociatedTokenAccountIdempotentInstruction(user.publicKey, userNoATA, user.publicKey, noMint)
        ])
        .signers([user])
        .rpc();

    log("Buy Executed.");

    // Verify Buy Fees
    g1BalanceAfter = await getBalance(G1_TREASURY);
    delta = g1BalanceAfter - g1BalanceBefore;
    log(`G1 Balance Change: +${(delta / LAMPORTS_PER_SOL).toFixed(5)} SOL`);

    const expectedProtocolShare = buyAmountSol * 0.005 * LAMPORTS_PER_SOL;

    if (user.publicKey.equals(G1_TREASURY)) {
        log("ℹ️ User IS G1 Treasury. Expecting 100% Fee (1%) to G1 (No split).");
        const fullFee = buyAmountSol * 0.01 * LAMPORTS_PER_SOL;
        if (Math.abs(delta - fullFee) < 500000) { // Tolerance
            log(`✅ CHECK PASS: 1.0% Fee (${fullFee / LAMPORTS_PER_SOL} SOL) retained by G1.`);
        } else {
            log(`❌ CHECK FAIL: Expected ${fullFee / LAMPORTS_PER_SOL}, got ${delta / LAMPORTS_PER_SOL}`);
        }
    } else {
        if (Math.abs(delta - expectedProtocolShare) < 10000) {
            log(`✅ CHECK PASS: 0.5% Fee (${expectedProtocolShare / LAMPORTS_PER_SOL} SOL) received by G1.`);
        } else {
            log(`❌ CHECK FAIL: Expected ${expectedProtocolShare / LAMPORTS_PER_SOL}, got ${delta / LAMPORTS_PER_SOL}`);
        }
    }

    // Check Creator Claimable
    const marketAccount = await (program.account as any).market.fetch(marketPda);
    const claimable = (marketAccount as any).creatorFeesClaimable.toNumber();
    log(`Market Creator Fees Claimable: ${claimable / LAMPORTS_PER_SOL} SOL`);

    if (user.publicKey.equals(G1_TREASURY)) {
        if (claimable === 0) {
            log("✅ CHECK PASS: Creator Fees are 0 (G1 Owner Logic Verified).");
        } else {
            log(`❌ CHECK FAIL: Creator Fees > 0 (${claimable}) for G1 Owner.`);
        }
    } else {
        if (Math.abs(claimable - expectedProtocolShare) < 10000) {
            log("✅ CHECK PASS: 0.5% Fee allocated to Creator.");
        } else {
            log(`❌ CHECK FAIL: Incorrect Creator allocation.`);
        }
    }

    g1BalanceBefore = g1BalanceAfter;

    // --- STEP 3: SELL (Immediate) ---
    divider();
    log("3. SELLING SHARES -> Fee Check (1% Total)");
    // User wants to sell "some" shares. Let's sell half of what we got.
    const userYesAccount = await connection.getTokenAccountBalance(userYesATA);
    const sharesHeld = userYesAccount.value.amount; // String
    const sharesToSell = new BN(sharesHeld).div(new BN(2)); // Sell 50%
    log(`Holding ${sharesHeld} shares. Selling ${sharesToSell.toString()}.`);

    // Note: Sell pays 1% fees.

    await program.methods.sellShares({ yes: {} }, sharesToSell, new BN(0))
        .accounts({
            market: marketPda,
            user: user.publicKey,
            yesTokenMint: yesMint,
            noTokenMint: noMint,
            userYesAccount: userYesATA,
            userNoAccount: userNoATA,
            protocolTreasury: G1_TREASURY,
            tokenProgram: TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
        })
        .signers([user])
        .rpc();

    log("Sell Executed.");

    // Verify Sell Fees
    g1BalanceAfter = await getBalance(G1_TREASURY);
    delta = g1BalanceAfter - g1BalanceBefore;
    log(`G1 Balance Change (Sell): +${(delta / LAMPORTS_PER_SOL).toFixed(5)} SOL`);

    // We confirm G1 received *something* (Sell always pays). 
    // Since output SOL varies by curve, exact calculation is complex here, but positive delta confirms fee logic.
    if (delta > 0) {
        log("✅ CHECK PASS: G1 received trading fee from Sell.");
    } else {
        log("❌ CHECK FAIL: G1 received no fee execution on Sell.");
    }
    g1BalanceBefore = g1BalanceAfter;

    // --- STEP 4: ANTI-BOT (Same Slot Buy + Sell) ---
    divider();
    log("4. FIRE TEST: ANTI-BOT (Buy + Sell in Same Tx)");

    const botAmountSol = 1;
    const botAmountLamports = new BN(botAmountSol * LAMPORTS_PER_SOL);

    const tx = new Transaction();

    // Instruction 1: Buy
    const buyIx = await program.methods.placeBet({ yes: {} }, botAmountLamports, new BN(0))
        .accounts({
            market: marketPda,
            user: user.publicKey,
            yesTokenMint: yesMint,
            noTokenMint: noMint,
            userYesAccount: userYesATA,
            userNoAccount: userNoATA,
            protocolTreasury: G1_TREASURY,
            tokenProgram: TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
        })
        .instruction();

    // Instruction 2: Sell (Immediate Dump of what we just bought? Hard to know exact shares.)
    // We'll sell a fixed amount we know we have (from previous remaining balance).
    const botSellShares = new BN(1000000000); // 1 share (assuming 9 decimals)

    const sellIx = await program.methods.sellShares({ yes: {} }, botSellShares, new BN(0))
        .accounts({
            market: marketPda,
            user: user.publicKey,
            yesTokenMint: yesMint,
            noTokenMint: noMint,
            userYesAccount: userYesATA,
            userNoAccount: userNoATA,
            protocolTreasury: G1_TREASURY,
            tokenProgram: TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
        })
        .instruction();

    tx.add(buyIx);
    tx.add(sellIx);

    log("Sending Bundled Tx (Buy -> Sell)...");
    const sig = await sendAndConfirmTransaction(connection, tx, [user]);
    log(`Tx Confirmed: ${sig}`);

    // Verify Anti-Bot Fee
    // Standard Fee = 1%. Anti-Bot = 15%.
    // Check Logs? Or Check Balance Delta.
    // We essentially check if G1 got a HUGE chunk.
    g1BalanceAfter = await getBalance(G1_TREASURY);
    delta = g1BalanceAfter - g1BalanceBefore;
    log(`G1 Balance Change (Anti-Bot): +${(delta / LAMPORTS_PER_SOL).toFixed(5)} SOL`);

    // Estimations:
    // Buy 1 SOL -> 1% Standard (0.5% G1) -> 0.005 SOL to G1. (Bot fee usually applies if PREVIOUS tx was same slot, or if logic applies to current tx... 
    // Wait, PlaceBet applies logic: If last_trade_slot == current... 
    // Is PlaceBet penalized on the FIRST instruction? NO. It sets the slot.
    // The SELL (2nd instruction) sees the slot set by PlaceBet. 
    // So SELL should be penalized.
    // Sell Amount Out ~ Price * 1 share.
    // If Penalty is 15%, G1 should get ~15% of that 1 share's value.
    if (delta > 0.006 * LAMPORTS_PER_SOL) { // > 0.6% implies higher than standard 0.5%
        log("✅ CHECK PASS: High Fee Detected (Anti-Bot likely active).");
    } else {
        log("⚠️ CHECK WARNING: Fee seems normal. Did Anti-Bot trigger?");
    }

    // --- STEP 5: RESOLUTION ---
    divider();
    log("5. RESOLUTION & CLAIM (2% Fee Check)");

    await program.methods.resolveMarket({ yes: {} })
        .accounts({
            market: marketPda,
            authority: user.publicKey, // We are creator? No, authority is G1Na...
            // Wait, Authoriy is in ProtocolState.
            // If User is NOT G1Na, user cannot resolve.
            // But we checked earlier: `protocol.authority = ctx.accounts.authority.key()`.
            // When we initialized, we set Authority to... User? 
            // In InitializeProtocol: `authority: user.publicKey`. 
            // Ah, wait. Protocol Authority was initialized to `user.publicKey` in this script (Step 1 init).
            // So User CAN resolve.
            protocolState: protocolStatePda,
        })
        .signers([user])
        .rpc();

    log("Market Resolved to YES.");

    // Try Claim
    log("Attempting to Claim Rewards (Should Fail due to Timelock)...");
    try {
        await program.methods.claimReward()
            .accounts({
                market: marketPda,
                user: user.publicKey,
                yesTokenMint: yesMint,
                noTokenMint: noMint,
                userYesAccount: userYesATA,
                userNoAccount: userNoATA,
                protocolTreasury: G1_TREASURY,
                tokenProgram: TOKEN_PROGRAM_ID,
            })
            .signers([user])
            .rpc();
        log("❌ CHECK FAIL: Claim succeeded immediately (Timelock not working?).");
    } catch (e: any) {
        if (e.toString().includes("TimelockActive") || e.toString().includes("0x1776")) { // 6006 decimal?
            log("✅ CHECK PASS: Claim blocked by Timelock (Security Active).");
        } else {
            log(`⚠️ Claim failed with unexpected error: ${e.message}`);
        }
    }

    divider();
    log("🏁 VALIDATION COMPLETE");
    divider();
}

main().catch(e => console.error(e));
