'use client';

import { useWallet } from '@solana/wallet-adapter-react';
import { useCallback, useState, useRef, useEffect } from 'react';
import type { WalletName } from '@solana/wallet-adapter-base';

interface WalletConnectionState {
    isConnecting: boolean;
    error: string | null;
}

export function useWalletConnection() {
    const { select, connect, disconnect, wallet, connecting, connected } = useWallet();

    const [state, setState] = useState<WalletConnectionState>({
        isConnecting: false,
        error: null,
    });

    const connectionAttemptRef = useRef<boolean>(false);

    // Detect successful connection and clear loading state
    useEffect(() => {
        if (connected && connectionAttemptRef.current) {
            connectionAttemptRef.current = false;
            console.log('[Wallet] ✓ Fully connected!');
            setState({ isConnecting: false, error: null });
        }
    }, [connected]);

    const connectWallet = useCallback(async (walletName: WalletName) => {
        if (connectionAttemptRef.current || connecting) {
            return { success: false, error: 'Connection already in progress' };
        }

        if (connected && wallet?.adapter?.name === walletName) {
            return { success: true, error: null };
        }

        // Helper: Wait for adapter to be ready
        const waitForAdapter = async (name: WalletName, maxAttempts = 10): Promise<boolean> => {
            for (let i = 0; i < maxAttempts; i++) {
                // @ts-ignore - access internal adapter state if needed, or re-select
                if (window.solana && name === 'Phantom') return true;
                // For now just wait a bit
                await new Promise(r => setTimeout(r, 200));
            }
            return true;
        };

        // If switching wallets, disconnect first
        if (connected) {
            try { await disconnect(); } catch (e) { /* ignore */ }
            await new Promise(resolve => setTimeout(resolve, 300));
        }

        connectionAttemptRef.current = true;
        setState({ isConnecting: true, error: null });

        try {
            // STEP 1: Select the wallet adapter
            console.log('[Wallet] 1. Selecting:', walletName);
            select(walletName);

            // STEP 2: Brief pause to allow React state to update (wallet object needs to change)
            await new Promise(resolve => setTimeout(resolve, 50));

            // Check if wallet object is available
            if (!wallet) {
                // Give it one more tick if context is slow
                await new Promise(resolve => setTimeout(resolve, 100));
            }

            // STEP 3: Call connect() with Retry Logic
            console.log('[Wallet] 3. Calling connect()...');

            let attempts = 0;
            const maxRetries = 2;

            while (attempts <= maxRetries) {
                try {
                    await connect();
                    break; // Success!
                } catch (err: any) {
                    attempts++;
                    console.warn(`[Wallet] Connection attempt ${attempts} failed:`, err.message);

                    if (attempts > maxRetries) throw err; // Throw final error

                    if (err.message.includes('Wallet not ready') || err.message.includes('User rejected')) {
                        // If user rejected, stop retrying immediately
                        if (err.message.includes('User rejected')) throw err;

                        // If not ready, wait and retry
                        await new Promise(r => setTimeout(r, 800));
                    } else {
                        throw err; // Unknown error, stop
                    }
                }
            }

            // If we reach here without error, connection was successful
            console.log('[Wallet] ✓ Connection successful!');
            connectionAttemptRef.current = false;
            setState({ isConnecting: false, error: null });
            return { success: true, error: null };

        } catch (error: any) {
            connectionAttemptRef.current = false;

            // Log full error for deep debugging
            console.error('[Wallet] ✗ Detailed Connection error:', {
                name: error?.name,
                message: error?.message,
                code: error?.code,
                errorObject: error
            });

            const msg = error?.message || 'Connection failed';

            if (msg.includes('User rejected') || msg.includes('user rejected')) {
                setState({ isConnecting: false, error: 'Connection cancelled by user' });
            } else if (msg.includes('Already connected')) {
                setState({ isConnecting: false, error: null });
                return { success: true, error: null };
            } else {
                setState({ isConnecting: false, error: msg });
            }
            return { success: false, error: msg };
        }
    }, [select, connect, disconnect, connecting, connected, wallet]);

    const disconnectWallet = useCallback(async () => {
        try {
            await disconnect();
            setState({ isConnecting: false, error: null });
            return { success: true };
        } catch (error: unknown) {
            const err = error instanceof Error ? error : new Error(String(error));
            return { success: false, error: err.message };
        }
    }, [disconnect]);

    const retry = useCallback(async () => {
        if (!wallet?.adapter?.name) {
            return { success: false, error: 'No wallet selected' };
        }
        setState({ isConnecting: false, error: null });
        return connectWallet(wallet.adapter.name as WalletName);
    }, [wallet, connectWallet]);

    const clearError = useCallback(() => {
        setState(prev => ({ ...prev, error: null }));
    }, []);

    return {
        isConnecting: state.isConnecting || connecting,
        error: state.error,
        connected,
        wallet,
        connectWallet,
        disconnectWallet,
        retry,
        clearError,
        canRetry: !!(state.error && wallet?.adapter?.name),
    };
}
