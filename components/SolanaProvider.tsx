'use client';

import React, { useMemo } from 'react';
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
import { WalletAdapterNetwork } from '@solana/wallet-adapter-base';
import { clusterApiUrl } from '@solana/web3.js';
import { WalletAuthWrapper } from './WalletAuthWrapper';

export function SolanaProvider({ children }: { children: React.ReactNode }) {
    const network = process.env.NEXT_PUBLIC_SOLANA_NETWORK === 'mainnet-beta'
        ? WalletAdapterNetwork.Mainnet
        : process.env.NEXT_PUBLIC_SOLANA_NETWORK === 'testnet'
            ? WalletAdapterNetwork.Testnet
            : WalletAdapterNetwork.Devnet;

    const endpoint = useMemo(() => {
        if (process.env.NEXT_PUBLIC_RPC_URL) {
            return process.env.NEXT_PUBLIC_RPC_URL;
        }
        return clusterApiUrl(network);
    }, [network]);

    // Let wallet-standard auto-detect wallets (Phantom, Solflare, etc.)
    // DO NOT add explicit adapters - they conflict with wallet-standard detection
    const wallets = useMemo(() => [], []);

    return (
        <ConnectionProvider endpoint={endpoint}>
            <WalletProvider
                wallets={wallets}
                autoConnect={true}
                // App Identity for wallet signatures
                localStorageKey="djinn-wallet-final-v16"
                onError={(error) => {
                    const msg = error.message || '';
                    // Only suppress truly transient errors - NOT connection errors
                    const isTransient =
                        msg.includes('User rejected') ||
                        msg.includes('Already connected') ||
                        msg === '';

                    if (isTransient) {
                        console.warn('[SolanaProvider] Suppressed:', error.name, msg || '(empty)');
                        return;
                    }
                    console.error('[SolanaProvider] Wallet error:', error.name, msg);
                }}
            >
                {/* ✅ NO uses WalletModalProvider aquí */}
                <WalletAuthWrapper>
                    {children}
                </WalletAuthWrapper>
            </WalletProvider>
        </ConnectionProvider>
    );
}