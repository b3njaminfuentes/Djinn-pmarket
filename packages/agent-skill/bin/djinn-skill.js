#!/usr/bin/env node
'use strict';

/**
 * npx djinn-skill
 * OpenClaw → Djinn integration installer
 * Generates a Solana-compatible wallet, registers on Djinn, shows online.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const readline = require('readline');
const https = require('https');
const http = require('http');
const crypto = require('crypto');

const DJINN_DIR = path.join(os.homedir(), '.djinn');
const WALLET_PATH = path.join(DJINN_DIR, 'bot-wallet.json');
const ENV_PATH = path.join(DJINN_DIR, '.env.djinn');
const API_URL = process.env.DJINN_API_URL || 'https://djinn.world';

// ─── Colors ──────────────────────────────────────────────────────────────────
const c = {
    reset: '\x1b[0m', bold: '\x1b[1m', pink: '\x1b[35m',
    green: '\x1b[32m', cyan: '\x1b[36m', yellow: '\x1b[33m',
    red: '\x1b[31m', dim: '\x1b[2m',
};
function log(msg) { process.stdout.write(msg + '\n'); }
function cyan(s) { return c.cyan + s + c.reset; }
function green(s) { return c.green + s + c.reset; }
function dim(s) { return c.dim + s + c.reset; }
function bold(s) { return c.bold + s + c.reset; }

// ─── Banner ──────────────────────────────────────────────────────────────────
log('');
log(c.bold + c.pink + '  ██████╗      ██╗██╗███╗   ██╗███╗   ██╗' + c.reset);
log(c.bold + c.pink + '  ██╔══██╗     ██║██║████╗  ██║████╗  ██║' + c.reset);
log(c.bold + c.pink + '  ██║  ██║     ██║██║██╔██╗ ██║██╔██╗ ██║' + c.reset);
log(c.bold + c.pink + '  ██║  ██║██   ██║██║██║╚██╗██║██║╚██╗██║' + c.reset);
log(c.bold + c.pink + '  ██████╔╝╚█████╔╝██║██║ ╚████║██║ ╚████║' + c.reset);
log(c.bold + c.pink + '  ╚═════╝  ╚════╝ ╚═╝╚═╝  ╚═══╝╚═╝  ╚═══╝' + c.reset);
log('');
log(bold('  Djinn Skill') + dim('  — OpenClaw Edition'));
log(dim('  Prediction markets for AI agents on Solana'));
log('');

// ─── Helpers ─────────────────────────────────────────────────────────────────
function prompt(rl, q) { return new Promise(r => rl.question(q, r)); }

function httpPost(url, data, redirectCount = 0) {
    return new Promise((resolve, reject) => {
        if (redirectCount > 5) return reject(new Error('Too many redirects'));
        const body = JSON.stringify(data);
        const parsed = new URL(url);
        const mod = parsed.protocol === 'https:' ? https : http;
        const req = mod.request({
            hostname: parsed.hostname,
            port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
            path: parsed.pathname + parsed.search,
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body), 'User-Agent': 'djinn-skill/1.0' },
        }, res => {
            // Follow redirects
            if ([301, 302, 307, 308].includes(res.statusCode) && res.headers.location) {
                const nextUrl = res.headers.location.startsWith('http')
                    ? res.headers.location
                    : new URL(res.headers.location, url).toString();
                return resolve(httpPost(nextUrl, data, redirectCount + 1));
            }
            let raw = '';
            res.on('data', d => raw += d);
            res.on('end', () => {
                try { resolve({ status: res.statusCode, body: JSON.parse(raw) }); }
                catch { resolve({ status: res.statusCode, body: raw }); }
            });
        });
        req.on('error', reject);
        req.write(body);
        req.end();
    });
}

// ─── Ed25519 keypair (Node.js built-ins only, no dependencies) ───────────────
function generateKeypair() {
    const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519');
    const privDer = privateKey.export({ type: 'pkcs8', format: 'der' });
    const pubDer = publicKey.export({ type: 'spki', format: 'der' });
    const seed = Buffer.from(privDer.slice(privDer.length - 32));
    const pubBytes = Buffer.from(pubDer.slice(pubDer.length - 32));
    return { seed, pubBytes };
}

function toBase58(bytes) {
    const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
    let digits = [0];
    for (const byte of bytes) {
        let carry = byte;
        for (let j = 0; j < digits.length; j++) {
            carry += digits[j] << 8;
            digits[j] = carry % 58;
            carry = Math.floor(carry / 58);
        }
        while (carry > 0) { digits.push(carry % 58); carry = Math.floor(carry / 58); }
    }
    let result = '';
    for (const b of bytes) { if (b !== 0) break; result += '1'; }
    for (let i = digits.length - 1; i >= 0; i--) result += ALPHABET[digits[i]];
    return result;
}

function signMessage(message, seed) {
    const privKey = crypto.createPrivateKey({
        key: Buffer.concat([Buffer.from('302e020100300506032b657004220420', 'hex'), seed]),
        format: 'der', type: 'pkcs8',
    });
    return crypto.sign(null, message, privKey);
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

    let seed, pubBytes, walletPubkey, isNew = false;

    // 1. Load or generate wallet
    if (!fs.existsSync(DJINN_DIR)) fs.mkdirSync(DJINN_DIR, { recursive: true });

    if (fs.existsSync(WALLET_PATH)) {
        let stored;
        try { stored = JSON.parse(fs.readFileSync(WALLET_PATH, 'utf8')); } catch { stored = {}; }

        // Check it has the right fields — if not, regenerate
        if (stored.seed && stored.pubBytes && stored.pubkey) {
            seed = Buffer.from(stored.seed, 'hex');
            pubBytes = Buffer.from(stored.pubBytes, 'hex');
            walletPubkey = stored.pubkey;
            log(green('✓') + '  Existing bot wallet found');
            log(dim('  Public key: ') + cyan(walletPubkey));
        } else {
            log(c.yellow + '  ⚠  Wallet file was incomplete — generating a new one' + c.reset);
            const kp = generateKeypair();
            seed = kp.seed; pubBytes = kp.pubBytes;
            walletPubkey = toBase58(pubBytes);
            isNew = true;
        }
    } else {
        log(c.pink + '  🔑 Generating new Solana-compatible bot wallet...' + c.reset);
        const kp = generateKeypair();
        seed = kp.seed; pubBytes = kp.pubBytes;
        walletPubkey = toBase58(pubBytes);
        isNew = true;
    }

    // Save wallet if new
    if (isNew) {
        // Full 64-byte keypair for Phantom import: [seed(32) + pubkey(32)]
        const keypair64 = Buffer.concat([seed, pubBytes]);
        const keypairArray = Array.from(keypair64); // JSON array format

        fs.writeFileSync(WALLET_PATH, JSON.stringify({
            seed: seed.toString('hex'),
            pubBytes: pubBytes.toString('hex'),
            pubkey: walletPubkey,
            keypair_base58: toBase58(keypair64), // Phantom-importable
            keypair_array: keypairArray,          // Solana CLI format
        }, null, 2), { mode: 0o600 });

        log(green('✓') + '  New wallet generated');
        log('');
        log(bold('  Public Key (share freely):'));
        log('  ' + cyan(walletPubkey));
        log('');
        log(bold('  Private Key (KEEP SECRET — Phantom import):'));
        log('  ' + c.yellow + toBase58(keypair64) + c.reset);
        log('  ' + dim('Saved to: ' + WALLET_PATH));
        log('');
        log(c.yellow + '  ⚠  Never share your private key. Keep it safe.' + c.reset);
        log('');
    }

    // 2. Ask for bot name
    log(bold('  What should we call your bot on Djinn?'));
    log(dim('  2–32 characters · letters, numbers, dashes'));
    log('');
    const rawName = await prompt(rl, c.pink + '  > Bot name: ' + c.reset);
    const botName = rawName.trim();

    if (!botName || botName.length < 2 || botName.length > 32) {
        log(c.red + '  ✗  Name must be 2–32 characters' + c.reset);
        rl.close(); process.exit(1);
    }

    log('');
    log(dim('  Registering ' + bold(botName) + ' on Djinn...'));

    // 3. Sign + register
    const timestamp = Math.floor(Date.now() / 1000);
    let signature;
    try {
        const message = Buffer.from(`djinn-register:${botName}:${walletPubkey}:${timestamp}`);
        signature = signMessage(message, seed).toString('base64');
    } catch (e) {
        log(c.red + '  ✗  Signing failed: ' + e.message + c.reset);
        rl.close(); process.exit(1);
    }

    let res;
    try {
        res = await httpPost(`${API_URL}/api/bots/register`, {
            botName, walletPubkey, signature, timestamp,
            agentType: 'clawbot',
            bio: 'Registered via npx djinn-skill',
        });
    } catch (e) {
        log(c.red + '  ✗  Network error: ' + e.message + c.reset);
        rl.close(); process.exit(1);
    }

    if (res.status !== 200 && res.status !== 201) {
        log(c.red + '  ✗  Registration failed: ' + JSON.stringify(res.body) + c.reset);
        rl.close(); process.exit(1);
    }

    // 4. Send heartbeat → bot goes ONLINE on Djinn
    log(dim('  Going online...'));
    try {
        const hbTs = Math.floor(Date.now() / 1000);
        const hbMsg = Buffer.from(`djinn-heartbeat:${walletPubkey}:${hbTs}`);
        const hbSig = signMessage(hbMsg, seed).toString('base64');
        await httpPost(`${API_URL}/api/bots/heartbeat`, {
            walletPubkey, signature: hbSig, timestamp: hbTs,
            solBalance: 0, computeProvider: 'openclaw',
        });
        log(green('✓') + '  ' + bold(botName) + ' is now ' + c.green + c.bold + 'ONLINE' + c.reset + ' on Djinn');
    } catch {
        log(c.yellow + '  ⚠  Heartbeat skipped (will retry next time)' + c.reset);
    }

    // 5. Generate pairing code
    const pairCode = 'DJNN-' + crypto.randomBytes(4).toString('hex').toUpperCase().slice(0, 4);
    try {
        await httpPost(`${API_URL}/api/bots/pair-code`, {
            code: pairCode, botWallet: walletPubkey, botName, expiresInMinutes: 10,
        });
    } catch { /* non-critical */ }

    // 6. Write env
    fs.writeFileSync(ENV_PATH, [
        '# Djinn ClawBot Config',
        `DJINN_BOT_NAME="${botName}"`,
        `DJINN_BOT_PUBKEY="${walletPubkey}"`,
        `DJINN_API_URL="${API_URL}"`,
        `DJINN_WALLET_PATH="${WALLET_PATH}"`,
        '',
    ].join('\n'), { mode: 0o600 });

    // 7. Copy SKILL.md
    const skillsDir = path.join(DJINN_DIR, 'skills', 'djinn-market');
    if (!fs.existsSync(skillsDir)) fs.mkdirSync(skillsDir, { recursive: true });
    const skillMdSrc = path.join(__dirname, '..', 'SKILL.md');
    const skillJsonSrc = path.join(__dirname, '..', 'skill.json');
    if (fs.existsSync(skillMdSrc)) fs.copyFileSync(skillMdSrc, path.join(skillsDir, 'SKILL.md'));
    if (fs.existsSync(skillJsonSrc)) fs.copyFileSync(skillJsonSrc, path.join(skillsDir, 'skill.json'));

    // 8. Done
    log('');
    log(c.bold + c.green + '  ✓  ' + botName + ' registered on Djinn!' + c.reset);
    log('');
    log(c.bold + '  ┌─────────────────────────────────────┐' + c.reset);
    log(c.bold + '  │                                     │' + c.reset);
    log(c.bold + '  │   ' + c.pink + 'Your code:' + c.reset + c.bold + '                       │' + c.reset);
    log(c.bold + '  │                                     │' + c.reset);
    log(c.bold + '  │       ' + c.pink + c.bold + pairCode + c.reset + c.bold + '                    │' + c.reset);
    log(c.bold + '  │                                     │' + c.reset);
    log(c.bold + '  │   ' + c.dim + 'Expires in 10 minutes' + c.reset + c.bold + '             │' + c.reset);
    log(c.bold + '  └─────────────────────────────────────┘' + c.reset);
    log('');
    log(dim('  Wallet: ') + cyan(walletPubkey));
    log('');
    log('');

    rl.close();
}

main().catch(e => {
    process.stderr.write(c.red + '\n  Fatal: ' + e.message + '\n' + c.reset);
    process.exit(1);
});
