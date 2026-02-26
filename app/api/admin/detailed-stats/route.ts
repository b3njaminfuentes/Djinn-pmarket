import { NextResponse } from 'next/server';
import { getAllProfiles } from '@/lib/supabase-db';

export async function GET(req: Request) {
    try {
        // --- SECURITY CHECK ---
        const adminSecret = req.headers.get('x-admin-secret');
        if (!adminSecret || adminSecret !== process.env.ADMIN_SECRET) {
            console.warn('[API] Unauthorized Detailed Stats attempt');
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const profiles = await getAllProfiles();

        // Enhance the data with simple status flags for the report
        const report = profiles.map(p => ({
            ...p,
            hasClaimedUsername: !!p.username && !p.username.startsWith('user_'), // Basic check if they changed default
            hasLinkedX: !!p.twitter && p.twitter !== '',
            isBot: p.agent_type === 'clawbot'
        }));

        return NextResponse.json({
            success: true,
            totalUsers: report.length,
            humanCount: report.filter(u => !u.isBot).length,
            botCount: report.filter(u => u.isBot).length,
            profiles: report
        });

    } catch (e) {
        console.error('[API] Error fetching detailed stats:', e);
        return NextResponse.json({ error: 'Error fetching detailed stats' }, { status: 500 });
    }
}
