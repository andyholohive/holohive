import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

/**
 * POST /api/mcp/kol-snapshot/upsert
 *
 * Doc 2 §3 + §10 MCP write endpoint — the Telegram MCP scan server
 * calls this after `tg_channel_snapshot(channel)` to persist the
 * organic-filtered aggregates into `kol_channel_snapshots`.
 *
 * Upserts on (kol_id, snapshot_date) — re-running the same monthly
 * scan replaces in place, same-month on-demand refreshes overwrite
 * the latest row without polluting Growth Trajectory's
 * month-over-month anchor. Same-day idempotency is automatic.
 *
 * Body (all required unless noted):
 *   - kol_id: uuid
 *   - snapshot_date: ISO date (YYYY-MM-DD)
 *   - follower_count: int
 *   - avg_views_per_post: number | null
 *   - avg_forwards_per_post: number | null
 *   - avg_reactions_per_post: number | null
 *   - avg_replies_per_post: number | null  (null = broadcast-only,
 *     drops Discussion Engagement dim per Jdot Q2)
 *   - engagement_rate: number | null
 *   - posting_frequency: number | null
 *   - follower_growth_pct: number | null  (null on month-1 per spec;
 *     drops Growth Trajectory dim per Jdot Q4)
 *   - organic_posts_analyzed: int | null
 *   - low_organic_volume_flag: boolean (default false)
 *
 * Auth: Bearer CRON_SECRET (server-to-server only) — same pattern as
 * the cron routes. Never exposed to the user-session cookie path.
 *
 * Uses the SUPABASE_SERVICE_ROLE_KEY so the write bypasses RLS the
 * same way crons do; the bearer check above is the actual gate.
 */
export async function POST(request: Request) {
  // Auth gate.
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 });
  const auth = request.headers.get('authorization') || '';
  if (auth !== `Bearer ${cronSecret}`) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 });

  // Required fields validation.
  const { kol_id, snapshot_date } = body;
  if (!kol_id || typeof kol_id !== 'string') return NextResponse.json({ error: 'kol_id required' }, { status: 400 });
  if (!snapshot_date || !/^\d{4}-\d{2}-\d{2}$/.test(snapshot_date)) {
    return NextResponse.json({ error: 'snapshot_date required (YYYY-MM-DD)' }, { status: 400 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ error: 'supabase not configured' }, { status: 500 });
  }
  const sb = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

  // engagement_rate is a GENERATED column (avg_views_per_post / follower_count).
  // Don't pass it through — Postgres errors with "cannot insert non-DEFAULT
  // value into generated column". The MCP scanner can compute it for its
  // own reporting; our snapshot row derives it automatically.
  const row = {
    kol_id,
    snapshot_date,
    follower_count: body.follower_count ?? null,
    avg_views_per_post: body.avg_views_per_post ?? null,
    avg_forwards_per_post: body.avg_forwards_per_post ?? null,
    avg_reactions_per_post: body.avg_reactions_per_post ?? null,
    avg_replies_per_post: body.avg_replies_per_post ?? null,
    posting_frequency: body.posting_frequency ?? null,
    follower_growth_pct: body.follower_growth_pct ?? null,
    organic_posts_analyzed: body.organic_posts_analyzed ?? null,
    low_organic_volume_flag: body.low_organic_volume_flag ?? false,
    notes: body.notes ?? null,
  };

  // Upsert on the (kol_id, snapshot_date) unique constraint — re-runs
  // and on-demand refreshes overwrite the existing row in place.
  const { data, error } = await sb
    .from('kol_channel_snapshots')
    .upsert(row, { onConflict: 'kol_id,snapshot_date' })
    .select('id, kol_id, snapshot_date')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ snapshot: data });
}
