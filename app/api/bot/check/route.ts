/**
 * GET /api/bot/check?wallet=<pubkey> — Check if a wallet belongs to a registered bot
 *
 * Returns: { isBot: boolean, botName?: string, status?: string }
 */

import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
    try {
        const wallet = request.nextUrl.searchParams.get('wallet')?.trim();

        if (!wallet) {
            return NextResponse.json({ isBot: false });
        }

        const supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
        );

        const { data } = await supabase
            .from('bot_activation_codes')
            .select('bot_name, status')
            .eq('bot_wallet', wallet)
            .in('status', ['claimed', 'used'])
            .maybeSingle();

        if (data) {
            return NextResponse.json({
                isBot: true,
                botName: data.bot_name,
                status: data.status,
            });
        }

        return NextResponse.json({ isBot: false });
    } catch {
        return NextResponse.json({ isBot: false });
    }
}
