'use client';

import React, { useState, useEffect } from 'react';
import { useAnchorWallet, useConnection, useWallet } from '@solana/wallet-adapter-react';
import { Keypair, PublicKey, SystemProgram } from '@solana/web3.js';
import { Program, AnchorProvider, Idl, utils, BN } from '@coral-xyz/anchor';
import { Loader2, X, Copy, Check, Download } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import idl from '../lib/idl/djinn_market.json';

// Hardcoded Program ID to match API route & Deployment
const DJINN_PROGRAM_ID = new PublicKey('A8pVMgP6vwjGqcbYh1WGWDjXq9uwQRoF9Lz1siLmD7nm');

interface RegisterBotModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess?: (botId: string) => void;
    initialBotName?: string;
    initialCategory?: string; // Expect string from URL param, parse to number
}

const CATEGORIES = [
    { value: 0, label: 'All Markets', icon: '🌐', desc: 'Research every category' },
    { value: 1, label: 'Sports', icon: '⚽', desc: 'Sports events & matches' },
    { value: 2, label: 'Crypto', icon: '₿', desc: 'Token prices & launches' },
    { value: 3, label: 'Politics', icon: '🏛️', desc: 'Elections & policy' },
    { value: 4, label: 'Other', icon: '🔮', desc: 'Culture, science, tech' },
];

const STAKE_AMOUNT_SDL = 10; // 10 SOL (Devnet)

type Step = 'IDENTITY' | 'WALLET' | 'STAKE' | 'SUCCESS';

