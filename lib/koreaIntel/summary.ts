/**
 * Korea intelligence summary — one read model behind the client portal's
 * Korea section and the weekly Korea email [Andy 2026-10-01].
 *
 * Three layers read from this:
 *   1. the weekly email — verdict, three numbers, one quote, one action
 *   2. the top of the portal Korea section — same verdict + trend + market
 *   3. the portal detail tabs — exchanges, listings, comments, peers, news,
 *      creators
 *
 * Everything is computed from data HHP already stores (KR Signal weekly rows,
 * weekly market snapshots, Korean listings, scored post comments, KOL channel
 * snapshots). Nothing is invented: a section with no data comes back empty and
 * the UI says so, rather than showing a placeholder number.
 *
 * Server-only — callers pass a service-role client after the portal gate (or
 * an admin role check) has authorized the request.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchKoreaNews, type KoreaNewsItem } from './news';

export type VerdictStatus = 'heating' | 'cooling' | 'steady' | 'first' | 'unlisted';

export interface KoreaSummary {
  client: { id: string; name: string; ticker: string; listed: boolean };
  week: { start: string; end: string; label: string } | null;
  verdict: { status: VerdictStatus; label: string; headline: string; sub: string | null };
  action: { text: string; why: string; kind: 'guide' | 'concern' | 'listing' | 'restart' | 'explainer' };
  stats: {
    share: { value: number; prev: number | null } | null;
    volume: { usd: number; window: string | null; paceRatio: number | null } | null;
    posts: { newThisWeek: number | null; total: number | null };
  };
  shareHistory: Array<{ week: string; share: number; volumeUsd: number; partial: boolean }>;
  market: {
    latest: { week: string; kospi: number; kospiPct: number | null; kimchiPct: number; kimchiPrev: number | null; krCexUsd: number; krCexPct: number | null; fx: number } | null;
    series: Array<{ week: string; kospi: number; kimchiPct: number; krCexUsd: number }>;
  };
  venues: Array<{ name: string; usd: number; pct: number; isKR: boolean }>;
  listings: Array<{ ticker: string; venue: string; listedOn: string; day1Usd: number | null }>;
  comments: {
    total: number; korean: number; substantive: number; noise: number; latest: string | null;
    split: Array<{ key: string; label: string; count: number }>;
    themes: Array<{ theme: string; count: number }>;
    quotes: Array<{ ko: string; en: string | null; label: string; theme: string | null; date: string | null }>;
    /** The quote the email leads with: one that backs up the week's action
     *  (a how-to-join question when the action is the guide), not just the
     *  most-reacted comment. */
    featured: { ko: string; en: string | null; label: string; theme: string | null; date: string | null } | null;
    /** Most common theme among negative/FUD comments only. */
    topConcern: string | null;
  };
  peers: { enabled: boolean; basket: string[]; rows: Array<{ name: string; share: number; isClient: boolean }> };
  news: KoreaNewsItem[];
  creators: { channels: number; followers: number; tiers: Array<{ tier: string; channels: number; followers: number; avgViews: number }> };
  readiness: Array<{ label: string; detail: string; ok: boolean; value: string }> | null;
}

const LABEL: Record<string, string> = {
  question: 'Questions', positive: 'Positive', hype: 'Excited', negative: 'Negative', fud: 'FUD',
};
const SPLIT_ORDER = ['question', 'positive', 'hype', 'negative', 'fud'];

