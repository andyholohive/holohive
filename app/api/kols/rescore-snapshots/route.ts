import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireSuperAdmin } from '@/lib/requireSuperAdmin';

export const dynamic = 'force-dynamic';

/**
 * POST /api/kols/rescore-snapshots
 *
 * [2026-08-19] Jdot: "3,352 posts back into the organic sample is a bigger
 * correction than it sounds. Every Channel Score computed before today was
 * built on a sample missing roughly half its posts. Worth a full rescore
 * rather than letting new scans slowly dilute the old numbers."
 *
 * He is right about the need. The thing his note doesn't settle is *which*
 * rescore, because there are two and they are not equivalent:
 *
 *   1. Re-run the MCP scan. Reads live Telegram with the corrected filter,
 *      so it is authoritative — but it only ever produces a snapshot for
 *      today. History stays wrong, and it spends API calls.
 *   2. Recompute in-DB from `tg_channel_posts`. Costs nothing, and can
 *      repair history — but it is only as complete as the crawl. If the
 *      corpus holds fewer posts for a channel than the live scan saw, a
 *      recompute would replace a sample missing its tagged posts with a
 *      sample missing arbitrary posts. That is not obviously an
 *      improvement, and it would be invisible once written.
 *
 * So this route defaults to a dry run: it reports, per snapshot, what the
 * corrected aggregates would be and how the corpus coverage compares to
 * what the original scan analysed. Nothing is written unless `apply` is
 * true AND the snapshot passes the coverage gate.
 *
 * Only the organic-filtered aggregates are touched. follower_count and
 * follower_growth_pct come from channel metadata, not from the post
 * sample, so the tag bug never reached them.
 */

// Same list as the MCP's DISCLOSURE_TAGS. Only a disclosure tag means paid;
// a topical hashtag does not, which was the original bug.
const DISCLOSURE_TAGS = new Set([
  '#kol', '#ad', '#ads', '#amb', '#ambassador', '#sponsored', '#sponsor',
  '#pr', '#promo', '#partnership',
  '#광고', '#유료광고', '#협찬', '#제휴', '#홍보', '#파트너십',
]);

const WINDOW_DAYS = 30; // matches tg_channel_snapshot's trailing window

function avg(xs: number[]): number | null {
  const v = xs.filter(x => Number.isFinite(x));
  return v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 100) / 100 : null;
}

export async function POST(request: Request) {
  const guard = await requireSuperAdmin(request);
  if (!guard.ok) return guard.response;

  const body = await request.json().catch(() => ({}));
  const apply = body?.apply === true;
  // A recompute is only allowed to overwrite when the corpus holds at least
  // this share of the posts the original scan analysed. Below it, the
  // in-DB sample is thinner than what it would replace.
  const minCoverage = Number(body?.min_coverage ?? 1);

  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  // KOL → channel, via the same t.me match the taxonomy uses.
  const { data: kols, error: kolErr } = await (sb as any)
    .from('master_kols').select('id, name, link, community_link').is('archived_at', null);
  if (kolErr) return NextResponse.json({ error: kolErr.message }, { status: 500 });

  const handleOf = (l: string | null) => {
    if (!l || !/t\.me\//i.test(l)) return null;
    return l.replace(/^.*t\.me\//i, '').replace(/[/?].*$/, '').toLowerCase() || null;
  };
  const kolHandles = new Map<string, string>();
  for (const k of kols ?? []) {
    const h = handleOf(k.link) ?? handleOf(k.community_link);
    if (h) kolHandles.set(k.id, h);
  }

  const { data: channels } = await (sb as any)
    .from('tg_monitored_channels').select('channel_tg_id, channel_username');
  const chanByHandle = new Map<string, string>();
  for (const c of channels ?? []) {
    const u = (c.channel_username ?? '').replace(/^@/, '').toLowerCase();
    // Normalised key: the registry stores the Bot API -100… form and the
    // crawler writes the Telethon peer id.
    if (u) chanByHandle.set(u, String(c.channel_tg_id).replace(/^-100/, '').replace(/^-/, ''));
  }

  const { data: snaps, error: snapErr } = await (sb as any)
    .from('kol_channel_snapshots')
    .select('id, kol_id, snapshot_date, avg_views_per_post, organic_posts_analyzed')
    .order('snapshot_date', { ascending: false });
  if (snapErr) return NextResponse.json({ error: snapErr.message }, { status: 500 });

  const results: any[] = [];
  let written = 0;

  for (const s of snaps ?? []) {
    const handle = kolHandles.get(s.kol_id);
    const key = handle ? chanByHandle.get(handle) : null;
    if (!key) { results.push({ id: s.id, kol_id: s.kol_id, skipped: 'no crawled channel' }); continue; }

    const end = new Date(`${s.snapshot_date}T23:59:59Z`);
    const start = new Date(end.getTime() - WINDOW_DAYS * 86_400_000);
    // Filter by channel in the query, not after it. The two sides store the
    // id differently, so match every form rather than normalising in SQL.
    const { data: posts } = await (sb as any)
      .from('tg_channel_posts')
      .select('views, forwards, replies, is_forward, hashtags')
      .in('channel_tg_id', [key, `-${key}`, `-100${key}`])
      .gte('posted_at', start.toISOString())
      .lte('posted_at', end.toISOString())
      .limit(2000);

    const mine = posts ?? [];

    const organic = mine.filter((p: any) =>
      !p.is_forward && !(p.hashtags ?? []).some((t: string) => DISCLOSURE_TAGS.has(t)));

    const was = s.organic_posts_analyzed ?? 0;
    const coverage = was > 0 ? organic.length / was : null;
    const recomputed = {
      avg_views_per_post: avg(organic.map((p: any) => Number(p.views))),
      avg_forwards_per_post: avg(organic.map((p: any) => Number(p.forwards))),
      avg_replies_per_post: avg(organic.map((p: any) => Number(p.replies))),
      organic_posts_analyzed: organic.length,
    };

    const eligible = coverage != null && coverage >= minCoverage;
    if (apply && eligible) {
      await (sb as any).from('kol_channel_snapshots').update(recomputed).eq('id', s.id);
      written += 1;
    }

    results.push({
      id: s.id, kol_id: s.kol_id, snapshot_date: s.snapshot_date,
      posts_in_corpus: mine.length, organic_in_corpus: organic.length,
      organic_analyzed_originally: was,
      coverage: coverage == null ? null : Math.round(coverage * 100) / 100,
      was_avg_views: s.avg_views_per_post, now_avg_views: recomputed.avg_views_per_post,
      eligible, applied: apply && eligible,
    });
  }

  const scored = results.filter(r => r.coverage != null);
  return NextResponse.json({
    ok: true,
    dry_run: !apply,
    snapshots: results.length,
    with_corpus_coverage: scored.length,
    eligible: scored.filter(r => r.eligible).length,
    written,
    results,
  });
}
