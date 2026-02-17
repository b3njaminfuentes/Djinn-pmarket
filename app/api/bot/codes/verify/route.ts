/**
 * GET /api/bot/codes/verify?code=DJNN-A7X9 — Verify activation code
 *
 * Public endpoint (used by CLI and web)
 * Returns: { valid: boolean, status, botName?, category? }
 */

import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
    try {
        const code = request.nextUrl.searchParams.get('code')?.toUpperCase().trim();

        if (!code) {
            return NextResponse.json({ valid: false, reason: 'No code provided' });
        }

        const supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
        );

        const { data, error } = await supabase
            .from('bot_activation_codes')
            .select('*')
            .eq('code', code)
            .maybeSingle();

        if (error || !data) {
            return NextResponse.json({ valid: false, reason: 'Code not found' });
        }

        // Check expiration
        if (data.expires_at && new Date(data.expires_at) < new Date()) {
            return NextResponse.json({ valid: false, reason: 'Code expired', status: 'expired' });
        }

        // Check if already fully used
        if (data.status === 'used') {
            return NextResponse.json({ valid: false, reason: 'Code already used', status: 'used' });
        }

        // Valid — return code data
        return NextResponse.json({
            valid: true,
            status: data.status, // 'available' or 'claimed'
            botName: data.bot_name || null,
            category: data.category ?? null,
            botWallet: data.bot_wallet || null,
        });

    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        console.error('Error verifying code:', message);
        return NextResponse.json({ valid: false, reason: 'Server error' }, { status: 500 });
    }
}
