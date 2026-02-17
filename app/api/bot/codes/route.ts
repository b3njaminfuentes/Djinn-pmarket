/**
 * POST /api/bot/codes — Generate activation codes (admin-only)
 *
 * Headers: x-admin-secret: <ADMIN_SECRET>
 * Body: { count: number }
 * Response: { codes: string[] }
 */

import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

function generateCode(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // No I, O, 0, 1 to avoid confusion
    let code = 'DJNN-';
    for (let i = 0; i < 4; i++) {
        code += chars[Math.floor(Math.random() * chars.length)];
    }
    return code;
}

export async function POST(request: NextRequest) {
    try {
        // Auth check
        const adminSecret = request.headers.get('x-admin-secret');
        if (adminSecret !== process.env.ADMIN_SECRET) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { count = 1 } = await request.json();
        const numCodes = Math.min(Math.max(1, count), 100);

        const supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
        );

        // Generate unique codes
        const codes: string[] = [];
        const maxRetries = numCodes * 3;
        let attempts = 0;

        while (codes.length < numCodes && attempts < maxRetries) {
            const code = generateCode();
            attempts++;

            // Check uniqueness
            const { data: existing } = await supabase
                .from('bot_activation_codes')
                .select('code')
                .eq('code', code)
                .maybeSingle();

            if (!existing) {
                const { error } = await supabase
                    .from('bot_activation_codes')
                    .insert({
                        code,
                        status: 'available',
                        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
                    });

                if (!error) {
                    codes.push(code);
                }
            }
        }

        return NextResponse.json({ codes, generated: codes.length });

    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        console.error('Error generating codes:', message);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

// GET — List all codes (admin-only)
export async function GET(request: NextRequest) {
    try {
        const adminSecret = request.headers.get('x-admin-secret');
        if (adminSecret !== process.env.ADMIN_SECRET) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
        );

        const { data, error } = await supabase
            .from('bot_activation_codes')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;

        return NextResponse.json({ codes: data });

    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        console.error('Error listing codes:', message);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
