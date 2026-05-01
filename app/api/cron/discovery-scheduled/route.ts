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

  // ── Runs-per-day check ──
  // vercel.json registers TWO cron entries that hit this endpoint:
  // 0 0 * * * (00:00 UTC = 09:00 KST, the morning sweep) and 0 12 * * *
  // (12:00 UTC = 21:00 KST = 09:00 ET, catches US-business-hours funding
  // announcements). The morning run always fires when shouldRun=true.
  // The afternoon run only fires when the user has explicitly opted in
  // by setting runs_per_day=2 in the schedule dialog.
  //
  // We detect "which fire is this" by the current UTC hour. The morning
  // cron lands within the 0:00-0:59 UTC hour, the afternoon within 12:00-
  // 12:59 UTC. Anything else (e.g. a manual curl from /api/cron/...) is
  // treated as the morning run for backward compat.
  const runsPerDay = (schedule.runs_per_day as number | null) ?? 1;
  const utcHour = now.getUTCHours();
  const isAfternoonFire = utcHour >= 11 && utcHour <= 13;
  if (isAfternoonFire && runsPerDay < 2) {
    await recordRun(supabase, 'skipped_cadence', {
      reason: 'runs_per_day=1; afternoon cron skipped',
      runs_per_day: runsPerDay,
      utc_hour: utcHour,
    });
    return NextResponse.json({
      skipped: true,
      reason: `runs_per_day=${runsPerDay}, afternoon fire skipped (set to 2 in /reminders... actually /intelligence schedule dialog to enable)`,
    });
  }

  // ── Cost cap check (kill switch) ──
  // Sum the rolling 7-day spend across all DISCOVERY agent_runs (manual
  // scans, deep dives, find-pocs, cron runs — everything counts toward
  // the budget the user set). If we've reached or exceeded the cap, we:
  //   1. Auto-disable the schedule (is_enabled=false) so future cron
  //      runs are no-ops until the user re-enables manually
  //   2. Record skipped_cap_breached on the row
  //   3. Fire a cron_failed Telegram alert with explanatory text
  // This protects against runaway spend if a misconfig (Opus + daily
  // + max-20 + 4 sources) goes unnoticed for several days.
  const cap = schedule.weekly_cost_cap_usd as number | null;
  if (cap != null && cap > 0) {
    // Include both completed AND failed runs — failed runs still incur
    // cost up to the failure point (Stage 2 enrichment can spend $0.40
    // and then time out), so excluding them lets a flapping cron blow
    // past the cap unnoticed.
    const { data: recent } = await (supabase as any)
      .from('agent_runs')
      .select('output_summary')
      .eq('agent_name', 'DISCOVERY')
      .in('status', ['completed', 'failed'])
      .gte('started_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());
    const weekSpend = (recent || []).reduce((sum: number, r: any) => {
      const c = Number(r.output_summary?.cost_usd);
      return Number.isFinite(c) ? sum + c : sum;
    }, 0);

    if (weekSpend >= cap) {
      // Disable + record + alert. Order is: disable first (defensive —
      // if the alert dispatch hangs, at least the cron is paused).
      await (supabase as any)
        .from('scheduled_scans')
        .update({
          is_enabled: false,
          updated_at: new Date().toISOString(),
        })
        .eq('schedule_key', SCHEDULE_KEY);
      await recordRun(supabase, 'skipped_cap_breached', {
        cap_usd: cap,
        week_spend_usd: Number(weekSpend.toFixed(2)),
        action: 'auto_disabled',
      });
      try {
        const { fireIntelligenceAlert } = await import('@/lib/intelligenceAlerts');
        await fireIntelligenceAlert('cron_failed', {
          run_type: 'Auto Discovery scan (cost cap)',
          error_message: `Weekly cost cap of $${cap.toFixed(2)} reached ($${weekSpend.toFixed(2)} spent in last 7 days). Auto-scan paused for safety. Re-enable in the schedule dialog when ready.`,
          triggered_at: new Date().toISOString(),
        });
      } catch (err: any) {
        console.error('[Discovery cron] cap-breached alert dispatch failed:', err?.message);
      }
      return NextResponse.json({
        skipped: true,
        reason: 'cost cap breached',
        cap_usd: cap,
        week_spend_usd: weekSpend,
        action: 'auto_disabled',
      });
    }
  }

  // ── Run the scan ──
  // We POST to our own scan endpoint rather than calling the function
  // directly — keeps a single code path for both cron and manual scans,
  // so any improvements (alerts, dedup, CRM filter, etc.) flow through
  // automatically.
  const baseUrl = resolveBaseUrl();
  // Forward the configured cooldown_days to the scan endpoint. Lives at
  // the top level of scheduled_scans (not inside scan_params) because
  // it's a volume control, not a scan parameter.
  const scanBody = {
    ...schedule.scan_params,
    cooldown_days: schedule.cooldown_days ?? 14,
    // Tag for the dashboard so AM and PM runs are distinguishable in the UI.
    cron_triggered: true,
    cron_fire: isAfternoonFire ? 'afternoon' : 'morning',
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

  // Operational alert on failure. Fire-and-forget — alert dispatch problems
  // shouldn't cascade into the cron's own response. We only fire on real
  // failures, never on skipped_cadence/skipped_disabled (those are normal).
  if (status === 'failed') {
    try {
      const { fireIntelligenceAlert } = await import('@/lib/intelligenceAlerts');
      const errMsg = scanResult?.error || scanResult?.errors?.[0] || 'Scan endpoint returned a failure response.';
      await fireIntelligenceAlert('cron_failed', {
        run_type: 'Auto Discovery scan',
        error_message: typeof errMsg === 'string' ? errMsg.slice(0, 500) : 'Unknown error',
        triggered_at: new Date().toISOString(),
      });
    } catch (err: any) {
      console.error('[Discovery cron] failed-alert dispatch failed:', err?.message);
    }
  }

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
  status: 'completed' | 'failed' | 'skipped_disabled' | 'skipped_cadence' | 'skipped_cap_breached',
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
