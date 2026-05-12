import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

/**
 * GET /api/mindshare/leaderboard?range=24h|7d|30d
 *
 * Returns the Korean mindshare leaderboard for the requested time
 * range. Each row: project info, mention count in window, mindshare %
 * (project mentions / total mentions in window), Δ vs prior window of
 * the same length, and a 14-day daily mention sparkline.
 *
 * Auth: any signed-in user.
 *
 * Math is kept in SQL/JS rather than precomputed because:
 *   - Time-range slicing varies by user request
 *   - Total volume per scan is small (≤1000 daily rows × ≤365 days)
 *   - Avoids stale-cache bugs
 */
export async function GET(request: Request) {
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
  // Language filter — 'all' uses the precomputed mindshare_daily (fast).
  // Specific languages recompute from tg_mentions joined with the channel
  // table on the fly. Slower but accurate for whatever channel scope.
  const language = (url.searchParams.get('language') || 'all').toLowerCase();

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // Define windows. "Current" is the last `days` days; "prior" is the
  // matching window immediately before that for the Δ comparison.
  // 14-day sparkline is independent — fixed window for visual context.
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const minusDays = (d: Date, n: number) => { const out = new Date(d); out.setUTCDate(out.getUTCDate() - n); return out; };

  const currentStart = fmt(minusDays(today, days - 1));
  const currentEnd = fmt(today);
  const priorStart = fmt(minusDays(today, days * 2 - 1));
  const priorEnd = fmt(minusDays(today, days));
  const sparkStart = fmt(minusDays(today, 13));

  // Pull all daily rows touching either window or the sparkline range.
  // Earliest of the three boundaries decides the lower bound.
  const lowerBound = sparkStart < priorStart ? sparkStart : priorStart;

  // For 'all' language: read the precomputed daily aggregate (fast path).
  // For a specific language: recompute from tg_mentions joined to
  // tg_monitored_channels, filtered to that language. Slower but accurate
  // — channel volume is small (≤ a few hundred channels typically).
  const [dailyRowsResp, projectsResp] = await Promise.all([
    language === 'all'
      ? (supabase as any)
          .from('mindshare_daily')
          .select('project_id, day, mention_count, channel_reach')
          .gte('day', lowerBound)
          .lte('day', currentEnd)
          .order('day', { ascending: true })
      : (supabase as any)
          .from('tg_mentions')
          .select('project_id, message_date, channel_id, channel:tg_monitored_channels!inner(language)')
          .gte('message_date', lowerBound + 'T00:00:00')
          .lte('message_date', currentEnd + 'T23:59:59')
          .not('project_id', 'is', null)
          .eq('channel.language', language),
    (supabase as any)
      .from('mindshare_projects')
      .select('id, name, client_id, category, is_pre_tge, twitter_handle, website_url, is_active')
      .eq('is_active', true),
  ]);

  // Reshape per-mention rows into the same daily-row shape so the rest
  // of the function works uniformly.
  let dailyRows: any[] = [];
  if (language === 'all') {
    dailyRows = (dailyRowsResp.data || []) as any[];
  } else {
    const dailyMap = new Map<string, { mentions: number; channels: Set<string> }>();
    for (const m of (dailyRowsResp.data || []) as any[]) {
      const day = (m.message_date as string).slice(0, 10);
      const key = `${m.project_id}::${day}`;
      let bucket = dailyMap.get(key);
      if (!bucket) { bucket = { mentions: 0, channels: new Set() }; dailyMap.set(key, bucket); }
      bucket.mentions++;
      if (m.channel_id) bucket.channels.add(m.channel_id);
    }
    dailyRows = Array.from(dailyMap.entries()).map(([k, v]) => {
      const [project_id, day] = k.split('::');
      return { project_id, day, mention_count: v.mentions, channel_reach: v.channels.size };
    });
  }
  const projects = projectsResp.data;

  type DailyRow = { project_id: string; day: string; mention_count: number; channel_reach: number };
  type Project  = { id: string; name: string; client_id: string | null; category: string | null; is_pre_tge: boolean; twitter_handle: string | null; website_url: string | null };

  // Bucket daily rows per project for fast slicing
  const rowsByProject = new Map<string, DailyRow[]>();
  for (const r of (dailyRows || []) as DailyRow[]) {
    let arr = rowsByProject.get(r.project_id);
    if (!arr) { arr = []; rowsByProject.set(r.project_id, arr); }
    arr.push(r);
  }

  // Sum helper bounded by inclusive day range
  const sumInRange = (rows: DailyRow[], from: string, to: string) =>
    rows.filter(r => r.day >= from && r.day <= to).reduce((s, r) => s + (r.mention_count || 0), 0);

  // Compute totals across all projects to derive mindshare %
  let currentTotal = 0, priorTotal = 0;
  const projectStats = ((projects || []) as Project[]).map(p => {
    const rows = rowsByProject.get(p.id) || [];
    const current = sumInRange(rows, currentStart, currentEnd);
    const prior   = sumInRange(rows, priorStart, priorEnd);
    currentTotal += current;
    priorTotal   += prior;

    // Build a 14-day spark series (most recent day last). Missing days
    // become 0 — frontend renders a dot at zero for visual continuity.
    const spark: number[] = [];
    for (let i = 13; i >= 0; i--) {
      const d = fmt(minusDays(today, i));
      const row = rows.find(r => r.day === d);
      spark.push(row?.mention_count || 0);
    }
    const channels = sumInRange(rows.map(r => ({ ...r, mention_count: r.channel_reach })), currentStart, currentEnd);

    return { project: p, current, prior, spark, channels };
  });

  // Final shape — mindshare % computed against the period total
  const items = projectStats.map(s => {
    const mindsharePct = currentTotal > 0 ? (s.current / currentTotal) * 100 : 0;
    const priorMindsharePct = priorTotal > 0 ? (s.prior / priorTotal) * 100 : 0;
    const deltaPct = mindsharePct - priorMindsharePct;
    // Mention-count change relative to the prior window (used for "↑ 22%" kind of badges)
    const mentionDeltaPct = s.prior > 0 ? ((s.current - s.prior) / s.prior) * 100 : (s.current > 0 ? 100 : 0);
    return {
      project_id: s.project.id,
      name: s.project.name,
      client_id: s.project.client_id,
      category: s.project.category,
      is_pre_tge: s.project.is_pre_tge,
      twitter_handle: s.project.twitter_handle,
      website_url: s.project.website_url,
      mention_count: s.current,
      channel_reach: s.channels,
      mindshare_pct: mindsharePct,
      delta_pct: deltaPct,
      mention_delta_pct: mentionDeltaPct,
      spark: s.spark,
    };
  })
  // Sort descending by mention count by default; UI can re-sort
  .sort((a, b) => b.mention_count - a.mention_count);

  return NextResponse.json({
    range,
    period: { from: currentStart, to: currentEnd },
    prior_period: { from: priorStart, to: priorEnd },
    spark_period: { from: sparkStart, to: currentEnd },
    total_mentions: currentTotal,
    items,
  });
}
