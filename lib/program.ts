import { AnchorProvider, Program, BN, Idl } from '@project-serum/anchor';
import { WalletContextState } from '@solana/wallet-adapter-react';
import { Connection, PublicKey, SystemProgram } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { PROGRAM_ID, PROTOCOL_AUTHORITY, RPC_ENDPOINT } from './program-config';
import { IDL, type DjinnMarket } from './idl/djinn_market';

/**
 * Get Anchor provider from wallet
 */
export function getProvider(wallet: WalletContextState): AnchorProvider | null {
    if (!wallet.publicKey || !wallet.signTransaction || !wallet.signAllTransactions) {
        return null;
    }

    const connection = new Connection(RPC_ENDPOINT, 'confirmed');

    return new AnchorProvider(
        connection,
        wallet as any,
        { commitment: 'confirmed', preflightCommitment: 'confirmed' }
    );
}

/**
 * Get Anchor Program instance
 */
export function getProgram(provider: AnchorProvider): any {
    return new Program(IDL as Idl, PROGRAM_ID, provider);
}

/**
 * Get Program Derived Address for protocol state
 */
export async function getProtocolStatePDA(): Promise<[PublicKey, number]> {
    return await PublicKey.findProgramAddress(
        [Buffer.from('protocol')],
        PROGRAM_ID
    );
}

/**
 * Get Program Derived Address for a market
 */
export async function getMarketPDA(
    creator: PublicKey,
    marketIndex: number
): Promise<[PublicKey, number]> {
    // Create seeds as Uint8Array array (correct format for findProgramAddressSync)
    const marketSeed = Buffer.from('market', 'utf8');
    const creatorSeed = creator.toBuffer();

    // Convert index to 8-byte little-endian buffer
    const indexSeed = Buffer.alloc(8);
    // Write as little endian using standard Buffer methods
    const idx = marketIndex;
    indexSeed[0] = idx & 0xff;
    indexSeed[1] = (idx >> 8) & 0xff;
    indexSeed[2] = (idx >> 16) & 0xff;
    indexSeed[3] = (idx >> 24) & 0xff;
    // Upper 4 bytes are 0 for small numbers

    return PublicKey.findProgramAddressSync(
        [marketSeed, creatorSeed, indexSeed],
        PROGRAM_ID
    );
}

/**
 * Get Program Derived Address for a user's position
 */
export async function getPositionPDA(
    market: PublicKey,
    user: PublicKey
): Promise<[PublicKey, number]> {
    return await PublicKey.findProgramAddress(
        [Buffer.from('position'), market.toBuffer(), user.toBuffer()],
        PROGRAM_ID
    );
}

/**
 * Initialize the protocol (one-time setup)
 * Should only be called once by protocol authority
 */
export async function initializeProtocol(wallet: WalletContextState) {
    const provider = getProvider(wallet);
    if (!provider || !wallet.publicKey) {
        throw new Error('Wallet not connected');
    }

    const program = getProgram(provider);
    const [protocolState, protocolBump] = await getProtocolStatePDA();

    console.log('Initializing protocol...');
    console.log('Protocol State PDA:', protocolState.toBase58());
    console.log('Authority:', wallet.publicKey.toBase58());

    try {
        const tx = await program.methods
            .initializeProtocol()
            .accounts({
                protocolState: protocolState,
                authority: wallet.publicKey,
                treasury: PROTOCOL_AUTHORITY,
                systemProgram: SystemProgram.programId,
            })
            .rpc();

        console.log('Protocol initialized!', tx);
        return { signature: tx, protocolState };
    } catch (error: any) {
        console.error('Error initializing protocol:', error);
        throw new Error(`Failed to initialize protocol: ${error.message}`);
    }
}

/**
 * Create a new prediction market
 */