export async function buildKoreaSummary(admin: SupabaseClient, clientId: string): Promise<KoreaSummary | null> {
  const db = admin as any;

  // The KR Signal config row is the client's Korea identity (ticker, venues,
  // peers). Linked by client_id; content_log_source is the older link.
  const { data: kc } = await db.from('kr_signal_clients')
    .select('id, name, ticker, kr_listed, global_venues, peer_basket, features, client_id, content_log_source')
    .or(`client_id.eq.${clientId},content_log_source.eq.hhp:${clientId}`)
    .limit(1).maybeSingle();
  if (!kc) return null;

  const [weeksRes, snapsRes, listRes, campRes] = await Promise.all([
    db.from('kr_signal_client_weekly')
      .select('week_ending, kr_vol_share, kr_token_vol_usd, kr_token_vol_window, by_venue, sov_pieces_cum, report_html, edited_html, peer_shares')
      .eq('client_id', kc.id).order('week_ending', { ascending: true }).limit(26),
    db.from('kr_signal_weekly_snapshots')
      .select('week_ending, kospi, kimchi_usdt, kr_cex_vol, fx_usdkrw')
      .order('week_ending', { ascending: true }).limit(26),
    db.from('kr_signal_listings')
      .select('ticker, venues, listed_on, day1_kr_vol')
      .not('day1_kr_vol', 'is', null).order('listed_on', { ascending: false }).limit(8),
    db.from('campaigns').select('id').eq('client_id', clientId),
  ]);

  const weeks: any[] = weeksRes.data ?? [];
  const snaps: any[] = snapsRes.data ?? [];
  const campaignIds: string[] = (campRes.data ?? []).map((c: any) => c.id);
  const ticker = `$${kc.ticker}`;
  const listed = !!kc.kr_listed;

  const cur = weeks.at(-1) ?? null;
  const prev = weeks.length > 1 ? weeks.at(-2) : null;
  const snap = snaps.at(-1) ?? null;
  const snapPrev = snaps.length > 1 ? snaps.at(-2) : null;
  const fx = Number(snap?.fx_usdkrw) || 1354;

  // ── week + stats ──────────────────────────────────────────────
  const week = cur ? weekRange(cur.week_ending) : null;
  const share = cur && listed ? { value: pct(cur.kr_vol_share), prev: prev ? pct(prev.kr_vol_share) : null } : null;
  // Compare DAILY pace — a 6-day week and a 7-day week must not be read as
  // "+0%" or as a 17% jump. Same rule as the weekly report since 2026-10-01.
  let paceRatio: number | null = null;
  if (cur && prev) {
    const cd = windowDays(cur.kr_token_vol_window), pd = windowDays(prev.kr_token_vol_window);
    const c = Number(cur.kr_token_vol_usd), p = Number(prev.kr_token_vol_usd);
    if (cd && pd && p > 0) paceRatio = (c / cd) / (p / pd);
  }
  const volume = cur && listed ? { usd: Number(cur.kr_token_vol_usd) || 0, window: cur.kr_token_vol_window, paceRatio } : null;
  const total = cur?.sov_pieces_cum ?? null;
  const newPosts = cur?.sov_pieces_cum != null && prev?.sov_pieces_cum != null ? cur.sov_pieces_cum - prev.sov_pieces_cum : null;

  // ── market ───────────────────────────────────────────────────
  const series = snaps.slice(-11).map((s) => ({
    week: s.week_ending, kospi: Math.round(Number(s.kospi)), kimchiPct: round2(Number(s.kimchi_usdt) * 100), krCexUsd: Number(s.kr_cex_vol),
  }));
  const latestMarket = snap ? {
    week: snap.week_ending,
    kospi: Math.round(Number(snap.kospi)),
    kospiPct: snapPrev ? round1(((snap.kospi - snapPrev.kospi) / snapPrev.kospi) * 100) : null,
    kimchiPct: round2(Number(snap.kimchi_usdt) * 100),
    kimchiPrev: snapPrev ? round2(Number(snapPrev.kimchi_usdt) * 100) : null,
    krCexUsd: Number(snap.kr_cex_vol),
    krCexPct: snapPrev ? round1(((snap.kr_cex_vol - snapPrev.kr_cex_vol) / snapPrev.kr_cex_vol) * 100) : null,
    fx: Math.round(fx),
  } : null;

  // ── comments, creators, news (independent reads) ─────────────
  const [comments, creators, news, onboarded] = await Promise.all([
    loadComments(db, campaignIds),
    loadCreators(db),
    fetchKoreaNews(admin, { name: kc.name, ticker: kc.ticker, peers: kc.peer_basket ?? [] }).catch(() => [] as KoreaNewsItem[]),
    listed ? Promise.resolve(0) : countOnboarded(db, campaignIds),
  ]);

  // ── verdict + action ─────────────────────────────────────────
  const retail = cur ? retailRead(cur.edited_html || cur.report_html) : null;
  const verdict = buildVerdict({ listed, ticker, share, paceRatio, marketPct: latestMarket?.krCexPct ?? null, newPosts, retail });
  const action = buildAction({ verdict: verdict.status, comments, listed });
  comments.featured = pickFeatured(comments.pool, action.kind, comments.topConcern);
  const { pool: _pool, ...commentsOut } = comments;

  // ── peers ────────────────────────────────────────────────────
  const peerRows = Array.isArray(cur?.peer_shares) ? cur.peer_shares : [];
  const peers = {
    enabled: !!kc.features?.peer_benchmark,
    basket: (kc.peer_basket ?? []) as string[],
    rows: peerRows.length && share
      ? [...peerRows.map((r: any) => ({ name: r.name, share: pct(r.kr_share), isClient: false })), { name: kc.name, share: share.value, isClient: true }]
          .sort((a, b) => b.share - a.share)
      : [],
  };

  const readiness = listed ? null : [
    { label: 'Korean creator coverage', detail: 'Onboarded creators on your campaigns', ok: onboarded > 0, value: onboarded ? `${onboarded} creators` : 'None yet' },
    { label: 'On a major global exchange', detail: (kc.global_venues ?? []).map(venueName).join(', ') || 'None tracked', ok: (kc.global_venues ?? []).length > 0, value: (kc.global_venues ?? []).length ? 'Yes' : 'Not yet' },
    { label: 'Korean posts growing', detail: 'New Korean posts this week', ok: (newPosts ?? 0) > 0, value: newPosts != null ? `${newPosts} new` : 'No data yet' },
  ];

  return {
    client: { id: clientId, name: kc.name, ticker: kc.ticker, listed },
    week,
    verdict,
    action,
    stats: { share, volume, posts: { newThisWeek: newPosts, total } },
    shareHistory: listed ? weeks.slice(-12).map((w) => ({
      week: w.week_ending, share: pct(w.kr_vol_share), volumeUsd: Number(w.kr_token_vol_usd) || 0,
      partial: w.kr_token_vol_window != null && w.kr_token_vol_window !== '7d',
    })) : [],
    market: { latest: latestMarket, series },
    venues: Array.isArray(cur?.by_venue) ? cur.by_venue.map((v: any) => ({ name: v.name, usd: Number(v.usd) || 0, pct: Number(v.pct) || 0, isKR: !!v.isKR })) : [],
    // day1_kr_vol is stored in KRW; convert at the latest weekly rate.
    listings: (listRes.data ?? []).map((l: any) => ({
      ticker: l.ticker, venue: (l.venues ?? []).map(venueName).join(' + '), listedOn: l.listed_on,
      day1Usd: l.day1_kr_vol != null ? Number(l.day1_kr_vol) / fx : null,
    })),
    comments: commentsOut,
    peers,
    news,
    creators,
    readiness,
  };
}