export default function RegisterBotModal({ isOpen, onClose, onSuccess, initialBotName, initialCategory }: RegisterBotModalProps) {
    const { connection } = useConnection();
    const wallet = useAnchorWallet();
    const { publicKey } = useWallet();

    // Step state
    const [step, setStep] = useState<Step>('IDENTITY');

    // Step 1: Identity
    const [botName, setBotName] = useState('');
    const [category, setCategory] = useState(0);
    const [strategy, setStrategy] = useState('');

    // Step 2: Wallet
    const [botKeypair, setBotKeypair] = useState<Keypair | null>(null);
    const [keyDownloaded, setKeyDownloaded] = useState(false);
    const [copied, setCopied] = useState(false);
    const [isExistingWallet, setIsExistingWallet] = useState(false);

    // Step 3: Stake
    const [isStaking, setIsStaking] = useState(false);
    const [stakeError, setStakeError] = useState('');

    // Success
    const [botId, setBotId] = useState('');
    const [setupCopied, setSetupCopied] = useState(false);

    // Reset on close & Init from props
    useEffect(() => {
        if (!isOpen) {
            setStep('IDENTITY');
            setBotName('');
            setCategory(0);
            setStrategy('');
            setBotKeypair(null);
            setKeyDownloaded(false);
            setCopied(false);
            setIsExistingWallet(false);
            setIsStaking(false);
            setStakeError('');
            setBotId('');
            setSetupCopied(false);
        } else {
            // Pre-fill from props (Magic Link)
            if (initialBotName) setBotName(initialBotName);
            if (initialCategory) {
                // partial match or index
                const catIndex = CATEGORIES.findIndex(c => c.label.toLowerCase() === initialCategory.toLowerCase());
                if (catIndex !== -1) setCategory(catIndex);
            }
        }
    }, [isOpen, initialBotName, initialCategory]);

    // Generate wallet
    const handleGenerateWallet = () => {
        const kp = Keypair.generate();
        setBotKeypair(kp);
        setIsExistingWallet(false);
    };

    // Use existing wallet
    const handleUseExisting = () => {
        setBotKeypair(null);
        setKeyDownloaded(false);
        setIsExistingWallet(true);
        setStep('STAKE'); // Auto-proceed
    };

    // Download private key
    const handleDownloadKey = () => {
        if (!botKeypair) return;
        const keyArray = Array.from(botKeypair.secretKey);
        const blob = new Blob([JSON.stringify(keyArray)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `djinn-bot-${botName || 'key'}.json`;
        a.click();
        URL.revokeObjectURL(url);
        setKeyDownloaded(true);
    };

    // Copy address
    const handleCopyAddress = () => {
        if (!botKeypair) return;
        navigator.clipboard.writeText(botKeypair.publicKey.toBase58());
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    // Stake & deploy via Anchor
    const handleStakeAndDeploy = async () => {
        if (!wallet || !publicKey) {
            setStakeError('Wallet not connected');
            return;
        }

        setIsStaking(true);
        setStakeError('');

        try {
            const provider = new AnchorProvider(connection, wallet, AnchorProvider.defaultOptions());
            const program = new Program(idl as Idl, DJINN_PROGRAM_ID, provider);

            // Find PDAs
            const [botProfilePDA] = PublicKey.findProgramAddressSync(
                [Buffer.from('bot_profile'), publicKey.toBuffer()],
                DJINN_PROGRAM_ID
            );

            const [botEscrowPDA] = PublicKey.findProgramAddressSync(
                [Buffer.from('bot_escrow'), publicKey.toBuffer()],
                DJINN_PROGRAM_ID
            );

            // Mock Metadata URI for now (could upload to IPFS/Arweave later)
            const metadataMock = JSON.stringify({
                description: strategy,
                image: `https://api.dicebear.com/9.x/bottts-neutral/svg?seed=${botName}`,
            });

            console.log('Registering bot...', {
                name: botName,
                metadata: metadataMock,
                category,
                accounts: {
                    botProfile: botProfilePDA.toBase58(),
                    botEscrow: botEscrowPDA.toBase58(),
                    owner: publicKey.toBase58(),
                }
            });

            const tx = await program.methods
                .registerBot(
                    botName,
                    metadataMock, // metadata_uri
                    category      // strategy_category (u8)
                )
                .accounts({
                    botProfile: botProfilePDA,
                    botEscrow: botEscrowPDA,
                    owner: publicKey,
                    systemProgram: SystemProgram.programId,
                })
                .rpc();

            console.log('Transaction signature:', tx);

            // Wait for confirmation logic usually handled by provider/connection but let's delay for UI
            await new Promise(resolve => setTimeout(resolve, 2000));

            // Success! Bot ID is the Profile PDA
            const generatedBotId = botProfilePDA.toBase58();
            setBotId(generatedBotId);
            setStep('SUCCESS');
            onSuccess?.(generatedBotId);

        } catch (e: any) {
            console.error(e);
            let msg = e.message || 'Failed to register bot';
            if (msg.includes('0x1')) msg = 'Insufficient funds for transaction fee';
            if (msg.includes('custom program error: 0x0')) msg = 'Bot name already taken or invalid'; // Generic anchor error map needed
            setStakeError(msg);
        } finally {
            setIsStaking(false);
        }
    };

    const handleCopySetup = () => {
        navigator.clipboard.writeText('npx @djinn/setup');
        setSetupCopied(true);
        setTimeout(() => setSetupCopied(false), 2000);
    };

    if (!isOpen) return null;

    const canProceedIdentity = botName.length >= 3 && botName.length <= 32 && strategy.length >= 10;
    const canProceedWallet = (botKeypair !== null && keyDownloaded) || isExistingWallet;

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
                {/* Close Button */}
                <button
                    onClick={onClose}
                    className="absolute top-6 right-6 bg-red-500 text-white border-2 border-black p-2 rounded-full hover:bg-red-600 hover:scale-110 transition-all shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] active:translate-y-[2px] active:shadow-none z-20"
                >
                    <X className="w-4 h-4 stroke-[3]" />
                </button>

                {/* Progress Dots */}
                <div className="flex justify-center gap-2 mb-6">
                    {(['IDENTITY', 'WALLET', 'STAKE', 'SUCCESS'] as Step[]).map((s, i) => (
                        <div
                            key={s}
                            className={`w-3 h-3 rounded-full border-2 border-black transition-all ${step === s ? 'bg-[#F492B7] scale-125' :
                                (['IDENTITY', 'WALLET', 'STAKE', 'SUCCESS'].indexOf(step) > i) ? 'bg-[#10B981]' :
                                    'bg-gray-200'
                                }`}
                        />
                    ))}
                </div>

                {/* ═══════════ STEP 1: IDENTITY ═══════════ */}
                {step === 'IDENTITY' && (
                    <div className="animate-in fade-in slide-in-from-right-4 duration-300">
                        <div className="mb-8">
                            <h1 className="text-3xl font-black lowercase tracking-tighter text-black leading-none mb-1">
                                deploy your bot
                            </h1>
                            <p className="text-gray-400 text-sm font-bold">give your AI agent an identity</p>
                        </div>

                        {/* Bot Avatar Preview */}
                        <div className="flex justify-center mb-6">
                            <div className="relative">
                                <div className="w-20 h-20 rounded-2xl border-4 border-black bg-[#F492B7] flex items-center justify-center text-4xl shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
                                    🤖
                                </div>
                                <div className="absolute -bottom-2 -right-2 bg-white border-2 border-black px-2 py-0.5 rounded-full text-[9px] font-black uppercase text-black shadow-[2px_2px_0px_0px_black]">
                                    {CATEGORIES[category].icon}
                                </div>
                            </div>
                        </div>

                        {/* Bot Name */}
                        <div className="mb-4">
                            <label className="block text-black font-black lowercase mb-2 ml-1 text-sm">bot name</label>
                            <input
                                type="text"
                                className="w-full bg-white border-[3px] border-black rounded-2xl px-5 py-4 font-bold text-xl text-black outline-none focus:bg-[#F492B7]/10 transition-all placeholder:text-gray-300 lowercase"
                                placeholder="alpha-sniper"
                                value={botName}
                                onChange={(e) => setBotName(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ''))}
                                maxLength={32}
                            />
                            <div className="flex justify-between mt-1 px-1">
                                <span className="text-[10px] font-black text-gray-400 uppercase">3-32 chars, a-z, 0-9, hyphens</span>
                                <span className="text-[10px] font-black text-gray-400">{botName.length}/32</span>
                            </div>
                        </div>

                        {/* Category */}
                        <div className="mb-4">
                            <label className="block text-black font-black lowercase mb-2 ml-1 text-sm">market category</label>
                            <div className="grid grid-cols-3 gap-2">
                                {CATEGORIES.map(cat => (
                                    <button
                                        key={cat.value}
                                        onClick={() => setCategory(cat.value)}
                                        className={`p-3 rounded-xl border-2 border-black text-center transition-all ${category === cat.value
                                            ? 'bg-[#F492B7] shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] -translate-y-0.5'
                                            : 'bg-white hover:bg-gray-50'
                                            }`}
                                    >
                                        <div className="text-xl mb-1">{cat.icon}</div>
                                        <div className="text-[10px] font-black text-black uppercase">{cat.label}</div>
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Strategy */}
                        <div className="mb-6">
                            <label className="block text-black font-black lowercase mb-2 ml-1 text-sm">strategy description</label>
                            <textarea
                                className="w-full bg-white border-[3px] border-black rounded-2xl px-5 py-4 font-bold text-sm text-black outline-none focus:bg-[#F492B7]/10 transition-all placeholder:text-gray-300 resize-none"
                                placeholder="Bonding curve holder — researches crypto markets, buys early positions with high conviction, holds for appreciation..."
                                rows={3}
                                value={strategy}
                                onChange={(e) => setStrategy(e.target.value)}
                                maxLength={200}
                            />
                            <div className="flex justify-between mt-1 px-1">
                                <span className="text-[10px] font-black text-gray-400 uppercase">min 10 chars — shown on your bot&apos;s profile</span>
                                <span className="text-[10px] font-black text-gray-400">{strategy.length}/200</span>
                            </div>
                        </div>

                        {/* Next Button */}
                        <button
                            onClick={() => setStep('WALLET')}
                            disabled={!canProceedIdentity}
                            className={`w-full py-4 rounded-2xl font-black text-xl uppercase border-[3px] border-black transition-all ${canProceedIdentity
                                ? 'bg-[#F492B7] text-black hover:-translate-y-1 hover:shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] active:translate-y-0 active:shadow-none cursor-pointer'
                                : 'bg-gray-100 text-gray-400 border-dashed cursor-not-allowed opacity-50'
                                }`}
                        >
                            Next → Connect Wallet
                        </button>
                    </div>
                )}

                {/* ═══════════ STEP 2: WALLET ═══════════ */}
                {step === 'WALLET' && (
                    <div className="animate-in fade-in slide-in-from-right-4 duration-300">
                        <div className="mb-6">
                            <h1 className="text-3xl font-black lowercase tracking-tighter text-black leading-none mb-1">
                                bot wallet
                            </h1>
                            <p className="text-gray-400 text-sm font-bold">your bot needs its own wallet to trade autonomously</p>
                        </div>

                        {!botKeypair ? (
                            /* Wallet Explainer + Options */
                            <div className="text-center py-4">
                                {/* Two Wallets Explainer */}
                                <div className="bg-gray-50 border-[3px] border-black rounded-2xl p-4 mb-5 text-left">
                                    <div className="text-[10px] font-black uppercase text-gray-400 mb-3 tracking-wider">How It Works</div>
                                    <div className="space-y-3">
                                        <div className="flex items-start gap-3">
                                            <div className="w-8 h-8 rounded-lg bg-[#F492B7] border-2 border-black flex items-center justify-center text-sm flex-shrink-0">🧑</div>
                                            <div>
                                                <div className="font-black text-xs text-black uppercase">Your Wallet (Owner)</div>
                                                <div className="text-[11px] text-gray-500 font-bold">
                                                    {publicKey ? `${publicKey.toBase58().slice(0, 4)}...${publicKey.toBase58().slice(-4)}` : 'Not connected'} — Signs registration &amp; pays stake
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex items-start gap-3">
                                            <div className="w-8 h-8 rounded-lg bg-black border-2 border-black flex items-center justify-center text-sm flex-shrink-0">🤖</div>
                                            <div>
                                                <div className="font-black text-xs text-black uppercase">Bot Wallet (Operator)</div>
                                                <div className="text-[11px] text-gray-500 font-bold">
                                                    Trades autonomously 24/7 on your behalf
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <p className="text-gray-500 text-sm font-bold mb-5 max-w-[90%] mx-auto">
                                    Did you run <code className="bg-gray-100 px-1.5 py-0.5 rounded text-[11px] border border-gray-200">npx @djinn/setup</code> already?
                                </p>

                                <div className="space-y-3">
                                    {/* OPTION 1: Use Connected (CLI) */}
                                    <button
                                        onClick={handleUseExisting}
                                        className="w-full bg-[#F492B7] text-black font-black text-sm uppercase px-6 py-4 rounded-2xl border-[3px] border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:-translate-y-1 hover:shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] active:translate-y-0 active:shadow-none transition-all flex items-center justify-center gap-2"
                                    >
                                        <span>⚡ Yes — Skip to Stake</span>
                                    </button>

                                    <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest my-2">- OR -</div>

                                    {/* OPTION 2: Generate New */}
                                    <button
                                        onClick={handleGenerateWallet}
                                        className="w-full bg-white text-black font-black text-sm uppercase px-6 py-4 rounded-2xl border-[3px] border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:-translate-y-1 hover:shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] active:translate-y-0 active:shadow-none transition-all grayscale opacity-70 hover:grayscale-0 hover:opacity-100"
                                    >
                                        <span>🔑 No — Generate Bot Wallet Here</span>
                                    </button>
                                </div>
                            </div>
                        ) : (
                            /* Wallet Generated */
                            <div>
                                {/* Address */}
                                <div className="bg-gray-50 border-[3px] border-black rounded-2xl p-4 mb-4">
                                    <div className="text-[10px] font-black uppercase text-gray-400 mb-2">Bot Public Address</div>
                                    <div className="flex items-center gap-2">
                                        <code className="text-sm font-bold text-black bg-white border border-gray-200 rounded-lg px-3 py-2 flex-1 truncate">
                                            {botKeypair.publicKey.toBase58()}
                                        </code>
                                        <button
                                            onClick={handleCopyAddress}
                                            className="p-2 bg-white border-2 border-black rounded-xl hover:bg-gray-100 transition-all shadow-[2px_2px_0px_0px_black] active:translate-y-[1px] active:shadow-none"
                                        >
                                            {copied ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
                                        </button>
                                    </div>
                                </div>

                                {/* Download Key Warning */}
                                <div className="bg-red-50 border-[3px] border-red-400 rounded-2xl p-4 mb-4">
                                    <div className="flex items-start gap-3">
                                        <span className="text-2xl">⚠️</span>
                                        <div>
                                            <div className="font-black text-red-700 text-sm uppercase mb-1">Save Your Private Key</div>
                                            <p className="text-red-600 text-xs font-bold">
                                                Download the keypair JSON file now. This is the ONLY time you&apos;ll see the private key. You need it to run your bot and control its funds.
                                            </p>
                                        </div>
                                    </div>
                                </div>

                                {/* Download Button */}
                                <button
                                    onClick={handleDownloadKey}
                                    className={`w-full py-4 rounded-2xl font-black text-lg uppercase border-[3px] border-black transition-all flex items-center justify-center gap-3 mb-4 ${keyDownloaded
                                        ? 'bg-[#10B981] text-white'
                                        : 'bg-black text-white hover:-translate-y-1 hover:shadow-[6px_6px_0px_0px_#F492B7]'
                                        }`}
                                >
                                    {keyDownloaded ? (
                                        <><Check className="w-5 h-5" /> Key Downloaded</>
                                    ) : (
                                        <><Download className="w-5 h-5" /> Download Keypair JSON</>
                                    )}
                                </button>

                                {/* Navigation */}
                                <div className="flex gap-3">
                                    <button
                                        onClick={() => setStep('IDENTITY')}
                                        className="flex-1 py-3 rounded-xl font-black text-sm uppercase border-2 border-black text-black bg-white hover:bg-gray-50 transition-all"
                                    >
                                        ← Back
                                    </button>
                                    <button
                                        onClick={() => setStep('STAKE')}
                                        disabled={!canProceedWallet}
                                        className={`flex-1 py-3 rounded-xl font-black text-sm uppercase border-2 border-black transition-all ${canProceedWallet
                                            ? 'bg-[#F492B7] text-black hover:-translate-y-0.5 hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]'
                                            : 'bg-gray-100 text-gray-400 border-dashed cursor-not-allowed opacity-50'
                                            }`}
                                    >
                                        Next → Stake
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* ═══════════ STEP 3: STAKE ═══════════ */}
                {step === 'STAKE' && (
                    <div className="animate-in fade-in slide-in-from-right-4 duration-300">
                        <div className="mb-6">
                            <h1 className="text-3xl font-black lowercase tracking-tighter text-black leading-none mb-1">
                                stake & deploy
                            </h1>
                            <p className="text-gray-400 text-sm font-bold">stake {STAKE_AMOUNT_SDL} SOL to activate your bot</p>
                        </div>

                        {/* Summary Card */}
                        <div className="bg-gray-50 border-[3px] border-black rounded-2xl p-5 mb-4">
                            <div className="flex items-center gap-4 mb-4">
                                <div className="w-14 h-14 rounded-xl border-2 border-black bg-[#F492B7] flex items-center justify-center text-3xl shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]">
                                    🤖
                                </div>
                                <div>
                                    <div className="font-black text-xl text-black">{botName}</div>
                                    <div className="text-gray-400 text-xs font-bold">
                                        {CATEGORIES[category].icon} {CATEGORIES[category].label} · by @{publicKey?.toBase58().slice(0, 6)}...
                                    </div>
                                </div>
                            </div>
                            <div className="text-gray-500 text-sm font-bold italic border-t-2 border-gray-200 pt-3">
                                &ldquo;{strategy}&rdquo;
                            </div>
                        </div>

                        {/* Stake Info */}
                        <div className="bg-white border-[3px] border-black rounded-2xl p-5 mb-4">
                            <div className="flex justify-between items-center mb-3">
                                <span className="font-black text-sm text-gray-500 uppercase">Registration Stake</span>
                                <span className="font-black text-2xl text-black">{STAKE_AMOUNT_SDL} SOL (Devnet)</span>
                            </div>
                            <div className="text-[10px] font-bold text-gray-400 leading-relaxed">
                                Your stake is held in escrow and protects the platform against malicious bots.
                                Stake is returned when you deregister (minus any slashing penalties).
                                (Using Devnet SOL for testing)
                            </div>
                        </div>

                        {/* What You Get */}
                        <div className="bg-[#F492B7]/10 border-2 border-[#F492B7] rounded-2xl p-4 mb-6">
                            <div className="text-[10px] font-black uppercase text-[#F492B7] mb-2">🎁 What You Get</div>
                            <div className="space-y-1.5 text-xs font-bold text-black">
                                <div className="flex items-center gap-2">✅ On-chain BotProfile (Novice tier)</div>
                                <div className="flex items-center gap-2">✅ Access to trade on all {CATEGORIES[category].label} markets</div>
                                <div className="flex items-center gap-2">✅ Leaderboard listing on /bots</div>
                                <div className="flex items-center gap-2">✅ Paper trading mode (free practice)</div>
                                <div className="flex items-center gap-2">✅ Upgradeable to Verified → Elite</div>
                            </div>
                        </div>

                        {stakeError && (
                            <div className="bg-red-50 border-2 border-red-400 rounded-xl p-3 mb-4 text-red-600 text-xs font-bold">
                                ❌ {stakeError}
                            </div>
                        )}

                        {/* Action Buttons */}
                        <div className="flex gap-3">
                            <button
                                onClick={() => setStep('WALLET')}
                                className="py-4 px-6 rounded-2xl font-black text-sm uppercase border-2 border-black text-black bg-white hover:bg-gray-50 transition-all"
                            >
                                ← Back
                            </button>
                            <button
                                onClick={handleStakeAndDeploy}
                                disabled={isStaking}
                                className="flex-1 py-4 rounded-2xl font-black text-xl uppercase border-[3px] border-black bg-[#10B981] text-black hover:-translate-y-1 hover:shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] active:translate-y-0 active:shadow-none transition-all flex items-center justify-center gap-2"
                            >
                                {isStaking ? (
                                    <><Loader2 className="w-5 h-5 animate-spin" /> Deploying...</>
                                ) : (
                                    <>💎 Stake {STAKE_AMOUNT_SDL} SOL & Deploy</>
                                )}
                            </button>
                        </div>
                    </div>
                )}

                {/* ═══════════ STEP 4: SUCCESS ═══════════ */}
                {step === 'SUCCESS' && (
                    <div className="text-center animate-in fade-in zoom-in-95 duration-300">
                        <div className="w-24 h-24 mx-auto bg-[#10B981] rounded-2xl flex items-center justify-center border-4 border-black shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] mb-6">
                            <span className="text-5xl">🤖</span>
                        </div>

                        <h2 className="text-3xl font-black lowercase tracking-tight text-black mb-1">{botName} is live!</h2>
                        <p className="text-gray-400 text-sm font-bold mb-6">your bot is registered and ready to trade</p>

                        {/* Setup Command */}
                        <div className="bg-black rounded-2xl p-4 mb-4 text-left border-2 border-white/20">
                            <div className="text-[10px] font-black uppercase text-[#F492B7] mb-2">Next: Install the Bot SDK</div>
                            <div className="flex items-center gap-2">
                                <code className="text-green-400 font-mono text-sm flex-1">$ npx @djinn/setup</code>
                                <button
                                    onClick={handleCopySetup}
                                    className="p-2 bg-white/10 rounded-lg hover:bg-white/20 transition-all"
                                >
                                    {setupCopied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4 text-white" />}
                                </button>
                            </div>
                        </div>

                        {/* Tier Info */}
                        <div className="bg-gray-50 border-2 border-black rounded-xl p-3 mb-6 text-left">
                            <div className="text-[10px] font-black uppercase text-gray-400 mb-1">Current Tier: 🌱 Novice</div>
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
