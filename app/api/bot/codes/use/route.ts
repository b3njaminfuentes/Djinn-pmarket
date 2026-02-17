/**
 * POST /api/bot/codes/use — Mark code as used after on-chain registration
 *
 * Body: { code, ownerWallet, botProfilePda }
 * Response: { success: true }
 */

import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
    try {
        const { code, ownerWallet, botProfilePda } = await request.json();

        if (!code || !ownerWallet) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        const upperCode = code.toUpperCase().trim();

        const supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
        );

        // Verify code exists and is claimed (not already used)
        const { data: existing } = await supabase
            .from('bot_activation_codes')
            .select('*')
            .eq('code', upperCode)
            .maybeSingle();

        if (!existing) {
            return NextResponse.json({ error: 'Code not found' }, { status: 404 });
        }

        if (existing.status === 'used') {
            return NextResponse.json({ error: 'Code already used' }, { status: 409 });
        }

        // Mark as used
        const { error } = await supabase
            .from('bot_activation_codes')
            .update({
                status: 'used',
                used_at: new Date().toISOString(),
                used_by_wallet: ownerWallet,
                bot_profile_pda: botProfilePda || null,
            })
            .eq('code', upperCode);

        if (error) {
            console.error('Error marking code as used:', error);
            return NextResponse.json({ error: 'Failed to update code' }, { status: 500 });
        }

        return NextResponse.json({ success: true });

    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        console.error('Error using code:', message);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