// ── verdict / action rules ───────────────────────────────────────

function buildVerdict(i: {
  listed: boolean; ticker: string; share: { value: number; prev: number | null } | null;
  paceRatio: number | null; marketPct: number | null; newPosts: number | null; retail: string | null;
}): KoreaSummary['verdict'] {
  if (!i.listed) {
    const tail = i.newPosts && i.newPosts > 0 ? `, but Korean coverage keeps growing: ${i.newPosts} new posts this week.` : '.';
    return { status: 'unlisted', label: 'Not listed in Korea yet', headline: `${i.ticker} isn’t on a Korean exchange yet${tail}`, sub: 'We watch Upbit and Bithumb every hour and will tell you the day it lands.' };
  }
  if (!i.share || i.share.prev == null || i.paceRatio == null) {
    return { status: 'first', label: 'First read', headline: `Korea is ${i.share ? `${i.share.value}%` : 'part'} of ${i.ticker} trading this week.`, sub: 'Week-on-week comparisons start next week.' };
  }
  const shareDelta = i.share.value - i.share.prev;
  const up = i.paceRatio >= 1.2 || shareDelta >= 2;
  const down = i.paceRatio <= 0.8 || shareDelta <= -2;
  const mUp = i.marketPct != null && i.marketPct > 10;
  const mDown = i.marketPct != null && i.marketPct < -10;
  const sub = i.retail ? `Korean retail overall is ${i.retail}.` : null;
  if (up) {
    const h = mDown ? `Koreans traded more ${i.ticker} this week, even though the overall Korean crypto market got quieter.`
      : mUp ? `Koreans traded more ${i.ticker} this week, as the wider Korean crypto market picked up.`
      : `Koreans traded more ${i.ticker} this week.`;
    return { status: 'heating', label: 'Heating up', headline: h, sub };
  }
  if (down) {
    const h = mDown ? `Korean trading in ${i.ticker} slowed this week, in line with a quieter Korean market.`
      : mUp ? `Korean trading in ${i.ticker} slowed this week, even as the wider Korean market picked up.`
      : `Korean trading in ${i.ticker} slowed this week.`;
    return { status: 'cooling', label: 'Cooling', headline: h, sub };
  }
  return { status: 'steady', label: 'Steady', headline: `Korean trading in ${i.ticker} held steady this week.`, sub };
}

