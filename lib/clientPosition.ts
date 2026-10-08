/**
 * Where a client sits in Korean Telegram, and how it got there — the data
 * behind the client dashboard's placement table, position map, rank race and
 * channel map.
 *
 * Everything is measured as SHARE of all mentions across Korea Signal's
 * tracked projects, never raw counts: crawl coverage varies (09/07–10/01 was
 * thin), and a share of the same corpus stays comparable across that. Weeks
 * whose total corpus is under half the typical week are flagged
 * `lowCoverage` so the charts can mark them rather than hide them.
 *
 * Placement ranks on the last 4 complete weeks. The map and race use a
 * 2-week rolling share (one noisy week can't throw a dot across the map) and
 * momentum = log2 change of that share against 2 weeks earlier, clamped to
 * ±2 (a quarter to four times).
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export interface Placement {
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
}

export interface PositionSeries {
  /** Mondays, oldest first. Complete weeks only. */
  weeks: string[];
  lowCoverage: boolean[];
  peersLabel: string;
  projects: Array<{
    id: string; name: string; isClient: boolean;
    /** Rolling 2-week share of all tracked mentions, in percent. */
    share: Array<number | null>;
    /** log2 of share vs 2 weeks earlier, clamped to ±2. */
    momentum: Array<number | null>;
    mentions: number[];
  }>;
}

export interface ChannelNode {
  id: string; name: string; members: number | null; hired: boolean;
  /** Telegram handle, for an "open the channel" link. */
  username: string | null;
  /** The roster KOL who runs this channel (master_kols.telegram_channel), if any. */
  kolId: string | null; kolName: string | null;
  /** That KOL is already on one of this client's live campaigns. */
  onCampaign: boolean;
  /** Mentions of the client / of its peers in this channel, last 28 days. */
  client: number; peers: number;
}

const DAY = 86_400_000;
const WEEKS = 12;
/** Placement's window: the last 4 complete weeks. */
const ROLL = 4;
/** The map/race window: 2-week rolling share, momentum vs 2 weeks earlier.
 *  Shorter than placement's because most projects' tracked history only
 *  starts late July — a 4+4 window left the map empty for 8 of 12 weeks. */
const SERIES = 2;

function mondayOf(iso: string): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}
const thisMondayKst = () => mondayOf(new Date(Date.now() + 9 * 3_600_000).toISOString());
const addWeeks = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 7 * DAY).toISOString().slice(0, 10);
const round = (n: number, p = 2) => +n.toFixed(p);

