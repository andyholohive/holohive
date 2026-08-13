import { SupabaseClient } from '@supabase/supabase-js';

/**
 * TG Intelligence Layer — the contract producer.
 *
 * Turns a subject's tg_channel_posts + tg_channel_coverage rows into
 * the single contract that feeds both coverage outputs (client
 * leave-behind + internal call-prep). Everything here is deterministic
 * data — the same rows always produce the same contract, per the
 * addendum's "no LLM in the render path" rule. The one LLM-shaped
 * field (topic split, the sample's S-1..S-4 bars) is emitted as
 * `topic_split: null` until the classification pass lands; renderers
 * must treat it as optional.
 *
 * Invariants honored here (canonical in the skill's rules.md):
 *  - Under-claim: every count is anchored to `channels_scanned` and
 *    `window_days`; percentages are of the tracked network, never "the
 *    market". Renderers should caption counts as indicative.
 *  - Channel TYPE, not tier: the breakdown groups by creator type from
 *    the KOL profiles. Tier / scores / bookable handles never enter
 *    the contract's client-safe sections.
 */

export type CoverageContract = {
  subject: { type: string; id: string };
  query: string | null;
  window_days: number;
  generated_basis: {
    channels_scanned: number;   // every channel we attempted
    channels_readable: number;  // scans that succeeded (ok or no_posts)
    scanned_at_latest: string | null;
    // Where the posts came from. A targeted scan asked Telegram directly
    // and is authoritative for its query; corpus matches are posts the
    // mindshare crawler already held that contain a tracked keyword.
    // Renderers must not present the two as the same claim.
    posts_from_scan: number;
    posts_from_corpus: number;
    keywords_used: string[];
    // How far back the corpus actually reaches, overall and per channel.
    // THIS IS THE HONESTY FIELD. The crawler only started covering most
    // channels in late July 2026, so a corpus-sourced count is bounded by
    // when we began watching, not by when the subject was discussed. A
    // client whose engagement predates `oldest_post` will look quiet for
    // reasons that have nothing to do with their coverage — surface the
    // window wherever these counts are shown.
    corpus_window: {
      oldest_post: string | null;
      newest_post: string | null;
      channels: Array<{ channel_handle: string | null; oldest_post: string }>;
    };
  };
  // The sample's E-1..E-4 strip.
  counts: {
    channels_covered: number;     // E-1: ≥1 matching post
    posts_total: number;          // E-2
    pct_of_tracked_network: number | null; // E-3: covered / readable
    channels_repeat: number;      // E-4: covered more than once
  };
  // The sample's H-table — grouped by creator type from KOL profiles.
  channel_type_breakdown: Array<{
    channel_type: string;
    channels: number;
    posts: number;
    avg_views_per_post: number | null;
  }>;
  // Month buckets, oldest first — the sample's velocity bars.
  velocity: Array<{ month: string; posts: number }>;
  // Evidence candidates for the "what the channels are saying" cards —
  // top post per covered channel by views. Text is verbatim (original
  // language); the human picks + translates for the final render.
  representative_posts: Array<{
    channel_handle: string | null;
    channel_title: string | null;
    channel_type: string | null;
    tg_message_id: number;
    posted_at: string;
    text: string;
    views: number | null;
    reaction_total: number | null;
    is_forward: boolean;
  }>;
  // S-1..S-4 topic bars — requires the classification pass. Null until
  // then; renderers treat as optional.
  topic_split: null;
};

/**
 * The subject's tracked keywords, for matching against the standing
 * corpus. Projects carry them directly; a client inherits them from its
 * linked mindshare project. A pipeline prospect has none, so it falls
 * back to the scan's own query — which is the term someone actually
 * searched for, and the best available stand-in.
 *
 * Keywords containing PostgREST filter punctuation are dropped rather
 * than escaped: they'd corrupt the `.or()` string, and a keyword with a
 * comma or bracket in it is not a real ticker.
 */
async function resolveSubjectKeywords(
  supabase: SupabaseClient,
  subjectType: string,
  subjectId: string,
  fallbackQuery: string | null,
): Promise<string[]> {
  let raw: unknown = null;
  if (subjectType === 'project') {
    const { data } = await (supabase as any)
      .from('mindshare_projects').select('tracked_keywords').eq('id', subjectId).maybeSingle();
    raw = data?.tracked_keywords ?? null;
  } else if (subjectType === 'client') {
    const { data } = await (supabase as any)
      .from('mindshare_projects').select('tracked_keywords').eq('client_id', subjectId).maybeSingle();
    raw = data?.tracked_keywords ?? null;
  }
  const list = Array.isArray(raw) ? raw : [];
  const cleaned = list
    .map(k => (typeof k === 'string' ? k.trim() : ''))
    .filter(k => k.length >= 2 && !/[,()*]/.test(k));
  if (cleaned.length > 0) return cleaned;
  const fb = (fallbackQuery ?? '').trim();
  return fb.length >= 2 && !/[,()*]/.test(fb) ? [fb] : [];
}

