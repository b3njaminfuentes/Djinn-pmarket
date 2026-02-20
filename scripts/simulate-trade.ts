const anchor = require("@project-serum/anchor");
const { Program, BN } = require("@project-serum/anchor");
const { Connection, PublicKey } = require("@solana/web3.js");
const { getAssociatedTokenAddressSync } = require("@solana/spl-token");
const fs = require('fs');
const idl = JSON.parse(fs.readFileSync("./lib/idl/djinn_market.json", "utf8"));

async function main() {
    const connection = new Connection("https://api.devnet.solana.com", "confirmed");
    const wallet = anchor.Wallet.local();
    const provider = new anchor.AnchorProvider(connection, wallet, { commitment: "confirmed" });
    const program = new Program(idl as any, new PublicKey(idl.metadata.address), provider);

    console.log("Creating market and trading...");

    const title = "Simulation Market " + Date.now();
    const [marketPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("market"), wallet.publicKey.toBuffer(), Buffer.from(title)],
        program.programId
    );
    const [protocolState] = PublicKey.findProgramAddressSync([Buffer.from("protocol")], program.programId);

    // 0. Initialize Protocol (if needed)
    try {
        await (program.account as any).protocolState.fetch(protocolState);
        console.log("✅ Protocol already initialized");
    } catch {
        console.log("⚠️ Protocol NOT initialized. Initializing...");
        await program.methods.initializeProtocol()
            .accounts({
                protocolState,
                authority: wallet.publicKey,
                treasury: new PublicKey("G1NaEsx5Pg7dSmyYy6Jfraa74b7nTbmN9A9NuiK171Ma"),
                systemProgram: anchor.web3.SystemProgram.programId,
            })
            .rpc();
        console.log("✅ Protocol Initialized");
    }

    const [yesMint] = PublicKey.findProgramAddressSync([Buffer.from("yes_mint"), marketPda.toBuffer()], program.programId);
    const [noMint] = PublicKey.findProgramAddressSync([Buffer.from("no_mint"), marketPda.toBuffer()], program.programId);

    // 1. Create Market
    const resolutionTime = new BN(Math.floor(Date.now() / 1000) + 3600); // 1 hour from now
    await program.methods.createMarket(title, resolutionTime)
        .accounts({
            market: marketPda,
            yesTokenMint: yesMint,
            noTokenMint: noMint,
            creator: wallet.publicKey,
            protocolState: protocolState,
            protocolTreasury: new PublicKey("G1NaEsx5Pg7dSmyYy6Jfraa74b7nTbmN9A9NuiK171Ma"),
            tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
            systemProgram: anchor.web3.SystemProgram.programId,
            rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        })
        .rpc();

    console.log("✅ Market Created:", title);

    // 2. Buy YES
    const sideYes = { yes: {} };
    await program.methods.placeBet(sideYes, new BN(100_000_000), new BN(0)) // Side, Amount, MinShares
        .accounts({
            market: marketPda,
            user: wallet.publicKey,
            yesTokenMint: yesMint,
            noTokenMint: noMint,
            userYesAccount: getAssociatedTokenAddressSync(yesMint, wallet.publicKey),
            userNoAccount: getAssociatedTokenAddressSync(noMint, wallet.publicKey),
            protocolTreasury: new PublicKey("G1NaEsx5Pg7dSmyYy6Jfraa74b7nTbmN9A9NuiK171Ma"),
            tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
            associatedTokenProgram: anchor.utils.token.ASSOCIATED_PROGRAM_ID,
            systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();

    console.log("✅ Buy YES successful!");

    // 3. Sell YES
    await program.methods.sellShares(sideYes, new BN(50_000_000), new BN(0))
        .accounts({
            market: marketPda,
            user: wallet.publicKey,
            yesTokenMint: yesMint,
            noTokenMint: noMint,
            userYesAccount: getAssociatedTokenAddressSync(yesMint, wallet.publicKey),
            userNoAccount: getAssociatedTokenAddressSync(noMint, wallet.publicKey),
            protocolTreasury: new PublicKey("G1NaEsx5Pg7dSmyYy6Jfraa74b7nTbmN9A9NuiK171Ma"),
            tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
            systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();

    console.log("✅ Sell YES successful!");
}

main();
