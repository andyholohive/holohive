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

  const postRows = (posts ?? []) as any[];
  const covRows = (coverage ?? []) as any[];

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
    },
    counts: {
      channels_covered: channelsCovered,
      posts_total: postRows.length,
      pct_of_tracked_network: channelsReadable > 0
        ? Math.round((channelsCovered / channelsReadable) * 100)
        : null,
      channels_repeat: channelsRepeat,
    },
    channel_type_breakdown: channelTypeBreakdown,
    velocity,
    representative_posts: representative,
    topic_split: null,
  };
}
