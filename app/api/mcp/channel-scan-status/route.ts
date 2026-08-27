import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

/**
 * POST /api/mcp/channel-scan-status
 *
 * Per-channel outcome for the mindshare corpus scrape. Called once per
 * channel per run, INCLUDING for channels that returned nothing — that is
 * the entire point.
 *
 * Why this exists: /api/mcp/mindshare-ingest only hears from channels that
 * produced posts, so a channel that fails is silent in exactly the same way
 * a channel with a quiet day is. Fourteen registered channels have produced
 * zero posts since May and there is no record anywhere of why, because the
 * reason only ever existed in a GitHub Actions log. Mirrors what
 * tg_channel_coverage already does for the newer coverage read.
 *
 * Body:
 *   - monitored_channel_id: uuid   (required)
 *   - channel_username: string | null
 *   - status: ok | no_posts | no_handle | not_found | private |
 *             not_channel | flood_wait | error
 *   - detail: string | null        — the exception text, truncated
 *   - posts_found: number
 *
 * Auth: Bearer CRON_SECRET, same as the sibling MCP ingest routes.
 */
const VALID = new Set([
  'ok', 'no_posts', 'no_handle', 'not_found', 'private',
  'not_channel', 'flood_wait', 'error',
]);

export async function POST(request: Request) {
  const auth = request.headers.get('authorization') ?? '';
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const id = body?.monitored_channel_id;
  const status = body?.status;
  if (!id || typeof id !== 'string') {
    return NextResponse.json({ error: 'monitored_channel_id is required' }, { status: 400 });
  }
  if (!VALID.has(status)) {
    return NextResponse.json(
      { error: `status must be one of: ${Array.from(VALID).join(', ')}` },
      { status: 400 },
    );
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  // failing_since is preserved across runs so the UI can distinguish "failed
  // once" from "failed every run since May". Read the current row rather than
  // letting the upsert clobber it — the age of a failure is the signal that
  // decides whether to fix the handle or drop the channel.
  const { data: prev } = await (supabase as any)
    .from('tg_channel_scan_log')
    .select('status, failing_since')
    .eq('monitored_channel_id', id)
    .maybeSingle();

  const now = new Date().toISOString();
  const failingSince = status === 'ok'
    ? null
    : (prev?.status && prev.status !== 'ok' ? prev.failing_since ?? now : now);

  const { error } = await (supabase as any)
    .from('tg_channel_scan_log')
    .upsert({
      monitored_channel_id: id,
      channel_username: typeof body.channel_username === 'string' ? body.channel_username : null,
      status,
      detail: typeof body.detail === 'string' ? body.detail.slice(0, 500) : null,
      posts_found: Number.isFinite(body?.posts_found) ? Number(body.posts_found) : 0,
      scanned_at: now,
      failing_since: failingSince,
    }, { onConflict: 'monitored_channel_id' });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
