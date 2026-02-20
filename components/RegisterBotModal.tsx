'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useAnchorWallet, useConnection, useWallet } from '@solana/wallet-adapter-react';
import { PublicKey, SystemProgram } from '@solana/web3.js';
import { Program, AnchorProvider, Idl } from '@coral-xyz/anchor';
import { Loader2, X, Check } from 'lucide-react';
import { motion } from 'framer-motion';
import idl from '../lib/idl/djinn_market.json';

const DJINN_PROGRAM_ID = new PublicKey('A8pVMgP6vwjGqcbYh1WGWDjXq9uwQRoF9Lz1siLmD7nm');

interface RegisterBotModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess?: (botId: string) => void;
    initialCode?: string; // From URL ?code=DJNN-XXXX
}

const CATEGORIES = [
    { value: 0, label: 'All Markets', icon: '🌐' },
    { value: 1, label: 'Sports', icon: '⚽' },
    { value: 2, label: 'Crypto', icon: '₿' },
    { value: 3, label: 'Politics', icon: '🏛️' },
    { value: 4, label: 'Other', icon: '🔮' },
];

const STAKE_AMOUNT_SOL = 10;

type Step = 'CODE' | 'STAKE' | 'SUCCESS';

interface CodeData {
    valid: boolean;
    status: string;
    botName: string | null;
    category: number | null;
    botWallet: string | null;
}

