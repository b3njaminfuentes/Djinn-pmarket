'use client';

import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { encodeBS58 } from '@/utils/bs58-compat';
import { Zap } from 'lucide-react';

export function WalletAuthWrapper({ children }: { children: React.ReactNode }) {
    const { publicKey, signMessage, connected, disconnect } = useWallet();
    const [isVerifying, setIsVerifying] = useState(false);
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [authSkipped, setAuthSkipped] = useState(false);
    const authTriggeredRef = useRef(false);
    const retryCountRef = useRef(0);

    const attemptAuth = useCallback(async () => {
        if (!publicKey || !signMessage) return;

        const walletAddress = publicKey.toBase58();
        const key = `djinn_auth_signature_${walletAddress}`;

        // Check if already authenticated
        const storedSig = localStorage.getItem(key);
        if (storedSig) {
            setIsAuthenticated(true);
            return;
        }

        setIsVerifying(true);
        try {
            const messageContent = `Welcome to Djinn Markets!\n\nPlease sign this message to verify ownership of your wallet.\n\nWallet: ${walletAddress}\nTimestamp: ${Date.now()}`;
            const message = new TextEncoder().encode(messageContent);

            const signature = await signMessage(message);

            try {
                localStorage.setItem(key, encodeBS58(signature));
            } catch (quotaError) {
                if (quotaError instanceof Error && (quotaError.name === 'QuotaExceededError' || quotaError.name === 'NS_ERROR_DOM_QUOTA_REACHED')) {
                    console.warn('[Auth] LocalStorage full, purging...');
                    Object.keys(localStorage).forEach( (k: any) => {
                        if (k.startsWith('djinn_pfp_') ||
                            k.startsWith('djinn_profile_') ||
                            k.startsWith('djinn_markets') ||
                            k.startsWith('djinn_created_markets')) {
                            localStorage.removeItem(k);
                        }
                    });
                    try {
                        localStorage.setItem(key, encodeBS58(signature));
                    } catch (retryError) {
                        console.error('[Auth] Still cannot save after purge');
                        Object.keys(localStorage).forEach( (k: any) => {
                            if (k.startsWith('djinn_')) localStorage.removeItem(k);
                        });
                        localStorage.setItem(key, encodeBS58(signature));
                    }
                } else {
                    throw quotaError;
                }
            }

            setIsAuthenticated(true);
            retryCountRef.current = 0;
            console.log('[Auth] Wallet authenticated');
        } catch (error) {
            console.warn('[Auth] Signature rejected or failed:', error);
            // Don't disconnect - let user stay connected and skip auth
            // They can still use the app, just not verified
            setAuthSkipped(true);
            setIsAuthenticated(true); // Let them through anyway
        } finally {
            setIsVerifying(false);
        }
    }, [publicKey, signMessage]);

    useEffect(() => {
        if (connected && publicKey && !authTriggeredRef.current) {
            authTriggeredRef.current = true;

            // Wait for Phantom popup to fully close before requesting signature
            // 2s delay prevents popup collision
            const timer = setTimeout(() => {
                attemptAuth();
            }, 2000);

            return () => clearTimeout(timer);
        } else if (!connected) {
            setIsAuthenticated(false);
            setAuthSkipped(false);
            authTriggeredRef.current = false;
            retryCountRef.current = 0;
        }
    }, [connected, publicKey, attemptAuth]);

    // Show verification screen only while actively signing (not blocking indefinitely)
    if (connected && !isAuthenticated && !authSkipped) {
        return (
            <div className="fixed inset-0 z-[99999] bg-black/90 backdrop-blur-md flex items-center justify-center p-4">
                <div className="relative w-full max-w-sm">
                    {/* Shadow Layer */}
                    <div className="absolute inset-0 bg-[#FF69B4] translate-x-3 translate-y-3 border-[3px] border-black rounded-[2.5rem]" />

                    {/* Content Layer */}
                    <div className="relative bg-white border-[3px] border-black p-8 flex flex-col items-center text-center space-y-6 rounded-[2.5rem]">

                        {/* Icon */}
                        <div className="w-20 h-20 bg-black flex items-center justify-center border-[3px] border-black shadow-[4px_4px_0px_#FF69B4] rounded-2xl">
                            {isVerifying ? (
                                <div className="w-10 h-10 border-4 border-white/30 border-t-[#FF69B4] rounded-full animate-spin" />
                            ) : (
                                <Zap className="w-10 h-10 text-[#FF69B4] fill-[#FF69B4]" />
                            )}
                        </div>

                        {/* Text */}
                        <div className="space-y-2">
                            <h2
                                className="text-3xl font-black uppercase tracking-tight"
                                style={{ fontFamily: 'var(--font-unbounded), sans-serif' }}
                            >
                                {isVerifying ? 'Verifying' : 'Sign Request'}
                            </h2>
                            <p className="text-black/50 text-xs font-bold uppercase tracking-widest px-8 leading-relaxed">
                                {isVerifying
                                    ? 'Please sign the message in your wallet to verify ownership.'
                                    : 'Preparing verification...'}
                            </p>
                        </div>

                        {/* Actions */}
                        <button
                            onClick={() => {
                                setAuthSkipped(true);
                                setIsAuthenticated(true);
                            }}
                            className="bg-black text-white px-6 py-3 text-[10px] font-black uppercase tracking-[0.2em] hover:bg-[#FF69B4] hover:shadow-[4px_4px_0px_#000] transition-all border-[2px] border-black rounded-2xl"
                        >
                            Skip for now
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return <>{children}</>;
}
