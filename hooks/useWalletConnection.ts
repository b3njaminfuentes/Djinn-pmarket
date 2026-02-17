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
    const walletRef = useRef(wallet);

    // Keep walletRef updated
    useEffect(() => {
        walletRef.current = wallet;
    }, [wallet]);

    // Detect successful connection and clear loading state
    useEffect(() => {
        if (connected) {
            connectionAttemptRef.current = false;
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

        // If switching wallets, disconnect first
        if (connected) {
            try { await disconnect(); } catch (e) { /* ignore */ }
        }

        connectionAttemptRef.current = true;
        setState({ isConnecting: true, error: null });

        try {
            console.log('[Wallet] Selecting:', walletName);
            select(walletName);

            // Wait for the wallet to be selected and ready
            // We poll walletRef until the adapter name matches
            let attempts = 0;
            const maxAttempts = 50; // 5 seconds (50 * 100ms)

            while (attempts < maxAttempts) {
                const currentWallet = walletRef.current;
                if (currentWallet?.adapter?.name === walletName &&
                    (currentWallet.readyState === 'Installed' || currentWallet.readyState === 'Loadable')) {
                    break;
                }
                await new Promise(r => setTimeout(r, 100));
                attempts++;
            }

            if (walletRef.current?.adapter?.name !== walletName) {
                throw new Error('Wallet adapter failed to load. Is it installed?');
            }

            console.log('[Wallet] Connecting to:', walletName);
            await connect();

            return { success: true, error: null };

        } catch (error: any) {
            connectionAttemptRef.current = false;
            console.error('[Wallet] Error:', error);

            const msg = error?.message || 'Connection failed';

            if (msg.includes('User rejected')) {
                setState({ isConnecting: false, error: 'Connection cancelled' });
            } else {
                setState({ isConnecting: false, error: msg });
            }

            return { success: false, error: msg };
        }
    }, [select, connect, disconnect, connecting, connected, wallet]);

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
        disconnectWallet: disconnect,
        retry,
        clearError,
        canRetry: !!(state.error && wallet?.adapter?.name),
    };
}
