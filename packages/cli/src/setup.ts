#!/usr/bin/env node

/**
 * @djinn/setup — Quick setup CLI for Djinn AI bot developers
 *
 * Usage:
 *   npx @djinn/setup
 *
 * What it does:
 *   1. Generates a Solana keypair for the bot
 *   2. Creates .env config with Djinn settings
 *   3. Installs @djinn/sdk
 *   4. Prints next steps (fund wallet + register bot)
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
║              AI Bot Setup Wizard v1.0.0                      ║
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

    if (Object.keys(overrides).length > 0) {
        console.log('  ⚡ Auto-Pilot Mode engaged.');
        if (overrides.botName) console.log(`  🔹 Bot Name: \x1b[36m${overrides.botName}\x1b[0m`);
        if (overrides.category !== undefined) console.log(`  🔹 Category: \x1b[36m${CATEGORIES[overrides.category]}\x1b[0m`);
        if (overrides.network) console.log(`  🔹 Network: \x1b[36m${overrides.network}\x1b[0m`);
        console.log('');
    }

    // ─── Step 0: Prerequisites ──────────────────────────────────────────────
    const nodeVersion = parseInt(process.version.slice(1).split('.')[0]);
    if (nodeVersion < 22) {
        console.warn(`⚠️  Warning: OpenClaw recommends Node.js 22+. You satisfy v${process.version}.`);
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

    // ─── Step 1: Bot Configuration ──────────────────────────────────────────
    console.log('\n📋 Step 1: Bot Configuration\n');

    const response = await prompts([
        {
            type: 'text',
            name: 'botName',
            message: 'Bot name (max 32 chars):',
            validate: (value: string) => value.length > 0 && value.length <= 32 ? true : 'Name must be 1-32 characters'
        },
        {
            type: 'select',
            name: 'category',
            message: 'Select Strategy Category:',
            choices: CATEGORIES.map((c, i) => ({ title: c, value: i })),
            initial: 0
        },
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

    const botName = response.botName;
    const category = response.category;
    const network = response.network;
    const defaultRpc = network === 'devnet' ? 'https://api.devnet.solana.com' : 'https://api.mainnet-beta.solana.com';
    const rpcUrl = response.rpcUrl || defaultRpc;
    const webhookUrl = response.webhookUrl;

    // ─── Step 4: Generate Wallet ──────────────────────────────────────────
    console.log('\n🔑 Step 4: Generating Bot Wallet\n');

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

    // ─── Step 4.5: Auto-Fund (The Magic) ──────────────────────────────────
    if (network === 'devnet') {
        console.log('\n💸 Step 4.5: Auto-Funding Wallet (Devnet Magic)\n');
        const fileContent = fs.readFileSync(walletPath, 'utf-8');
        const secretKey = new Uint8Array(JSON.parse(fileContent));
        const kp = Keypair.fromSecretKey(secretKey);
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

    // ─── Step 5: Create .env ──────────────────────────────────────────────
    console.log('\n📝 Step 5: Writing Configuration\n');

    const envContent = `# Djinn AI Bot Configuration
# Generated by @djinn/setup

DJINN_RPC_URL=${rpcUrl}
DJINN_BOT_KEYPAIR_PATH=${walletPath}
DJINN_API_URL=${network === 'devnet' ? 'http://localhost:3000' : 'https://djinn.world'}
DJINN_PROGRAM_ID=${DJINN_PROGRAM_ID}
DJINN_BOT_NAME=${botName}
DJINN_STRATEGY_CATEGORY=${category}
DJINN_NETWORK=${network}
${webhookUrl ? `DJINN_WEBHOOK_URL=${webhookUrl}` : '# DJINN_WEBHOOK_URL=https://your-bot.example.com/djinn'}
`;

    const envPath = path.join(process.cwd(), '.env.djinn');
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

    console.log('  NEXT STEPS:\n');

    if (network === 'devnet') {
        console.log('  1. Open Djinn in your browser and connect your OWNER wallet (Phantom)');
    } else {
        console.log('  1. Fund your owner wallet with 11+ SOL (10 SOL stake + gas fees)');
    }

    console.log('\n  2. Click this Magic Link to register your bot:');
    const baseUrl = network === 'devnet' ? 'http://localhost:3000' : 'https://djinn.world';
    const magicLink = `${baseUrl}/bots?name=${encodeURIComponent(botName)}&category=${encodeURIComponent(CATEGORIES[category])}`;
    console.log(`     👉 ${magicLink}\n`);
    console.log('     This opens Djinn with your bot info pre-filled.');
    console.log('     Connect your browser wallet → Stake 10 SOL → Bot is live!\n');

    console.log('  3. Start your bot:');
    console.log('     // Your bot reads .env.djinn and trades with the bot wallet');
    console.log('     const markets = await djinn.listMarkets({ category: "crypto" });');
    console.log('     // Your bot\'s strategy goes here!\n');

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
