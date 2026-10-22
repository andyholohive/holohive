/**
 * Client dashboard data — everything /clients/[id] shows, for one client.
 *
 * Server-side (service role): the Korea market tables have no read policy,
 * so this runs behind /api/clients/[id]/dashboard. Every section degrades to
 * "no data" on its own — a client with no Korea Signal setup still gets its
 * delivery numbers, and a failed read shows as missing, never as zero.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { getCampaignWeekState, type CampaignWeekState } from '@/lib/campaignWeekHelpers';
import { loadPosition, type Placement, type PositionSeries, type ChannelNode } from '@/lib/clientPosition';

export interface WeekPoint { week: string; reads: number; posts: number; engagements: number; partial: boolean }

export interface ClientDashboardData {
  client: { id: string; name: string; logoUrl: string | null; isActive: boolean };
  campaigns: Array<{ id: string; name: string; status: string | null }>;
  week: CampaignWeekState | null;
  startDate: string | null;
  /** Resign grace: still active through this date after the term ended. Null when none / passed. */
  graceUntil: string | null;
  totals: { reads: number; posts: number; engagements: number; creators: number; byPlatform: Array<{ platform: string; posts: number; reads: number }>; web2: { posts: number; reads: number; creators: number } } | null;
  weekly: WeekPoint[];
  creators: Array<{ name: string; posts: number; reads: number; best: number; engagements: number }>;
  sentiment: { counted: number; filtered: number; byLabel: Array<{ label: string; count: number }>; quotes: Array<{ ko: string; en: string; label: string }> } | null;
  market: { weeks: Array<{ weekEnding: string; sharePct: number; volUsd: number }> } | null;
  buzz: { weeks: Array<{ week: string; mentions: number; channels: number }> } | null;
  lineup: {
    weekNumber: number; weekOf: string; status: string; campaignName: string;
    angles: Array<{ name: string; slots: Array<{ kol: string; status: string }> }>;
    previous: { weekNumber: number; angles: Array<{ name: string; slots: Array<{ kol: string; status: string }> }> } | null;
  } | null;
  /** Where the client sits among every project Korea Signal tracks in Korean Telegram. */
  placement: Placement | null;
  /** 12 weeks of rolling share + momentum for the client and its peers (position map, rank race). */
  position: PositionSeries | null;
  /** Korean channels mentioning the client vs its peers, last 28 days. Team-only. */
  channels: ChannelNode[] | null;
  /** The engagement on one line: kickoff to term end, and what happened along the way. */
  journey: {
    start: string | null; end: string | null; today: string; firstPost: string | null;
    lineups: Array<{ weekOf: string; weekNumber: number; status: string; posted: number; total: number }>;
    bestWeek: { week: string; reads: number } | null;
    topPost: { kol: string; platform: string; reads: number; url: string | null; date: string } | null;
    listings: Array<{ date: string; venues: string[] }>;
  };
  /** Money out on this client's campaigns. Admin roles only — the route strips it for members. */
  spend: { total: number; kol: number; byCategory: Array<{ category: string; amount: number }>; payments: number } | null;
  /**
   * This client against the roster: medians across active clients with 10+
   * posts, and where this client ranks (1 = best). Cost fields are admin-only
   * — the route nulls them for members, same as `spend`.
   */
  benchmarks: {
    clients: number;
    readsPerPost: { median: number; rank: number | null };
    engRate: { median: number; rank: number | null };
    cpm: { median: number; rank: number | null } | null;
  } | null;
}

const DAY = 86_400_000;

/** Monday (YYYY-MM-DD) of the week holding an ISO date, by calendar date. */
function mondayOf(iso: string): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

/** Today's Monday in Korea time, the team's working week. */
function thisMondayKst(): string {
  return mondayOf(new Date(Date.now() + 9 * 3_600_000).toISOString());
}

async function inChunks<T>(ids: string[], size: number, fn: (chunk: string[]) => Promise<T[]>): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += size) out.push(...(await fn(ids.slice(i, i + size))));
  return out;
}

