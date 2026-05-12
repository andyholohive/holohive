import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

/**
 * GET /api/mindshare/projects/[id]/detail?range=24h|7d|30d
 *
 * Drives the drill-down dialog opened from a leaderboard row or treemap
 * cell click. Returns:
 *   - project metadata (name, keywords, links)
 *   - daily series for the requested range (drives the chart)
 *   - top channels by mention count in the window
 *   - up to 25 most recent matching messages with their matched keyword
 *
 * Auth: any signed-in user.
 */
export async function GET(request: Request, { params }: { params: { id: string } }) {
  const cookieStore = cookies();
  const sb = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get(n: string) { return cookieStore.get(n)?.value; }, set() {}, remove() {} } }
  );
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = params;
  const url = new URL(request.url);
  const range = (url.searchParams.get('range') || '7d') as '24h' | '7d' | '30d';
  const days = range === '24h' ? 1 : range === '7d' ? 7 : 30;

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // Date math — match the leaderboard endpoint's window definition.
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const minusDays = (d: Date, n: number) => { const o = new Date(d); o.setUTCDate(o.getUTCDate() - n); return o; };
  const fromDate = fmt(minusDays(today, days - 1));
  const toDate = fmt(today);
  const fromIso = `${fromDate}T00:00:00`;
  const toIso = `${toDate}T23:59:59`;

  // Pull project + recent mentions + daily series in parallel
  const [{ data: project }, { data: dailyRows }, { data: mentions }] = await Promise.all([
    (supabase as any)
      .from('mindshare_projects')
      .select('id, name, client_id, tracked_keywords, category, is_pre_tge, twitter_handle, website_url, description, client:clients(id, name)')
      .eq('id', id)
      .single(),
    (supabase as any)
      .from('mindshare_daily')
      .select('day, mention_count, channel_reach')
      .eq('project_id', id)
      .gte('day', fromDate)
      .lte('day', toDate)
      .order('day', { ascending: true }),
    (supabase as any)
      .from('tg_mentions')
      .select('id, message_text, message_date, matched_keyword, channel:tg_monitored_channels(id, channel_name, channel_username)')
      .eq('project_id', id)
      .gte('message_date', fromIso)
      .lte('message_date', toIso)
      .order('message_date', { ascending: false })
      .limit(25),
  ]);

  if (!project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  // Derive top channels from the same mention pool (broader query so
  // we don't get a biased top-channel list from only the recent 25).
  const { data: allMentions } = await (supabase as any)
    .from('tg_mentions')
    .select('channel:tg_monitored_channels(id, channel_name, channel_username)')
    .eq('project_id', id)
    .gte('message_date', fromIso)
    .lte('message_date', toIso);

  const channelCounts = new Map<string, { name: string; username: string | null; count: number }>();
  for (const m of (allMentions || []) as any[]) {
    const ch = m.channel;
    if (!ch) continue;
    const key = ch.id;
    const existing = channelCounts.get(key);
    if (existing) existing.count++;
    else channelCounts.set(key, { name: ch.channel_name, username: ch.channel_username, count: 1 });
  }
  const topChannels = Array.from(channelCounts.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  // Fill missing days in the daily series with zeroes so the chart
  // doesn't look spiky from gaps.
  const series: Array<{ day: string; mentions: number; channels: number }> = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = fmt(minusDays(today, i));
    const row = (dailyRows || []).find((r: any) => r.day === d);
    series.push({
      day: d,
      mentions: row?.mention_count ?? 0,
      channels: row?.channel_reach ?? 0,
    });
  }

  return NextResponse.json({
    project,
    range,
    period: { from: fromDate, to: toDate },
    series,
    top_channels: topChannels,
    sample_mentions: mentions || [],
    total_mentions_in_window: series.reduce((s, d) => s + d.mentions, 0),
  });
}
