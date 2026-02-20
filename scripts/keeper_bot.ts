/**
 * CHRONOS KEEPER BOT
 * ==================
 * Automated market creation and resolution for Djinn Majors
 * 
 * Features:
 * - Creates hourly markets for BTC, ETH, SOL
 * - Resolves expired markets using Pyth prices
 * - Runs on a cron schedule (every 5 minutes for resolution checks)
 * 
 * Usage:
 *   npx ts-node scripts/keeper_bot.ts
 */

import * as anchor from "@coral-xyz/anchor";
import { Program, AnchorProvider, BN, web3 } from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey, clusterApiUrl } from "@solana/web3.js";
import * as fs from "fs";
import * as path from "path";

// ═══════════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════════

// Pyth Price Feed IDs (Mainnet)
const PYTH_FEEDS = {
    BTC: new PublicKey("GVXRSBjFk6e6J3NbVPXohDJetcTjaeeuykUpbQF8UoMU"),
    ETH: new PublicKey("JBu1AL4obBcCMqKBBxhpWCNUt136ijcuMZLFvtp7Nq7j"),
    SOL: new PublicKey("H6ARHf6YXhGYeQfUzQNGk6rDNnLBQKrenN712K4AQJEG"),
};

// Asset enum mapping
enum AssetType {
    BTC = 0,
    ETH = 1,
    SOL = 2,
}

// Interval enum mapping
enum MarketInterval {
    FifteenMinutes = 0,
    OneHour = 1,
}

// Program ID
const PROGRAM_ID = new PublicKey("A8pVMgP6vwjGqcbYh1WGWDjXq9uwQRoF9Lz1siLmD7nm");

// Treasury
const TREASURY = new PublicKey("G1NaEsx5Pg7dSmyYy6Jfraa74b7nTbmN9A9NuiK171Ma");

// ═══════════════════════════════════════════════════════════════════════════════
// PYTH PRICE PARSING
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Parse Pyth price from account data
 * Returns price in USD cents
 */
function parsePythPrice(data: Buffer): number {
    // Price at offset 208 (i64)
    const price = data.readBigInt64LE(208);
    // Exponent at offset 216 (i32)
    const expo = data.readInt32LE(216);

    // Convert to cents
    const priceCents = Number(price) * Math.pow(10, expo + 2);
    return Math.round(priceCents);
}

/**
 * Fetch current price from Pyth
 */
async function fetchPythPrice(
    connection: Connection,
    priceFeed: PublicKey
): Promise<number> {
    const accountInfo = await connection.getAccountInfo(priceFeed);
    if (!accountInfo) {
        throw new Error(`Failed to fetch Pyth price feed: ${priceFeed.toBase58()}`);
    }
    return parsePythPrice(accountInfo.data);
}

// ═══════════════════════════════════════════════════════════════════════════════
// PDA DERIVATION
// ═══════════════════════════════════════════════════════════════════════════════

function getChronosMarketPDA(
    asset: number,
    interval: number,
    roundNumber: bigint
): [PublicKey, number] {
    const assetBytes = Buffer.alloc(1);
    assetBytes.writeUInt8(asset);

    const intervalBytes = Buffer.alloc(1);
    intervalBytes.writeUInt8(interval);

    const roundBytes = Buffer.alloc(8);
    roundBytes.writeBigUInt64LE(roundNumber);

    return PublicKey.findProgramAddressSync(
        [
            Buffer.from("chronos"),
            assetBytes,
            intervalBytes,
            roundBytes,
        ],
        PROGRAM_ID
    );
}

function getChronosVaultPDA(marketPubkey: PublicKey): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
        [Buffer.from("chronos_vault"), marketPubkey.toBuffer()],
        PROGRAM_ID
    );
}

// ═══════════════════════════════════════════════════════════════════════════════
// KEEPER BOT CLASS
// ═══════════════════════════════════════════════════════════════════════════════

class ChronosKeeper {
    private connection: Connection;
    private program: Program;
    private keeper: Keypair;
    private roundNumbers: Map<string, bigint>;

    constructor(
        connection: Connection,
        program: Program,
        keeper: Keypair
    ) {
        this.connection = connection;
        this.program = program;
        this.keeper = keeper;
        this.roundNumbers = new Map();

        // Initialize round numbers
        this.roundNumbers.set("BTC_1H", BigInt(1));
        this.roundNumbers.set("ETH_1H", BigInt(1));
        this.roundNumbers.set("SOL_1H", BigInt(1));
    }

