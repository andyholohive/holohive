/**
 * Korea Scan — every number on the scan, from matched posts.
 *
 * Pure: give it posts already matched to the subject and to each peer, and
 * the window. No database, no clock (the window end is passed in), so the
 * same input always gives the same scan and it can be tested offline.
 *
 * Method follows Yano's RISE scan (15 Sep 2026):
 *  - reader-views are Telegram view counts as recorded at harvest;
 *  - paid share counts only disclosed markers (a ceiling on disclosed spend);
 *  - field movement compares the last 8 weeks with each project's own 92-day
 *    pace, quality-weighted (scaled down, and labelled, on a shorter corpus);
 *  - partial weeks are flagged so a chart never reads them as a collapse.
 */

import { COVERAGE_TYPES, COVERAGE_WEIGHT, classifyPost, isPaid, isReferral, type CoverageType } from './classify';

export interface ScanPost {
  id: string;
  channel: string;
  channelTitle: string | null;
  messageId: number | null;
  postedAt: string;
  text: string;
  views: number | null;
  hashtags: string[] | null;
}

export interface ScanInput {
  subject: { name: string; posts: ScanPost[] };
  peers: Array<{ name: string; posts: ScanPost[] }>;
  /** What the peers are, in words ("perp DEXs"). */
  field: string;
  /** Last day covered (ISO). Usually the corpus's newest post, never "today" if the corpus is behind. */
  windowEnd: string;
  windowDays: number;
  /** First day the corpus has steady volume. The window never starts before it. */
  coverageStart: string | null;
  /** asOf: when the scan was run, so staleness is measured against today. */
  corpus: { trackedChannels: number; lastPostAt: string | null; asOf: string };
  method: { aliases: string[]; exclude: string[] };
  /** Channels Holo Hive has worked with (tg_monitored_channels.is_hired). Handles compared case-insensitively. */
  network?: Array<{ handle: string; title: string | null }>;
}

type Mix = Record<CoverageType, number>;

export interface KoreaScan {
  subject: string;
  field: string;
  window: { start: string; end: string; days: number; weeks: number };
  /** Spans behind each comparison, in days, so every graphic can state its window. */
  periods: { compare: number; movementLong: number; movementShort: number };
  corpus: { trackedChannels: number; lastPostAt: string | null; staleDays: number | null };
  method: { aliases: string[]; exclude: string[]; peers: string[] };
  headline: { posts: number; channels: number; views: number; last4: number; prev4: number; changePct: number | null; fieldChangePct: number | null };
  paid: { tagged: Bucket; untagged: Bucket; share: number | null };
  depth: Array<{ name: string; posts: number; channels: number; views: number; perChannel: number; isSubject: boolean }>;
  mix: {
    subject: { shares: Mix; score: number; posts: number };
    field: { shares: Mix; score: number; posts: number; projects: number };
  };
  reach: {
    weeks: Array<{ start: string; posts: number; views: number; perMention: number | null; partial: boolean }>;
    best: { name: string; perMention: number } | null;
    worst: { name: string; perMention: number } | null;
  };
  momentum: Array<{ start: string; posts: number; channelsToDate: number; partial: boolean }>;
  movement: {
    rows: Array<{ name: string; weighted92: number; last8w: number; pace: number | null; projected90: number; isSubject: boolean }>;
    fieldPace: number | null;
    gaining: number;
  };
  rank: { now: number | null; fourWeeksAgo: number | null; of: number };
  room: { channels: number; subjectChannels: number; neverNamed: number };
  referral: { recent21: number | null; recent21Posts: number; whole: number | null };
  receipts: Array<{ channel: string; channelTitle: string | null; url: string | null; date: string; views: number | null; text: string; type: CoverageType }>;
  /**
   * Holo Hive's network against this field: channels we've worked with that
   * write about the field, how many already named the subject, and the ones
   * that haven't, with their typical readers per post. `open` carries channel
   * names: internal only, stripped before a scan is shared (see redactForShare).
   */
  /**
   * Share of the field's Korean coverage, quality-weighted (Yano's "same
   * method as page 4"): each name's weighted posts over the whole field's.
   */
  share: {
    rows: Array<{ name: string; weighted: number; raw: number; isSubject: boolean }>;
    subjectRank: number | null;
    weekly: Array<{ start: string; weighted: number; partial: boolean }>;
  };
  /** Channels that named the subject, most-read first. `ours` is internal (stripped on share). */
  channels: Array<{ handle: string; title: string | null; posts: number; views: number; avgViews: number; ours: boolean }>;
  network: {
    inField: number;
    named: number;
    openCount: number;
    /** Sum of each open channel's average readers per post on this field. */
    openReaders: number;
    open: Array<{ handle: string; title: string | null; fieldPosts: number; avgViews: number }>;
  } | null;
}

