/**
 * GET /api/dashboard/v2/renewals-pipeline — Layer 3
 *
 * Renamed from "Lead Success" per Jdot 2026-06-01: the original
 * framing implied role-gating, but Jdot wants everyone to see this
 * surface. Layer is universally accessible.
 *
 * Returns:
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

    const [clients, pipeline] = await Promise.all([
      getStandardClients(sb),
      getPipelineSnapshot(),
    ]);

    // Build renewal entries — only those with an end_date set (ad-hoc
    // clients are already excluded by getStandardClients).
    const withEnd = clients.filter(c => c.engagement_end_date);
    const renewals = withEnd
      .map(c => {
        const t = renewalToneFor(c.engagement_end_date, cfg.renewal_red_days, cfg.renewal_amber_days);
        return {
          id: c.id,
          name: c.name,
          slug: c.slug,
          engagement_start_date: c.engagement_start_date,
          engagement_end_date: c.engagement_end_date,
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

    const payload = {
      asOf: new Date().toISOString(),
      thresholds: cfg,
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
