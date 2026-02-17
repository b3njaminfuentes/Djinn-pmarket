
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Admin/Service Role Client
const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * POST /api/bot/codes/new
 * Generates a new activation code for the CLI (Self-Service)
 */
export async function POST(req: NextRequest) {
    try {
        // Generate a random 4-char code (e.g. A7X9)
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        let code = 'DJNN-';
        for (let i = 0; i < 4; i++) {
            code += chars.charAt(Math.floor(Math.random() * chars.length));
        }

        // Insert into DB
        const { data, error } = await supabase
            .from('bot_activation_codes')
            .insert([
                {
                    code,
                    status: 'available', // Ready to be claimed by CLI details
                    // No bot_wallet yet, CLI will update this in /claim or we pass it here?
                    // Actually, CLI generates wallet -> gets code -> claims code with wallet.
                    // So here we just return the code.
                }
            ])
            .select()
            .single();

        if (error) throw error;

        return NextResponse.json({ success: true, code });

    } catch (err: any) {
        console.error('Error generating code:', err);
        return NextResponse.json({ success: false, error: err.message }, { status: 500 });
    }
}