export default function RegisterBotModal({ isOpen, onClose, onSuccess, initialCode }: RegisterBotModalProps) {
    const { connection } = useConnection();
    const wallet = useAnchorWallet();
    const { publicKey } = useWallet();

    // Step state
    const [step, setStep] = useState<Step>('CODE');

    // Code step
    const [codeInput, setCodeInput] = useState('');
    const [codeData, setCodeData] = useState<CodeData | null>(null);
    const [codeError, setCodeError] = useState('');
    const [isVerifying, setIsVerifying] = useState(false);

    // Stake step
    const [isStaking, setIsStaking] = useState(false);
    const [stakeError, setStakeError] = useState('');

    // Success
    const [botId, setBotId] = useState('');

    // Config Input State
    const [botNameInput, setBotNameInput] = useState('');
    const [categoryInput, setCategoryInput] = useState(0);

    // Reset on close
    useEffect(() => {
        if (!isOpen) {
            setStep('CODE');
            setCodeInput('');
            setCodeData(null);
            setCodeError('');
            setIsVerifying(false);
            setIsStaking(false);
            setStakeError('');
            setBotId('');
        } else if (initialCode) {
            setCodeInput(initialCode.toUpperCase());
        }
    }, [isOpen, initialCode]);

    // Auto-verify when initialCode is present
    useEffect(() => {
        if (isOpen && initialCode && !codeData && !isVerifying) {
            verifyCode(initialCode.toUpperCase());
        }
    }, [isOpen, initialCode]);

    const verifyCode = useCallback(async (code: string) => {
        if (!code || code.length < 4) return;

        setIsVerifying(true);
        setCodeError('');
        setCodeData(null);

        try {
            const res = await fetch(`/api/bot/codes/verify?code=${encodeURIComponent(code)}`);
            const data = await res.json();

            if (!data.valid) {
                setCodeError(data.reason || 'Invalid code');
                return;
            }

            // If code was already used (bot registered via CLI), show success
            if (data.status === 'used') {
                setCodeData(data);
                setBotNameInput(data.botName || '');
                setCategoryInput(data.category || 0);
                setBotId(data.botProfilePda || data.botWallet || '');
                setStep('SUCCESS');
                return;
            }

            setCodeData(data);

            // If code has bot data (claimed by CLI), initialize inputs and advance
            if (data) {
                setBotNameInput(data.botName || '');
                setCategoryInput(data.category || 0);
            }

            // If code has bot data (claimed by CLI), auto-advance to STAKE
            if (data.botName) {
                setStep('STAKE');
            }
        } catch {
            setCodeError('Could not verify code. Is the server running?');
        } finally {
            setIsVerifying(false);
        }
    }, []);

    const handleVerifyClick = () => {
        verifyCode(codeInput.toUpperCase().trim());
    };

    // Stake & deploy via Anchor
    const handleStakeAndDeploy = async () => {
        if (!wallet || !publicKey || !codeData) {
            setStakeError('Wallet not connected or code not verified');
            return;
        }

        if (!botNameInput) {
            setStakeError('Please enter a bot name');
            return;
        }

        setIsStaking(true);
        setStakeError('');

        try {
            const provider = new AnchorProvider(connection, wallet, AnchorProvider.defaultOptions());
            const program = new Program(idl as any, provider);

            const [botProfilePDA] = PublicKey.findProgramAddressSync(
                [Buffer.from('bot_profile'), publicKey.toBuffer()],
                DJINN_PROGRAM_ID
            );

            const [botEscrowPDA] = PublicKey.findProgramAddressSync(
                [Buffer.from('bot_escrow'), publicKey.toBuffer()],
                DJINN_PROGRAM_ID
            );

            const metadataUri = JSON.stringify({
                description: `Autonomous ${CATEGORIES[categoryInput || 0]?.label || 'general'} prediction agent`,
                image: `https://api.dicebear.com/9.x/bottts-neutral/svg?seed=${botNameInput}`,
            });

            const tx = await program.methods
                .registerBot(
                    botNameInput,
                    metadataUri,
                    categoryInput || 0
                )
                .accounts({
                    botProfile: botProfilePDA,
                    botEscrow: botEscrowPDA,
                    owner: publicKey,
                    systemProgram: SystemProgram.programId,
                })
                .rpc();

            console.log('Bot registered, tx:', tx);
            await new Promise(resolve => setTimeout(resolve, 2000));

            // Mark code as used
            const code = codeInput.toUpperCase().trim() || initialCode?.toUpperCase().trim() || '';
            try {
                await fetch('/api/bot/codes/use', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        code,
                        ownerWallet: publicKey.toBase58(),
                        botProfilePda: botProfilePDA.toBase58(),
                    }),
                });
            } catch {
                // Non-critical — code tracking failed but bot is registered
            }

            const generatedBotId = botProfilePDA.toBase58();
            setBotId(generatedBotId);
            setStep('SUCCESS');
            onSuccess?.(generatedBotId);

        } catch (e: unknown) {
            const err = e as Error;
            let msg = err.message || 'Failed to register bot';
            if (msg.includes('0x1')) msg = 'Insufficient funds for transaction fee';
            if (msg.includes('custom program error: 0x0')) msg = 'Bot already registered or name taken';
            setStakeError(msg);
        } finally {
            setIsStaking(false);
        }
    };

    if (!isOpen) return null;

    const botName = codeData?.botName || '';
    const category = codeData?.category ?? 0;
    const steps: Step[] = ['CODE', 'STAKE', 'SUCCESS'];

    return (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 pointer-events-none">
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm pointer-events-auto" onClick={onClose} />

            <motion.div
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 20 }}
                className="relative w-full max-w-lg pointer-events-auto bg-white border-[4px] border-black rounded-[2.5rem] p-8 shadow-[12px_12px_0px_0px_rgba(0,0,0,1)] overflow-y-auto max-h-[90vh]"
            >
                {/* Close */}
                <button
                    onClick={onClose}
                    className="absolute top-6 right-6 bg-red-500 text-white border-2 border-black p-2 rounded-full hover:bg-red-600 hover:scale-110 transition-all shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] active:translate-y-[2px] active:shadow-none z-20"
                >
                    <X className="w-4 h-4 stroke-[3]" />
                </button>

                {/* Progress Dots */}
                <div className="flex justify-center gap-2 mb-6">
                    {steps.map((s, i) => (
                        <div
                            key={s}
                            className={`w-3 h-3 rounded-full border-2 border-black transition-all ${step === s ? 'bg-[#F492B7] scale-125' :
                                steps.indexOf(step) > i ? 'bg-[#10B981]' :
                                    'bg-gray-200'
                                }`}
                        />
                    ))}
                </div>

                {/* ═══════════ STEP 1: CODE ═══════════ */}
                {step === 'CODE' && (
                    <div className="animate-in fade-in slide-in-from-right-4 duration-300">
                        <div className="mb-6">
                            <h1 className="text-3xl font-black lowercase tracking-tighter text-black leading-none mb-1">
                                activation code
                            </h1>
                            <p className="text-gray-400 text-sm font-bold">
                                enter your code from the CLI setup
                            </p>
                        </div>

                        {/* Code Input */}
                        <div className="mb-6">
                            <div className="flex gap-3">
                                <input
                                    type="text"
                                    className="flex-1 bg-white border-[3px] border-black rounded-2xl px-5 py-4 font-black text-2xl text-black outline-none focus:bg-[#F492B7]/10 transition-all placeholder:text-gray-300 uppercase tracking-widest text-center"
                                    placeholder="DJNN-XXXX"
                                    value={codeInput}
                                    onChange={(e) => {
                                        const val = e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, '');
                                        setCodeInput(val);
                                        setCodeError('');
                                        setCodeData(null);
                                    }}
                                    maxLength={9}
                                    onKeyDown={(e) => { if (e.key === 'Enter') handleVerifyClick(); }}
                                />
                            </div>
                            {codeError && (
                                <p className="text-red-500 text-xs font-bold mt-2 ml-1">{codeError}</p>
                            )}
                        </div>

                        {/* Verified Code Summary */}
                        {codeData && codeData.botName && (
                            <div className="bg-[#10B981]/10 border-[3px] border-[#10B981] rounded-2xl p-4 mb-6">
                                <div className="text-[10px] font-black uppercase text-[#10B981] mb-2 tracking-wider">Code Valid</div>
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-xl border-2 border-black bg-[#F492B7] flex items-center justify-center text-2xl shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">🤖</div>
                                    <div>
                                        <div className="font-black text-black text-lg">{codeData.botName}</div>
                                        <div className="text-gray-500 text-xs font-bold">{CATEGORIES[codeData.category || 0]?.icon} {CATEGORIES[codeData.category || 0]?.label}</div>
                                    </div>
                                    <div className="ml-auto">
                                        <Check className="w-6 h-6 text-[#10B981]" />
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Verified but no bot data yet (code available but not claimed by CLI) */}
                        {codeData && !codeData.botName && (
                            <div className="bg-yellow-50 border-[3px] border-yellow-400 rounded-2xl p-4 mb-6">
                                <div className="text-[10px] font-black uppercase text-yellow-600 mb-1 tracking-wider">Code Valid — CLI Setup Needed</div>
                                <p className="text-yellow-700 text-xs font-bold">
                                    This code is valid but hasn&apos;t been claimed by the CLI yet. Run <code className="bg-yellow-100 px-1.5 py-0.5 rounded">npx @djinn/setup</code> first.
                                </p>
                            </div>
                        )}

                        {/* Action Button */}
                        {!codeData?.botName ? (
                            <button
                                onClick={handleVerifyClick}
                                disabled={isVerifying || codeInput.length < 4}
                                className={`w-full py-4 rounded-2xl font-black text-xl uppercase border-[3px] border-black transition-all flex items-center justify-center gap-2 ${isVerifying || codeInput.length < 4
                                    ? 'bg-gray-100 text-gray-400 border-dashed cursor-not-allowed opacity-50'
                                    : 'bg-[#F492B7] text-black hover:-translate-y-1 hover:shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] active:translate-y-0 active:shadow-none cursor-pointer'
                                    }`}
                            >
                                {isVerifying ? (
                                    <><Loader2 className="w-5 h-5 animate-spin" /> Verifying...</>
                                ) : (
                                    'Verify Code'
                                )}
                            </button>
                        ) : (
                            <button
                                onClick={() => setStep('STAKE')}
                                className="w-full py-4 rounded-2xl font-black text-xl uppercase border-[3px] border-black bg-[#10B981] text-black hover:-translate-y-1 hover:shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] active:translate-y-0 active:shadow-none transition-all cursor-pointer flex items-center justify-center gap-2"
                            >
                                Next → Stake & Deploy
                            </button>
                        )}

                        {/* Help text */}
                        <p className="text-gray-400 text-[10px] font-bold uppercase tracking-wider mt-4 text-center">
                            Don&apos;t have a code? Contact the Djinn team
                        </p>
                    </div>
                )}

                {/* ═══════════ STEP 2: STAKE ═══════════ */}
                {step === 'STAKE' && (
                    <div className="animate-in fade-in slide-in-from-right-4 duration-300">
                        <div className="mb-6">
                            <h1 className="text-3xl font-black lowercase tracking-tighter text-black leading-none mb-1">
                                configure & deploy
                            </h1>
                            <p className="text-gray-400 text-sm font-bold">set your bot's identity and stake {STAKE_AMOUNT_SOL} SOL</p>
                        </div>

                        {/* Configuration Inputs */}
                        <div className="bg-white border-[3px] border-black rounded-2xl p-5 mb-4 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
                            <div className="mb-4">
                                <label className="block text-xs font-black uppercase text-gray-500 mb-1">Bot Name</label>
                                <input
                                    type="text"
                                    className="w-full bg-gray-50 border-2 border-black rounded-xl px-4 py-3 font-black text-lg text-black outline-none focus:bg-[#F492B7]/10 focus:border-[#F492B7] transition-all placeholder:text-gray-300"
                                    placeholder="Ex: Alpha Hunter"
                                    value={botNameInput}
                                    onChange={(e) => setBotNameInput(e.target.value.slice(0, 32))}
                                    maxLength={32}
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-black uppercase text-gray-500 mb-1">Strategy Category</label>
                                <div className="grid grid-cols-2 gap-2">
                                    {CATEGORIES.slice(1).map((cat) => (
                                        <button
                                            key={cat.value}
                                            onClick={() => setCategoryInput(cat.value)}
                                            className={`p-2 rounded-xl border-2 transition-all flex items-center justify-center gap-2 text-xs font-bold ${categoryInput === cat.value
                                                ? 'bg-[#F492B7] border-black text-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]'
                                                : 'bg-white border-gray-200 text-gray-400 hover:border-black hover:text-black'
                                                }`}
                                        >
                                            <span>{cat.icon}</span>
                                            <span>{cat.label}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* Bot wallet warning */}
                        {codeData?.botWallet && publicKey && codeData.botWallet === publicKey.toBase58() && (
                            <div className="bg-yellow-50 border-[3px] border-yellow-400 rounded-2xl p-4 mb-4">
                                <div className="text-[10px] font-black uppercase text-yellow-600 mb-1 tracking-wider">Wrong Wallet Connected</div>
                                <p className="text-yellow-700 text-xs font-bold">
                                    You&apos;re connected with the <strong>bot wallet</strong>. Please connect your <strong>human/owner wallet</strong> (Phantom) to register.
                                </p>
                            </div>
                        )}

                        {/* Stake Info */}
                        <div className="bg-gray-50 border-[3px] border-black rounded-2xl p-5 mb-4">
                            <div className="flex justify-between items-center mb-1">
                                <span className="font-black text-sm text-gray-500 uppercase">Registration Stake</span>
                                <span className="font-black text-2xl text-black">{STAKE_AMOUNT_SOL} SOL</span>
                            </div>
                            <div className="text-[10px] font-bold text-gray-400 leading-relaxed">
                                Stake is held in escrow. Returned when you deregister (minus slashing).
                                {codeData?.botWallet && <> Bot wallet: <code className="bg-gray-100 px-1 rounded text-[9px]">{codeData.botWallet.slice(0, 8)}...{codeData.botWallet.slice(-4)}</code></>}
                            </div>
                        </div>

                        {stakeError && (
                            <div className="bg-red-50 border-2 border-red-400 rounded-xl p-3 mb-4 text-red-600 text-xs font-bold">
                                {stakeError}
                            </div>
                        )}

                        {/* Action Buttons */}
                        <div className="flex gap-3">
                            <button
                                onClick={() => setStep('CODE')}
                                className="py-4 px-6 rounded-2xl font-black text-sm uppercase border-2 border-black text-black bg-white hover:bg-gray-50 transition-all"
                            >
                                ← Back
                            </button>
                            <button
                                onClick={handleStakeAndDeploy}
                                disabled={isStaking || !publicKey || !botNameInput}
                                className={`flex-1 py-4 rounded-2xl font-black text-xl uppercase border-[3px] border-black transition-all flex items-center justify-center gap-2 ${!publicKey || !botNameInput
                                    ? 'bg-gray-100 text-gray-400 border-dashed cursor-not-allowed opacity-50'
                                    : 'bg-[#10B981] text-black hover:-translate-y-1 hover:shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] active:translate-y-0 active:shadow-none'
                                    }`}
                            >
                                {isStaking ? (
                                    <><Loader2 className="w-5 h-5 animate-spin" /> Deploying...</>
                                ) : !publicKey ? (
                                    'Connect Wallet First'
                                ) : (
                                    <>Stake & Launch</>
                                )}
                            </button>
                        </div>
                    </div>
                )}

                {/* ═══════════ STEP 3: SUCCESS ═══════════ */}
                {step === 'SUCCESS' && (
                    <div className="text-center animate-in fade-in zoom-in-95 duration-300">
                        <div className="w-24 h-24 mx-auto bg-[#10B981] rounded-2xl flex items-center justify-center border-4 border-black shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] mb-6">
                            <span className="text-5xl">🤖</span>
                        </div>

                        <h2 className="text-3xl font-black lowercase tracking-tight text-black mb-1">{botName} is live!</h2>
                        <p className="text-gray-400 text-sm font-bold mb-6">your bot is registered and ready to trade</p>

                        {/* Tier Info */}
                        <div className="bg-gray-50 border-2 border-black rounded-xl p-3 mb-6 text-left">
                            <div className="text-[10px] font-black uppercase text-gray-400 mb-1">Current Tier: Novice</div>
                            <div className="text-xs font-bold text-gray-500">
                                Max 2 SOL/trade · 10 trades/hour · Upgrade by building reputation
                            </div>
                        </div>

                        {/* Action Buttons */}
                        <div className="flex gap-3">
                            <a
                                href={`/bot/${botId}`}
                                className="flex-1 py-4 rounded-2xl font-black text-lg uppercase border-[3px] border-black bg-[#F492B7] text-black hover:-translate-y-1 hover:shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] active:translate-y-0 active:shadow-none transition-all text-center"
                            >
                                View My Bot →
                            </a>
                        </div>

                        <button
                            onClick={onClose}
                            className="mt-4 text-xs font-black uppercase tracking-wider text-gray-400 hover:text-black transition-colors"
                        >
                            Close
                        </button>
                    </div>
                )}
            </motion.div>
        </div>
    );
}
