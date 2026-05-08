import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { randomBytes } from 'crypto';
import { buildAuthUrl } from '@/lib/googleCalendarService';

export const dynamic = 'force-dynamic';

/**
 * GET /api/google/oauth/start
 *
 * Kicks off the Google OAuth flow for the currently-logged-in user.
 * Generates a CSRF state token, stores it in a short-lived httpOnly cookie,
 * and redirects to Google's consent screen. The callback at /api/google/
 * oauth/callback verifies the state matches.
 *
 * Why a cookie + state token: prevents CSRF where an attacker tricks a
 * logged-in user into approving the attacker's account by handcrafting
 * a callback URL. The state binds the callback to the originating session.
 */
export async function GET() {
  // Fail fast with a useful message if env is missing. Otherwise the
  // user sees a generic 500 and has no idea what to fix.
  if (!process.env.GOOGLE_CLIENT_ID) {
    return NextResponse.json(
      { error: 'GOOGLE_CLIENT_ID is not set in .env.local. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET, then restart the dev server.' },
      { status: 500 },
    );
  }
  if (!process.env.GOOGLE_CLIENT_SECRET) {
    return NextResponse.json(
      { error: 'GOOGLE_CLIENT_SECRET is not set in .env.local.' },
      { status: 500 },
    );
  }

  const cookieStore = cookies();
  const sb = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) { return cookieStore.get(name)?.value; },
        set() {}, remove() {},
      },
    }
  );
  const { data: { user }, error } = await sb.auth.getUser();
  if (error || !user) {
    return NextResponse.redirect(new URL('/login', getOrigin()));
  }

  // 32-byte random token. We embed user_id in state so the callback can
  // verify it matches the session user and reject mismatches (someone
  // hijacking the redirect would land on a different session).
  const csrfToken = randomBytes(16).toString('hex');
  const state = `${user.id}.${csrfToken}`;

  let authUrl: string;
  try {
    authUrl = buildAuthUrl(state);
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to build OAuth URL' }, { status: 500 });
  }

  const res = NextResponse.redirect(authUrl);

  // 10 minute lifetime — Google's consent screen rarely takes that long.
  res.cookies.set('google_oauth_state', csrfToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 600,
  });

  return res;
}

function getOrigin(): string {
  if (process.env.NEXT_PUBLIC_BASE_URL) {
    return process.env.NEXT_PUBLIC_BASE_URL.startsWith('http')
      ? process.env.NEXT_PUBLIC_BASE_URL
      : `https://${process.env.NEXT_PUBLIC_BASE_URL}`;
  }
  return process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000';
}
