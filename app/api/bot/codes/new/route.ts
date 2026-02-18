
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Admin/Service Role Client
const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * POST /api/bot/codes/new
 * Generates a new activation code for the CLI (Admin-only, requires x-admin-secret header)
 */
export async function POST(req: NextRequest) {
    // Auth check — solo admins pueden generar códigos desde este endpoint
    const adminSecret = req.headers.get('x-admin-secret');
    if (!adminSecret || adminSecret !== process.env.ADMIN_SECRET) {
        return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    try {
        // Generate a random 4-char code (e.g. DJNN-A7X9)
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        let code = 'DJNN-';
        for (let i = 0; i < 4; i++) {
            code += chars.charAt(Math.floor(Math.random() * chars.length));
        }

        // Insert into DB with 7-day expiry
        const { data, error } = await supabase
            .from('bot_activation_codes')
            .insert([
                {
                    code,
                    status: 'available',
                    expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
                }
            ])
            .select()
            .single();

        if (error) throw error;

        return NextResponse.json({ success: true, code });

    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        console.error('Error generating code:', message);
        return NextResponse.json({ success: false, error: message }, { status: 500 });
    }
}
