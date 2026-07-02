import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/**
 * Campaign Overview — KOL Leaderboard
 *
 * Company-wide, all-time, pooled across every client + campaign.
 * Row = one KOL. Answers "who do we over-rely on" and "who consistently
 * performs." Independent from Client Success (per-client, current-state).
 *
 * Read-only, fully derived. No new logging surface.
 *
 * Query composition per Campaign Overview spec §3:
 *   - identity: master_kols (KOL DB is sole source per F2.1)
 *   - posts + views: contents (posted status only; multipost group
 *     deduped by max-per-group)
 *   - activation count + client count: campaign_kols + campaigns.client_id
 *   - engagement rate: (likes + comments + retweets + bookmarks) / views
 *
 * Amber thresholds pull from dashboard_config so Jdot can tune without
 * a code change (defaults seeded 2026-07-02):
 *   - overview_reuse_amber_min_clients
 *   - overview_top10_concentration_amber_pct
 *
 * Auth: session-gated (admin surface).
 */

async function getAuthClient() {
  const cookieStore = cookies();
  const sb = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get(n: string) { return cookieStore.get(n)?.value; }, set() {}, remove() {} } }
  );
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { error: 'Unauthorized', status: 401 as const };
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  return { admin };
}

interface KolRow {
  kol_id: string;
  name: string;
  handle: string | null;
  primary_platform: string | null;
  profile_picture_url: string | null;
  posts: number;
  views: number;
  avg_views: number;
  engagement_rate: number;
  activations: number;
  clients: number;
  is_amber_reuse: boolean;
}

