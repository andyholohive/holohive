import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createClient } from '@supabase/supabase-js';
import { runMindshareScan } from '@/lib/mindshareScanner';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * POST /api/mindshare/scan?backfill=1
 *
 * Admin-gated wrapper around the mindshare scanner so the UI can
 * trigger a manual run without exposing CRON_SECRET. The cron route
 * (/api/cron/mindshare-scan) keeps its bearer-token auth for Vercel.
 *
 * Auth: signed-in user with role admin | super_admin.
 */
export async function POST(request: Request) {
  // 1) Verify session
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
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // 2) Verify admin
  const { data: profile } = await (sb as any)
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();
  const role = profile?.role;
  if (role !== 'admin' && role !== 'super_admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const url = new URL(request.url);
  const backfill = url.searchParams.get('backfill') === '1';

  // 3) Run scan with the service-role client so RLS doesn't get in the way.
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  try {
    const result = await runMindshareScan(supabase, { backfill });
    return NextResponse.json({ ok: true, backfill, ...result });
  } catch (err: any) {
    console.error('[mindshare/scan] error:', err);
    return NextResponse.json({ ok: false, error: err?.message || 'scan failed' }, { status: 500 });
  }
}
