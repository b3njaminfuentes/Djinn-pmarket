import { useCallback, useMemo, useEffect } from 'react';
import { useAnchorWallet, useConnection } from '@solana/wallet-adapter-react';
import { useWallet } from '@solana/wallet-adapter-react';
import { Program, AnchorProvider, Idl, BN, web3, utils } from '@coral-xyz/anchor';
import { PublicKey, SystemProgram } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID, getAssociatedTokenAddress, createAssociatedTokenAccountIdempotentInstruction } from '@solana/spl-token';

// Import IDL - now has address field at root level
import idlJson from '../lib/idl/djinn_market.json';

const MASTER_TREASURY = new PublicKey("G1NaEsx5Pg7dSmyYy6Jfraa74b7nTbmN9A9NuiK171Ma");

// Get program ID (HARDCODED as it might be missing from IDL in some builds)
const PROGRAM_ID = "A8pVMgP6vwjGqcbYh1WGWDjXq9uwQRoF9Lz1siLmD7nm";
const PROGRAM_PUBKEY = new PublicKey(PROGRAM_ID);

export const useDjinnProtocol = () => {
    const { connection } = useConnection();
    const anchorWallet = useAnchorWallet();
    const { sendTransaction, signTransaction, publicKey } = useWallet();

    const provider = useMemo(() => {
        if (!anchorWallet) return null;
        return new AnchorProvider(connection, anchorWallet, {
            preflightCommitment: 'processed',
        });
    }, [connection, anchorWallet]);

    const program = useMemo(() => {
        if (!provider) return null;
        try {
            return new Program(idlJson as Idl, PROGRAM_PUBKEY, provider);
        } catch (e) {
            console.error('[Djinn] Failed to initialize program:', e);
            return null;
        }
    }, [provider]);

    const isContractReady = useMemo(() => {
        return !!(program && provider && anchorWallet && anchorWallet.publicKey);
    }, [program, provider, anchorWallet]);

    const createMarket = useCallback(async (
        title: string,
        description: string,
        endDate: Date,
        sourceUrl: string = '',
        metadataUri: string,
        numOutcomes: number = 2,
        initialBuyAmount: number = 0,
        initialBuySide: number = 0
    ) => {
        if (!isContractReady || !program || !anchorWallet || !provider || !publicKey) {
            throw new Error("Wallet not connected or contract not ready");
        }

        try {
            console.log('[Djinn] 🚀 ENTERING NUCLEAR MODE (Rebroadcast + High Priority)');

            // 1. Fetch Blockhash (Finalized is safer for congestion)
            const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('finalized');

            // 2. Generate Nonce & PDA
            const nonce = Date.now() * 1000 + Math.floor(Math.random() * 1000);
            const nonceBuffer = new Uint8Array(8);
            let n = BigInt(nonce);
            for (let i = 0; i < 8; i++) {
                nonceBuffer[i] = Number(n & BigInt(0xff));
                n >>= BigInt(8);
            }
            const [marketPda] = await PublicKey.findProgramAddress(
                [Buffer.from("market"), publicKey.toBuffer(), Buffer.from(utils.sha256.hash(title), "hex"), Buffer.from(nonceBuffer)],
                program.programId
            );
            const [marketVaultPda] = await PublicKey.findProgramAddress(
                [Buffer.from("market_vault"), marketPda.toBuffer()],
                program.programId
            );

            // 3. Construct Transaction
            const tx = new web3.Transaction();
            tx.recentBlockhash = blockhash;
            tx.feePayer = publicKey;

            // ULTRA PRIORITY: 0.05 SOL (For serious congestion)
            tx.add(web3.ComputeBudgetProgram.setComputeUnitLimit({ units: 600_000 }));
            tx.add(web3.ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 85_000_000 }));

            const ix = await program.methods
                .initializeMarket(title, new BN(Math.floor(endDate.getTime() / 1000)), new BN(nonce), Number(numOutcomes))
                .accounts({
                    market: marketPda,
                    marketVault: marketVaultPda,
                    creator: publicKey,
                    protocolTreasury: MASTER_TREASURY,
                    systemProgram: SystemProgram.programId,
                })
                .instruction();
            tx.add(ix);

            let signature: string;

            // 4. SIGN & BROADCAST LOOP (Nuclear Option)
            if (signTransaction) {
                console.log("[Djinn] 🖊️ Requesting wallet signature once...");
                const signedTx = await signTransaction(tx);
                const rawTx = signedTx.serialize();

                signature = await connection.sendRawTransaction(rawTx, { skipPreflight: true, maxRetries: 0 });
                console.log("[Djinn] 📡 Initial broadcast success. Sig:", signature);

                const startTime = Date.now();
                let confirmed = false;
                let lastResend = Date.now();

                // Poll for 100 seconds
                while (Date.now() - startTime < 100000) {
                    const status = await connection.getSignatureStatus(signature, { searchTransactionHistory: true });
                    const val = status?.value;

                    if (val?.err) throw new Error(`TX Failed: ${JSON.stringify(val.err)}`);
                    if (val?.confirmationStatus === 'confirmed' || val?.confirmationStatus === 'finalized') {
                        confirmed = true;
                        console.log(`[Djinn] 🎊 MISSION ACCOMPLISHED! (${val.confirmationStatus})`);
                        break;
                    }

                    // Rebroadcast every 4 seconds
                    if (Date.now() - lastResend > 4000) {
                        connection.sendRawTransaction(rawTx, { skipPreflight: true, maxRetries: 0 }).catch(() => { });
                        lastResend = Date.now();
                        console.log("[Djinn] 🔄 Rebroadcast...");
                    }

                    // Expiry check
                    const currentHeight = await connection.getBlockHeight('processed');
                    if (currentHeight > lastValidBlockHeight) throw new Error("TX Expired. Devnet is extremely slow right now.");

                    await new Promise(r => setTimeout(r, 2000));
                }
                if (!confirmed) throw new Error("Timeout: Transaction stuck in blocks.");
            } else {
                // Fallback
                console.log("[Djinn] ⚠️ Fallback send...");
                signature = await sendTransaction(tx, connection, { skipPreflight: true, maxRetries: 5 });
                const confirmation = await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, 'confirmed');
                if (confirmation.value.err) throw new Error(`TX Failed: ${JSON.stringify(confirmation.value.err)}`);
            }

            return { tx: signature, marketPda, yesMintPda: marketPda, noMintPda: marketPda, numOutcomes };
        } catch (error) {
            console.error("Error creating market:", error);
            throw error;
        }
    }, [program, anchorWallet, isContractReady, provider, connection, publicKey, signTransaction]);

    const buyShares = useCallback(async (
        marketPda: PublicKey,
        outcomeIndex: number,
        amountSol: number,
        marketCreator: PublicKey,
        minSharesOut: number = 0
    ) => {
        if (!program || !anchorWallet || !connection || !publicKey) throw new Error("Wallet not connected");

        try {
            const amountLamports = new BN(Math.round(amountSol * web3.LAMPORTS_PER_SOL));
            const minSharesBN = new BN(Math.floor(minSharesOut)).mul(new BN(1_000_000_000));

            const userPositionPda = PublicKey.findProgramAddressSync(
                [Buffer.from("user_pos"), marketPda.toBuffer(), publicKey.toBuffer(), Buffer.from([outcomeIndex])],
                program.programId
            )[0];

            const marketVaultPda = PublicKey.findProgramAddressSync(
                [Buffer.from("market_vault"), marketPda.toBuffer()],
                program.programId
            )[0];

            const tx = new web3.Transaction();
            tx.add(web3.ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }));
            tx.add(web3.ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 10_000_000 }));

            const [insuranceVaultPda] = PublicKey.findProgramAddressSync(
                [Buffer.from("insurance_vault")],
                program.programId
            );

            const ix = await program.methods
                .buyShares(outcomeIndex, amountLamports, minSharesBN)
                .accounts({
                    market: marketPda,
                    marketVault: marketVaultPda,
                    userPosition: userPositionPda,
                    user: publicKey,
                    protocolTreasury: MASTER_TREASURY,
                    insuranceVault: insuranceVaultPda,
                    marketCreator: marketCreator,
                    systemProgram: SystemProgram.programId,
                })
                .instruction();

            tx.add(ix);
            const signature = await sendTransaction(tx, connection, { skipPreflight: true });
            console.log("✅ Buy TX Sent Sig:", signature);
            await connection.confirmTransaction(signature, 'confirmed');
            return signature;
        } catch (error) {
            console.error("Error buying shares:", error);
            throw error;
        }
    }, [program, anchorWallet, connection, publicKey]);

    const resolveMarket = useCallback(async (
        marketPda: PublicKey,
        outcome: 'yes' | 'no' | 'void'
    ) => {
        if (!program || !anchorWallet || !connection || !publicKey) throw new Error("Wallet not connected");

        try {
            const [marketVaultPda] = await PublicKey.findProgramAddress(
                [Buffer.from("market_vault"), marketPda.toBuffer()],
                program.programId
            );

            const [insuranceVaultPda] = PublicKey.findProgramAddressSync(
                [Buffer.from("insurance_vault")],
                program.programId
            );

            const winningOutcome = outcome === 'yes' ? 0 : 1;
            const tx = new web3.Transaction();
            const ix = await program.methods
                .resolveMarket(winningOutcome)
                .accounts({
                    market: marketPda,
                    marketVault: marketVaultPda,
                    authority: publicKey,
                    protocolTreasury: MASTER_TREASURY,
                    insuranceVault: insuranceVaultPda,
                    systemProgram: SystemProgram.programId,
                })
                .instruction();

            tx.add(ix);
            const signature = await sendTransaction(tx, connection);
            const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
            await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, 'confirmed');
            return signature;
        } catch (error) {
            console.error("Error resolving market:", error);
            throw error;
        }
    }, [program, anchorWallet, connection, publicKey]);

    const claimReward = useCallback(async (
        marketPda: PublicKey,
        yesMint: PublicKey,
        noMint: PublicKey,
        sideOrIndex: 'yes' | 'no' | number = 'yes'
    ) => {
        if (!program || !anchorWallet || !connection || !publicKey) throw new Error("Wallet not connected");

        try {
            let outcomeIndex = 0;
            if (typeof sideOrIndex === 'number') {
                outcomeIndex = sideOrIndex;
            } else {
                outcomeIndex = sideOrIndex.toLowerCase() === 'yes' ? 0 : 1;
            }

            const [marketVaultPda] = await PublicKey.findProgramAddress(
                [Buffer.from("market_vault"), marketPda.toBuffer()],
                program.programId
            );

            const userPositionPda = PublicKey.findProgramAddressSync(
                [Buffer.from("user_pos"), marketPda.toBuffer(), publicKey.toBuffer(), Buffer.from([outcomeIndex])],
                program.programId
            )[0];

            const tx = new web3.Transaction();
            const ix = await program.methods
                .claimWinnings(outcomeIndex)
                .accounts({
                    market: marketPda,
                    marketVault: marketVaultPda,
                    userPosition: userPositionPda,
                    user: publicKey,
                    systemProgram: SystemProgram.programId,
                })
                .instruction();

            tx.add(ix);
            const signature = await sendTransaction(tx, connection, { skipPreflight: true });
            await connection.confirmTransaction(signature, 'confirmed');
            return signature;
        } catch (error) {
            console.error("Error claiming winnings:", error);
            throw error;
        }
    }, [program, anchorWallet, connection, publicKey]);

    const getUserBalance = useCallback(async (marketPda: PublicKey, outcomeIndex: number) => {
        if (!program || !anchorWallet || !publicKey) return 0;
        try {
            const [userPositionPda] = PublicKey.findProgramAddressSync(
                [Buffer.from("user_pos"), marketPda.toBuffer(), publicKey.toBuffer(), Buffer.from([outcomeIndex])],
                program.programId
            );
            // @ts-ignore
            const posAccount = await program.account.userPosition.fetch(userPositionPda);
            return posAccount ? Number(posAccount.shares) / 1e9 : 0;
        } catch (e) {
            return 0;
        }
    }, [program, anchorWallet, publicKey]);

    const sellShares = useCallback(async (
        marketPda: PublicKey,
        outcomeIndex: number,
        sharesAmount: number,
        yesMint: PublicKey,
        noMint: PublicKey,
        marketCreator: PublicKey,
        minSolOut: number = 0,
        sellMax: boolean = false
    ) => {
        if (!program || !anchorWallet || !publicKey) throw new Error("Wallet not connected");

        try {
            const userPositionPda = PublicKey.findProgramAddressSync(
                [Buffer.from("user_pos"), marketPda.toBuffer(), publicKey.toBuffer(), Buffer.from([outcomeIndex])],
                program.programId
            )[0];

            let onChainSharesRaw = BigInt(0);
            try {
                // @ts-ignore
                const posAccount = await program.account.userPosition.fetch(userPositionPda);
                if (posAccount) {
                    // @ts-ignore
                    onChainSharesRaw = BigInt(posAccount.shares.toString());
                }
            } catch (e) { console.error(e); }

            let sharesToBurnBN: BN;
            if (sellMax || sharesAmount >= Number(onChainSharesRaw) / 1e9 * 0.99) {
                sharesToBurnBN = new BN(onChainSharesRaw.toString());
            } else {
                sharesToBurnBN = new BN(Math.floor(sharesAmount * 1e9).toString());
            }

            if (sharesToBurnBN.isZero()) throw new Error("No shares to sell.");

            const tx = new web3.Transaction();
            tx.add(web3.ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }));
            tx.add(web3.ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 10_000_000 }));

            const [insuranceVaultPda] = PublicKey.findProgramAddressSync(
                [Buffer.from("insurance_vault")],
                program.programId
            );

            const ix = await program.methods.sellShares(outcomeIndex, sharesToBurnBN, new BN(minSolOut))
                .accounts({
                    market: marketPda,
                    marketVault: PublicKey.findProgramAddressSync([Buffer.from("market_vault"), marketPda.toBuffer()], program.programId)[0],
                    userPosition: userPositionPda,
                    user: publicKey,
                    protocolTreasury: MASTER_TREASURY,
                    insuranceVault: insuranceVaultPda,
                    systemProgram: SystemProgram.programId,
                    marketCreator: marketCreator || MASTER_TREASURY,
                })
                .instruction();

            tx.add(ix);
            const signature = await sendTransaction(tx, connection, { skipPreflight: true });
            await connection.confirmTransaction(signature, 'confirmed');
            return signature;
        } catch (error) {
            console.error("Error selling shares:", error);
            throw error;
        }
    }, [program, anchorWallet, connection, publicKey]);

    // ═══════════════════════════════════════════════════════════════════════
    // BOT MANAGEMENT
    // ═══════════════════════════════════════════════════════════════════════

    const registerBot = useCallback(async (
        name: string,
        metadataUri: string,
        strategyCategory: number
    ) => {
        if (!program || !anchorWallet || !connection || !publicKey) throw new Error("Wallet not connected");

        try {
            const [botProfilePda] = PublicKey.findProgramAddressSync(
                [Buffer.from('bot_profile'), publicKey.toBuffer()],
                program.programId
            );
            const [botEscrowPda] = PublicKey.findProgramAddressSync(
                [Buffer.from('bot_escrow'), publicKey.toBuffer()],
                program.programId
            );

            const tx = new web3.Transaction();
            tx.add(web3.ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }));
            tx.add(web3.ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 10_000_000 }));

            const ix = await program.methods
                .registerBot(name, metadataUri, strategyCategory)
                .accounts({
                    botProfile: botProfilePda,
                    botEscrow: botEscrowPda,
                    owner: publicKey,
                    systemProgram: SystemProgram.programId,
                })
                .instruction();

            tx.add(ix);
            const signature = await sendTransaction(tx, connection, { skipPreflight: true });
            await connection.confirmTransaction(signature, 'confirmed');
            console.log('✅ Bot registered:', botProfilePda.toBase58());
            return { tx: signature, botProfilePda, botEscrowPda };
        } catch (error) {
            console.error("Error registering bot:", error);
            throw error;
        }
    }, [program, anchorWallet, connection, publicKey]);

    const toggleBot = useCallback(async (isActive: boolean, isPaperTrading: boolean) => {
        if (!program || !anchorWallet || !connection || !publicKey) throw new Error("Wallet not connected");

        try {
            const [botProfilePda] = PublicKey.findProgramAddressSync(
                [Buffer.from('bot_profile'), publicKey.toBuffer()],
                program.programId
            );

            const tx = new web3.Transaction();
            const ix = await program.methods
                .toggleBot(isActive, isPaperTrading)
                .accounts({
                    botProfile: botProfilePda,
                    owner: publicKey,
                })
                .instruction();

            tx.add(ix);
            const signature = await sendTransaction(tx, connection);
            await connection.confirmTransaction(signature, 'confirmed');
            return signature;
        } catch (error) {
            console.error("Error toggling bot:", error);
            throw error;
        }
    }, [program, anchorWallet, connection, publicKey]);

    const deregisterBot = useCallback(async () => {
        if (!program || !anchorWallet || !connection || !publicKey) throw new Error("Wallet not connected");

        try {
            const [botProfilePda] = PublicKey.findProgramAddressSync(
                [Buffer.from('bot_profile'), publicKey.toBuffer()],
                program.programId
            );
            const [botEscrowPda] = PublicKey.findProgramAddressSync(
                [Buffer.from('bot_escrow'), publicKey.toBuffer()],
                program.programId
            );

            const tx = new web3.Transaction();
            const ix = await program.methods
                .deregisterBot()
                .accounts({
                    botProfile: botProfilePda,
                    botEscrow: botEscrowPda,
                    owner: publicKey,
                    systemProgram: SystemProgram.programId,
                })
                .instruction();

            tx.add(ix);
            const signature = await sendTransaction(tx, connection);
            await connection.confirmTransaction(signature, 'confirmed');
            return signature;
        } catch (error) {
            console.error("Error deregistering bot:", error);
            throw error;
        }
    }, [program, anchorWallet, connection, publicKey]);

    const restakeBot = useCallback(async () => {
        if (!program || !anchorWallet || !connection || !publicKey) throw new Error("Wallet not connected");

        try {
            const [botProfilePda] = PublicKey.findProgramAddressSync(
                [Buffer.from('bot_profile'), publicKey.toBuffer()],
                program.programId
            );
            const [botEscrowPda] = PublicKey.findProgramAddressSync(
                [Buffer.from('bot_escrow'), publicKey.toBuffer()],
                program.programId
            );

            const tx = new web3.Transaction();
            const ix = await program.methods
                .restakeBot()
                .accounts({
                    botProfile: botProfilePda,
                    botEscrow: botEscrowPda,
                    owner: publicKey,
                    systemProgram: SystemProgram.programId,
                })
                .instruction();

            tx.add(ix);
            const signature = await sendTransaction(tx, connection);
            await connection.confirmTransaction(signature, 'confirmed');
            return signature;
        } catch (error) {
            console.error("Error restaking bot:", error);
            throw error;
        }
    }, [program, anchorWallet, connection, publicKey]);

    // ═══════════════════════════════════════════════════════════════════════
    // VAULT MANAGEMENT
    // ═══════════════════════════════════════════════════════════════════════

    const initializeVault = useCallback(async () => {
        if (!program || !anchorWallet || !connection || !publicKey) throw new Error("Wallet not connected");

        try {
            const [botProfilePda] = PublicKey.findProgramAddressSync(
                [Buffer.from('bot_profile'), publicKey.toBuffer()],
                program.programId
            );
            const [agentVaultPda] = PublicKey.findProgramAddressSync(
                [Buffer.from('agent_vault'), botProfilePda.toBuffer()],
                program.programId
            );

            const tx = new web3.Transaction();
            const ix = await program.methods
                .initializeVault()
                .accounts({
                    agentVault: agentVaultPda,
                    botProfile: botProfilePda,
                    owner: publicKey,
                    systemProgram: SystemProgram.programId,
                })
                .instruction();

            tx.add(ix);
            const signature = await sendTransaction(tx, connection, { skipPreflight: true });
            await connection.confirmTransaction(signature, 'confirmed');
            console.log('✅ Vault initialized:', agentVaultPda.toBase58());
            return { tx: signature, agentVaultPda };
        } catch (error) {
            console.error("Error initializing vault:", error);
            throw error;
        }
    }, [program, anchorWallet, connection, publicKey]);

    const depositToVault = useCallback(async (agentVaultPda: PublicKey, amountSol: number) => {
        if (!program || !anchorWallet || !connection || !publicKey) throw new Error("Wallet not connected");

        try {
            const amountLamports = new BN(Math.round(amountSol * web3.LAMPORTS_PER_SOL));

            const [vaultDepositPda] = PublicKey.findProgramAddressSync(
                [Buffer.from('vault_deposit'), agentVaultPda.toBuffer(), publicKey.toBuffer()],
                program.programId
            );
            const [vaultSolPda] = PublicKey.findProgramAddressSync(
                [Buffer.from('vault_sol'), agentVaultPda.toBuffer()],
                program.programId
            );

            const tx = new web3.Transaction();
            const ix = await program.methods
                .depositToVault(amountLamports)
                .accounts({
                    agentVault: agentVaultPda,
                    vaultDeposit: vaultDepositPda,
                    vaultSol: vaultSolPda,
                    depositor: publicKey,
                    systemProgram: SystemProgram.programId,
                })
                .instruction();

            tx.add(ix);
            const signature = await sendTransaction(tx, connection, { skipPreflight: true });
            await connection.confirmTransaction(signature, 'confirmed');
            return signature;
        } catch (error) {
            console.error("Error depositing to vault:", error);
            throw error;
        }
    }, [program, anchorWallet, connection, publicKey]);

    const withdrawFromVault = useCallback(async (agentVaultPda: PublicKey, amountSol: number) => {
        if (!program || !anchorWallet || !connection || !publicKey) throw new Error("Wallet not connected");

        try {
            const amountLamports = new BN(Math.round(amountSol * web3.LAMPORTS_PER_SOL));

            const [vaultDepositPda] = PublicKey.findProgramAddressSync(
                [Buffer.from('vault_deposit'), agentVaultPda.toBuffer(), publicKey.toBuffer()],
                program.programId
            );
            const [vaultSolPda] = PublicKey.findProgramAddressSync(
                [Buffer.from('vault_sol'), agentVaultPda.toBuffer()],
                program.programId
            );

            const tx = new web3.Transaction();
            const ix = await program.methods
                .withdrawFromVault(amountLamports)
                .accounts({
                    agentVault: agentVaultPda,
                    vaultDeposit: vaultDepositPda,
                    vaultSol: vaultSolPda,
                    depositor: publicKey,
                    systemProgram: SystemProgram.programId,
                })
                .instruction();

            tx.add(ix);
            const signature = await sendTransaction(tx, connection, { skipPreflight: true });
            await connection.confirmTransaction(signature, 'confirmed');
            return signature;
        } catch (error) {
            console.error("Error withdrawing from vault:", error);
            throw error;
        }
    }, [program, anchorWallet, connection, publicKey]);

    return {
        program,
        // Markets
        createMarket,
        buyShares,
        sellShares,
        resolveMarket,
        claimReward,
        getUserBalance,
        // Bots
        registerBot,
        toggleBot,
        deregisterBot,
        restakeBot,
        // Vaults
        initializeVault,
        depositToVault,
        withdrawFromVault,
        // Status
        isReady: isContractReady
    };
};