export async function loadClientDashboard(db: SupabaseClient, clientId: string): Promise<ClientDashboardData | null> {
  const sb = db as any;
  const { data: client } = await sb.from('clients').select('id, name, logo_url, is_active').eq('id', clientId).maybeSingle();
  if (!client) return null;

  const [{ data: campaigns }, { data: stints }, { data: coverage }] = await Promise.all([
    sb.from('campaigns').select('id, name, status, start_date, is_test').eq('client_id', clientId).is('archived_at', null),
    sb.from('client_stints').select('start_date, end_date, grace_until').eq('client_id', clientId),
    sb.from('client_coverage').select('covered_through').eq('client_id', clientId).maybeSingle(),
  ]);
  const camps = ((campaigns ?? []) as any[]).filter((c) => !c.is_test);
  const campIds = camps.map((c) => c.id as string);

  // Week N of M — same anchors as the client card (earliest stint start; covered-through, else latest stint end).
  const starts = ((stints ?? []) as any[]).map((s) => s.start_date).filter(Boolean).sort();
  const ends = ((stints ?? []) as any[]).map((s) => s.end_date).filter(Boolean).sort();
  const startDate: string | null = starts[0] ?? null;
  const termEnd: string | null = coverage?.covered_through ?? ends[ends.length - 1] ?? null;
  const todayKst = new Date(Date.now() + 9 * 3_600_000).toISOString().slice(0, 10);
  const graceUntil: string | null = ((stints ?? []) as any[]).map((s) => s.grace_until).filter((g) => g && g >= todayKst).sort().pop() ?? null;
  const week = getCampaignWeekState(startDate, termEnd);

  // ── Delivery: every live post across the client's campaigns ──────────
  const contents = campIds.length
    ? await inChunks(campIds, 50, async (ids) => {
        const rows: any[] = [];
        for (let from = 0; ; from += 1000) {
          const { data, error } = await sb.from('contents')
            .select('id, activation_date, platform, content_link, impressions, likes, retweets, comments, bookmarks, campaign_kols(master_kols(name, kol_category))')
            .in('campaign_id', ids).not('activation_date', 'is', null).range(from, from + 999);
          if (error) throw new Error(`contents read failed: ${error.message}`);
          rows.push(...(data ?? []));
          if (!data || data.length < 1000) break;
        }
        return rows;
      })
    : [];
  const eng = (c: any) => (c.likes ?? 0) + (c.retweets ?? 0) + (c.comments ?? 0) + (c.bookmarks ?? 0);

  let totals: ClientDashboardData['totals'] = null;
  const weekly: WeekPoint[] = [];
  const creators: ClientDashboardData['creators'] = [];
  if (contents.length) {
    const byPlatform = new Map<string, { posts: number; reads: number }>();
    const byKol = new Map<string, { posts: number; reads: number; best: number; engagements: number }>();
    const byWeek = new Map<string, { reads: number; posts: number; engagements: number }>();
    for (const c of contents) {
      const reads = c.impressions ?? 0;
      const p = byPlatform.get(c.platform ?? 'Other') ?? { posts: 0, reads: 0 };
      p.posts++; p.reads += reads; byPlatform.set(c.platform ?? 'Other', p);
      const name = c.campaign_kols?.master_kols?.name ?? 'Unknown';
      const k = byKol.get(name) ?? { posts: 0, reads: 0, best: 0, engagements: 0 };
      k.posts++; k.reads += reads; k.best = Math.max(k.best, reads); k.engagements += eng(c); byKol.set(name, k);
      const w = mondayOf(c.activation_date);
      const ww = byWeek.get(w) ?? { reads: 0, posts: 0, engagements: 0 };
      ww.reads += reads; ww.posts++; ww.engagements += eng(c); byWeek.set(w, ww);
    }
    const web2 = contents.filter((c: any) => c.campaign_kols?.master_kols?.kol_category === 'Web2');
    totals = {
      web2: { posts: web2.length, reads: web2.reduce((n: number, c: any) => n + (c.impressions ?? 0), 0), creators: new Set(web2.map((c: any) => c.campaign_kols?.master_kols?.name)).size },
      reads: contents.reduce((n: number, c: any) => n + (c.impressions ?? 0), 0),
      posts: contents.length,
      engagements: contents.reduce((n: number, c: any) => n + eng(c), 0),
      creators: byKol.size,
      byPlatform: [...byPlatform.entries()].map(([platform, v]) => ({ platform, ...v })).sort((a, b) => b.posts - a.posts),
    };
    // Continuous weeks from the first post to this week, empty weeks as zero.
    const first = [...byWeek.keys()].sort()[0];
    const thisWeek = thisMondayKst();
    for (let t = Date.parse(`${first}T00:00:00Z`); t <= Date.parse(`${thisWeek}T00:00:00Z`); t += 7 * DAY) {
      const key = new Date(t).toISOString().slice(0, 10);
      const v = byWeek.get(key) ?? { reads: 0, posts: 0, engagements: 0 };
      weekly.push({ week: key, ...v, partial: key === thisWeek });
    }
    creators.push(...[...byKol.entries()].map(([name, v]) => ({ name, ...v })).sort((a, b) => b.reads - a.reads).slice(0, 8));
  }

  const sentimentTask = (async (): Promise<ClientDashboardData['sentiment']> => {
  // ── Community: comments under the client's posts ──────────────────────
  let sentiment: ClientDashboardData['sentiment'] = null;
  const contentIds = contents.map((c: any) => c.id as string);
  if (contentIds.length) {
    const comments = await inChunks(contentIds, 150, async (ids) => {
      const { data } = await sb.from('post_comments').select('sentiment_label, text, en_gloss, reaction_total').in('content_id', ids).limit(5000);
      return (data ?? []) as any[];
    });
    if (comments.length) {
      const NOISE = new Set(['noise', null, undefined, '']);
      const counted = comments.filter((c) => !NOISE.has(c.sentiment_label));
      const tally = new Map<string, number>();
      for (const c of counted) tally.set(c.sentiment_label, (tally.get(c.sentiment_label) ?? 0) + 1);
      const order = ['question', 'positive', 'hype', 'negative', 'fud'];
      const rank = (l: string) => (order.includes(l) ? order.indexOf(l) : order.length);
      sentiment = {
        counted: counted.length,
        filtered: comments.length - counted.length,
        byLabel: [...tally.entries()].map(([label, count]) => ({ label, count }))
          .sort((a, b) => rank(a.label) - rank(b.label) || b.count - a.count),
        quotes: counted
          .filter((c) => c.en_gloss && ['positive', 'hype', 'question'].includes(c.sentiment_label) && (c.text ?? '').length > 20)
          .sort((a, b) => (b.reaction_total ?? 0) - (a.reaction_total ?? 0))
          // The same comment can arrive twice (a forwarded post in two channels).
          .filter((c, i, all) => all.findIndex((x) => x.text === c.text) === i)
          .slice(0, 3)
          .map((c) => ({ ko: (c.text as string).slice(0, 160), en: (c.en_gloss as string).slice(0, 200), label: c.sentiment_label })),
      };
    }
  }

    return sentiment;
  })();
  const marketTask = (async (): Promise<ClientDashboardData['market']> => {
  // ── Korea market: Korean exchanges' share of the token's trading ──────
  let market: ClientDashboardData['market'] = null;
  const { data: krc } = await sb.from('kr_signal_clients').select('id')
    .or(`client_id.eq.${clientId},content_log_source.eq.hhp:${clientId}`).limit(1).maybeSingle();
  if (krc) {
    const { data: wk } = await sb.from('kr_signal_client_weekly').select('week_ending, kr_token_vol_usd, kr_vol_share')
      .eq('client_id', krc.id).order('week_ending', { ascending: true });
    const weeks = ((wk ?? []) as any[]).filter((w) => w.kr_vol_share != null)
      .map((w) => ({ weekEnding: w.week_ending, sharePct: +(Number(w.kr_vol_share) * 100).toFixed(1), volUsd: Number(w.kr_token_vol_usd) || 0 }))
      .slice(-12);
    if (weeks.length) market = { weeks };
  }

    return market;
  })();
  const buzzTask = (async (): Promise<ClientDashboardData['buzz']> => {
  // ── Korean Telegram buzz: Korea Signal's mention counts ───────────────
  let buzz: ClientDashboardData['buzz'] = null;
  const { data: mp } = await sb.from('mindshare_projects').select('id').eq('client_id', clientId).limit(1).maybeSingle();
  if (mp) {
    const since = new Date(Date.now() - 10 * 7 * DAY).toISOString().slice(0, 10);
    const { data: days } = await sb.from('mindshare_daily').select('day, mention_count, channel_reach').eq('project_id', mp.id).gte('day', since);
    const m = new Map<string, { mentions: number; channels: number }>();
    for (const d of (days ?? []) as any[]) {
      const w = mondayOf(d.day);
      const v = m.get(w) ?? { mentions: 0, channels: 0 };
      v.mentions += d.mention_count ?? 0; v.channels = Math.max(v.channels, d.channel_reach ?? 0); m.set(w, v);
    }
    const thisWeek = thisMondayKst();
    const weeks = [...m.entries()].filter(([w]) => w < thisWeek).sort(([a], [b]) => a.localeCompare(b)).map(([week, v]) => ({ week, ...v }));
    if (weeks.length) buzz = { weeks };
  }

    return buzz;
  })();
  const lineupTask = (async (): Promise<ClientDashboardData['lineup']> => {
  // ── This week's lineup, and how last week went ────────────────────────
  let lineup: ClientDashboardData['lineup'] = null;
  if (campIds.length) {
    const thisWeek = thisMondayKst();
    const { data: lus } = await sb.from('campaign_lineups')
      .select('id, campaign_id, week_number, week_of, status, lineup_angles(angle_name, sort_order, lineup_slots(sort_order, status, master_kols(name)))')
      .in('campaign_id', campIds).lte('week_of', thisWeek).order('week_of', { ascending: false }).limit(4);
    const shape = (l: any) => ((l.lineup_angles ?? []) as any[]).sort((a, b) => a.sort_order - b.sort_order).map((a) => ({
      name: a.angle_name,
      slots: ((a.lineup_slots ?? []) as any[]).sort((x, y) => x.sort_order - y.sort_order).map((s) => ({ kol: s.master_kols?.name ?? 'Unknown', status: s.status })),
    }));
    const current = ((lus ?? []) as any[]).find((l) => l.week_of === thisWeek);
    const prev = ((lus ?? []) as any[]).find((l) => l.week_of < thisWeek);
    if (current || prev) {
      lineup = {
        // No lineup set for this week yet: call it the week after the last one.
        weekNumber: current ? current.week_number : prev.week_number + 1,
        weekOf: thisWeek,
        status: current?.status ?? 'none',
        campaignName: camps.find((c) => c.id === (current ?? prev).campaign_id)?.name ?? '',
        angles: current ? shape(current) : [],
        previous: prev ? { weekNumber: prev.week_number, angles: shape(prev) } : null,
      };
    }
  }

    return lineup;
  })();
  const positionTask = loadPosition(db, clientId, campIds);
  const journeyTask = (async (): Promise<ClientDashboardData['journey']> => {
  // ── Journey: every lineup week, the best week, the top post, KR listings ──
  const today = new Date(Date.now() + 9 * 3_600_000).toISOString().slice(0, 10);
  const [{ data: lus }, { data: krc }] = await Promise.all([
    campIds.length
      ? sb.from('campaign_lineups').select('week_number, week_of, status, lineup_angles(lineup_slots(status))').in('campaign_id', campIds).order('week_of')
      : Promise.resolve({ data: [] }),
    sb.from('kr_signal_clients').select('coingecko_id').or(`client_id.eq.${clientId},content_log_source.eq.hhp:${clientId}`).limit(1).maybeSingle(),
  ]);
  const { data: lst } = krc?.coingecko_id
    ? await sb.from('kr_signal_listings').select('listed_on, venues').eq('coingecko_id', krc.coingecko_id).order('listed_on')
    : { data: [] };
  const done = weekly.filter((w) => !w.partial);
  const best = done.reduce<WeekPoint | null>((b, w) => (!b || w.reads > b.reads ? w : b), null);
  const top = contents.reduce<any>((b: any, c: any) => (!b || (c.impressions ?? 0) > (b.impressions ?? 0) ? c : b), null);
  const dates = contents.map((c: any) => c.activation_date as string).sort();
  return {
    start: startDate, end: termEnd, today, firstPost: dates[0] ?? null,
    lineups: ((lus ?? []) as any[]).map((l) => {
      const slots = ((l.lineup_angles ?? []) as any[]).flatMap((a) => (a.lineup_slots ?? []) as any[]);
      return { weekOf: l.week_of, weekNumber: l.week_number, status: l.status, posted: slots.filter((x) => x.status === 'posted').length, total: slots.length };
    }),
    bestWeek: best && best.reads > 0 ? { week: best.week, reads: best.reads } : null,
    topPost: top && top.impressions ? {
      kol: top.campaign_kols?.master_kols?.name ?? 'Unknown', platform: top.platform ?? '', reads: top.impressions,
      url: top.content_link ?? null, date: top.activation_date,
    } : null,
    listings: ((lst ?? []) as any[]).map((x) => ({ date: x.listed_on, venues: x.venues ?? [] })),
  };
  })();
  const spendTask = (async (): Promise<ClientDashboardData['spend']> => {
  if (!campIds.length) return null;
  const { data: pays } = await sb.from('payments').select('amount, payment_category').in('campaign_id', campIds);
  const rows = (pays ?? []) as any[];
  if (!rows.length) return null;
  const by = new Map<string, number>();
  for (const r of rows) by.set(r.payment_category ?? 'other', (by.get(r.payment_category ?? 'other') ?? 0) + Number(r.amount ?? 0));
  return {
    total: rows.reduce((n, r) => n + Number(r.amount ?? 0), 0),
    kol: by.get('kol') ?? 0,
    byCategory: [...by.entries()].map(([category, amount]) => ({ category, amount })).sort((a, b) => b.amount - a.amount),
    payments: rows.length,
  };
  })();
  const benchTask = (async (): Promise<ClientDashboardData['benchmarks']> => {
  const { data, error } = await sb.rpc('client_benchmarks');
  if (error || !data) return null;
  // Under 10 posts a client is still ramping; its ratios would skew the medians.
  const rows = (data as any[]).filter((r) => Number(r.posts) >= 10 && Number(r.reads) > 0).map((r) => ({
    id: r.client_id as string,
    rpp: Number(r.reads) / Number(r.posts),
    er: (Number(r.engagements) / Number(r.reads)) * 100,
    cpm: r.kol_spend ? (Number(r.kol_spend) / Number(r.reads)) * 1000 : null,
  }));
  if (rows.length < 3) return null;
  const median = (v: number[]) => { const a = [...v].sort((x, y) => x - y); const m = a.length >> 1; return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2; };
  const me = rows.find((r) => r.id === clientId);
  const rank = (v: number | null | undefined, all: number[], lowIsBest = false) =>
    v == null ? null : all.filter((x) => (lowIsBest ? x < v : x > v)).length + 1;
  const cpms = rows.map((r) => r.cpm).filter((x): x is number => x !== null);
  return {
    clients: rows.length,
    readsPerPost: { median: median(rows.map((r) => r.rpp)), rank: rank(me?.rpp, rows.map((r) => r.rpp)) },
    engRate: { median: median(rows.map((r) => r.er)), rank: rank(me?.er, rows.map((r) => r.er)) },
    cpm: cpms.length >= 3 ? { median: median(cpms), rank: rank(me?.cpm, cpms, true) } : null,
  };
  })();
  // The sections above are independent; run them together.
  const [sentiment, market, buzz, lineup, { placement, position, channels }, spend, benchmarks, journey] = await Promise.all([sentimentTask, marketTask, buzzTask, lineupTask, positionTask, spendTask, benchTask, journeyTask]);
  return {
    client: { id: client.id, name: client.name, logoUrl: client.logo_url ?? null, isActive: !!client.is_active },
    campaigns: camps.map((c) => ({ id: c.id, name: c.name, status: c.status ?? null })),
    week, startDate, graceUntil,
    totals, weekly, creators, sentiment, market, buzz, lineup, placement, position, channels, journey, spend, benchmarks,
  };
}
