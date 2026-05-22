import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

/**
 * GET /api/mindshare/projects/[id]/channels?range=24h|7d|30d
 *
 * Storyteller endpoint — "who is talking about this project, and how
 * much?" Returns the top Telegram channels ranked by mention count for
 * a single project, with prior-window delta math for trend arrows.
 *
 * Mirrors the leaderboard's data flow but pivots project → channels
 * instead of channel-aggregate → project rankings.
 *
 * Auth: any signed-in user (matches /api/mindshare/leaderboard).
 *
 * Response shape:
 *   {
 *     project: { id, name, category, is_pre_tge, ... },
 *     period: { from, to },
 *     prior_period: { from, to },
 *     total_mentions: number,
 *     items: [{
 *       channel_id: string | null,
 *       channel_name: string | null,
 *       channel_username: string | null,
 *       mention_count: number,
 *       share_pct: number,   // % of project's total mentions in window
 *       prior_count: number,
 *       delta_pct: number,   // % change vs prior window
 *       last_mention_at: string | null,
 *     }]
 *   }
 */
export async function GET(
  request: Request,
  { params }: { params: { id: string } },
) {
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

  const url = new URL(request.url);
  const range = (url.searchParams.get('range') || '7d') as '24h' | '7d' | '30d';
  const days = range === '24h' ? 1 : range === '7d' ? 7 : 30;

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // Define current + prior windows. Prior is the matching window
  // immediately before the current one, used for trend deltas.
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const minusDays = (d: Date, n: number) => { const out = new Date(d); out.setUTCDate(out.getUTCDate() - n); return out; };
  const currentStart = fmt(minusDays(today, days - 1));
  const currentEnd = fmt(today);
  const priorStart = fmt(minusDays(today, days * 2 - 1));
  const priorEnd = fmt(minusDays(today, days));

  try {
    // 1) Project metadata (so the page can render the header without
    //    a separate round-trip).
    const { data: project, error: projectErr } = await (supabase as any)
      .from('mindshare_projects')
      .select('id, name, client_id, category, is_pre_tge, twitter_handle, website_url, description, is_active')
      .eq('id', params.id)
      .single();
    if (projectErr || !project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    // 2) Pull every mention for this project across BOTH windows (we
    //    need both for the trend math). Selects channel_id so we can
    //    group + join to tg_monitored_channels for names.
    const { data: mentions } = await (supabase as any)
      .from('tg_mentions')
      .select('channel_id, message_date')
      .eq('project_id', params.id)
      .gte('message_date', priorStart + 'T00:00:00')
      .lte('message_date', currentEnd + 'T23:59:59');

    const rows = (mentions || []) as Array<{ channel_id: string | null; message_date: string }>;

    // 3) Aggregate per channel: current count, prior count, last mention.
    // null channel_id buckets to "_unknown" — happens when a chat hasn't
    // been linked to tg_monitored_channels yet (the channel_tg_id
    // backfill we're separately running fixes this).
    type Bucket = { channel_id: string | null; current: number; prior: number; lastAt: string | null };
    const byChannel = new Map<string, Bucket>();
    for (const m of rows) {
      const key = m.channel_id ?? '_unknown';
      let b = byChannel.get(key);
      if (!b) {
        b = { channel_id: m.channel_id, current: 0, prior: 0, lastAt: null };
        byChannel.set(key, b);
      }
      const day = (m.message_date as string).slice(0, 10);
      if (day >= currentStart && day <= currentEnd) b.current++;
      else if (day >= priorStart && day <= priorEnd) b.prior++;
      if (!b.lastAt || m.message_date > b.lastAt) b.lastAt = m.message_date;
    }

    // 4) Resolve channel names + usernames in one round-trip.
    const channelIds = Array.from(byChannel.values())
      .map(b => b.channel_id)
      .filter((id): id is string => !!id);
    let channelMeta = new Map<string, { name: string | null; username: string | null }>();
    if (channelIds.length > 0) {
      const { data: channels } = await (supabase as any)
        .from('tg_monitored_channels')
        .select('id, channel_name, channel_username')
        .in('id', channelIds);
      for (const c of (channels || []) as any[]) {
        channelMeta.set(c.id, { name: c.channel_name, username: c.channel_username });
      }
    }

    // 5) Shape the response. Total = sum of current counts, used for
    // share_pct so we don't pollute with prior-window mentions.
    const currentTotal = Array.from(byChannel.values()).reduce((s, b) => s + b.current, 0);
    const items = Array.from(byChannel.values()).map(b => {
      const meta = b.channel_id ? channelMeta.get(b.channel_id) : null;
      const share_pct = currentTotal > 0 ? (b.current / currentTotal) * 100 : 0;
      const delta_pct = b.prior > 0
        ? ((b.current - b.prior) / b.prior) * 100
        : (b.current > 0 ? 100 : 0);
      return {
        channel_id: b.channel_id,
        channel_name: meta?.name ?? null,
        channel_username: meta?.username ?? null,
        mention_count: b.current,
        share_pct,
        prior_count: b.prior,
        delta_pct,
        last_mention_at: b.lastAt,
      };
    })
    // Sort by current-window mention count desc; ties by name asc for stability.
    .sort((a, b) => (b.mention_count - a.mention_count) || ((a.channel_name || '').localeCompare(b.channel_name || '')));

    return NextResponse.json({
      project,
      range,
      period: { from: currentStart, to: currentEnd },
      prior_period: { from: priorStart, to: priorEnd },
      total_mentions: currentTotal,
      items,
    });
  } catch (err: any) {
    console.error('[mindshare/projects/[id]/channels] error:', err);
    return NextResponse.json({ error: err?.message || 'failed' }, { status: 500 });
  }
}
