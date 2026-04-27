import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';
// Same upper bound as the manual scan endpoint, in case Stage 2 enrichment
// runs into back-to-back batches.
export const maxDuration = 300;

/**
 * GET /api/cron/discovery-scheduled
 *
 * Triggered daily at 00:00 UTC by Vercel cron (configured in vercel.json).
 * That's 09:00 KST — perfect for the team to wake up to fresh prospects.
 *
 * The actual cadence (daily / weekdays / weekly) lives in the
 * `scheduled_scans` table so the user can change it from the UI without
 * a redeploy. This handler:
 *
 *   1. Loads the 'discovery_default' row
 *   2. Bails if disabled
 *   3. Bails if today's day-of-week doesn't match the configured cadence
 *   4. Otherwise POSTs to /api/prospects/discovery/scan with the saved
 *      scan_params, exactly as if a human had clicked Run Discovery
 *   5. Records the result on the schedule row for the UI's "last run"
 *      display (and so we can debug stuck or failing crons later)
 *
 * Auth: same Bearer token as the other crons, via CRON_SECRET env var.
 */

const SCHEDULE_KEY = 'discovery_default';

export async function GET(request: Request) {
  // Vercel sends Authorization: Bearer <CRON_SECRET> for cron-triggered
  // requests. Reject everything else so the endpoint can't be hit ad hoc.
  // Allow unauth in dev (no CRON_SECRET set) for easier local testing.
  if (process.env.CRON_SECRET) {
    const auth = request.headers.get('authorization') || '';
    if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseServiceKey) {
    return NextResponse.json({ error: 'Missing Supabase config' }, { status: 500 });
  }
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // Load schedule config
  const { data: schedule, error: loadErr } = await (supabase as any)
    .from('scheduled_scans')
    .select('*')
    .eq('schedule_key', SCHEDULE_KEY)
    .single();

  if (loadErr || !schedule) {
    return NextResponse.json(
      { error: loadErr?.message || 'Schedule row missing' },
      { status: 500 },
    );
  }

  // ── Disabled check ──
  if (!schedule.is_enabled) {
    await recordRun(supabase, 'skipped_disabled', null);
    return NextResponse.json({ skipped: true, reason: 'schedule disabled' });
  }

  // ── Cadence check ──
  // Compute "is today the right day?" against the saved cadence. We use UTC
  // here intentionally — the cron always fires at 00:00 UTC, so "today" in
  // UTC is the same as "today" from the cron's point of view. If we used
  // local time instead we'd flake near midnight boundaries.
  const now = new Date();
  // ISO day-of-week: Mon=1..Sun=7
  const utcDay = now.getUTCDay() === 0 ? 7 : now.getUTCDay();
  const cadence = schedule.cadence as 'daily' | 'weekdays' | 'weekly';
  const weeklyDay = schedule.weekly_day as number | null;

  let shouldRun = false;
  if (cadence === 'daily') shouldRun = true;
  else if (cadence === 'weekdays') shouldRun = utcDay >= 1 && utcDay <= 5;
  else if (cadence === 'weekly') shouldRun = weeklyDay != null && utcDay === weeklyDay;

  if (!shouldRun) {
    await recordRun(supabase, 'skipped_cadence', { cadence, weekly_day: weeklyDay, utc_day: utcDay });
    return NextResponse.json({
      skipped: true,
      reason: `cadence=${cadence}${cadence === 'weekly' ? `(day ${weeklyDay})` : ''}, today is utcDay=${utcDay}`,
    });
  }

  // ── Run the scan ──
  // We POST to our own scan endpoint rather than calling the function
  // directly — keeps a single code path for both cron and manual scans,
  // so any improvements (alerts, dedup, CRM filter, etc.) flow through
  // automatically.
  const baseUrl = resolveBaseUrl();
  const scanBody = {
    ...schedule.scan_params,
    // Always tag the run so output_summary makes it obvious in the dashboard
    cron_triggered: true,
  };

  let scanResult: any = null;
  let status: 'completed' | 'failed' = 'completed';
  try {
    const res = await fetch(`${baseUrl}/api/prospects/discovery/scan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(scanBody),
      // Vercel's overall function timeout still bounds this; we just don't
      // want fetch's default to be the bottleneck.
      signal: AbortSignal.timeout(280_000),
    });
    scanResult = await res.json();
    if (!res.ok || scanResult?.error) {
      status = 'failed';
    }
  } catch (err: any) {
    status = 'failed';
    scanResult = { error: err?.message ?? 'fetch failed' };
  }

  await recordRun(supabase, status, scanResult);

  return NextResponse.json({
    ran: true,
    status,
    summary: scanResult,
  });
}

/** Persist the run outcome on the schedule row so the UI can show
 *  "last ran 6h ago · ✓" or "last ran 2d ago · failed". */
async function recordRun(
  supabase: any,
  status: 'completed' | 'failed' | 'skipped_disabled' | 'skipped_cadence',
  summary: any,
) {
  await supabase
    .from('scheduled_scans')
    .update({
      last_run_at: new Date().toISOString(),
      last_run_status: status,
      last_run_summary: summary,
      updated_at: new Date().toISOString(),
    })
    .eq('schedule_key', SCHEDULE_KEY);
}

/** Where to POST the scan request. Prefer NEXT_PUBLIC_BASE_URL so the
 *  cron stays on the canonical custom domain (app.holohive.io); fall
 *  back to the deployment URL Vercel injects at build time. */
function resolveBaseUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_BASE_URL;
  if (explicit) {
    return explicit.startsWith('http') ? explicit : `https://${explicit}`;
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  return 'http://localhost:3000';
}
