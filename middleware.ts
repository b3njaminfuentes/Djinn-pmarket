import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const PROTECTED_ROUTES = [
    '/markets',
    '/market/',
    '/activity',
    '/bets',
    '/profile/',
    '/oracle',
    '/leaderboard',
    '/genesis',
    '/admin'
];

export function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl;

    // Allow static assets and API routes
    if (
        pathname.startsWith('/_next/') ||
        pathname.startsWith('/api/') ||
        pathname.startsWith('/favicon') ||
        pathname.endsWith('.png') ||
        pathname.endsWith('.jpg') ||
        pathname.endsWith('.svg') ||
        pathname.endsWith('.ico')
    ) {
        return NextResponse.next();
    }

    // Check if the route is protected
    const isProtected = PROTECTED_ROUTES.some(route => pathname.startsWith(route));

    if (isProtected) {
        const session = request.cookies.get('djinn_connected');
        const access = request.cookies.get('djinn_access');

        if (!session?.value || !access?.value) {
            // Redirect to landing — no access without wallet connection OR whitelist access
            return NextResponse.redirect(new URL('/', request.url));
        }
    }

    return NextResponse.next();
}

export const config = {
    matcher: [
        '/((?!_next/static|_next/image|favicon.ico).*)',
    ],
};