export async function GET(request: Request) {
  const auth = await getAuthClient();
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const admin = auth.admin;

  const url = new URL(request.url);
  const platformFilter = url.searchParams.get('platform'); // null | 'X' | 'Telegram' | 'YouTube'

  // 1. Config thresholds
  const { data: cfgRaw } = await (admin as any)
    .from('dashboard_config')
    .select('key, value')
    .in('key', ['overview_reuse_amber_min_clients', 'overview_top10_concentration_amber_pct']);
  const cfg: Record<string, number> = {};
  for (const row of (cfgRaw ?? []) as Array<{ key: string; value: string }>) {
    cfg[row.key] = Number(row.value);
  }
  const reuseAmberMinClients = cfg.overview_reuse_amber_min_clients ?? 3;
  const top10AmberPct = cfg.overview_top10_concentration_amber_pct ?? 40;

  // 2. All-time contents (posted only, deduped by multipost_group_id).
  // Content platform is the axis per Q5 default — a multi-platform KOL
  // shows in both filters with different metrics.
  let contentsQuery = (admin as any)
    .from('contents')
    .select('id, campaign_kols_id, campaign_id, platform, impressions, likes, comments, retweets, bookmarks, multipost_group_id, status');
  if (platformFilter && platformFilter !== 'all') {
    contentsQuery = contentsQuery.eq('platform', platformFilter);
  }
  const { data: contentRows } = await contentsQuery.eq('status', 'posted');

  // Dedupe multipost: keep one row per (multipost_group_id) picking the
  // one with the highest impressions to represent the group. Non-grouped
  // rows pass through unchanged.
  const bestByGroup = new Map<string, any>();
  const nonGrouped: any[] = [];
  for (const c of (contentRows ?? []) as any[]) {
    if (c.multipost_group_id) {
      const prev = bestByGroup.get(c.multipost_group_id);
      if (!prev || (c.impressions ?? 0) > (prev.impressions ?? 0)) {
        bestByGroup.set(c.multipost_group_id, c);
      }
    } else {
      nonGrouped.push(c);
    }
  }
  const dedupedContents = [...nonGrouped, ...Array.from(bestByGroup.values())];

  // 3. Load campaign_kols → kol_id + campaign_id (drives activation +
  // client fanout).
  const { data: campaignKols } = await (admin as any)
    .from('campaign_kols')
    .select('id, master_kol_id, campaign_id, hidden, deleted_at');
  const kolIdByCampaignKolsId = new Map<string, string>();
  const campaignsByKolId = new Map<string, Set<string>>();
  for (const ck of (campaignKols ?? []) as Array<{ id: string; master_kol_id: string | null; campaign_id: string; hidden: boolean | null; deleted_at: string | null }>) {
    if (!ck.master_kol_id || ck.hidden || ck.deleted_at) continue;
    kolIdByCampaignKolsId.set(ck.id, ck.master_kol_id);
    if (!campaignsByKolId.has(ck.master_kol_id)) campaignsByKolId.set(ck.master_kol_id, new Set());
    campaignsByKolId.get(ck.master_kol_id)!.add(ck.campaign_id);
  }

  // 4. campaigns → client_id (client fanout per KOL).
  const campaignIdSet = new Set<string>();
  for (const set of campaignsByKolId.values()) for (const cid of set) campaignIdSet.add(cid);
  const { data: campaignRows } = await (admin as any)
    .from('campaigns')
    .select('id, client_id')
    .in('id', Array.from(campaignIdSet));
  const clientByCampaign = new Map<string, string | null>();
  for (const c of (campaignRows ?? []) as Array<{ id: string; client_id: string | null }>) {
    clientByCampaign.set(c.id, c.client_id);
  }

  // 5. Aggregate per KOL. Bucket contents by kol_id via campaign_kols_id.
  type Agg = {
    posts: number;
    views: number;
    engagement: number;
    activations: Set<string>;
    clients: Set<string>;
  };
  const aggByKol = new Map<string, Agg>();

  const ensure = (kolId: string): Agg => {
    let a = aggByKol.get(kolId);
    if (!a) {
      a = { posts: 0, views: 0, engagement: 0, activations: new Set(), clients: new Set() };
      aggByKol.set(kolId, a);
    }
    return a;
  };

  for (const c of dedupedContents) {
    const ckId = c.campaign_kols_id as string | null;
    if (!ckId) continue;
    const kolId = kolIdByCampaignKolsId.get(ckId);
    if (!kolId) continue;
    const a = ensure(kolId);
    a.posts += 1;
    a.views += Number(c.impressions ?? 0);
    a.engagement += Number(c.likes ?? 0) + Number(c.comments ?? 0) + Number(c.retweets ?? 0) + Number(c.bookmarks ?? 0);
    if (c.campaign_id) a.activations.add(c.campaign_id);
  }

  // Also fold in campaign_kols → activation count & clients for KOLs that
  // have zero posted content but did participate (curated / pending).
  for (const [kolId, camps] of campaignsByKolId.entries()) {
    const a = ensure(kolId);
    for (const cid of camps) a.activations.add(cid);
    for (const cid of camps) {
      const clientId = clientByCampaign.get(cid);
      if (clientId) a.clients.add(clientId);
    }
  }

  // 6. Load KOL identity for the aggregated set only (cheap).
  const kolIds = Array.from(aggByKol.keys());
  const { data: kolRows } = await (admin as any)
    .from('master_kols')
    .select('id, name, link, platform, profile_picture_url, archived_at')
    .in('id', kolIds);

  // Derive handle from link (best-effort last path segment).
  const handleFromLink = (link: string | null): string | null => {
    if (!link) return null;
    try {
      const url = new URL(link);
      const last = url.pathname.split('/').filter(Boolean).pop();
      return last ? last.replace(/^@/, '') : null;
    } catch {
      return null;
    }
  };

  // Build final rows (skip archived KOLs).
  const leaderboard: KolRow[] = ((kolRows ?? []) as any[])
    .filter(k => !k.archived_at)
    .map(k => {
      const a = aggByKol.get(k.id)!;
      const avgViews = a.posts > 0 ? Math.round(a.views / a.posts) : 0;
      const engagementRate = a.views > 0 ? a.engagement / a.views : 0;
      const handle = handleFromLink(k.link);
      return {
        kol_id: k.id,
        name: k.name,
        handle,
        primary_platform: k.platform,
        profile_picture_url: k.profile_picture_url,
        posts: a.posts,
        views: a.views,
        avg_views: avgViews,
        engagement_rate: engagementRate,
        activations: a.activations.size,
        clients: a.clients.size,
        is_amber_reuse: a.clients.size >= reuseAmberMinClients,
      };
    })
    .sort((a, b) => b.avg_views - a.avg_views);

  // 7. KPI rows. Whole-book aggregates (do NOT re-filter by platform in v1
  // per spec §3 controls note).
  const totalKols = leaderboard.length;
  const totalPosts = leaderboard.reduce((s, r) => s + r.posts, 0);
  const totalViews = leaderboard.reduce((s, r) => s + r.views, 0);
  const totalEngagement = leaderboard.reduce((s, r) => s + r.engagement_rate * r.views, 0);
  const totalActivations = leaderboard.reduce((s, r) => s + r.activations, 0);

  const campaignAverages = {
    avg_posts_per_kol: totalKols > 0 ? Math.round(totalPosts / totalKols) : 0,
    avg_views_per_post: totalPosts > 0 ? Math.round(totalViews / totalPosts) : 0,
    avg_activations_per_kol: totalKols > 0 ? Math.round((totalActivations / totalKols) * 10) / 10 : 0,
    avg_engagement_rate: totalViews > 0 ? totalEngagement / totalViews : 0,
  };
  const allTimeTotals = {
    total_kols: totalKols,
    total_posts: totalPosts,
    total_views: totalViews,
    total_activations: totalActivations,
  };

  // 8. Concentration signal: does the top 10 hold ≥ threshold %?
  const top10Views = leaderboard.slice(0, 10).reduce((s, r) => s + r.views, 0);
  const concentrationPct = totalViews > 0 ? Math.round((top10Views / totalViews) * 100) : 0;
  const isConcentrationAmber = concentrationPct >= top10AmberPct;

  return NextResponse.json({
    asOf: new Date().toISOString(),
    filters: { platform: platformFilter ?? 'all' },
    thresholds: {
      reuse_amber_min_clients: reuseAmberMinClients,
      top10_concentration_amber_pct: top10AmberPct,
    },
    kpi: {
      campaign_averages: campaignAverages,
      all_time_totals: allTimeTotals,
      concentration: {
        top10_pct: concentrationPct,
        is_amber: isConcentrationAmber,
      },
    },
    leaderboard,
  });
}
