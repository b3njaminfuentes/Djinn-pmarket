'use client';

import React, { useState, useEffect } from 'react';
import { isUsernameAvailable, upsertProfile } from '@/lib/supabase-db';
import { Loader2, X } from 'lucide-react';

interface ClaimUsernameModalProps {
    isOpen: boolean;
    walletAddress: string;
    onSuccess: (username: string) => void;
    onClose: () => void;
}

export default function ClaimUsernameModal({ isOpen, walletAddress, onSuccess, onClose }: ClaimUsernameModalProps) {
    const [step, setStep] = useState<'INPUT' | 'SUCCESS'>('INPUT');
    const [username, setUsername] = useState('');
    const [isChecking, setIsChecking] = useState(false);
    const [isAvailable, setIsAvailable] = useState<boolean | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (!isOpen) {
            setStep('INPUT');
            setUsername('');
            setIsAvailable(null);
        }
    }, [isOpen]);

    useEffect(() => {
        if (!isOpen || step !== 'INPUT') return;
        const checkAvailability = async () => {
            if (username.length < 3) {
                setIsAvailable(null);
                return;
            }
            setIsChecking(true);
            const avail = await isUsernameAvailable(username);
            setIsAvailable(avail);
            setIsChecking(false);
        };

        const timeout = setTimeout(checkAvailability, 500);
        return () => clearTimeout(timeout);
    }, [username, isOpen, step]);

    const handleSubmit = async () => {
        if (!isAvailable || username.length < 3) return;

        setIsSubmitting(true);
        setError('');

        try {
            // Check for referral in localStorage
            const referrerUsername = localStorage.getItem('referredBy');
            let referrerWallet = null;
            if (referrerUsername) {
                const { getWalletByUsername, registerReferral } = await import('@/lib/supabase-db');
                referrerWallet = await getWalletByUsername(referrerUsername);
            }

            const newProfile = await upsertProfile({
                wallet_address: walletAddress,
                username: username,
                bio: 'New Djinn Trader',
                avatar_url: '/pink-pfp.png',
                referred_by: referrerWallet
            });

            if (newProfile) {
                // If there was a referral, register it in the referrals table
                if (referrerWallet) {
                    const { registerReferral, getProfile } = await import('@/lib/supabase-db');
                    const referrerProfile = await getProfile(referrerWallet);
                    if (referrerProfile?.id) {
                        await registerReferral(referrerProfile.id, newProfile.id!, walletAddress);
                    }
                    localStorage.removeItem('referredBy');
                }

                // Instead of closing, move to SUCCESS step
                setStep('SUCCESS');
            } else {
                setError('Failed to create profile. Try again.');
            }
        } catch (e) {
            console.error(e);
            setError('An error occurred.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleConnectX = async () => {
        const { supabase } = await import('@/lib/supabase');
        try {
            console.log("Attempting X connection from Claim Modal...");
            const { data, error } = await supabase.auth.signInWithOAuth({
                provider: 'x',
                options: {
                    redirectTo: window.location.origin,
                },
            });
            if (error) {
                console.error("🔴 Supabase Auth Error (Claim Modal):", error);
                alert(`Auth Error: ${error.message}`);
                throw error;
            }
        } catch (e: any) {
            console.error("❌ Failed to connect X:", e);
            if (!e.message?.includes("provider is not enabled")) {
                alert("Auth Error: Could not connect to X.");
            }
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 pointer-events-none">
            {/* Backdrop: Subtle dark blur */}
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm pointer-events-auto" />

            <div className={`
                relative w-full max-w-md pointer-events-auto
                bg-white border-[4px] border-black rounded-[2.5rem] p-8
                shadow-[12px_12px_0px_0px_rgba(0,0,0,1)]
                animate-in slide-in-from-bottom-12 duration-500
            `}>

                {step === 'INPUT' ? (
                    <>
                        {/* Header: Title + Close Button */}
                        <div className="flex justify-between items-start mb-8">
                            <h1 className="text-4xl font-black lowercase tracking-tighter text-black leading-none">
                                claim your<br />identity
                            </h1>

                            <button
                                onClick={onClose}
                                className="bg-red-500 text-white border-2 border-black p-2 rounded-full hover:bg-red-600 hover:scale-110 transition-all shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] active:translate-y-[2px] active:shadow-none"
                            >
                                <X className="w-5 h-5 stroke-[3]" />
                            </button>
                        </div>

                        {/* Avatar Placeholder */}
                        <div className="flex justify-center mb-8">
                            <div className="relative">
                                <div className="w-24 h-24 rounded-full border-4 border-black bg-[#F492B7] flex items-center justify-center overflow-hidden shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
                                    <img src="/pink-pfp.png" className="w-full h-full object-cover" alt="Avatar" />
                                </div>
                                <div className="absolute -bottom-1 -right-1 bg-white border-2 border-black px-3 py-1 rounded-full text-[10px] font-black uppercase text-black shadow-[2px_2px_0px_0px_black]">
                                    New
                                </div>
                            </div>
                        </div>

                        {/* Input Section */}
                        <div className="space-y-6">
                            <div>
                                <label className="block text-black font-black lowercase mb-2 ml-1 text-sm tracking-tight">choose username</label>
                                <div className="relative">
                                    <input
                                        type="text"
                                        className="w-full bg-white border-[3px] border-black rounded-2xl px-5 py-4 font-bold text-xl text-black outline-none focus:bg-[#F492B7]/10 transition-all placeholder:text-gray-300 lowercase"
                                        placeholder="djinngod"
                                        value={username}
                                        onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                                        maxLength={15}
                                    />
                                    <div className="absolute right-4 top-1/2 -translate-y-1/2">
                                        {isChecking ? (
                                            <Loader2 className="w-6 h-6 animate-spin text-black" />
                                        ) : username.length >= 3 ? (
                                            isAvailable ? (
                                                <div className="bg-[#10B981] border-2 border-black rounded-full p-1 shadow-[2px_2px_0px_0px_black]">
                                                    <svg className="w-4 h-4 text-black" fill="none" stroke="currentColor" strokeWidth="4" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
                                                </div>
                                            ) : (
                                                <div className="bg-red-500 border-2 border-black rounded-full p-1 shadow-[2px_2px_0px_0px_black]">
                                                    <X className="w-4 h-4 text-white" strokeWidth={4} />
                                                </div>
                                            )
                                        ) : null}
                                    </div>
                                </div>
                                <div className="mt-3 px-1 flex justify-between items-center text-[11px] font-black uppercase tracking-wider">
                                    <span className={error || isAvailable === false ? 'text-red-500' : 'text-gray-400'}>
                                        {error || (isAvailable === false ? 'Taken' : 'min 3 chars')}
                                    </span>
                                    <span className="text-gray-400">{username.length}/15</span>
                                </div>
                            </div>

                            {/* Action Button */}
                            <button
                                onClick={handleSubmit}
                                disabled={!isAvailable || username.length < 3 || isSubmitting}
                                className={`
                                    w-full py-5 rounded-2xl font-black text-2xl uppercase border-[3px] border-black transition-all flex items-center justify-center gap-3
                                    ${isAvailable && !isSubmitting
                                        ? 'bg-[#10B981] text-black hover:-translate-y-1 hover:shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] active:translate-y-0 active:shadow-none cursor-pointer'
                                        : 'bg-gray-100 text-gray-400 border-dashed cursor-not-allowed opacity-50'}
                                `}
                            >
                                {isSubmitting ? <Loader2 className="animate-spin w-6 h-6" /> : 'Claim Identity'}
                            </button>
                        </div>
                    </>
                ) : (
                    <>
                        {/* SUCCESS / CONNECT X STEP */}
                        <div className="text-center animate-in fade-in zoom-in-95 duration-300">
                            <div className="w-24 h-24 mx-auto bg-[#10B981] rounded-full flex items-center justify-center border-4 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] mb-6">
                                <span className="text-4xl">🎉</span>
                            </div>

                            <h2 className="text-3xl font-black lowercase tracking-tight mb-2">welcome, {username}!</h2>
                            <p className="text-sm font-bold text-gray-500 mb-8 max-w-[80%] mx-auto">your identity is secure. now, link your official X account to complete your profile.</p>

                            <button
                                onClick={handleConnectX}
                                className="w-full bg-black text-white text-lg font-black uppercase tracking-widest py-4 rounded-xl border-2 border-transparent hover:bg-black/90 hover:border-white/20 transition-all flex items-center justify-center gap-3 shadow-[4px_4px_0px_0px_#F492B7] hover:translate-y-[2px] hover:shadow-none mb-4"
                            >
                                <svg viewBox="0 0 24 24" className="w-5 h-5 fill-white"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" /></svg>
                                Connect X
                            </button>

                            <button
                                onClick={() => onSuccess(username)}
                                className="text-xs font-black uppercase tracking-wider text-gray-400 hover:text-black transition-colors"
                            >
                                Skip for now
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div >
    );
}