interface Bucket { posts: number; channels: number; views: number }

const DAY = 86_400_000;
const KST = 9 * 3_600_000;

/** Monday 00:00 KST of the week containing `t`, as an ISO date (YYYY-MM-DD). */
export function weekStart(t: number) {
  const k = new Date(t + KST);
  const dow = (k.getUTCDay() + 6) % 7; // Monday = 0
  const monday = Date.UTC(k.getUTCFullYear(), k.getUTCMonth(), k.getUTCDate() - dow);
  return new Date(monday).toISOString().slice(0, 10);
}

const ts = (p: ScanPost) => Date.parse(p.postedAt);
const views = (ps: ScanPost[]) => ps.reduce((n, p) => n + (p.views ?? 0), 0);
const channels = (ps: ScanPost[]) => new Set(ps.map((p) => p.channel)).size;
const within = (ps: ScanPost[], from: number, to: number) => ps.filter((p) => ts(p) > from && ts(p) <= to);
const pct = (a: number, b: number) => (b > 0 ? Math.round(((a - b) / b) * 100) : null);
const weight = (ps: ScanPost[]) => ps.reduce((n, p) => n + COVERAGE_WEIGHT[classifyPost(p.text)], 0);

function mixOf(ps: ScanPost[]) {
  const counts = Object.fromEntries(COVERAGE_TYPES.map((t) => [t, 0])) as Mix;
  for (const p of ps) counts[classifyPost(p.text)] += 1;
  const n = ps.length || 1;
  const shares = Object.fromEntries(COVERAGE_TYPES.map((t) => [t, Math.round((counts[t] / n) * 100)])) as Mix;
  return { shares, score: +(weight(ps) / n).toFixed(2), posts: ps.length };
}