const HOW_TO_JOIN = /(join|eligib|entry|enter|access|how|confus|참여|방법|응모)/i;

function buildAction(i: { verdict: VerdictStatus; comments: KoreaSummary['comments']; listed: boolean }): KoreaSummary['action'] {
  const q = i.comments.split.find((s) => s.key === 'question')?.count ?? 0;
  const neg = (i.comments.split.find((s) => s.key === 'negative')?.count ?? 0) + (i.comments.split.find((s) => s.key === 'fud')?.count ?? 0);
  const sub = i.comments.substantive || 1;
  const howTheme = i.comments.themes.find((t) => HOW_TO_JOIN.test(t.theme));
  if (q / sub >= 0.25 && howTheme) {
    return { kind: 'guide', text: 'Post a short Korean guide: how to join, and who’s eligible.', why: 'It’s the most common question in Korean comments. We can brief our creators to share it.' };
  }
  if (neg / sub >= 0.25 && i.comments.topConcern) {
    return { kind: 'concern', text: 'Answer the top concern in a pinned Korean post.', why: `The most common worry in Korean comments is “${i.comments.topConcern}”.` };
  }
  if (!i.listed) return { kind: 'listing', text: 'Keep Korean coverage steady ahead of a listing.', why: 'Exchanges look for an active Korean community before they list.' };
  if (i.verdict === 'cooling') return { kind: 'restart', text: 'Line up a creator push to restart Korean attention.', why: 'Korean trading slowed this week.' };
  return { kind: 'explainer', text: 'Give interested Koreans a clear next step: a pinned Korean explainer.', why: 'Attention is up, so make it easy to act on.' };
}

// ── loaders ──────────────────────────────────────────────────────