export async function loadPosition(db: SupabaseClient, clientId: string, campaignIds: string[] = []): Promise<{
  placement: Placement | null; position: PositionSeries | null; channels: ChannelNode[] | null;
}> {
  const sb = db as any;
  const none = { placement: null, position: null, channels: null };
  const [{ data: projects }, { data: krc }] = await Promise.all([
    sb.from('mindshare_projects').select('id, name, category, client_id').eq('is_active', true),
    sb.from('kr_signal_clients').select('kr_venues').or(`client_id.eq.${clientId},content_log_source.eq.hhp:${clientId}`).limit(1).maybeSingle(),
  ]);
  const projs = (projects ?? []) as any[];
  const me = projs.find((p) => p.client_id === clientId);
  if (!me) return none;

  // Weeks: the 12 shown, plus 7 before them so the first shown week has a
  // full rolling window and a momentum baseline.
  const thisWeek = thisMondayKst();
  const all = Array.from({ length: WEEKS + 2 * ROLL - 1 }, (_, i) => addWeeks(thisWeek, i - (WEEKS + 2 * ROLL - 1)));
  const { data: rows, error } = await sb.rpc('mindshare_weekly', { since: all[0] });
  if (error) throw new Error(`mindshare_weekly failed: ${error.message}`);
  const active = new Set(projs.map((p) => p.id as string));
  const idx = new Map(all.map((w, i) => [w, i]));
  const m = new Map<string, number[]>();
  const total = all.map(() => 0);
  for (const r of (rows ?? []) as any[]) {
    const i = idx.get(r.week);
    if (i === undefined || !active.has(r.project_id)) continue;
    const arr = m.get(r.project_id) ?? all.map(() => 0);
    arr[i] += Number(r.mentions); m.set(r.project_id, arr);
    total[i] += Number(r.mentions);
  }
  const last = all.length - 1;
  if (!total.slice(last - ROLL + 1).some((t) => t > 0)) return none;

  const sumRange = (a: number[], end: number, win = ROLL) => (end - win + 1 < 0 ? null : a.slice(end - win + 1, end + 1).reduce((x, y) => x + y, 0));
  // Before a project's first tracked mention it wasn't being counted yet —
  // that's "no data", not 0%, or every new project would rocket in from zero.
  const firstIdx = new Map([...m.entries()].map(([id, a]) => [id, a.findIndex((v) => v > 0)]));
  const share = (id: string, end: number, win = ROLL): number | null => {
    const f = firstIdx.get(id) ?? -1;
    if (f === -1 || end - win + 1 < f) return null;
    const t = sumRange(total, end, win);
    const v = sumRange(m.get(id) ?? all.map(() => 0), end, win);
    return t && v !== null ? (v / t) * 100 : null;
  };
  const momentum = (id: string, end: number): number | null => {
    const now = share(id, end, SERIES), before = share(id, end - SERIES, SERIES);
    if (now === null || before === null) return null;
    // Percentage points added to both sides: damps tiny projects (0.05% → 0.2% is noise, not ×4 growth).
    const eps = 0.15;
    return Math.max(-2, Math.min(2, Math.log2((now + eps) / (before + eps))));
  };

  // ── Placement: the last 4 complete weeks, ranked ────────────────────
  const recent = (id: string) => sumRange(m.get(id) ?? all.map(() => 0), last) ?? 0;
  const table = projs.map((p) => ({ id: p.id as string, name: p.name as string, category: p.category as string | null, mentions: recent(p.id) }))
    .sort((a, b) => b.mentions - a.mentions);
  const rankOf = (rowsIn: typeof table, id: string) => {
    const v = rowsIn.find((r) => r.id === id)!.mentions;
    return rowsIn.filter((r) => r.mentions > v).length + 1; // ties share a rank
  };
  const cat = me.category ? table.filter((r) => r.category === me.category) : null;
  const useCat = !!cat && cat.length > 1;
  let peerRows: typeof table;
  if (useCat) peerRows = cat!.slice(0, 8);
  else {
    const i = table.findIndex((r) => r.id === me.id);
    peerRows = table.slice(Math.max(0, i - 3), Math.max(0, i - 3) + 7);
  }
  if (!peerRows.some((r) => r.id === me.id)) peerRows = [...peerRows.slice(0, 7), table.find((r) => r.id === me.id)!];
  const peersLabel = useCat ? `${me.category} projects` : 'Nearest in the overall table';
  const nowShare = share(me.id, last) ?? 0;
  const prevShare = share(me.id, last - ROLL);
  const placement: Placement = {
    windowDays: ROLL * 7,
    category: me.category ?? null,
    mentions: recent(me.id),
    sharePct: round(nowShare, 1),
    sharePrevPct: prevShare === null ? null : round(prevShare, 1),
    rank: rankOf(table, me.id),
    of: table.length,
    categoryRank: useCat ? rankOf(cat!, me.id) : null,
    categoryOf: useCat ? cat!.length : null,
    peers: peerRows.map((r) => ({ name: r.name, mentions: r.mentions, sharePct: round(share(r.id, last) ?? 0, 1), rank: rankOf(table, r.id), isClient: r.id === me.id })),
    peersLabel,
    krVenues: (krc?.kr_venues ?? []) as string[],
  };

  // ── Position series: the same peers, 12 weeks ───────────────────────
  const shown = all.slice(-WEEKS);
  const offset = all.length - WEEKS;
  // "Typical" ignores the near-empty weeks before the crawl reached full
  // coverage (late July), or they drag the bar low enough to pass September.
  const peak = Math.max(...total);
  const real = total.filter((t) => t >= peak * 0.1).sort((a, b) => a - b);
  const typical = real.length ? real[real.length >> 1] : 0;
  const position: PositionSeries = {
    weeks: shown,
    lowCoverage: shown.map((_, i) => total[offset + i] < typical * 0.5),
    peersLabel,
    projects: peerRows.map((r) => ({
      id: r.id, name: r.name, isClient: r.id === me.id,
      share: shown.map((_, i) => { const v = share(r.id, offset + i, SERIES); return v === null ? null : round(v); }),
      momentum: shown.map((_, i) => { const v = momentum(r.id, offset + i); return v === null ? null : round(v); }),
      mentions: shown.map((_, i) => (m.get(r.id) ?? [])[offset + i] ?? 0),
    })),
  };

  // Start the player at the first week the client is on the map — earlier
  // frames would be empty (not yet tracked), which reads as a broken chart.
  const meSeries = position.projects.find((p) => p.isClient)!;
  const first = Math.min(meSeries.momentum.findIndex((v) => v !== null), position.weeks.length - 2);
  if (first > 0) {
    position.weeks = position.weeks.slice(first);
    position.lowCoverage = position.lowCoverage.slice(first);
    for (const p of position.projects) { p.share = p.share.slice(first); p.momentum = p.momentum.slice(first); p.mentions = p.mentions.slice(first); }
  }

  // ── Channel map: who talks about the client vs its peers ────────────
  const peerIds = peerRows.map((r) => r.id).filter((id) => id !== me.id);
  const since = new Date(Date.now() - 28 * DAY).toISOString();
  const mentions: any[] = [];
  for (let from = 0; from < 10_000; from += 1000) {
    const { data } = await sb.from('tg_mentions').select('channel_id, project_id')
      .in('project_id', [me.id, ...peerIds]).gte('message_date', since).range(from, from + 999);
    mentions.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  const byCh = new Map<string, { client: number; peers: number }>();
  for (const x of mentions) {
    if (!x.channel_id) continue;
    const v = byCh.get(x.channel_id) ?? { client: 0, peers: 0 };
    if (x.project_id === me.id) v.client++; else v.peers++;
    byCh.set(x.channel_id, v);
  }
  let channels: ChannelNode[] | null = null;
  if (byCh.size) {
    // Every channel that mentioned the client, then the busiest peer-only ones — 48 nodes at most.
    const ranked = [...byCh.entries()].sort((a, b) => (b[1].client - a[1].client) || (b[1].peers - a[1].peers)).slice(0, 48);
    const { data: chRows } = await sb.from('tg_monitored_channels').select('id, channel_name, channel_username, member_count, is_hired').in('id', ranked.map(([id]) => id));
    const info = new Map(((chRows ?? []) as any[]).map((c) => [c.id, c]));
    // Which channels a roster KOL runs, and which of those KOLs are already
    // on this client's campaigns — so "Reach next" can offer the right action.
    const handles = ((chRows ?? []) as any[]).map((c) => c.channel_username).filter(Boolean) as string[];
    const norm = (h: string | null | undefined) => (h ?? '').trim().replace(/^@/, '').replace(/^https?:\/\/t\.me\//i, '').toLowerCase();
    const [{ data: kols }, { data: onCamp }] = await Promise.all([
      handles.length ? sb.from('master_kols').select('id, name, telegram_channel').not('telegram_channel', 'is', null).is('archived_at', null) : Promise.resolve({ data: [] }),
      campaignIds.length ? sb.from('campaign_kols').select('master_kol_id').in('campaign_id', campaignIds).is('deleted_at', null) : Promise.resolve({ data: [] }),
    ]);
    const byHandle = new Map(((kols ?? []) as any[]).map((k) => [norm(k.telegram_channel), k]));
    const booked = new Set(((onCamp ?? []) as any[]).map((r) => r.master_kol_id));
    channels = ranked.map(([id, v]) => {
      const c = info.get(id);
      const kol = c?.channel_username ? byHandle.get(norm(c.channel_username)) : undefined;
      return {
        id, name: c?.channel_name ?? 'Unknown channel', username: c?.channel_username ?? null,
        members: c?.member_count ?? null, hired: !!c?.is_hired,
        kolId: kol?.id ?? null, kolName: kol?.name ?? null, onCampaign: !!kol && booked.has(kol.id),
        ...v,
      };
    });
  }

  return { placement, position, channels };
}