    /**
     * Sync round numbers from blockchain to avoid desync on restart
     */
    async syncRounds(): Promise<void> {
        console.log("🔄 Syncing round numbers from blockchain...");
        try {
            const accounts = await (this.(program.account as any).as any).chronosMarket.all();

            for (const account of accounts) {
                const market = account.account as any;
                const assetName = AssetType[market.asset];
                const intervalName = market.interval === MarketInterval.OneHour ? "1H" : "15M";
                const key = `${assetName}_${intervalName}`;

                const roundNumber = BigInt(market.roundNumber.toString());
                const currentMax = this.roundNumbers.get(key) || BigInt(0);

                if (roundNumber >= currentMax) {
                    this.roundNumbers.set(key, roundNumber + BigInt(1));
                }
            }
            console.log("   Current round states:", Object.fromEntries(
                Array.from(this.roundNumbers.entries()).map(([k, v]) => [k, v.toString()])
            ));
        } catch (error) {
            console.error("   ❌ Failed to sync rounds:", error);
        }
    }

    /**
     * Create a new Chronos market
     */
    async createMarket(
        asset: AssetType,
        interval: MarketInterval
    ): Promise<string | null> {
        const assetName = AssetType[asset];
        const intervalName = interval === MarketInterval.OneHour ? "1H" : "15M";
        const key = `${assetName}_${intervalName}`;

        const roundNumber = this.roundNumbers.get(key) || BigInt(1);

        console.log(`\n📊 Creating ${assetName} ${intervalName} market (Round #${roundNumber})...`);

        try {
            // Fetch current price from Pyth
            const priceFeed = PYTH_FEEDS[assetName as keyof typeof PYTH_FEEDS];
            const currentPriceCents = await fetchPythPrice(this.connection, priceFeed);
            const priceUSD = currentPriceCents / 100;

            console.log(`   Current ${assetName} price: $${priceUSD.toFixed(2)}`);

            // Derive PDAs
            const [marketPDA] = getChronosMarketPDA(asset, interval, roundNumber);
            const [vaultPDA] = getChronosVaultPDA(marketPDA);

            console.log(`   Market PDA: ${marketPDA.toBase58()}`);

            // Build transaction
            const tx = await this.program.methods
                .initializeChronosMarket(
                    asset,
                    interval,
                    new BN(roundNumber.toString()),
                    new BN(currentPriceCents)
                )
                .accounts({
                    chronosMarket: marketPDA,
                    chronosVault: vaultPDA,
                    pythPriceFeed: priceFeed,
                    keeper: this.keeper.publicKey,
                    systemProgram: web3.SystemProgram.programId,
                })
                .signers([this.keeper])
                .rpc();

            console.log(`   ✅ Market created! TX: ${tx}`);
            console.log(`   Question: Will ${assetName} be above $${priceUSD.toFixed(2)} at round end?`);

            // Increment round number
            this.roundNumbers.set(key, roundNumber + BigInt(1));

            return tx;
        } catch (error: any) {
            console.error(`   ❌ Failed to create market: ${error.message}`);
            return null;
        }
    }

    /**
     * Resolve an expired market
     */
    async resolveMarket(
        marketPubkey: PublicKey,
        priceFeed: PublicKey
    ): Promise<string | null> {
        console.log(`\n⚖️ Resolving market ${marketPubkey.toBase58().slice(0, 8)}...`);

        try {
            const [vaultPDA] = getChronosVaultPDA(marketPubkey);

            const tx = await this.program.methods
                .resolveChronosMarket()
                .accounts({
                    chronosMarket: marketPubkey,
                    chronosVault: vaultPDA,
                    pythPriceFeed: priceFeed,
                    protocolTreasury: TREASURY,
                    systemProgram: web3.SystemProgram.programId,
                })
                .rpc();

            console.log(`   ✅ Market resolved! TX: ${tx}`);
            return tx;
        } catch (error: any) {
            console.error(`   ❌ Resolution failed: ${error.message}`);
            return null;
        }
    }