async function loadComments(db: any, campaignIds: string[]): Promise<KoreaSummary['comments'] & { pool: any[] }> {
  const empty = { total: 0, korean: 0, substantive: 0, noise: 0, latest: null, split: [], themes: [], quotes: [], featured: null, topConcern: null, pool: [] as any[] };
  if (!campaignIds.length) return empty;
  const { data: contents } = await db.from('contents').select('id').in('campaign_id', campaignIds);
  const ids = (contents ?? []).map((c: any) => c.id);
  if (!ids.length) return empty;
  const { data } = await db.from('post_comments')
    .select('text, en_gloss, lang, sentiment_label, sentiment_theme, reaction_total, sent_at')
    .in('content_id', ids).limit(2000);
  const rows: any[] = data ?? [];
  if (!rows.length) return empty;

  const counts: Record<string, number> = {};
  const themeCounts: Record<string, number> = {};
  const concernCounts: Record<string, number> = {};
  for (const r of rows) {
    counts[r.sentiment_label ?? 'noise'] = (counts[r.sentiment_label ?? 'noise'] ?? 0) + 1;
    if (r.sentiment_label && r.sentiment_label !== 'noise' && r.sentiment_theme) {
      const t = normalizeTheme(r.sentiment_theme);
      themeCounts[t] = (themeCounts[t] ?? 0) + 1;
      if (r.sentiment_label === 'negative' || r.sentiment_label === 'fud') concernCounts[t] = (concernCounts[t] ?? 0) + 1;
    }
  }
  const noise = counts.noise ?? 0;
  const quotes = rows
    .filter((r) => r.lang === 'ko' && r.en_gloss && ['positive', 'question', 'negative', 'fud', 'hype'].includes(r.sentiment_label))
    .sort((a, b) => (b.reaction_total ?? 0) - (a.reaction_total ?? 0) || String(b.sent_at).localeCompare(String(a.sent_at)));
  // Spread quotes across labels so one bucket doesn't fill all four slots.
  const picked: any[] = [];
  for (const lab of ['question', 'positive', 'hype', 'negative', 'fud']) {
    const q = quotes.find((x) => x.sentiment_label === lab && !picked.includes(x));
    if (q) picked.push(q);
    if (picked.length >= 4) break;
  }
  return {
    total: rows.length,
    korean: rows.filter((r) => r.lang === 'ko').length,
    substantive: rows.length - noise,
    noise,
    latest: rows.reduce((m: string | null, r) => (r.sent_at && (!m || r.sent_at > m) ? r.sent_at : m), null),
    split: SPLIT_ORDER.map((k) => ({ key: k, label: LABEL[k], count: counts[k] ?? 0 })).filter((s) => s.count > 0),
    themes: Object.entries(themeCounts).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([theme, count]) => ({ theme, count })),
    quotes: picked.map(toQuote),
    featured: null, // chosen after the action, so it can back the action up
    topConcern: Object.entries(concernCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null,
    pool: quotes,
  };
}

/** The quote the email leads with should be the evidence for the action. */
function pickFeatured(pool: any[], kind: KoreaSummary['action']['kind'], topTheme: string | null) {
  const norm = (t: any) => normalizeTheme(String(t ?? ''));
  let q: any;
  if (kind === 'guide') q = pool.find((r) => r.sentiment_label === 'question' && (HOW_TO_JOIN.test(r.sentiment_theme ?? '') || HOW_TO_JOIN.test(r.en_gloss ?? '')));
  if (kind === 'concern' && topTheme) q = pool.find((r) => ['negative', 'fud'].includes(r.sentiment_label) && norm(r.sentiment_theme) === topTheme)
    ?? pool.find((r) => ['negative', 'fud'].includes(r.sentiment_label));
  q = q ?? pool.find((r) => r.sentiment_label === 'question') ?? pool[0];
  return q ? toQuote(q) : null;
}

function toQuote(r: any) {
  return { ko: String(r.text).slice(0, 220), en: r.en_gloss ?? null, label: LABEL[r.sentiment_label] ?? r.sentiment_label, theme: r.sentiment_theme ?? null, date: r.sent_at ?? null };
}

