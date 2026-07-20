import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * POST /api/mcp/channel-posts
 *
 * Ingest endpoint for the TG Intelligence Layer coverage read. Called
 * per-channel by the Telethon coverage scanner after
 * `scan_channel_posts(...)` pulls a channel's posts for a subject
 * (prospect project / client). Upserts into tg_channel_posts on the
 * (subject_type, subject_id, channel_tg_id, tg_message_id) unique key
 * so re-scans are idempotent, and records per-channel pull status in
 * tg_channel_coverage (mirroring the tg_post_coverage discipline —
 * log WHY a channel returned nothing).
 *
 * Body:
 *   - subject_type: 'pipeline' | 'client' | 'project'
 *   - subject_id: uuid — polymorphic anchor (sales-pipeline row today;
 *     repointable to a rebuild entity / Client without migration)
 *   - channel_handle: string
 *   - query: string | null — the search term used
 *   - kol_id: uuid | null — when the channel maps to a roster KOL
 *   - channel_type: string | null — from KOL profile when known
 *   - status: 'ok' | 'no_posts' | 'not_found' | 'private' |
 *             'not_channel' | 'flood_wait' | 'error'
 *   - detail: string | null — error/flood context
 *   - scan: CoverageScan | null — the scanner payload when status='ok':
 *       { tg_channel_id, channel_title, channel_handle, posts: [...] }
 *
 * Auth: Bearer CRON_SECRET (server-to-server only). Same pattern as
 * mindshare-ingest / kol-snapshot.
 */
export async function POST(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 });
  const auth = request.headers.get('authorization') || '';
  if (auth !== `Bearer ${cronSecret}`) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 });

  const subjectType = body.subject_type;
  const subjectId = body.subject_id;
  const channelHandle = body.channel_handle;
  if (!['pipeline', 'client', 'project'].includes(subjectType)) {
    return NextResponse.json({ error: "subject_type must be 'pipeline' | 'client' | 'project'" }, { status: 400 });
  }
  if (!subjectId || typeof subjectId !== 'string') {
    return NextResponse.json({ error: 'subject_id is required' }, { status: 400 });
  }
  if (!channelHandle || typeof channelHandle !== 'string') {
    return NextResponse.json({ error: 'channel_handle is required' }, { status: 400 });
  }
  const status = body.status;
  if (typeof status !== 'string') {
    return NextResponse.json({ error: 'status is required' }, { status: 400 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const scan = body.scan ?? null;
  const query = body.query ?? null;
  let postsUpserted = 0;

  if (status === 'ok' && scan && Array.isArray(scan.posts)) {
    const rows = scan.posts.map((p: any) => ({
      subject_type: subjectType,
      subject_id: subjectId,
      channel_tg_id: String(scan.tg_channel_id ?? ''),
      channel_handle: scan.channel_handle ?? channelHandle,
      channel_title: scan.channel_title ?? null,
      channel_type: body.channel_type ?? null,
      kol_id: body.kol_id ?? null,
      tg_message_id: p.tg_message_id,
      posted_at: p.posted_at,
      text: p.text ?? '',
      views: p.views ?? null,
      forwards: p.forwards ?? null,
      replies: p.replies ?? null,
      reactions_json: p.reactions_json ?? null,
      reaction_total: p.reaction_total ?? null,
      is_forward: p.is_forward === true,
      query,
      pulled_at: new Date().toISOString(),
    }));
    if (rows.length > 0) {
      const { error: postsErr, count } = await (supabase as any)
        .from('tg_channel_posts')
        .upsert(rows, {
          onConflict: 'subject_type,subject_id,channel_tg_id,tg_message_id',
          count: 'exact',
        });
      if (postsErr) {
        console.error('[channel-posts] posts upsert failed:', postsErr);
        return NextResponse.json({ error: postsErr.message }, { status: 500 });
      }
      postsUpserted = count ?? rows.length;
    }
  }

  // Coverage row — one per subject+channel, latest scan wins.
  const { error: covErr } = await (supabase as any)
    .from('tg_channel_coverage')
    .upsert({
      subject_type: subjectType,
      subject_id: subjectId,
      channel_handle: channelHandle,
      channel_tg_id: scan?.tg_channel_id != null ? String(scan.tg_channel_id) : null,
      status,
      detail: body.detail ?? null,
      posts_found: postsUpserted,
      query,
      scanned_at: new Date().toISOString(),
    }, { onConflict: 'subject_type,subject_id,channel_handle' });
  if (covErr) {
    console.error('[channel-posts] coverage upsert failed:', covErr);
    return NextResponse.json({ error: covErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, posts_upserted: postsUpserted, status });
}
