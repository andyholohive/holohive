import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

/**
 * GET /api/google/status
 *
 * Returns whether the current user has Google Calendar connected, and
 * if so, which email + when they connected. Used by the /settings page
 * to render either the "Connect Google" button or the "Connected as
 * foo@gmail.com" status block.
 *
 * Returns:
 *   { connected: false }
 *   { connected: true, email, connected_at, expires_at }
 */
export async function GET() {
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
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Use service role to bypass any RLS — this endpoint already gates
  // on the session user above, so reading their own row is safe.
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: tokens } = await (supabase as any)
    .from('google_oauth_tokens')
    .select('google_email, connected_at, expires_at')
    .eq('user_id', user.id)
    .maybeSingle();

  if (!tokens) {
    return NextResponse.json({ connected: false });
  }

  return NextResponse.json({
    connected: true,
    email: tokens.google_email,
    connected_at: tokens.connected_at,
    expires_at: tokens.expires_at,
  });
}
