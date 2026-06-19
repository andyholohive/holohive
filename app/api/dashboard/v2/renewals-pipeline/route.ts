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
import { adminSupabase, getStandardClients, renewalToneFor } from '@/lib/dashboard/queries';
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

    const [clients, pipeline, retentionRaw, contentTotalRaw] = await Promise.all([
      getStandardClients(sb),
      getPipelineSnapshot(),
      // [2026-06-11] Retention metrics — spec § 5.1.
      // Count active vs churned across ALL clients (including ad-hoc
      // and whitelisted). Churned status is the manual signal — when
      // an engagement ends without renewal, ops flips it to 'churned'
      // on the Clients page.
      (sb as any)
        .from('clients')
        .select('id, engagement_status, engagement_start_date')
        .in('engagement_status', ['active', 'churned']),
      // All-time content posted count across all clients. Just a count,
      // not per-client — fed into the "Total Content Delivered" card.
      (sb as any)
        .from('contents')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'posted'),
    ]);

    // Build renewal entries — only those with an end_date set (ad-hoc
    // clients are already excluded by getStandardClients).
    const withEnd = clients.filter(c => c.engagement_end_date);
    const renewals = withEnd
      .map(c => {
        const t = renewalToneFor(c.engagement_end_date, cfg.renewal_red_days, cfg.renewal_amber_days);
        // Week number per TD §5.2 — continuous since engagement_start_date,
        // doesn't reset on renewal (matches the §4.1 Client Health rule).
        let weekNumber: number | null = null;
        if (c.engagement_start_date) {
          const start = new Date(c.engagement_start_date + (c.engagement_start_date.includes('T') ? '' : 'T00:00:00Z'));
          const weeks = Math.floor((Date.now() - start.getTime()) / (7 * 86_400_000));
          weekNumber = weeks >= 0 ? weeks + 1 : null;
        }
        return {
          id: c.id,
          name: c.name,
          slug: c.slug,
          engagement_start_date: c.engagement_start_date,
          engagement_end_date: c.engagement_end_date,
          weekNumber,
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
      const end = new Date(r.engagement_end_date as string);
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

    // [2026-06-11] Retention block — spec § 5.1.
    const retentionRows = (retentionRaw.data ?? []) as Array<{
      id: string;
      engagement_status: string | null;
      engagement_start_date: string | null;
    }>;
    const activeCountRet = retentionRows.filter(c => c.engagement_status === 'active').length;
    const churnedCountRet = retentionRows.filter(c => c.engagement_status === 'churned').length;
    const denomRet = activeCountRet + churnedCountRet;
    const clientRetentionPct = denomRet > 0 ? Math.round((activeCountRet / denomRet) * 100) : 100;

    // Avg engagement weeks — across CURRENT active clients only. If
    // there's no start date, skip the row from the average.
    const weekSpans = retentionRows
      .filter(c => c.engagement_status === 'active' && c.engagement_start_date)
      .map(c => {
        const start = new Date(
          c.engagement_start_date + (c.engagement_start_date!.includes('T') ? '' : 'T00:00:00Z'),
        );
        const ms = Date.now() - start.getTime();
        return ms > 0 ? Math.floor(ms / (7 * 86_400_000)) : 0;
      });
    const avgEngagementWeeks = weekSpans.length > 0
      ? Math.round((weekSpans.reduce((s, w) => s + w, 0) / weekSpans.length) * 10) / 10
      : 0;

    const totalContentDelivered = (contentTotalRaw as any).count ?? 0;

    const retention = {
      clientRetentionPct,
      activeClients: activeCountRet,
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
        clientsWithoutEndDate: clients
          .filter(c => !c.engagement_end_date)
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
