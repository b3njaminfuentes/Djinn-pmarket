import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
    const expectedAdminSecret = process.env.ADMIN_SECRET;
    const providedAdminSecret = request.headers.get('x-admin-secret');

    if (!expectedAdminSecret) {
        console.error('[ORACLE-CONFIG] ADMIN_SECRET is not configured');
        return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
    }

    if (!providedAdminSecret || providedAdminSecret !== expectedAdminSecret) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabaseAdmin = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    );


    try {
        const { source, config } = await request.json();

        if (!source || !config) {
            return NextResponse.json({ error: 'source and config are required' }, { status: 400 });
        }

        if (source === 'custom_urls') {
            if (!Array.isArray(config.urls)) {
                return NextResponse.json({ error: 'config.urls must be an array for custom_urls' }, { status: 400 });
            }

            const { error } = await supabaseAdmin
                .from('oracle_sources')
                .upsert({
                    name: 'custom',
                    display_name: 'Custom Links',
                    enabled: true,
                    config: { urls: config.urls }
                }, { onConflict: 'name' });

            if (error) throw error;

        } else {
            const { error } = await supabaseAdmin
                .from('oracle_sources')
                .update({
                    config: config,
                    enabled: true
                })
                .eq('name', source);

            if (error) throw error;
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error saving config:', error);
        return NextResponse.json(
            { error: 'Failed to save config', details: String(error) },
            { status: 500 }
        );
    }
}