    /**
     * Scan for expired markets and resolve them
     */
    async scanAndResolve(): Promise<void> {
        console.log("\n🔍 Scanning for expired markets...");

        // Fetch all Chronos market accounts
        const accounts = await (this.(program.account as any).as any).chronosMarket.all();

        const now = Math.floor(Date.now() / 1000);
        let resolvedCount = 0;

        for (const account of accounts) {
            const market = account.account as any;

            // Check if market is active and past end time
            if (market.status.active && now >= market.endTime.toNumber()) {
                const priceFeed = PYTH_FEEDS[
                    AssetType[market.asset] as keyof typeof PYTH_FEEDS
                ];

                if (priceFeed) {
                    await this.resolveMarket(account.publicKey, priceFeed);
                    resolvedCount++;
                }
            }
        }

        console.log(`   Resolved ${resolvedCount} market(s)`);
    }

    /**
     * Create markets for all assets
     */
    async createAllMarkets(): Promise<void> {
        console.log("\n🚀 Creating hourly markets for all assets...");

        for (const asset of [AssetType.BTC, AssetType.ETH, AssetType.SOL]) {
            await this.createMarket(asset, MarketInterval.OneHour);
        }
    }

    /**
     * Run the keeper bot loop
     */
    async run(): Promise<void> {
        console.log("═══════════════════════════════════════════════");
        console.log("🤖 CHRONOS KEEPER BOT STARTED");
        console.log("═══════════════════════════════════════════════");
        console.log(`Keeper: ${this.keeper.publicKey.toBase58()}`);
        console.log(`Program: ${PROGRAM_ID.toBase58()}`);
        console.log("");

        // Sync rounds before starting
        await this.syncRounds();

        // Initial market creation
        await this.createAllMarkets();

        // Resolution check every 5 minutes
        const resolutionInterval = setInterval(async () => {
            await this.scanAndResolve();
        }, 5 * 60 * 1000);

        // Create new markets every hour
        const creationInterval = setInterval(async () => {
            await this.createAllMarkets();
        }, 60 * 60 * 1000);

        console.log("\n⏰ Bot running...");
        console.log("   - Resolution checks: every 5 minutes");
        console.log("   - Market creation: every 1 hour");
        console.log("\nPress Ctrl+C to stop\n");

        // Keep process alive
        process.on("SIGINT", () => {
            console.log("\n\n👋 Shutting down keeper bot...");
            clearInterval(resolutionInterval);
            clearInterval(creationInterval);
            process.exit(0);
        });
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════════════════

async function main() {
    // Load keeper keypair from environment or file
    let keeperKeypair: Keypair;

    if (process.env.KEEPER_PRIVATE_KEY) {
        const secretKey = JSON.parse(process.env.KEEPER_PRIVATE_KEY);
        keeperKeypair = Keypair.fromSecretKey(Uint8Array.from(secretKey));
    } else {
        // Try to load from default location
        const keypairPath = path.join(
            process.env.HOME || "",
            ".config/solana/id.json"
        );

        if (fs.existsSync(keypairPath)) {
            const secretKey = JSON.parse(fs.readFileSync(keypairPath, "utf-8"));
            keeperKeypair = Keypair.fromSecretKey(Uint8Array.from(secretKey));
        } else {
            console.error("❌ No keeper keypair found!");
            console.error("   Set KEEPER_PRIVATE_KEY env var or ensure ~/.config/solana/id.json exists");
            process.exit(1);
        }
    }

    // Setup connection
    const rpcUrl = process.env.RPC_URL || clusterApiUrl("devnet");
    const connection = new Connection(rpcUrl, "confirmed");

    console.log(`🔗 Connected to: ${rpcUrl}`);

    // Setup provider and program
    const wallet = {
        publicKey: keeperKeypair.publicKey,
        signTransaction: async (tx: any) => {
            tx.sign(keeperKeypair);
            return tx;
        },
        signAllTransactions: async (txs: any[]) => {
            txs.forEach((tx) => tx.sign(keeperKeypair));
            return txs;
        },
    };

    const provider = new AnchorProvider(connection, wallet as any, {
        commitment: "confirmed",
    });

    // Load IDL
    const idlPath = path.join(
        __dirname,
        "../programs/djinn-market/target/idl/djinn_market.json"
    );

    if (!fs.existsSync(idlPath)) {
        console.error("❌ IDL not found! Run 'anchor build' first.");
        process.exit(1);
    }

    const idl = JSON.parse(fs.readFileSync(idlPath, "utf-8"));
    const program = new Program(idl, provider);

    // Start keeper
    const keeper = new ChronosKeeper(connection, program, keeperKeypair);
    await keeper.run();
}

main().catch(console.error);
