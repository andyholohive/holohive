/**
 * GET /api/dashboard/v2/renewals-pipeline — Layer 3
 *
 * Renamed from "Lead Success" per Jdot 2026-06-01: the original
 * framing implied role-gating, but Jdot wants everyone to see this
 * surface. Layer is universally accessible.
 *
 * Returns:
 *   - retention: spec § 5.1 — client_retention_pct, avg_engagement_weeks,
 *     total_content_delivered. Counts ad-hoc clients in retention denom
 *     when they have a Churned status (the array filter is is_ad_hoc
 *     dropping live ones, NOT historical churned ones).
 *   - renewals: standard clients in the renewal window, sorted by
 *     days-left ascending (red first, then amber).
 *   - upcomingMonths: a 90-day forward-look grouped by month.
 *   - pipeline: snapshot from /crm/sales-pipeline, read via the
 *     isolated `getPipelineSnapshot()` helper. When Yano's CRM
 *     rebuild lands, only that helper changes.
 */

import { NextResponse } from 'next/server';
import { fetchAllRows } from '@/lib/paginateSelect';
import { adminSupabase, getStandardClients, getRelevantClients, renewalToneFor } from '@/lib/dashboard/queries';
import { getCampaignWeek } from '@/lib/campaignWeekHelpers';
import { getDashboardConfig } from '@/lib/dashboard/config';
import { getPipelineSnapshot, ACTIVE_PIPELINE_STAGES } from '@/lib/dashboard/pipeline-source';

export const dynamic = 'force-dynamic';

const CACHE_TTL_MS = 60_000;
let cached: { value: any; at: number } | null = null;

