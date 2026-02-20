import { useAnchorWallet, useConnection } from "@solana/wallet-adapter-react";
import { AnchorProvider, Program, Idl, BN, web3 } from "@project-serum/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { useMemo, useCallback } from "react";
import idl from "@/lib/idl/djinn_market.json";

// Load IDL from JSON
const IDL = idl as any;

const PROGRAM_ID = new PublicKey("76HyPe3NMY39BXYaYPTq3QUmvxriXNhfEBZBXBxwxghB");
const TREASURY = new PublicKey("G1NaEsx5Pg7dSmyYy6Jfraa74b7nTbmN9A9NuiK171Ma");

export function useChronosProgram() {
    const { connection } = useConnection();
    const wallet = useAnchorWallet();

    const provider = useMemo(() => {
        if (!wallet) return null;
        return new AnchorProvider(connection, wallet, AnchorProvider.defaultOptions());
    }, [connection, wallet]);

    const program = useMemo(() => {
        if (!provider) return null;
        return new Program(IDL, PROGRAM_ID, provider);
    }, [provider]);

    const buyShares = useCallback(async (marketKey: PublicKey, outcomeIndex: number, amountSol: number) => {
        if (!program || !wallet) throw new Error("Wallet not connected");

        const solLamports = new BN(Math.round(amountSol * 1e9));
        const [chronosVault] = PublicKey.findProgramAddressSync(
            [Buffer.from("chronos_vault"), marketKey.toBuffer()],
            PROGRAM_ID
        );
        const [userPosition] = PublicKey.findProgramAddressSync(
            [Buffer.from("chronos_pos"), marketKey.toBuffer(), wallet.publicKey.toBuffer(), Buffer.from([outcomeIndex])],
            PROGRAM_ID
        );

        // Min shares out: 0 for now (no slippage protection in UI yet)
        const minSharesOut = new BN(0);

        try {
            const tx = await program.methods
                .buyChronosShares(outcomeIndex, solLamports, minSharesOut)
                .accounts({
                    chronosMarket: marketKey,
                    chronosVault,
                    userPosition,
                    user: wallet.publicKey,
                    protocolTreasury: TREASURY,
                    systemProgram: SystemProgram.programId,
                })
                .rpc();

            console.log("Buy Transaction:", tx);
            return tx;
        } catch (error) {
            console.error("Buy Error:", error);
            throw error;
        }
    }, [program, wallet]);

    const claimWinnings = useCallback(async (marketKey: PublicKey, outcomeIndex: number) => {
        if (!program || !wallet) throw new Error("Wallet not connected");

        const [chronosVault] = PublicKey.findProgramAddressSync(
            [Buffer.from("chronos_vault"), marketKey.toBuffer()],
            PROGRAM_ID
        );
        const [userPosition] = PublicKey.findProgramAddressSync(
            [Buffer.from("chronos_pos"), marketKey.toBuffer(), wallet.publicKey.toBuffer(), Buffer.from([outcomeIndex])],
            PROGRAM_ID
        );

        try {
            const tx = await program.methods
                .claimChronosWinnings(outcomeIndex)
                .accounts({
                    chronosMarket: marketKey,
                    chronosVault,
                    userPosition,
                    user: wallet.publicKey,
                    systemProgram: SystemProgram.programId,
                })
                .rpc();

            console.log("Claim Transaction:", tx);
            return tx;
        } catch (error) {
            console.error("Claim Error:", error);
            throw error;
        }
    }, [program, wallet]);

    const fetchMyPositions = useCallback(async () => {
        if (!program || !wallet) return [];

        try {
            // Fetch all ChronosPosition accounts owned by the user
            const accounts = await (program.account as any).chronosPosition.all([
                {
                    memcmp: {
                        offset: 8, // Discriminator (8 bytes)
                        bytes: wallet.publicKey.toBase58(), // Owner field is first after discriminator
                    }
                }
            ]);

            return accounts.map((a: any) => ({
                publicKey: a.publicKey,
                account: a.account
            }));
        } catch (error) {
            console.error("Fetch Positions Error:", error);
            return [];
        }
    }, [program, wallet]);

    const fetchAllMarkets = useCallback(async () => {
        if (!program) return [];
        try {
            const accounts = await (program.account as any).chronosMarket.all();
            return accounts.map((a: any) => ({
                publicKey: a.publicKey,
                account: a.account
            }));
        } catch (error) {
            console.error("Fetch Markets Error:", error);
            return [];
        }
    }, [program]);

    return {
        program,
        buyShares,
        claimWinnings,
        fetchMyPositions,
        fetchAllMarkets,
        isConnected: !!wallet
    };
}

export function deriveChronosMarketKey(assetSymbol: string, roundNumber: number, intervalInvoking: number = 0) {
    // interval: 0=15min, 1=1h. Default 0.
    const assetIndex = assetSymbol === 'BTC' ? 0 : assetSymbol === 'ETH' ? 1 : 2;

    return PublicKey.findProgramAddressSync(
        [
            Buffer.from("chronos"),
            Buffer.from([assetIndex]),
            Buffer.from([intervalInvoking]),
            new BN(roundNumber).toArrayLike(Buffer, "le", 8)
        ],
        PROGRAM_ID
    )[0];
}
