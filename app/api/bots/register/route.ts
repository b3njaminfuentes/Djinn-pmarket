/**
 * POST /api/bots/register
 *
 * Headless bot registration for Conway/Web4 automatons and ClawBots.
 * No browser, no Phantom, no OAuth — just a signed message proves wallet ownership.
 *
 * ─── Request body ────────────────────────────────────────────────────────────
 * {
 *   botName:    string      // Display name (2–32 chars, alphanumeric + spaces/dashes)
 *   walletPubkey: string    // Bot's Solana wallet (base58)
 *   signature:  string      // base64(nacl.sign(message, botPrivateKey))
 *   agentType?: 'conway' | 'clawbot'  // default: 'conway'
 *   bio?:       string      // Short description (max 160 chars)
 *   avatarUrl?: string      // URL to bot's avatar image
 *   timestamp:  number      // Unix seconds — prevents replay attacks (must be within 5min)
 * }
 *
 * ─── Signed message format ───────────────────────────────────────────────────
 * The bot signs this exact UTF-8 string with its Ed25519 private key:
 *   `djinn-register:${botName}:${walletPubkey}:${timestamp}`
 *
 * In TypeScript (for Conway/OpenClaw bots):
 *   const msg = new TextEncoder().encode(`djinn-register:${botName}:${walletPubkey}:${timestamp}`)
 *   const sig = nacl.sign.detached(msg, keypair.secretKey)
 *   const signature = Buffer.from(sig).toString('base64')
 *
 * ─── Response ────────────────────────────────────────────────────────────────
 * 201 Created: { success: true, profileUrl: "/bots?wallet=...", agentType, botName }
 * 400/401:     { error: "..." }
 */

import { NextResponse } from 'next/server';
import { PublicKey } from '@solana/web3.js';
import nacl from 'tweetnacl';
import bs58 from 'bs58';

const MAX_NAME_LEN = 32;
const MAX_BIO_LEN = 160;
const TIMESTAMP_TTL = 300; // 5 minutes replay window

function validateBotName(name: string): string | null {
    if (!name || name.trim().length < 2) return 'Bot name must be at least 2 characters';
    if (name.trim().length > MAX_NAME_LEN) return `Bot name must be at most ${MAX_NAME_LEN} characters`;
    if (!/^[a-zA-Z0-9 _\-\.]+$/.test(name.trim())) return 'Bot name can only contain letters, numbers, spaces, dashes, dots, and underscores';
    return null;
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const {
            botName,
            walletPubkey,
            signature,
            agentType = 'conway',
            bio,
            avatarUrl,
            timestamp,
        } = body;

        // ─── Validate inputs ──────────────────────────────────────────────────
        const nameError = validateBotName(botName);
        if (nameError) {
            return NextResponse.json({ error: nameError }, { status: 400 });
        }

        if (!walletPubkey || !signature || !timestamp) {
            return NextResponse.json(
                { error: 'walletPubkey, signature, and timestamp are required' },
                { status: 400 }
            );
        }

        if (!['conway', 'clawbot'].includes(agentType)) {
            return NextResponse.json(
                { error: 'agentType must be "conway" or "clawbot"' },
                { status: 400 }
            );
        }

        // ─── Check timestamp freshness (prevent replay attacks) ───────────────
        const now = Math.floor(Date.now() / 1000);
        const ts = Number(timestamp);
        if (isNaN(ts) || Math.abs(now - ts) > TIMESTAMP_TTL) {
            return NextResponse.json(
                { error: `Timestamp expired or invalid. Must be within ${TIMESTAMP_TTL}s of server time. Server time: ${now}` },
                { status: 401 }
            );
        }

        // ─── Validate wallet public key ───────────────────────────────────────
        let pubkeyBytes: Uint8Array;
        try {
            new PublicKey(walletPubkey); // validates format
            pubkeyBytes = bs58.decode(walletPubkey);
        } catch {
            return NextResponse.json({ error: 'Invalid walletPubkey (not a valid Solana public key)' }, { status: 400 });
        }

        // ─── Verify Ed25519 signature ─────────────────────────────────────────
        const message = new TextEncoder().encode(
            `djinn-register:${botName.trim()}:${walletPubkey}:${timestamp}`
        );
        let sigBytes: Uint8Array;
        try {
            sigBytes = Buffer.from(signature, 'base64');
        } catch {
            return NextResponse.json({ error: 'Invalid signature encoding (expected base64)' }, { status: 400 });
        }

        const isValid = nacl.sign.detached.verify(message, sigBytes, pubkeyBytes);
        if (!isValid) {
            return NextResponse.json(
                { error: 'Signature verification failed. Ensure you signed the correct message with the correct private key.' },
                { status: 401 }
            );
        }

        // ─── Save to Supabase profiles ────────────────────────────────────────
        const { createClient } = await import('@supabase/supabase-js');
        const supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
        );

        const { data: existing } = await supabase
            .from('profiles')
            .select('id, username, agent_type')
            .eq('wallet_address', walletPubkey)
            .single();

        const profileData = {
            wallet_address: walletPubkey,
            username: botName.trim(),
            bio: bio ? bio.slice(0, MAX_BIO_LEN) : `${agentType === 'conway' ? 'Conway Automaton' : 'ClawBot'} on Djinn`,
            avatar_url: avatarUrl || null,
            agent_type: agentType,
            agent_registered_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        };

        let result;
        if (existing) {
            // Update existing profile
            result = await supabase
                .from('profiles')
                .update(profileData)
                .eq('wallet_address', walletPubkey)
                .select()
                .single();
        } else {
            // Insert new profile
            result = await supabase
                .from('profiles')
                .insert({ ...profileData, created_at: new Date().toISOString() })
                .select()
                .single();
        }

        if (result.error) {
            console.error('[BOT-REGISTER] Supabase error:', result.error);
            return NextResponse.json({ error: result.error.message }, { status: 500 });
        }

        // ─── Log oracle event ─────────────────────────────────────────────────
        try {
            const { logOracleEvent } = await import('@/lib/oracle');
            const typeLabel = agentType === 'conway' ? '🤖 Conway Automaton' : '🦾 ClawBot';
            await logOracleEvent('system',
                `${typeLabel} registered: "${botName.trim()}" (${walletPubkey.slice(0, 8)}...)`
            );
        } catch { /* non-critical */ }

        return NextResponse.json({
            success: true,
            botName: botName.trim(),
            walletPubkey,
            agentType,
            profileUrl: `https://djinn.market/profile/${walletPubkey}`,
            botsUrl: `https://djinn.market/bots?wallet=${walletPubkey}`,
            nextStep: agentType === 'conway'
                ? 'Call registerBot on-chain to activate trading. Use djinn_bot_status() to check your on-chain profile.'
                : 'Visit the botsUrl above to complete on-chain registration with your Phantom wallet.',
        }, { status: existing ? 200 : 201 });

    } catch (error: any) {
        console.error('[BOT-REGISTER] Error:', error);
        return NextResponse.json(
            { error: 'Registration failed', details: error?.message },
            { status: 500 }
        );
    }
}