/** Page past PostgREST's 1,000-row response cap. */
async function fetchAllPages(build: (from: number, to: number) => any, pageSize = 1000): Promise<any[]> {
  const out: any[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await build(from, from + pageSize - 1);
    if (error) throw error;
    const rows = (data ?? []) as any[];
    out.push(...rows);
    if (rows.length < pageSize) return out;
  }
}

export async function buildCoverageContract(
  supabase: SupabaseClient,
  subjectType: string,
  subjectId: string,
  windowDays = 30,
): Promise<CoverageContract> {
  const [{ data: posts, error: pErr }, { data: coverage, error: cErr }] = await Promise.all([
    (supabase as any)
      .from('tg_channel_posts')
      .select('channel_tg_id, channel_handle, channel_title, channel_type, tg_message_id, posted_at, text, views, reaction_total, is_forward, query')
      .eq('subject_type', subjectType)
      .eq('subject_id', subjectId)
      .order('posted_at', { ascending: false }),
    (supabase as any)
      .from('tg_channel_coverage')
      .select('channel_handle, status, scanned_at, query')
      .eq('subject_type', subjectType)
      .eq('subject_id', subjectId),
  ]);
  if (pErr) throw pErr;
  if (cErr) throw cErr;

  const scanRows = (posts ?? []) as any[];
  const covRows = (coverage ?? []) as any[];

  // [2026-08-13] Second source: the standing mindshare corpus.
  //
  // Coverage used to read ONLY subject-stamped rows, which meant every
  // question — including "is this client being talked about" — required
  // its own Telegram scan, while ~20k already-collected posts sat unread
  // because a crawl isn't subject-scoped and leaves subject_id NULL.
  //
  // So both sources feed the contract and `generated_basis` records which
  // is which. They are not the same claim: a scan asked Telegram for a
  // term; a corpus match is a term appearing in posts we happened to be
  // holding. The corpus is also bounded by when the crawler started on
  // each channel, which is why corpus_window ships alongside the counts.
  const keywords = await resolveSubjectKeywords(
    supabase, subjectType, subjectId, scanRows[0]?.query ?? covRows[0]?.query ?? null,
  );
  const sinceIso = new Date(Date.now() - windowDays * 86400_000).toISOString();
  let corpusRows: any[] = [];
  if (keywords.length > 0) {
    const orFilter = keywords.map(k => `text.ilike.%${k}%`).join(',');
    corpusRows = await fetchAllPages((from, to) => (supabase as any)
      .from('tg_channel_posts')
      .select('channel_tg_id, channel_handle, channel_title, channel_type, tg_message_id, posted_at, text, views, reaction_total, is_forward, query')
      .is('subject_type', null)
      .gte('posted_at', sinceIso)
      .or(orFilter)
      .order('posted_at', { ascending: false })
      .range(from, to));
  }

  // Union, scan rows winning — a targeted pull carries the query that
  // produced it, which the crawler's copy of the same message doesn't.
  const seen = new Set<string>(
    scanRows.map(p => `${p.channel_tg_id ?? p.channel_handle}:${p.tg_message_id}`),
  );
  const freshCorpus = corpusRows.filter(
    p => !seen.has(`${p.channel_tg_id ?? p.channel_handle}:${p.tg_message_id}`),
  );
  const postRows = [...scanRows, ...freshCorpus]
    .sort((a, b) => String(b.posted_at).localeCompare(String(a.posted_at)));

  // Per-channel corpus depth — the earliest post we hold for each channel
  // the crawler covers. A count that starts after a client's engagement
  // did is narrow, not low.
  const corpusOldestByChannel = new Map<string, string>();
  for (const p of corpusRows) {
    const h = p.channel_handle ?? null;
    if (!h) continue;
    const cur = corpusOldestByChannel.get(h);
    if (!cur || String(p.posted_at) < cur) corpusOldestByChannel.set(h, String(p.posted_at));
  }
  const corpusDates = corpusRows.map(p => String(p.posted_at)).sort();

  // Denominator for E-3. Once corpus matches join in, "covered / channels
  // we scanned" breaks the moment a keyword hits a channel this subject
  // was never scanned against — it read 1133% on the first union run.
  // The tracked network is the monitored-channel registry: what we watch,
  // which is the only honest thing a percentage here can be "of".
  const { count: monitoredCount } = await (supabase as any)
    .from('tg_monitored_channels')
    .select('id', { count: 'exact', head: true })
    .eq('is_active', true);

  const channelsScanned = covRows.length;
  const channelsReadable = covRows.filter(c => c.status === 'ok' || c.status === 'no_posts').length;
  const scannedAtLatest = covRows.reduce<string | null>(
    (max, c) => (!max || c.scanned_at > max ? c.scanned_at : max), null,
  );

  // Group posts by channel.
  const byChannel = new Map<string, any[]>();
  for (const p of postRows) {
    const key = p.channel_tg_id || p.channel_handle || 'unknown';
    const list = byChannel.get(key) ?? [];
    list.push(p);
    byChannel.set(key, list);
  }

  const channelsCovered = byChannel.size;
  const channelsRepeat = [...byChannel.values()].filter(list => list.length > 1).length;

  // Channel-type breakdown — creator type from the profile when the
  // scanner passed one, 'General' otherwise (analysis-time inference
  // upgrades this later for non-roster channels).
  const typeAgg = new Map<string, { channels: Set<string>; posts: number; viewsSum: number; viewsN: number }>();
  for (const [key, list] of byChannel) {
    const t = list[0].channel_type || 'General';
    const agg = typeAgg.get(t) ?? { channels: new Set<string>(), posts: 0, viewsSum: 0, viewsN: 0 };
    agg.channels.add(key);
    agg.posts += list.length;
    for (const p of list) {
      if (typeof p.views === 'number') { agg.viewsSum += p.views; agg.viewsN += 1; }
    }
    typeAgg.set(t, agg);
  }
  const channelTypeBreakdown = [...typeAgg.entries()]
    .map(([channel_type, a]) => ({
      channel_type,
      channels: a.channels.size,
      posts: a.posts,
      avg_views_per_post: a.viewsN > 0 ? Math.round(a.viewsSum / a.viewsN) : null,
    }))
    .sort((a, b) => b.posts - a.posts);

  // Velocity: last 6 calendar months, oldest first, zero-filled.
  const months: string[] = [];
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    months.push(d.toISOString().slice(0, 7));
  }
  const velocityMap = new Map<string, number>(months.map(m => [m, 0]));
  for (const p of postRows) {
    const m = String(p.posted_at).slice(0, 7);
    if (velocityMap.has(m)) velocityMap.set(m, (velocityMap.get(m) ?? 0) + 1);
  }
  const velocity = months.map(month => ({ month, posts: velocityMap.get(month) ?? 0 }));

  // Representative posts: top post per channel by views, best 8 overall.
  const representative = [...byChannel.values()]
    .map(list => [...list].sort((a, b) => (b.views ?? 0) - (a.views ?? 0))[0])
    .sort((a, b) => (b.views ?? 0) - (a.views ?? 0))
    .slice(0, 8)
    .map(p => ({
      channel_handle: p.channel_handle ?? null,
      channel_title: p.channel_title ?? null,
      channel_type: p.channel_type ?? null,
      tg_message_id: p.tg_message_id,
      posted_at: p.posted_at,
      text: String(p.text).slice(0, 1000),
      views: p.views ?? null,
      reaction_total: p.reaction_total ?? null,
      is_forward: p.is_forward === true,
    }));

  return {
    subject: { type: subjectType, id: subjectId },
    query: postRows[0]?.query ?? covRows[0]?.query ?? null,
    window_days: windowDays,
    generated_basis: {
      channels_scanned: channelsScanned,
      channels_readable: channelsReadable,
      scanned_at_latest: scannedAtLatest,
      posts_from_scan: scanRows.length,
      posts_from_corpus: freshCorpus.length,
      keywords_used: keywords,
      corpus_window: {
        oldest_post: corpusDates[0] ?? null,
        newest_post: corpusDates[corpusDates.length - 1] ?? null,
        channels: [...corpusOldestByChannel.entries()]
          .map(([channel_handle, oldest_post]) => ({ channel_handle, oldest_post }))
          .sort((a, b) => a.oldest_post.localeCompare(b.oldest_post)),
      },
    },
    counts: {
      channels_covered: channelsCovered,
      posts_total: postRows.length,
      pct_of_tracked_network: (() => {
        // Prefer the monitored registry; fall back to readable scans for a
        // scan-only subject with no corpus keywords. Never exceeds 100.
        const denom = (monitoredCount ?? 0) > 0
          ? Math.max(monitoredCount as number, channelsCovered)
          : channelsReadable;
        return denom > 0 ? Math.round((channelsCovered / denom) * 100) : null;
      })(),
      channels_repeat: channelsRepeat,
    },
    channel_type_breakdown: channelTypeBreakdown,
    velocity,
    representative_posts: representative,
    topic_split: null,
  };
}
