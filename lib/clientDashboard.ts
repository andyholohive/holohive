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

export interface WeekPoint { week: string; reads: number; posts: number; engagements: number; partial: boolean }

export interface ClientDashboardData {
  client: { id: string; name: string; logoUrl: string | null; isActive: boolean };
  campaigns: Array<{ id: string; name: string; status: string | null }>;
  week: CampaignWeekState | null;
  startDate: string | null;
  totals: { reads: number; posts: number; engagements: number; creators: number; byPlatform: Array<{ platform: string; posts: number; reads: number }> } | null;
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
  placement: {
    windowDays: number;
    category: string | null;
    mentions: number;
    sharePct: number;
    sharePrevPct: number | null;
    rank: number;
    of: number;
    categoryRank: number | null;
    categoryOf: number | null;
    /** The category table, or the client's neighbours in the overall table when it has no category. */
    peers: Array<{ name: string; mentions: number; sharePct: number; rank: number; isClient: boolean }>;
    peersLabel: string;
    krVenues: string[];
  } | null;
  /** Money out on this client's campaigns. Admin roles only — the route strips it for members. */
  spend: { total: number; kol: number; byCategory: Array<{ category: string; amount: number }>; payments: number } | null;
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
    sb.from('client_stints').select('start_date, end_date').eq('client_id', clientId),
    sb.from('client_coverage').select('covered_through').eq('client_id', clientId).maybeSingle(),
  ]);
  const camps = ((campaigns ?? []) as any[]).filter((c) => !c.is_test);
  const campIds = camps.map((c) => c.id as string);

  // Week N of M — same anchors as the client card (earliest stint start; covered-through, else latest stint end).
  const starts = ((stints ?? []) as any[]).map((s) => s.start_date).filter(Boolean).sort();
  const ends = ((stints ?? []) as any[]).map((s) => s.end_date).filter(Boolean).sort();
  const startDate: string | null = starts[0] ?? null;
  const termEnd: string | null = coverage?.covered_through ?? ends[ends.length - 1] ?? null;
  const week = getCampaignWeekState(startDate, termEnd);

  // ── Delivery: every live post across the client's campaigns ──────────
  const contents = campIds.length
    ? await inChunks(campIds, 50, async (ids) => {
        const rows: any[] = [];
        for (let from = 0; ; from += 1000) {
          const { data, error } = await sb.from('contents')
            .select('id, activation_date, platform, impressions, likes, retweets, comments, bookmarks, campaign_kols(master_kols(name))')
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
    totals = {
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
  const placementTask = (async (): Promise<ClientDashboardData['placement']> => {
  // ── Placement: share of all tracked Korean Telegram mentions ──────────
  // Shares, not raw counts: crawl coverage varies (09/07–10/01 was thin),
  // and a share of the same corpus stays comparable across that.
  const WINDOW = 30;
  const [{ data: projects }, { data: krc }] = await Promise.all([
    sb.from('mindshare_projects').select('id, name, category, client_id').eq('is_active', true),
    sb.from('kr_signal_clients').select('kr_venues').or(`client_id.eq.${clientId},content_log_source.eq.hhp:${clientId}`).limit(1).maybeSingle(),
  ]);
  const projs = (projects ?? []) as any[];
  const me = projs.find((p) => p.client_id === clientId);
  if (!me) return null;
  const since = new Date(Date.now() - 2 * WINDOW * DAY).toISOString().slice(0, 10);
  const cut = new Date(Date.now() - WINDOW * DAY).toISOString().slice(0, 10);
  const days: any[] = [];
  for (let from = 0; ; from += 1000) {
    const { data } = await sb.from('mindshare_daily').select('project_id, day, mention_count').gte('day', since).range(from, from + 999);
    days.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  const now = new Map<string, number>(), before = new Map<string, number>();
  for (const d of days) {
    const m = d.day > cut ? now : before;
    m.set(d.project_id, (m.get(d.project_id) ?? 0) + (d.mention_count ?? 0));
  }
  const sum = (m: Map<string, number>) => [...m.values()].reduce((a, b) => a + b, 0);
  const totalNow = sum(now), totalBefore = sum(before);
  if (!totalNow) return null;
  const table = projs.map((p) => ({ id: p.id, name: p.name, category: p.category, mentions: now.get(p.id) ?? 0 }))
    .sort((a, b) => b.mentions - a.mentions);
  const rankOf = (rows: typeof table, id: string) => {
    const v = rows.find((r) => r.id === id)!.mentions;
    return rows.filter((r) => r.mentions > v).length + 1; // ties share a rank
  };
  const share = (n: number, of: number) => +((n / of) * 100).toFixed(1);
  const cat = me.category ? table.filter((r) => r.category === me.category) : null;
  let peerRows: typeof table;
  if (cat && cat.length > 1) peerRows = cat.slice(0, 8);
  else {
    const i = table.findIndex((r) => r.id === me.id);
    peerRows = table.slice(Math.max(0, i - 3), Math.max(0, i - 3) + 7);
  }
  if (!peerRows.some((r) => r.id === me.id)) peerRows = [...peerRows.slice(0, 7), table.find((r) => r.id === me.id)!];
  return {
    windowDays: WINDOW,
    category: me.category ?? null,
    mentions: now.get(me.id) ?? 0,
    sharePct: share(now.get(me.id) ?? 0, totalNow),
    sharePrevPct: totalBefore ? share(before.get(me.id) ?? 0, totalBefore) : null,
    rank: rankOf(table, me.id),
    of: table.length,
    categoryRank: cat && cat.length > 1 ? rankOf(cat, me.id) : null,
    categoryOf: cat && cat.length > 1 ? cat.length : null,
    peers: peerRows.map((r) => ({ name: r.name, mentions: r.mentions, sharePct: share(r.mentions, totalNow), rank: rankOf(table, r.id), isClient: r.id === me.id })),
    peersLabel: cat && cat.length > 1 ? `${me.category} projects` : 'Nearest in the overall table',
    krVenues: (krc?.kr_venues ?? []) as string[],
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
  // The sections above are independent; run them together.
  const [sentiment, market, buzz, lineup, placement, spend] = await Promise.all([sentimentTask, marketTask, buzzTask, lineupTask, placementTask, spendTask]);
  return {
    client: { id: client.id, name: client.name, logoUrl: client.logo_url ?? null, isActive: !!client.is_active },
    campaigns: camps.map((c) => ({ id: c.id, name: c.name, status: c.status ?? null })),
    week, startDate,
    totals, weekly, creators, sentiment, market, buzz, lineup, placement, spend,
  };
}
