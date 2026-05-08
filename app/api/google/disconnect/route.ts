import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createClient } from '@supabase/supabase-js';
import { disconnectUser } from '@/lib/googleCalendarService';

export const dynamic = 'force-dynamic';

/**
 * POST /api/google/disconnect
 *
 * Disconnects the current user's Google Calendar integration:
 *   1. Calls Google's revoke endpoint (best-effort)
 *   2. Deletes the row from google_oauth_tokens
 *
 * After this, the meeting reminder cron skips them until they reconnect.
 */
export async function POST() {
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

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  try {
    await disconnectUser(supabase, user.id);
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
