/**
 * GET /api/dashboard/v2/monday-form-summary
 *
 * [2026-06-11] Thin status endpoint for the Monday form chip in the
 * dashboard header. Returns just the few fields the PageHeader chip
 * needs — submittedCount / totalCount / deadlinePassed / deadlineHourUtc
 * / weekOf / formSlug. Avoids pulling the entire Internal Success
 * payload (workload + escalations + initiatives + ad-hoc work) every
 * time the user opens any dashboard tab.
 *
 * Same 60s in-memory cache pattern as the other Layer endpoints. Per-
 * user scope isn't needed — Monday form status is team-wide.
 */

import { NextResponse } from 'next/server';
import { adminSupabase } from '@/lib/dashboard/queries';
import { getDashboardConfig } from '@/lib/dashboard/config';
import { getMondayFormStatus, MONDAY_FORM_SLUG } from '@/lib/dashboard/monday-form';

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
    const status = await getMondayFormStatus(sb, cfg.form_deadline_hour_utc);

    const payload = {
      asOf: new Date().toISOString(),
      formSlug: MONDAY_FORM_SLUG,
      weekOf: status.weekOf,
      submittedCount: status.submittedCount,
      // Total = number of team members the status helper considered.
      // MondayFormStatus exposes .entries[]; the chip just needs the length.
      totalCount: status.entries.length,
      deadlinePassed: status.deadlinePassed,
      deadlineHourUtc: status.deadlineHourUtc,
    };

    cached = { value: payload, at: Date.now() };
    return NextResponse.json(payload);
  } catch (err) {
    return NextResponse.json(
      { error: 'Failed to load Monday form summary', detail: (err as Error).message },
      { status: 500 },
    );
  }
}
