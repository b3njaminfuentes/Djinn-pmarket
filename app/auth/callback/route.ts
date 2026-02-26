import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
    const requestUrl = new URL(request.url)
    const code = requestUrl.searchParams.get('code')

    if (code) {
        // We use the same environment variables as in lib/supabase.ts
        const supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            {
                auth: {
                    persistSession: false, // On server-side we don't need to persist in memory
                    autoRefreshToken: false,
                    detectSessionInUrl: true
                }
            }
        )

        // Exchange the code for a session
        await supabase.auth.exchangeCodeForSession(code)
    }

    // URL to redirect to after sign in process completes
    // We redirect to the root page, the client-side listener in LayoutWrapper will pick up the updated session
    return NextResponse.redirect(requestUrl.origin)
}
