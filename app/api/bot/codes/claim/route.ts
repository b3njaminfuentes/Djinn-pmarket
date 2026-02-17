/**
 * POST /api/bot/codes/claim — CLI claims code with bot data
 *
 * Body: { code, botName, category, botWallet }
 * Response: { success: true }
 */

import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
    try {
        const { code, botName, category, botWallet } = await request.json();

        if (!code || !botName) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        const upperCode = code.toUpperCase().trim();

        const supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
        );

        // Verify code exists and is available
        const { data: existing } = await supabase
            .from('bot_activation_codes')
            .select('*')
            .eq('code', upperCode)
            .maybeSingle();

        if (!existing) {
            return NextResponse.json({ error: 'Code not found' }, { status: 404 });
        }

        if (existing.status !== 'available') {
            return NextResponse.json({ error: `Code already ${existing.status}` }, { status: 409 });
        }

        if (existing.expires_at && new Date(existing.expires_at) < new Date()) {
            return NextResponse.json({ error: 'Code expired' }, { status: 410 });
        }

        // Claim the code
        const { error } = await supabase
            .from('bot_activation_codes')
            .update({
                status: 'claimed',
                bot_name: botName,
                category: typeof category === 'number' ? category : parseInt(category) || 0,
                bot_wallet: botWallet || null,
                claimed_at: new Date().toISOString(),
            })
            .eq('code', upperCode);

        if (error) {
            console.error('Error claiming code:', error);
            return NextResponse.json({ error: 'Failed to claim code' }, { status: 500 });
        }

        return NextResponse.json({ success: true });

    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        console.error('Error claiming code:', message);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