export function computeKoreaScan(input: ScanInput): KoreaScan {
  const end = Date.parse(input.windowEnd);
  // Never measure a span the corpus doesn't cover: a quiet start would read as growth.
  const start = Math.max(end - input.windowDays * DAY, input.coverageStart ? Date.parse(input.coverageStart) : -Infinity);
  const days = Math.round((end - start) / DAY);
  const weeksCovered = Math.floor(days / 7);
  // Last N weeks against the N before; N is 4 when the corpus allows, else half of what it has.
  const compare = 7 * Math.min(4, Math.max(1, Math.floor(weeksCovered / 2)));
  // Yano's movement read: last 8 weeks against a 92-day pace. On a shorter corpus, the
  // same shape — the latest ~60% of the span against the whole of it.
  const movementLong = Math.min(92, days);
  const movementShort = movementLong >= 92 ? 56 : Math.max(7, 7 * Math.floor((movementLong * 0.6) / 7));
  const subj = within(input.subject.posts, start, end);
  const peers = input.peers.map((p) => ({ name: p.name, posts: within(p.posts, start, end) }));
  const all = [{ name: input.subject.name, posts: subj, isSubject: true }, ...peers.map((p) => ({ ...p, isSubject: false }))];

  // Headline: last 4 weeks against the 4 before, for the subject and the field.
  const last4 = within(subj, end - compare * DAY, end).length;
  const prev4 = within(subj, end - 2 * compare * DAY, end - compare * DAY).length;
  const fieldLast4 = peers.reduce((n, p) => n + within(p.posts, end - compare * DAY, end).length, 0);
  const fieldPrev4 = peers.reduce((n, p) => n + within(p.posts, end - 2 * compare * DAY, end - compare * DAY).length, 0);

  // Paid markers.
  const tagged = subj.filter((p) => isPaid(p.text, p.hashtags));
  const untagged = subj.filter((p) => !isPaid(p.text, p.hashtags));
  const bucket = (ps: ScanPost[]): Bucket => ({ posts: ps.length, channels: channels(ps), views: views(ps) });

  // Depth: readers per channel, same window for every name.
  const depth = all
    .filter((r) => r.posts.length > 0)
    .map((r) => ({ name: r.name, posts: r.posts.length, channels: channels(r.posts), views: views(r.posts), perChannel: Math.round(views(r.posts) / Math.max(channels(r.posts), 1)), isSubject: r.isSubject }))
    .sort((a, b) => b.perChannel - a.perChannel);

  // Coverage mix: subject vs the pooled field.
  const fieldPosts = peers.flatMap((p) => p.posts);
  const mix = {
    subject: mixOf(subj),
    field: { ...mixOf(fieldPosts), projects: peers.filter((p) => p.posts.length > 0).length },
  };

  // Weekly series, up to 18 weeks, oldest first. The week holding the window end is partial
  // unless the window ends on a Sunday night.
  const lastWeek = weekStart(end);
  const weekKeys: string[] = [];
  for (let w = Date.parse(lastWeek); weekKeys.length < 18 && w > start; w -= 7 * DAY) weekKeys.unshift(new Date(w).toISOString().slice(0, 10));
  // Monday 00:00 KST is Date.parse(lastWeek) − 9h; the week is whole only if the window reaches Sunday night.
  const partialLast = end < Date.parse(lastWeek) - KST + 7 * DAY - 60_000;
  const byWeek = (ps: ScanPost[]) => {
    const m = new Map<string, ScanPost[]>();
    for (const p of ps) { const k = weekStart(ts(p)); m.set(k, [...(m.get(k) ?? []), p]); }
    return m;
  };
  const sw = byWeek(subj);
  const reachWeeks = weekKeys.map((k, i) => {
    const ps = sw.get(k) ?? [];
    const v = views(ps);
    return { start: k, posts: ps.length, views: v, perMention: ps.length ? Math.round(v / ps.length) : null, partial: partialLast && i === weekKeys.length - 1 };
  });
  const perMention = all
    .filter((r) => r.posts.length >= 10 && !r.isSubject)
    .map((r) => ({ name: r.name, perMention: Math.round(views(r.posts) / r.posts.length) }))
    .sort((a, b) => b.perMention - a.perMention);

  // Momentum: mentions per week with the running count of distinct channels.
  const seen = new Set<string>();
  for (const p of subj) if (weekStart(ts(p)) < weekKeys[0]) seen.add(p.channel);
  const momentum = weekKeys.map((k, i) => {
    const ps = sw.get(k) ?? [];
    ps.forEach((p) => seen.add(p.channel));
    return { start: k, posts: ps.length, channelsToDate: seen.size, partial: partialLast && i === weekKeys.length - 1 };
  });

  // Movement: last 8 weeks against each project's own 92-day pace, quality-weighted.
  const movementRows = all.map((r) => {
    const w92 = weight(within(r.posts, end - movementLong * DAY, end));
    const w8 = weight(within(r.posts, end - movementShort * DAY, end));
    const pace = w92 > 0 ? Math.round(((w8 / movementShort) / (w92 / movementLong) - 1) * 100) : null;
    return { name: r.name, weighted92: Math.round(w92), last8w: Math.round(w8), pace, projected90: Math.round((w8 / movementShort) * 90), isSubject: r.isSubject };
  }).filter((r) => r.weighted92 > 0).sort((a, b) => (b.pace ?? -999) - (a.pace ?? -999));
  const f92 = movementRows.filter((r) => !r.isSubject).reduce((n, r) => n + r.weighted92, 0);
  const f8 = movementRows.filter((r) => !r.isSubject).reduce((n, r) => n + r.last8w, 0);

  // Rank on raw mentions, now and four weeks ago (each over a 4-week span).
  const rankAt = (to: number) => {
    const counts = all.map((r) => ({ s: r.isSubject, n: within(r.posts, to - compare * DAY, to).length })).filter((r) => r.n > 0).sort((a, b) => b.n - a.n);
    const i = counts.findIndex((c) => c.s);
    return i >= 0 ? i + 1 : null;
  };

  // The room: channels writing about anyone in the field, and how many named the subject.
  const roomChannels = new Set(all.flatMap((r) => r.posts.map((p) => p.channel)));
  const subjChannels = new Set(subj.map((p) => p.channel));

  // Referral codes: recent 21 days vs whole window.
  const recent = within(subj, end - 21 * DAY, end);
  const refShare = (ps: ScanPost[]) => (ps.length ? Math.round((ps.filter((p) => isReferral(p.text)).length / ps.length) * 100) : null);

  // Receipts: most-read posts, one per channel.
  const usedCh = new Set<string>();
  const receipts = [...subj].sort((a, b) => (b.views ?? 0) - (a.views ?? 0)).filter((p) => (usedCh.has(p.channel) ? false : (usedCh.add(p.channel), true))).slice(0, 3)
    .map((p) => ({
      channel: p.channel, channelTitle: p.channelTitle,
      url: p.messageId != null && /^[A-Za-z0-9_]{4,}$/.test(p.channel) ? `https://t.me/${p.channel}/${p.messageId}` : null,
      date: p.postedAt, views: p.views, text: excerpt(p.text), type: classifyPost(p.text),
    }));

  const staleDays = input.corpus.lastPostAt ? Math.floor((Date.parse(input.corpus.asOf) - Date.parse(input.corpus.lastPostAt)) / DAY) : null;

  // Our network: which of our channels write about the field, and which never named the subject.
  let network: KoreaScan['network'] = null;
  if (input.network?.length) {
    const ours = new Map(input.network.map((c) => [c.handle.toLowerCase(), c.title]));
    const byCh = new Map<string, ScanPost[]>();
    for (const r of all) for (const p of r.posts) {
      const k = p.channel.toLowerCase();
      if (ours.has(k)) byCh.set(k, [...(byCh.get(k) ?? []), p]);
    }
    const namedSet = new Set(subj.map((p) => p.channel.toLowerCase()));
    const open = [...byCh.entries()].filter(([k]) => !namedSet.has(k)).map(([k, ps]) => ({
      handle: ps[0].channel, title: ours.get(k) ?? ps[0].channelTitle, fieldPosts: ps.length,
      avgViews: Math.round(views(ps) / Math.max(ps.filter((p) => p.views != null).length, 1)),
    })).sort((a, b) => b.avgViews - a.avgViews);
    network = {
      inField: byCh.size, named: [...byCh.keys()].filter((k) => namedSet.has(k)).length,
      openCount: open.length, openReaders: open.reduce((n, c) => n + c.avgViews, 0), open,
    };
  }

  // Share of the conversation, quality-weighted, whole window and week by week.
  const wAll = all.map((r) => ({ name: r.name, isSubject: r.isSubject, w: weight(r.posts), n: r.posts.length }));
  const wTotal = wAll.reduce((n, r) => n + r.w, 0);
  const nTotal = wAll.reduce((n, r) => n + r.n, 0);
  const shareRows = wAll.filter((r) => r.n > 0)
    .map((r) => ({ name: r.name, weighted: wTotal ? +((r.w / wTotal) * 100).toFixed(1) : 0, raw: nTotal ? +((r.n / nTotal) * 100).toFixed(1) : 0, isSubject: r.isSubject }))
    .sort((a, b) => b.weighted - a.weighted);
  const fieldByWeek = byWeek(all.flatMap((r) => r.posts));
  const shareWeekly = weekKeys.map((k, i) => {
    const tot = weight(fieldByWeek.get(k) ?? []);
    return { start: k, weighted: tot ? +((weight(sw.get(k) ?? []) / tot) * 100).toFixed(1) : 0, partial: partialLast && i === weekKeys.length - 1 };
  });

  // Channels that named the subject.
  const ourSet = new Set((input.network ?? []).map((c) => c.handle.toLowerCase()));
  const byChannel = new Map<string, ScanPost[]>();
  for (const p of subj) byChannel.set(p.channel, [...(byChannel.get(p.channel) ?? []), p]);
  const channelRows = [...byChannel.entries()].map(([handle, ps]) => ({
    handle, title: ps[0].channelTitle, posts: ps.length, views: views(ps),
    avgViews: Math.round(views(ps) / Math.max(ps.filter((p) => p.views != null).length, 1)),
    ours: ourSet.has(handle.toLowerCase()),
  })).sort((a, b) => b.views - a.views);

  return {
    subject: input.subject.name,
    field: input.field,
    window: { start: new Date(start).toISOString(), end: new Date(end).toISOString(), days, weeks: weeksCovered },
    periods: { compare, movementLong, movementShort },
    corpus: { trackedChannels: input.corpus.trackedChannels, lastPostAt: input.corpus.lastPostAt, staleDays },
    method: { ...input.method, peers: input.peers.map((p) => p.name) },
    headline: { posts: subj.length, channels: channels(subj), views: views(subj), last4, prev4, changePct: pct(last4, prev4), fieldChangePct: pct(fieldLast4, fieldPrev4) },
    paid: { tagged: bucket(tagged), untagged: bucket(untagged), share: subj.length ? Math.round((tagged.length / subj.length) * 100) : null },
    depth,
    mix,
    reach: { weeks: reachWeeks, best: perMention[0] ?? null, worst: perMention.length > 1 ? perMention[perMention.length - 1] : null },
    momentum,
    movement: { rows: movementRows, fieldPace: f92 > 0 ? Math.round(((f8 / movementShort) / (f92 / movementLong) - 1) * 100) : null, gaining: movementRows.filter((r) => !r.isSubject && (r.pace ?? 0) > 0).length },
    rank: { now: rankAt(end), fourWeeksAgo: days >= 2 * compare ? rankAt(end - compare * DAY) : null, of: all.filter((r) => r.posts.length > 0).length },
    room: { channels: roomChannels.size, subjectChannels: subjChannels.size, neverNamed: roomChannels.size - subjChannels.size },
    referral: { recent21: refShare(recent), recent21Posts: recent.length, whole: refShare(subj) },
    receipts,
    share: { rows: shareRows, subjectRank: shareRows.findIndex((r) => r.isSubject) + 1 || null, weekly: shareWeekly },
    channels: channelRows,
    network,
  };
}

/** A scan safe to send outside Holo Hive: our network's channel names, and which channels are ours, removed. */
export function redactForShare(s: KoreaScan): KoreaScan {
  return {
    ...s,
    network: s.network ? { ...s.network, open: [] } : null,
    // Which channels are ours is internal too.
    channels: (s.channels ?? []).map((c) => ({ ...c, ours: false })),
  };
}

/** First 220 characters on one line, cut at a word. */
function excerpt(t: string) {
  const one = (t ?? '').replace(/\s+/g, ' ').trim();
  if (one.length <= 220) return one;
  const cut = one.slice(0, 220);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), 160))} …`;
}
