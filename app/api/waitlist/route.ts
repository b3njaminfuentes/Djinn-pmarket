/**
 * POST /api/waitlist — Join the Djinn email waitlist
 * No wallet required. Anyone can sign up.
 *
 * Body: { email, twitterHandle?, referralCode? }
 * Returns: { success, position, total }
 *
 * GET /api/waitlist/count — Returns total signup count (public)
 */

import { NextResponse } from 'next/server';

function isValidEmail(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

function sanitizeTwitter(handle: string): string {
    return handle.trim().replace(/^@/, '').replace(/[^a-zA-Z0-9_]/g, '').slice(0, 50);
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { email, twitterHandle, referralCode } = body;

        if (!email || !isValidEmail(email)) {
            return NextResponse.json({ error: 'Valid email required' }, { status: 400 });
        }

        const { createClient } = await import('@supabase/supabase-js');
        const supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
        );

        // Check if already registered
        const { data: existing } = await supabase
            .from('email_waitlist')
            .select('id, created_at')
            .eq('email', email.trim().toLowerCase())
            .single();

        if (existing) {
            const { count } = await supabase
                .from('email_waitlist')
                .select('*', { count: 'exact', head: true });
            return NextResponse.json({
                success: true,
                alreadyJoined: true,
                message: "You're already on the list. We'll be in touch.",
                total: count || 0,
            });
        }

        // Insert new signup
        const { error } = await supabase
            .from('email_waitlist')
            .insert({
                email: email.trim().toLowerCase(),
                twitter_handle: twitterHandle ? sanitizeTwitter(twitterHandle) : null,
                referral_code: referralCode || null,
            });

        if (error) {
            // Unique constraint = already registered
            if (error.code === '23505') {
                return NextResponse.json({
                    success: true,
                    alreadyJoined: true,
                    message: "You're already on the list.",
                });
            }
            console.error('[WAITLIST] Supabase error:', error);
            return NextResponse.json({ error: 'Failed to join waitlist' }, { status: 500 });
        }

        // Get total count + position
        const { count } = await supabase
            .from('email_waitlist')
            .select('*', { count: 'exact', head: true });

        // Log oracle event
        try {
            const { logOracleEvent } = await import('@/lib/oracle');
            await logOracleEvent('system', `🔥 New waitlist signup: ${email.split('@')[0]}@... (total: ${count})`);
        } catch { /* non-critical */ }

        return NextResponse.json({
            success: true,
            message: "You're in. Welcome to Djinn.",
            position: count || 1,
            total: count || 1,
        }, { status: 201 });

    } catch (error: any) {
        console.error('[WAITLIST] Error:', error);
        return NextResponse.json({ error: 'Failed to join waitlist' }, { status: 500 });
    }
}

export async function GET() {
    try {
        const { createClient } = await import('@supabase/supabase-js');
        const supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
        );

        const [waitlistRes, botsRes, marketsRes] = await Promise.all([
            supabase.from('email_waitlist').select('*', { count: 'exact', head: true }),
            supabase.from('profiles').select('*', { count: 'exact', head: true }).not('agent_type', 'eq', 'human'),
            supabase.from('markets').select('*', { count: 'exact', head: true }).eq('resolved', false),
        ]);

        return NextResponse.json({
            waitlistCount: waitlistRes.count || 0,
            botCount: botsRes.count || 0,
            activeMarkets: marketsRes.count || 0,
        });
    } catch (error: any) {
        return NextResponse.json({ waitlistCount: 0, botCount: 0, activeMarkets: 0 });
    }
}
