import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

/**
 * GET /api/public/mindshare/[token]?before=YYYY-MM-DD&after=YYYY-MM-DD&window=30
 *
 * Client-facing before/after mindshare snapshot. Resolves a share token
 * to the project row (opt-in per project via /mindshare admin toggle),
 * then returns two window-shaped rollups (before + after) plus a daily
 * series that spans both windows and the gap between.
 *
 * Windows are anchored to a pivot date (`before` = "end of the baseline
 * period", `after` = "start of the campaign period"). By default we anchor
 * both to today - 30d and window = 30d ("last 30d vs the 30d before that")
 * so a client landing on the URL sees a defensible chart immediately. The
 * URL can override with a specific pivot (e.g. campaign_start_date) to
 * frame the story around when HHP engagement started.
 *
 * Also returns top_channels for transparency + total_market_mentions
 * so the % is verifiable against the denominator.
 *
 * No auth — token gate is the guard. Same pattern as /public/portal/[id]
 * (that page uses anon-key + RLS; we use service key + token match).
 */
export async function GET(request: Request, { params }: { params: { token: string } }) {
  const { token } = params;
  if (!token || !/^[0-9a-f-]{20,}$/i.test(token)) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 400 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const { data: project, error: projErr } = await (supabase as any)
    .from('mindshare_projects')
    .select('id, name, category, is_pre_tge, twitter_handle, website_url, description, client_id, is_active, client:clients(id, name)')
    .eq('public_share_token', token)
    .maybeSingle();

  if (projErr) return NextResponse.json({ error: projErr.message }, { status: 500 });
  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!project.is_active) return NextResponse.json({ error: 'Project is inactive' }, { status: 404 });

  const url = new URL(request.url);
  const windowDays = Math.min(Math.max(Number(url.searchParams.get('window') || 30), 7), 90);

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const minusDays = (d: Date, n: number) => { const o = new Date(d); o.setUTCDate(o.getUTCDate() - n); return o; };

  // Pivot = the day the "after" window starts. Default to today - windowDays
  // so "after" = last N days, "before" = the N days before that.
  const pivotStr = url.searchParams.get('after') || iso(minusDays(today, windowDays));
  const pivot = new Date(pivotStr + 'T00:00:00Z');
  if (Number.isNaN(pivot.getTime())) {
    return NextResponse.json({ error: 'Invalid after date' }, { status: 400 });
  }

  const beforeStart = minusDays(pivot, windowDays);
  const beforeEnd = minusDays(pivot, 1);
  const afterStart = pivot;
  const afterEnd = minusDays(new Date(pivot), -Math.min(windowDays, Math.floor((today.getTime() - pivot.getTime()) / 86400000)));
  const seriesFrom = beforeStart;
  const seriesTo = afterEnd > today ? today : afterEnd;

  // Pull the project's daily mention series that covers the full span,
  // plus the market total per day (denominator for mindshare %).
  const [projSeriesRes, totalRes] = await Promise.all([
    (supabase as any)
      .from('mindshare_daily')
      .select('day, mention_count, channel_reach')
      .eq('project_id', project.id)
      .gte('day', iso(seriesFrom))
      .lte('day', iso(seriesTo))
      .order('day', { ascending: true }),
    (supabase as any)
      .from('mindshare_daily')
      .select('day, mention_count')
      .gte('day', iso(seriesFrom))
      .lte('day', iso(seriesTo)),
  ]);

  const projRows: Array<{ day: string; mention_count: number; channel_reach: number }> = projSeriesRes.data || [];
  const totalRows: Array<{ day: string; mention_count: number }> = totalRes.data || [];

  // Aggregate market total per day so mindshare % can be computed.
  const totalByDay = new Map<string, number>();
  for (const r of totalRows) {
    totalByDay.set(r.day, (totalByDay.get(r.day) || 0) + Number(r.mention_count || 0));
  }
  const projByDay = new Map<string, { m: number; c: number }>();
  for (const r of projRows) projByDay.set(r.day, { m: Number(r.mention_count || 0), c: Number(r.channel_reach || 0) });

  // Fill each day so the chart doesn't look spiky on gaps.
  const series: Array<{ day: string; mentions: number; channels: number; total: number; mindshare_pct: number }> = [];
  for (let d = new Date(seriesFrom); d <= seriesTo; d = minusDays(d, -1)) {
    const day = iso(d);
    const proj = projByDay.get(day) || { m: 0, c: 0 };
    const tot = totalByDay.get(day) || 0;
    series.push({
      day,
      mentions: proj.m,
      channels: proj.c,
      total: tot,
      mindshare_pct: tot > 0 ? (proj.m / tot) * 100 : 0,
    });
  }

  const window = (from: Date, to: Date) => {
    const points = series.filter(s => s.day >= iso(from) && s.day <= iso(to));
    const mentions = points.reduce((sum, p) => sum + p.mentions, 0);
    const total = points.reduce((sum, p) => sum + p.total, 0);
    const channels = new Set<string>(); // approximate via max channels/day
    let maxChannels = 0;
    for (const p of points) maxChannels = Math.max(maxChannels, p.channels);
    return {
      from: iso(from),
      to: iso(to),
      days: points.length,
      mentions,
      total_market_mentions: total,
      mindshare_pct: total > 0 ? (mentions / total) * 100 : 0,
      channels_reached: maxChannels,
    };
  };
  const beforeStats = window(beforeStart, beforeEnd);
  const afterStats = window(afterStart, afterEnd);

  // Top channels the project appeared in during the AFTER window — clients
  // want to see WHERE the growth happened, not just the aggregate move.
  const { data: topChannelRows } = await (supabase as any)
    .from('tg_mentions')
    .select('channel:tg_monitored_channels(id, channel_name, channel_username, member_count)')
    .eq('project_id', project.id)
    .gte('message_date', `${iso(afterStart)}T00:00:00`)
    .lte('message_date', `${iso(afterEnd)}T23:59:59`);
  const chanCounts = new Map<string, { name: string; username: string | null; member_count: number | null; count: number }>();
  for (const m of (topChannelRows || []) as any[]) {
    const ch = m.channel;
    if (!ch) continue;
    const existing = chanCounts.get(ch.id);
    if (existing) existing.count++;
    else chanCounts.set(ch.id, { name: ch.channel_name, username: ch.channel_username, member_count: ch.member_count ?? null, count: 1 });
  }
  const topChannels = Array.from(chanCounts.values()).sort((a, b) => b.count - a.count).slice(0, 8);

  return NextResponse.json({
    project: {
      id: project.id,
      name: project.name,
      category: project.category,
      is_pre_tge: project.is_pre_tge,
      twitter_handle: project.twitter_handle,
      website_url: project.website_url,
      description: project.description,
      client_name: (project as any).client?.name ?? null,
    },
    window_days: windowDays,
    before: beforeStats,
    after: afterStats,
    delta: {
      mindshare_pct_points: afterStats.mindshare_pct - beforeStats.mindshare_pct,
      mentions_change_pct: beforeStats.mentions > 0
        ? ((afterStats.mentions - beforeStats.mentions) / beforeStats.mentions) * 100
        : (afterStats.mentions > 0 ? 100 : 0),
    },
    series,
    top_channels: topChannels,
    generated_at: new Date().toISOString(),
  });
}