async function loadCreators(db: any): Promise<KoreaSummary['creators']> {
  const since = new Date(Date.now() - 75 * 86_400_000).toISOString().slice(0, 10);
  const { data } = await db.from('kol_channel_snapshots')
    .select('kol_id, snapshot_date, follower_count, avg_views_per_post')
    .gte('snapshot_date', since).order('snapshot_date', { ascending: false }).limit(3000);
  // Followers from each channel's newest snapshot; views from its newest
  // snapshot that HAS views. The monthly follower snapshot (1st of the month)
  // writes follower_count only — views arrive later from the Telegram scan —
  // so on those days the newest rows have null views. Counting null as 0 made
  // every tier's average collapse (2,602 → 383) on 10/01/2026.
  const latest = new Map<string, any>();
  for (const r of data ?? []) {
    const cur = latest.get(r.kol_id);
    if (!cur) latest.set(r.kol_id, { ...r });
    else if (cur.avg_views_per_post == null && r.avg_views_per_post != null) cur.avg_views_per_post = r.avg_views_per_post;
  }
  const bands = [
    { tier: 'Large · 20K+', min: 20000, max: Infinity },
    { tier: 'Mid · 5–20K', min: 5000, max: 20000 },
    { tier: 'Under 5K', min: 0, max: 5000 },
  ];
  const tiers = bands.map((b) => {
    const rows = [...latest.values()].filter((r) => (r.follower_count ?? 0) >= b.min && (r.follower_count ?? 0) < b.max);
    return {
      tier: b.tier,
      channels: rows.length,
      followers: rows.reduce((s, r) => s + (r.follower_count ?? 0), 0),
      // Average over channels that have a views figure, not over all of them.
      avgViews: (() => { const v = rows.map((r) => r.avg_views_per_post).filter((x) => x != null).map(Number); return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : 0; })(),
    };
  });
  return { channels: latest.size, followers: tiers.reduce((s, t) => s + t.followers, 0), tiers };
}

async function countOnboarded(db: any, campaignIds: string[]): Promise<number> {
  if (!campaignIds.length) return 0;
  const { data } = await db.from('campaign_kols').select('master_kol_id')
    .in('campaign_id', campaignIds).eq('hh_status', 'Onboarded').eq('hidden', false).is('deleted_at', null);
  return new Set((data ?? []).map((r: any) => r.master_kol_id)).size;
}

// ── helpers ──────────────────────────────────────────────────────

/** Themes are free text from the sentiment scorer, so "wants to try" and
 *  "want to try" arrive as separate themes. Fold the obvious variants. */
function normalizeTheme(t: string): string {
  return t.toLowerCase().trim()
    .replace(/\b(wants|wanting)\b/g, 'want')
    .replace(/\b(asks|asking)\b/g, 'ask')
    .replace(/\s+/g, ' ');
}

/** "KR retail neutral or sidelined" in the stored report → "neutral or on the sidelines". */
function retailRead(html: string | null | undefined): string | null {
  if (!html) return null;
  const m = /KR retail ([^\n<]+)/.exec(html.replace(/<[^>]+>/g, ''));
  if (!m) return null;
  return m[1].trim().replace(/\bsidelined\b/, 'on the sidelines');
}

export function windowDays(w: string | null | undefined): number | null {
  if (!w) return null;
  if (w === '24h') return 1;
  const m = /^(\d+)d$/.exec(w);
  return m ? Number(m[1]) : null;
}

/** week_ending is the Sunday the report window starts on; the window runs 7 days. */
function weekRange(startIso: string) {
  const s = new Date(startIso + 'T00:00:00Z');
  const e = new Date(s); e.setUTCDate(e.getUTCDate() + 6);
  const M = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const label = s.getUTCMonth() === e.getUTCMonth()
    ? `${M[s.getUTCMonth()]} ${s.getUTCDate()}–${e.getUTCDate()}`
    : `${M[s.getUTCMonth()]} ${s.getUTCDate()} – ${M[e.getUTCMonth()]} ${e.getUTCDate()}`;
  return { start: startIso, end: e.toISOString().slice(0, 10), label };
}

function venueName(v: string) {
  const map: Record<string, string> = { upbit: 'Upbit', bithumb: 'Bithumb', coinbase: 'Coinbase', bybit: 'Bybit', kraken: 'Kraken', bitget: 'Bitget', gate: 'Gate' };
  return map[v] ?? v;
}
const pct = (x: any) => round1(Number(x) * 100);
const round1 = (x: number) => Math.round(x * 10) / 10;
const round2 = (x: number) => Math.round(x * 100) / 100;