export async function createMarketOnChain(
    wallet: WalletContextState,
    title: string,
    description: string,
    resolutionTime: number
): Promise<{ signature: string; marketPDA: PublicKey }> {
    const provider = getProvider(wallet);
    if (!provider || !wallet.publicKey) {
        throw new Error('Wallet not connected');
    }

    const program = getProgram(provider);
    const [protocolState] = await getProtocolStatePDA();

    // Fetch protocol state to get market index
    const protocolAccount = await program.account.protocolState.fetch(protocolState);
    const marketIndex = protocolAccount.totalMarkets.toNumber();

    const [market, marketBump] = await getMarketPDA(wallet.publicKey, marketIndex);

    console.log('Creating market on-chain...');
    console.log('Market PDA:', market.toBase58());
    console.log('Creator:', wallet.publicKey.toBase58());
    console.log('Market Index:', marketIndex);

    try {
        const tx = await program.methods
            .createMarket(title, description, new BN(resolutionTime))
            .accounts({
                market: market,
                protocolState: protocolState,
                creator: wallet.publicKey,
                protocolTreasury: PROTOCOL_AUTHORITY,
                systemProgram: SystemProgram.programId,
            })
            .rpc();

        console.log('Market created!', tx);
        return { signature: tx, marketPDA: market };
    } catch (error: any) {
        console.error('Error creating market:', error);
        throw new Error(`Failed to create market: ${error.message}`);
    }
}

/**
 * Fetch market data from blockchain
 */
export async function fetchMarketData(
    wallet: WalletContextState,
    marketPDA: PublicKey
) {
    const provider = getProvider(wallet);
    if (!provider) {
        throw new Error('Wallet not connected');
    }

    const program = getProgram(provider);

    try {
        const marketAccount = await program.account.market.fetch(marketPDA);
        return {
            creator: marketAccount.creator,
            title: marketAccount.title,
            description: marketAccount.description,
            yesPool: marketAccount.yesPool.toNumber(),
            noPool: marketAccount.noPool.toNumber(),
            totalYesShares: marketAccount.totalYesShares.toNumber(),
            totalNoShares: marketAccount.totalNoShares.toNumber(),
            resolutionTime: marketAccount.resolutionTime.toNumber(),
            resolved: marketAccount.resolved,
            winningOutcome: marketAccount.winningOutcome,
            creationFeePaid: marketAccount.creationFeePaid.toNumber(),
        };
    } catch (error: any) {
        console.error('Error fetching market:', error);
        throw new Error(`Failed to fetch market: ${error.message}`);
    }
}

/**
 * Place a trade (buy YES or NO shares)
 */
export async function placeTradeOnChain(
    wallet: WalletContextState,
    marketPDA: PublicKey,
    yesTokenMint: PublicKey,
    noTokenMint: PublicKey,
    yesTokenAccount: PublicKey,
    noTokenAccount: PublicKey,
    outcome: boolean,
    amount: number
): Promise<{ signature: string; positionPDA: PublicKey }> {
    const provider = getProvider(wallet);
    if (!provider || !wallet.publicKey) {
        throw new Error('Wallet not connected');
    }

    const program = getProgram(provider);
    const [protocolState] = await getProtocolStatePDA();
    const [position] = await getPositionPDA(marketPDA, wallet.publicKey);

    const marketAccount = await program.account.market.fetch(marketPDA);
    const marketCreator = marketAccount.creator;

    console.log('Placing trade:', { market: marketPDA.toBase58(), outcome: outcome ? 'YES' : 'NO', amount });

    try {
        const tx = await program.methods
            .placeTrade(outcome, new BN(amount))
            .accounts({
                market: marketPDA,
                position: position,
                protocolState: protocolState,
                trader: wallet.publicKey,
                marketCreator: marketCreator,
                protocolTreasury: PROTOCOL_AUTHORITY,
                yesTokenMint: yesTokenMint,
                noTokenMint: noTokenMint,
                traderYesAccount: yesTokenAccount,
                traderNoAccount: noTokenAccount,
                tokenProgram: TOKEN_PROGRAM_ID,
                systemProgram: SystemProgram.programId,
            })
            .rpc();

        console.log('Trade successful!', tx);
        return { signature: tx, positionPDA: position };
    } catch (error: any) {
        console.error('Error placing trade:', error);
        throw new Error(`Failed to place trade: ${error.message}`);
    }
}

/**
 * Calculate current market price based on pools
 */
export function calculateMarketPrice(yesPool: number, noPool: number): number {
    const total = yesPool + noPool;
    if (total === 0) return 50;
    return Math.round((yesPool / total) * 100);
}

// Export types for use in components
export type { DjinnMarket };
export { IDL };
