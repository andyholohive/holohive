import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createClient } from '@supabase/supabase-js';
import { exchangeCodeForTokens } from '@/lib/googleCalendarService';

export const dynamic = 'force-dynamic';

/**
 * GET /api/google/oauth/callback?code=...&state=...
 *
 * Google redirects here after the consent screen. We:
 *   1. Verify state cookie matches (CSRF check)
 *   2. Verify the user_id in state matches the current session
 *   3. Exchange the code for access + refresh tokens
 *   4. Upsert into google_oauth_tokens
 *   5. Redirect back to /settings with a success/error flag
 *
 * On any failure we redirect to /settings?google=error&reason=... so the
 * user sees a toast instead of a stack trace.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const errorParam = url.searchParams.get('error'); // e.g. user clicked Cancel

  if (errorParam) {
    return redirectToSettings('error', `Google declined: ${errorParam}`);
  }
  if (!code || !state) {
    return redirectToSettings('error', 'Missing code or state from Google callback');
  }

  // ── Auth + CSRF verification ───────────────────────────────────────
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
  const { data: { user } } = await sb.auth.getUser();
  if (!user) {
    return redirectToSettings('error', 'Session expired during OAuth flow');
  }

  const [stateUserId, stateCsrf] = state.split('.');
  const cookieCsrf = cookieStore.get('google_oauth_state')?.value;
  if (!stateUserId || !stateCsrf || !cookieCsrf || stateCsrf !== cookieCsrf) {
    return redirectToSettings('error', 'Invalid OAuth state (CSRF check failed)');
  }
  if (stateUserId !== user.id) {
    return redirectToSettings('error', 'OAuth state user mismatch');
  }

  // ── Exchange + store tokens ────────────────────────────────────────
  let tokens;
  try {
    tokens = await exchangeCodeForTokens(code);
  } catch (err: any) {
    return redirectToSettings('error', err.message || 'Token exchange failed');
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

  const { error: upsertErr } = await (supabase as any)
    .from('google_oauth_tokens')
    .upsert({
      user_id: user.id,
      google_email: tokens.email,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_at: expiresAt,
      scope: tokens.scope,
      connected_at: new Date().toISOString(),
    }, { onConflict: 'user_id' });

  if (upsertErr) {
    return redirectToSettings('error', `Database error: ${upsertErr.message}`);
  }

  // ── Done — clear the CSRF cookie + redirect ────────────────────────
  const res = redirectToSettings('connected', tokens.email);
  res.cookies.set('google_oauth_state', '', { maxAge: 0, path: '/' });
  return res;
}

function redirectToSettings(status: 'connected' | 'error', detail?: string): NextResponse {
  const base = getOrigin();
  const url = new URL('/settings', base);
  url.searchParams.set('google', status);
  if (detail) url.searchParams.set('detail', detail);
  return NextResponse.redirect(url);
}

function getOrigin(): string {
  if (process.env.NEXT_PUBLIC_BASE_URL) {
    return process.env.NEXT_PUBLIC_BASE_URL.startsWith('http')
      ? process.env.NEXT_PUBLIC_BASE_URL
      : `https://${process.env.NEXT_PUBLIC_BASE_URL}`;
  }
  return process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000';
}
