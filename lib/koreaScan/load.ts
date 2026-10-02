/**
 * Korea Scan — server loader. Reads the Korean Telegram corpus
 * (tg_channel_posts) for a subject and its peers and hands the matched posts
 * to computeKoreaScan.
 *
 * Two-step match: Postgres narrows with a case-insensitive substring filter
 * per alias, then buildMatcher applies word boundaries, ticker casing and
 * exclusions in JS. The coarse filter only ever over-fetches.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { buildMatcher } from './classify';
import { computeKoreaScan, weekStart, type KoreaScan, type ScanPost } from './compute';
import { categorySets, CURATED_SETS, peersFor, type PeerSet, type ScanSubject, type TrackedProject } from './peers';

const PAGE = 1000;
const MAX_ROWS = 20_000;

export async function loadPeerSets(db: SupabaseClient): Promise<PeerSet[]> {
  const { data } = await (db as any).from('mindshare_projects').select('name, category, tracked_keywords, client_id').eq('is_active', true);
  return [...CURATED_SETS, ...categorySets((data ?? []) as TrackedProject[])];
}

/** Newest post in the corpus and the number of channels being tracked. */
export async function corpusState(db: SupabaseClient) {
  const [{ data: last }, { data: pulled }, { count }] = await Promise.all([
    (db as any).from('tg_channel_posts').select('posted_at').order('posted_at', { ascending: false }).limit(1).maybeSingle(),
    (db as any).from('tg_channel_posts').select('pulled_at').order('pulled_at', { ascending: false }).limit(1).maybeSingle(),
    (db as any).from('tg_monitored_channels').select('id', { count: 'exact', head: true }).eq('is_active', true),
  ]);
  // lastPulledAt = when the Telegram MCP last wrote anything (crawl or live search).
  return { lastPostAt: (last?.posted_at as string) ?? null, lastPulledAt: (pulled?.pulled_at as string) ?? null, trackedChannels: count ?? 0 };
}

const DAY = 86_400_000;
const KST = 9 * 3_600_000;

/**
 * Where the corpus actually has data. The crawler started late July 2026 and
 * has gaps; measuring a 120-day window over six real weeks would turn the
 * empty start into fake growth. Returns the first week from which every week
 * carries at least a quarter of a typical (75th-percentile) week.
 */
export async function corpusCoverage(db: SupabaseClient, until: number, windowDays: number) {
  const weeks: number[] = [];
  for (let w = Date.parse(weekStart(until)) - KST; w > until - windowDays * DAY - 7 * DAY; w -= 7 * DAY) weeks.unshift(w);
  const counts = await Promise.all(weeks.map(async (w) => {
    const { count } = await (db as any).from('tg_channel_posts').select('id', { count: 'exact', head: true })
      .gte('posted_at', new Date(w).toISOString()).lt('posted_at', new Date(w + 7 * DAY).toISOString());
    return count ?? 0;
  }));
  // "Typical" = the 75th-percentile week, so a long run of near-empty early weeks can't drag it down.
  const sorted = [...counts].sort((a, b) => a - b);
  const median = sorted.length ? sorted[Math.floor(sorted.length * 0.75)] : 0;
  let first = weeks.length;
  for (let i = weeks.length - 1; i >= 0 && counts[i] >= median * 0.25; i--) first = i;
  // The newest week can be a sliver (the crawler stopped on a Monday): don't let it end the window.
  const lastIdx = weeks.length - 1;
  const trailingSliver = counts[lastIdx] < median * 0.25;
  if (trailingSliver) {
    first = weeks.length;
    for (let i = lastIdx - 1; i >= 0 && counts[i] >= median * 0.25; i--) first = i;
  }
  return {
    coverageStart: first < weeks.length ? new Date(weeks[first]).toISOString() : null,
    end: trailingSliver ? weeks[lastIdx] - 1 : until,
  };
}

async function fetchMatches(db: SupabaseClient, s: ScanSubject, since: string, until: string): Promise<ScanPost[]> {
  const quote = (a: string) => `"*${a.replace(/["\\]/g, '').replace(/^\$/, '')}*"`;
  const or = s.aliases.filter(Boolean).map((a) => `text.ilike.${quote(a)}`).join(',');
  if (!or) return [];
  const match = buildMatcher(s);
  const out: ScanPost[] = [];
  for (let from = 0; from < MAX_ROWS; from += PAGE) {
    const { data, error } = await (db as any).from('tg_channel_posts')
      .select('id, channel_handle, channel_title, tg_message_id, posted_at, text, views, hashtags')
      .gte('posted_at', since).lte('posted_at', until).or(or)
      .order('posted_at', { ascending: true }).range(from, from + PAGE - 1);
    if (error) throw new Error(`Korea scan read failed for ${s.name}: ${error.message}`);
    for (const r of data ?? []) {
      if (!r.text || !match(r.text)) continue;
      out.push({
        id: r.id, channel: r.channel_handle ?? 'unknown', channelTitle: r.channel_title ?? null, messageId: r.tg_message_id ?? null,
        postedAt: r.posted_at, text: r.text, views: r.views ?? null, hashtags: r.hashtags ?? null,
      });
    }
    if (!data || data.length < PAGE) break;
  }
  // The same post can be pulled twice (raw crawl + a subject-scoped scan). Count it once.
  const seen = new Set<string>();
  return out.filter((p) => { const k = `${p.channel}:${p.messageId ?? p.id}`; return seen.has(k) ? false : (seen.add(k), true); });
}

async function inBatches<T, R>(items: T[], size: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += size) out.push(...(await Promise.all(items.slice(i, i + size).map(fn))));
  return out;
}

export interface ScanRequest {
  subject: ScanSubject;
  peerSet: PeerSet;
  windowDays?: number;
}

export async function runKoreaScan(db: SupabaseClient, req: ScanRequest): Promise<KoreaScan> {
  const windowDays = req.windowDays ?? 120;
  const corpus = await corpusState(db);
  // Never claim a window the corpus doesn't reach: end at its newest post.
  const newest = corpus.lastPostAt ? Math.min(Date.now(), Date.parse(corpus.lastPostAt)) : Date.now();
  const coverage = await corpusCoverage(db, newest, windowDays);
  const end = new Date(coverage.end);
  const since = new Date(Math.max(end.getTime() - windowDays * DAY, coverage.coverageStart ? Date.parse(coverage.coverageStart) : 0)).toISOString();
  const until = end.toISOString();
  const peers = peersFor(req.peerSet, req.subject.name);
  const { data: hired } = await (db as any).from('tg_monitored_channels').select('channel_username, channel_name').eq('is_hired', true).eq('is_active', true);
  const network = (hired ?? []).filter((c: any) => c.channel_username).map((c: any) => ({ handle: c.channel_username as string, title: (c.channel_name as string) ?? null }));
  const [subjectPosts, ...peerPosts] = await inBatches([req.subject, ...peers], 4, (s) => fetchMatches(db, s, since, until));
  return computeKoreaScan({
    subject: { name: req.subject.name, posts: subjectPosts },
    peers: peers.map((p, i) => ({ name: p.name, posts: peerPosts[i] })),
    field: req.peerSet.field,
    windowEnd: until,
    windowDays,
    coverageStart: coverage.coverageStart,
    corpus: { trackedChannels: corpus.trackedChannels, lastPostAt: corpus.lastPostAt, asOf: new Date().toISOString() },
    method: { aliases: req.subject.aliases, exclude: req.subject.exclude ?? [] },
    network,
  });
}
