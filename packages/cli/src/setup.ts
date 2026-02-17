#!/usr/bin/env node

/**
 * @djinn/setup — Quick setup CLI for Djinn AI bot developers
 *
 * Usage:
 *   npx @djinn/setup
 *
 * What it does:
 *   1. Validates activation code
 *   2. Generates a Solana keypair for the bot
 *   3. Creates .env config with Djinn settings
 *   4. Claims the code with bot data
 *   5. Prints Magic Link to complete registration
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
// @ts-ignore
import prompts from 'prompts';
import { Keypair, Connection, LAMPORTS_PER_SOL } from '@solana/web3.js';
// @ts-ignore
import bs58 from 'bs58';

const DJINN_BANNER = `
╔══════════════════════════════════════════════════════════════╗
║                                                              ║
║     ██████╗      ██╗██╗███╗   ██╗███╗   ██╗                ║
║     ██╔══██╗     ██║██║████╗  ██║████╗  ██║                ║
║     ██║  ██║     ██║██║██╔██╗ ██║██╔██╗ ██║                ║
║     ██║  ██║██   ██║██║██║╚██╗██║██║╚██╗██║                ║
║     ██████╔╝╚█████╔╝██║██║ ╚████║██║ ╚████║                ║
║     ╚═════╝  ╚════╝ ╚═╝╚═╝  ╚═══╝╚═╝  ╚═══╝                ║
║                                                              ║
║              AI Bot Setup Wizard v2.0.0                      ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
`;

const CATEGORIES = ['All', 'Sports', 'Crypto', 'Politics', 'Other'];
const DJINN_PROGRAM_ID = 'A8pVMgP6vwjGqcbYh1WGWDjXq9uwQRoF9Lz1siLmD7nm';

async function main() {
    console.log(DJINN_BANNER);
    console.log('  Welcome to Djinn! Let\'s set up your AI trading bot.\n');

    // ─── Arg Parsing (Non-Interactive Mode) ─────────────────────────────────
    const args = process.argv.slice(2);
    const overrides: any = {};
    args.forEach(arg => {
        if (arg.startsWith('--')) {
            const [key, val] = arg.slice(2).split('=');
            if (!key) return;
            if (key === 'name' || key === 'botName') overrides.botName = val;
            if (key === 'code') overrides.activationCode = val;
            if (key === 'rpc' || key === 'rpcUrl') overrides.rpcUrl = val;
            if (key === 'webhook' || key === 'webhookUrl') overrides.webhookUrl = val;
            if (key === 'network') overrides.network = val;
            if (key === 'category') {
                const idx = CATEGORIES.findIndex(c => c.toLowerCase() === (val || '').toLowerCase());
                if (idx >= 0) overrides.category = idx;
            }
            if (key === 'force' || key === 'overwrite') overrides.overwrite = true;
        }
    });
    prompts.override(overrides);

    // ─── Global Config ──────────────────────────────────────────────────────
    let network = overrides.network || 'devnet';

    if (Object.keys(overrides).length > 0) {
        console.log('  ⚡ Auto-Pilot Mode engaged.');
        if (overrides.activationCode) console.log(`  🔹 Code: \x1b[36m${overrides.activationCode}\x1b[0m`);
        if (overrides.botName) console.log(`  🔹 Bot Name: \x1b[36m${overrides.botName}\x1b[0m`);
        if (overrides.category !== undefined) console.log(`  🔹 Category: \x1b[36m${CATEGORIES[overrides.category]}\x1b[0m`);
        // network already logged below if set
    }
    if (overrides.network) console.log(`  🔹 Network: \x1b[36m${overrides.network}\x1b[0m`);
    if (Object.keys(overrides).length > 0) console.log('');

    // ─── Step 0: Generate Activation Code ─────────────────────────────────
    console.log('🔑 Step 0: Generating Activation Code...\n');

    let code = '';

    try {
        const baseUrl = network === 'devnet' ? 'http://localhost:3000' : 'https://djinn.world';
        const res = await fetch(`${baseUrl}/api/bot/codes/new`, { method: 'POST' });
        const data = await res.json();

        if (!data.success) throw new Error(data.error || 'Failed to generate code');
        code = data.code;

        console.log(`  ✨ Generated Code: \x1b[36m${code}\x1b[0m`);
        console.log('  (This code links your CLI bot to the Web Dashboard)\n');

    } catch (e) {
        // Fallback for offline/manual testing if API fails
        console.log('  ⚠️  Could not reach Djinn API. Using offline mode.');
        const { activationCode } = await prompts({
            type: 'text',
            name: 'activationCode',
            message: 'Enter manual code (or press Enter to generate generic):',
            initial: 'DJNN-OFFLINE'
        });
        code = activationCode;
    }

    // Determine API URL (devnet = localhost, mainnet = production)
    // We'll ask network first for this, but default to devnet for validation
    const apiUrl = overrides.network === 'mainnet' ? 'https://djinn.world' : 'http://localhost:3000';

    // Validate code against API
    console.log('\n  🔍 Validating code...');
    try {
        const verifyRes = await fetch(`${apiUrl}/api/bot/codes/verify?code=${encodeURIComponent(code)}`);
        const verifyData = await verifyRes.json();

        if (!verifyData.valid) {
            console.error(`\n  ❌ Invalid code: ${verifyData.reason || 'Unknown error'}`);
            console.error('  Get a valid code from the Djinn team.\n');
            process.exit(1);
        }

        if (verifyData.status === 'claimed') {
            console.error(`\n  ❌ This code has already been claimed.`);
            console.error('  If this is yours, use the Magic Link from your previous setup.\n');
            process.exit(1);
        }

        console.log('  ✅ Code is valid!\n');
    } catch (e) {
        console.error('\n  ⚠️  Could not validate code (API not reachable).');
        console.error('  Make sure the Djinn app is running: yarn dev\n');
        console.error('  Continuing anyway...\n');
    }

    // ─── Step 1: Prerequisites ──────────────────────────────────────────────
    const nodeVersion = parseInt(process.version.slice(1).split('.')[0]);
    if (nodeVersion < 22) {
        console.warn(`⚠️  Warning: OpenClaw recommends Node.js 22+. You have v${process.version}.`);
    }

    console.log('🔍 Checking OpenClaw Engine...');
    try {
        execSync('which openclaw', { stdio: 'ignore' });
        console.log('✅ OpenClaw is installed.');
    } catch (e) {
        console.error('❌ OpenClaw (clawd) not found.');
        console.error('   Please install it manually from: https://openclaw.ai');
        console.error('   Then run this setup again.');
        process.exit(1);
    }

    // ─── Step 2: Bot Configuration ──────────────────────────────────────────
    console.log('\n📋 Step 2: Network Configuration\n');

    const response = await prompts([
        {
            type: 'select',
            name: 'network',
            message: 'Select Network:',
            choices: [
                { title: 'Devnet (Testing)', value: 'devnet' },
                { title: 'Mainnet (Real Money)', value: 'mainnet' }
            ],
            initial: 0
        },
        {
            type: 'text',
            name: 'rpcUrl',
            message: 'RPC URL (Leave empty for default):',
        },
        {
            type: 'text',
            name: 'webhookUrl',
            message: 'Webhook URL (Optional):',
        }
    ], {
        onCancel: () => {
            console.log('\n❌ Setup cancelled.');
            process.exit(0);
        }
    });

    // Default configuration (User sets Name/Category on Web)
    const botName = 'Unconfigured Bot';
    const category = 0; // Default to 'All'

    if (response.network) network = response.network;
    const defaultRpc = network === 'devnet' ? 'https://api.devnet.solana.com' : 'https://api.mainnet-beta.solana.com';
    const rpcUrl = response.rpcUrl || defaultRpc;
    const webhookUrl = response.webhookUrl;

    // ─── Step 3: Generate Wallet ──────────────────────────────────────────
    console.log('\n🔑 Step 3: Generating Bot Wallet\n');

    const djinnDir = path.join(process.env.HOME || '.', '.djinn');
    if (!fs.existsSync(djinnDir)) {
        fs.mkdirSync(djinnDir, { recursive: true });
    }

    const walletPath = path.join(djinnDir, 'bot-wallet.json');

    if (fs.existsSync(walletPath)) {
        console.log(`  ⚠️  Wallet already exists at ${walletPath}`);
        const { overwrite } = await prompts({
            type: 'confirm',
            name: 'overwrite',
            message: 'Overwrite existing wallet?',
            initial: false
        });

        if (!overwrite) {
            console.log('  Using existing wallet.');
        } else {
            generateWallet(walletPath);
        }
    } else {
        generateWallet(walletPath);
    }

    // Read wallet public key for claiming
    const fileContent = fs.readFileSync(walletPath, 'utf-8');
    const secretKey = new Uint8Array(JSON.parse(fileContent));
    const kp = Keypair.fromSecretKey(secretKey);
    const botWalletPubkey = kp.publicKey.toBase58();

    // ─── Step 3.5: Auto-Fund (Devnet) ──────────────────────────────────
    if (network === 'devnet') {
        console.log('\n💸 Auto-Funding Wallet (Devnet)\n');
        const connection = new Connection(rpcUrl, 'confirmed');

        try {
            const balance = await connection.getBalance(kp.publicKey);
            if (balance < 1 * LAMPORTS_PER_SOL) {
                console.log('  💧 Requesting 5 SOL Airdrop...');
                const signature = await connection.requestAirdrop(kp.publicKey, 5 * LAMPORTS_PER_SOL);
                await connection.confirmTransaction(signature);
                const newBalance = await connection.getBalance(kp.publicKey);
                console.log(`  ✅ Airdrop successful! New Balance: ${newBalance / LAMPORTS_PER_SOL} SOL`);
            } else {
                console.log(`  ✅ Wallet already funded: ${balance / LAMPORTS_PER_SOL} SOL`);
            }
        } catch (e) {
            console.log('  ⚠️  Airdrop failed (Rate limited?). You may need to use a faucet: https://faucet.solana.com');
        }
    }

    // ─── Step 4: Claim Activation Code ──────────────────────────────────
    console.log('\n📡 Step 4: Claiming Activation Code\n');

    const finalApiUrl = network === 'devnet' ? 'http://localhost:3000' : 'https://djinn.world';

    try {
        const claimRes = await fetch(`${finalApiUrl}/api/bot/codes/claim`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                code,
                botName,
                category,
                botWallet: botWalletPubkey,
            }),
        });

        const claimData = await claimRes.json();

        if (claimData.success) {
            console.log('  ✅ Code claimed successfully!');
        } else {
            console.log(`  ⚠️  Could not claim code: ${claimData.error || 'Unknown'}`);
            console.log('  You can still complete registration via the Magic Link.\n');
        }
    } catch (e) {
        console.log('  ⚠️  Could not reach API to claim code. Continue manually.');
    }

    // ─── Step 5: Write .env ──────────────────────────────────────────────
    console.log('\n📝 Step 5: Writing Configuration\n');

    const envContent = `# Djinn AI Bot Configuration
# Generated by @djinn/setup

DJINN_ACTIVATION_CODE=${code}
DJINN_RPC_URL=${rpcUrl}
DJINN_BOT_KEYPAIR_PATH=${walletPath}
DJINN_API_URL=${finalApiUrl}
DJINN_PROGRAM_ID=${DJINN_PROGRAM_ID}
DJINN_BOT_NAME=${botName}
DJINN_STRATEGY_CATEGORY=${category}
DJINN_NETWORK=${network}
${webhookUrl ? `DJINN_WEBHOOK_URL=${webhookUrl}` : '# DJINN_WEBHOOK_URL=https://your-bot.example.com/djinn'}
`;

    const envPath = path.join(djinnDir, '.env.djinn');
    fs.writeFileSync(envPath, envContent);
    console.log(`  ✅ Config written to ${envPath}`);

    // ─── Step 6: Install SDK ──────────────────────────────────────────────
    console.log('\n📦 Step 6: Installing @djinn/sdk\n');

    try {
        execSync('npm install @djinn/sdk', { stdio: 'inherit' });
        console.log('  ✅ SDK installed');
    } catch {
        console.log('  ⚠️  SDK not yet published. You can install it later.');
    }

    // ─── Step 7: Install Agent Skill ──────────────────────────────────────
    console.log('\n🧠 Step 7: Installing @djinn/agent-skill (The Brain)\n');

    try {
        execSync('npm install @djinn/agent-skill', { stdio: 'inherit' });
        console.log('  ✅ Agent Skill installed');
    } catch {
        console.log('  ⚠️  Skill package not found (Run locally if testing).');
    }

    // ─── Done ──────────────────────────────────────────────────────────────
    console.log('\n' + '═'.repeat(60));
    console.log('\n🎉 Setup complete! Here\'s how it works:\n');

    console.log('  YOUR BOT HAS TWO WALLETS:');
    console.log('  ┌──────────────────────────────────────────────────────┐');
    console.log('  │  🧑 OWNER WALLET (Phantom/Backpack in your browser) │');
    console.log('  │     → Signs the registration tx & pays the stake    │');
    console.log('  │     → You control this. It\'s YOUR wallet.           │');
    console.log('  │                                                      │');
    console.log('  │  🤖 BOT WALLET (generated above)                    │');
    console.log(`  │     → ${walletPath}`);
    console.log('  │     → The bot uses this to execute trades 24/7      │');
    console.log('  │     → It operates autonomously with this key        │');
    console.log('  └──────────────────────────────────────────────────────┘\n');

    console.log('  NEXT STEP:\n');

    if (network === 'devnet') {
        console.log('  1. Open this link in your browser (connect your OWNER wallet):');
    } else {
        console.log('  1. Fund your owner wallet with 11+ SOL, then open:');
    }

    const baseUrl = network === 'devnet' ? 'http://localhost:3000' : 'https://djinn.world';
    const magicLink = `${baseUrl}/bots?code=${encodeURIComponent(code)}`;
    console.log(`\n     👉 \x1b[36m${magicLink}\x1b[0m\n`);
    console.log('     Connect wallet → Stake → Bot is live!\n');

    console.log('  2. Configure & Activate on Web:');
    console.log('     Follow the link above to set your Bot Name and Category.');
    console.log('     Once activated, your bot will be ready to trade!\n');

    console.log('  3. Start your bot logic:');
    console.log('     // Your bot reads .env.djinn and trades with the bot wallet');
    console.log('     const markets = await djinn.listMarkets();');

    console.log('  📖 Full docs: https://docs.djinn.world/bots');
    console.log('  💬 Discord: https://discord.gg/djinn\n');
}

function generateWallet(walletPath: string) {
    const kp = Keypair.generate();
    const secretKey = Array.from(kp.secretKey);
    fs.writeFileSync(walletPath, JSON.stringify(secretKey));
    fs.chmodSync(walletPath, 0o600); // Owner read/write only
    console.log(`  ✅ New wallet generated: ${walletPath}`);
    console.log(`  📍 Public Key: ${kp.publicKey.toBase58()}`);
    const bs58Key = bs58.encode(kp.secretKey);
    console.log(`  🔐 Private Key (BS58):`);
    console.log(`\n${bs58Key}\n`);

    // Try to copy to clipboard on Mac
    if (process.platform === 'darwin') {
        try {
            execSync(`echo "${bs58Key}" | pbcopy`);
            console.log('  📋 (Copied to clipboard!)');
        } catch (e) {
            // Ignore if pbcopy fails
        }
    }

    console.log('  ⚠️  BACK UP THIS KEY! If lost, your stake is gone.');
}

main().catch(console.error);
