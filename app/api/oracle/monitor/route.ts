import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    try {
        const { slug } = await request.json();

        if (!slug) {
            return NextResponse.json({ error: 'Market slug required' }, { status: 400 });
        }

        // Enable monitoring for this market (Optional, ignore if column missing)
        const { error } = await supabase
            .from('markets')
            .update({ monitoring_enabled: true })
            .eq('slug', slug);

        if (error) {
            console.warn('[Monitor] Supabase update failed (might be missing column), proceeding to AI:', error.message);
        }

        // Log the event
        // We assume the caller (client) handles the "oracle log" or we do it here.
        // Ideally we should log to oracle_logs here too.

        // Lazy import oracle module to avoid circular deps if any, or just use raw insert
        // Log the event
        await supabase.from('oracle_logs').insert({
            type: 'system',
            source: 'system',
            message: `Auto-monitoring enabled for market: ${slug}`,
            metadata: { trigger: 'first_bet' }
        });

        // --- EXECUTE ORACLE BOT ---
        try {
            const { OracleBot } = await import('@/lib/oracle/bot');
            const bot = new OracleBot();

            // Fetch market title to use as question
            let { data: market } = await supabase.from('markets').select('title').eq('slug', slug).single();

            // Fallback to local API (for test markets)
            if (!market?.title) {
                try {
                    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://127.0.0.1:3002';
                    const localRes = await fetch(`${baseUrl}/api/markets`);
                    const localMarkets = await localRes.json();
                    const localM = localMarkets.find( (m: any) => m.id === slug);
                    if (localM) market = { title: localM.title } as any;
                } catch (e) { }
            }

            const question = market?.title || slug;

            // Run analysis
            await bot.analyzeMarket(slug, question);

        } catch (botError) {
            console.error("Oracle Bot execution failed:", botError);
            await supabase.from('oracle_logs').insert({
                type: 'error',
                source: 'system',
                message: `Bot execution failed: ${String(botError)}`
            });
        }

        return NextResponse.json({ success: true, message: `Monitoring enabled for ${slug}` });
    } catch (error) {
        return NextResponse.json({ error: String(error) }, { status: 500 });
    }
}
