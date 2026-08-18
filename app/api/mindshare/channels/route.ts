import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

/**
 * GET /api/mindshare/channels
 *
 * TG · Channels — the registry behind every mindshare and coverage
 * number: which Korean channels we watch, and whether each is actually
 * producing posts.
 *
 * The useful column is `last_post_at`. A channel can sit in the registry
 * as active for weeks while its handle has changed, it has gone private,
 * or the crawler quietly stopped resolving it — and nothing downstream
 * says so, the totals are just lower than they should be. Registered but
 * silent is the failure this table is for.
 *
 * Post counts join on the normalised channel id: the registry stores the
 * Bot API form (-100…) and the crawler writes the Telethon peer id, so a
 * raw comparison matches almost nothing. That mismatch silently dropped
 * 98% of the corpus once already (2026-08-08).
 */
export async function GET() {
  const cookieStore = cookies();
  const sb = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get(n: string) { return cookieStore.get(n)?.value; }, set() {}, remove() {} } },
  );
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const { data, error } = await (supabase as any).rpc('mindshare_channel_registry');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = (data ?? []) as any[];
  const active = rows.filter(r => r.is_active);
  // Channel taxonomy — Jdot's v7 answer #2. Reported as a distribution
  // because the number that matters is how many rows are still `unknown`:
  // that is the hand-classification queue, and it only shrinks if someone
  // can see it.
  const byKind = active.reduce((acc: Record<string, number>, r) => {
    acc[r.channel_kind || 'unknown'] = (acc[r.channel_kind || 'unknown'] ?? 0) + 1;
    return acc;
  }, {});
  const now = Date.now();
  const stale = rows.filter(r => r.is_active && (!r.last_post_at || now - Date.parse(r.last_post_at) > 14 * 86400_000));

  return NextResponse.json({
    ok: true,
    channels: rows,
    summary: {
      total: rows.length,
      active: rows.filter(r => r.is_active).length,
      producing: rows.filter(r => (r.posts_30d ?? 0) > 0).length,
      silent: stale.length,
      by_kind: byKind,
      unclassified: byKind.unknown ?? 0,
      hired: active.filter(r => r.is_hired).length,
    },
  });
}
