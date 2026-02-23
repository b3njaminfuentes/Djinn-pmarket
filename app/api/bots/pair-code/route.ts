/**
 * POST /api/bots/pair-code
 * Called by `npx @djinn/skill` after registration.
 * Stores a short-lived pairing code in Supabase so the human can enter it on the website.
 */
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(request: Request) {
    try {
        const { code, botWallet, botName, expiresInMinutes = 10 } = await request.json();

        if (!code || !botWallet) {
            return NextResponse.json({ error: 'code and botWallet required' }, { status: 400 });
        }

        const supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
        );

        const expiresAt = new Date(Date.now() + expiresInMinutes * 60 * 1000).toISOString();

        // Upsert — if same wallet re-runs npx, replace old code
        const { error } = await supabase
            .from('bot_pair_codes')
            .upsert({
                code: code.toUpperCase(),
                bot_wallet: botWallet,
                bot_name: botName,
                expires_at: expiresAt,
                used: false,
                created_at: new Date().toISOString(),
            }, { onConflict: 'bot_wallet' });

        if (error) {
            console.error('[PAIR-CODE]', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ success: true, code, expiresAt });

    } catch (e: any) {
        console.error('[PAIR-CODE]', e);
        return NextResponse.json({ error: 'Failed to store code' }, { status: 500 });
    }
}