export async function GET() {
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return NextResponse.json(cached.value);
  }

  try {
    const sb = adminSupabase();
    const cfg = await getDashboardConfig();

    // [2026-07-06] Relevant-client universe (live non-test + real churns).
    // Retention + content + avg-engagement all scope to this so archived
    // brands and test/seed clients stop inflating the numbers.
    const relevant = await getRelevantClients(sb);
    const liveClientIds = relevant.liveIds;

    const [clients, pipeline, contentTotalRaw, activeStintsRaw] = await Promise.all([
      getStandardClients(sb),
      getPipelineSnapshot(),
      // [2026-07-06] Total content delivered — now scoped to campaigns of
      // LIVE clients only (standard + real ad-hoc, non-archived, non-test).
      // Previously counted all-time posted content across every campaign
      // ever, so ~46% of the number came from archived test campaigns.
      // contents has no client_id — embed the campaign to filter by client.
      liveClientIds.length > 0
        ? fetchAllRows(() => (sb as any) // paginated (audit H4): don't cap "Total content delivered" at 1000
            .from('contents')
            .select('id, multipost_group_id, campaigns!inner(client_id)')
            .eq('status', 'posted')
            .in('campaigns.client_id', liveClientIds))
        : Promise.resolve({ data: [] }),
      // [2026-06-19] Active client_stints — used to anchor Average
      // Engagement to the current stint per TD §5.1 "anchors to the
      // stint, fixing multi-term blur".
      (sb as any)
        .from('client_stints')
        .select('client_id, start_date')
        .eq('status', 'active'),
    ]);

    // Build renewal entries — only those with a coverage anchor set
    // (ad-hoc clients are already excluded by getStandardClients).
    //
    // [2026-06-25] Andy: Days Left anchors to covered_through from the
    // Stint+Period substrate (single source of renewal math).
    // [2026-07-02 F1 cleanup] Legacy engagement_end_date fallback removed.
    // Ended clients (no active stint) intentionally show no end date on
    // pipeline dashboards — they're ended, so renewal math shouldn't
    // page for them.
    const renewalAnchor = (c: typeof clients[number]): string | null =>
      c.covered_through ?? null;
    const withEnd = clients.filter(c => renewalAnchor(c) !== null);
    // Build map of client_id → earliest active stint start for week math.
    const stintStartById = new Map<string, string>();
    for (const s of ((activeStintsRaw.data ?? []) as Array<{ client_id: string; start_date: string }>)) {
      if (s.client_id && s.start_date) stintStartById.set(s.client_id, s.start_date);
    }
    const renewals = withEnd
      .map(c => {
        const anchor = renewalAnchor(c)!;
        const t = renewalToneFor(anchor, cfg.renewal_red_days, cfg.renewal_amber_days);
        // [F1 cleanup 2026-07-02] Week number counts from active stint
        // start_date, not the retired clients.engagement_start_date.
        // Continuous per TD §5.2 — doesn't reset on renewal.
        // [2026-07-10] Switched to the canonical Monday-anchored helper —
        // the raw floor math counted the partial pre-Monday week and ran
        // one week ahead of the campaign page (Jdot punch list).
        const stintStart = stintStartById.get(c.id) ?? null;
        const weekNumber = getCampaignWeek(stintStart)?.weekNumber ?? null;
        return {
          id: c.id,
          name: c.name,
          slug: c.slug,
          renewal_anchor: anchor,
          weekNumber,
          // [2026-07-10] The "Started" column read c.engagement_start_date,
          // but that clients column was retired in the F1 stint cleanup and
          // this API never sent a replacement — the column rendered blank.
          // Send the active stint start (same source the Week number uses).
          engagement_start_date: stintStart,
          tone: t.tone,
          daysLeft: t.daysLeft,
        };
      })
      // Sort: red first, then amber, then green; within each, soonest first
      .sort((a, b) => {
        const order = { red: 0, amber: 1, green: 2 } as const;
        if (order[a.tone] !== order[b.tone]) return order[a.tone] - order[b.tone];
        return (a.daysLeft ?? 9999) - (b.daysLeft ?? 9999);
      });

    // 90-day forward look, grouped by month
    const upcomingByMonth = new Map<string, number>();
    const now = new Date();
    for (const r of renewals) {
      if (r.daysLeft === null || r.daysLeft < 0 || r.daysLeft > 90) continue;
      const end = new Date(r.renewal_anchor);
      const key = `${end.getUTCFullYear()}-${String(end.getUTCMonth() + 1).padStart(2, '0')}`;
      upcomingByMonth.set(key, (upcomingByMonth.get(key) ?? 0) + 1);
    }
    const upcomingMonths = Array.from(upcomingByMonth.entries())
      .map(([month, count]) => ({ month, count }))
      .sort((a, b) => a.month.localeCompare(b.month));

    // Pipeline derived metrics
    const activeStages = pipeline.countByStage.filter(s => ACTIVE_PIPELINE_STAGES.has(s.stage));
    const activeCount = activeStages.reduce((sum, s) => sum + s.count, 0);
    const activeValue = activeStages.reduce((sum, s) => sum + s.totalValue, 0);

    // [2026-07-06] Retention block — spec § 5.1, now keyed off the SAME
    // 4-bucket derivation the Clients page uses (Active / Paused / Ad-hoc
    // / Inactive), so "active clients" here matches what /clients shows.
    //   Active  = coverage-current standard clients (the Clients "Active" tab).
    //   Churned = Inactive tab (is_active=false, non-archived, non-test).
    // Paused (coverage lapsed, renewal pending) is surfaced separately —
    // it's neither renewed nor churned, so it stays out of the ratio.
    // Previously this counted all live clients (standard + ad-hoc + paused)
    // as "active", which read 5 while /clients showed 2.
    const activeCountRet = relevant.activeIds.length;
    const pausedCountRet = relevant.pausedIds.length;
    const churnedCountRet = relevant.churnedIds.length;
    const denomRet = activeCountRet + churnedCountRet;
    const clientRetentionPct = denomRet > 0 ? Math.round((activeCountRet / denomRet) * 100) : 100;

    // Avg engagement weeks — anchored to the CURRENT active stint per
    // TD §5.1 ("anchors to the stint, fixing multi-term blur").
    // [2026-07-06] Scoped to live (relevant) clients only. Clients
    // without an active stint row are skipped — the metric is purely
    // stint-anchored.
    const stintStartByClient = new Map<string, string>();
    for (const s of ((activeStintsRaw.data ?? []) as Array<{ client_id: string; start_date: string }>)) {
      if (s.client_id && s.start_date) stintStartByClient.set(s.client_id, s.start_date);
    }
    const weekSpans = relevant.activeIds
      .map(id => stintStartByClient.get(id) ?? null)
      .filter((s): s is string => s != null)
      .map(s => {
        const start = new Date(s + (s.includes('T') ? '' : 'T00:00:00Z'));
        const ms = Date.now() - start.getTime();
        return ms > 0 ? Math.floor(ms / (7 * 86_400_000)) : 0;
      });
    const avgEngagementWeeks = weekSpans.length > 0
      ? Math.round((weekSpans.reduce((s, w) => s + w, 0) / weekSpans.length) * 10) / 10
      : 0;

    // Dedup multipost mirrors: one counted delivery per group.
    const contentRowsAll = ((contentTotalRaw as any).data ?? []) as Array<{ id: string; multipost_group_id: string | null }>;
    const seenContentGroups = new Set<string>();
    let totalContentDelivered = 0;
    for (const c of contentRowsAll) {
      if (c.multipost_group_id) {
        if (seenContentGroups.has(c.multipost_group_id)) continue;
        seenContentGroups.add(c.multipost_group_id);
      }
      totalContentDelivered++;
    }

    const retention = {
      clientRetentionPct,
      activeClients: activeCountRet,
      pausedClients: pausedCountRet,
      churnedClients: churnedCountRet,
      avgEngagementWeeks,
      totalContentDelivered,
    };

    const payload = {
      asOf: new Date().toISOString(),
      thresholds: cfg,
      retention,
      renewals: {
        all: renewals,
        countsByTone: {
          red: renewals.filter(r => r.tone === 'red').length,
          amber: renewals.filter(r => r.tone === 'amber').length,
          green: renewals.filter(r => r.tone === 'green').length,
        },
        upcomingMonths,
        // [F1 cleanup] "Without end date" now means "no coverage_through" —
        // i.e. no active stint. Same semantic, sourced from the substrate.
        clientsWithoutEndDate: clients
          .filter(c => c.covered_through == null)
          .map(c => ({ id: c.id, name: c.name, slug: c.slug })),
      },
      pipeline: {
        ...pipeline,
        activeStages: { count: activeCount, totalValue: activeValue },
      },
    };

    cached = { value: payload, at: Date.now() };
    return NextResponse.json(payload);
  } catch (err) {
    return NextResponse.json(
      { error: 'Failed to load Renewals & Pipeline layer', detail: (err as Error).message },
      { status: 500 },
    );
  }
}
