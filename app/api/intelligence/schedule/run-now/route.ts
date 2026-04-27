import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';
// Same as the manual scan + the cron — Stage 2 enrichment can chew through
// up to a few minutes for max=20 / Opus runs.
export const maxDuration = 300;

const SCHEDULE_KEY = 'discovery_default';

/**
 * POST /api/intelligence/schedule/run-now
 *
 * Fires the auto-Discovery scan immediately using the saved schedule
 * params, BYPASSING both the cadence check and the is_enabled flag.
 *
 * Use case: the user just changed their schedule settings and wants to
 * verify the configuration produces sensible results before relying on
 * tomorrow's 09:00 KST cron run. Differs from the cron path in three
 * ways:
 *   - No Bearer auth (assumes the user-session check upstream)
 *   - No cadence/disabled gating (user explicitly clicked Run Now)
 *   - Records last_run_summary.manually_triggered=true so the dialog
 *     can distinguish manual runs from cron runs
 *
 * Body: none (uses scan_params from the saved schedule row).
 *
 * Response shape mirrors the underlying scan endpoint plus
 * `manually_triggered: true`.
 */
export async function POST() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseServiceKey) {
    return NextResponse.json({ error: 'Missing Supabase config' }, { status: 500 });
  }
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // Load schedule config so we use the saved params
  const { data: schedule, error: loadErr } = await (supabase as any)
    .from('scheduled_scans')
    .select('*')
    .eq('schedule_key', SCHEDULE_KEY)
    .single();

  if (loadErr || !schedule) {
    return NextResponse.json({ error: loadErr?.message || 'Schedule row missing' }, { status: 500 });
  }

  // Build scan body from saved params, just like the cron does, but
  // tag it as manually triggered so dashboards can distinguish.
  const scanBody = {
    ...(schedule.scan_params || {}),
    cron_triggered: false,
    manually_triggered: true,
  };

  const baseUrl = resolveBaseUrl();

  let scanResult: any = null;
  let status: 'completed' | 'failed' = 'completed';
  try {
    const res = await fetch(`${baseUrl}/api/prospects/discovery/scan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(scanBody),
      signal: AbortSignal.timeout(280_000),
    });
    scanResult = await res.json();
    if (!res.ok || scanResult?.error) status = 'failed';
  } catch (err: any) {
    status = 'failed';
    scanResult = { error: err?.message ?? 'fetch failed' };
  }

  // Record run on the schedule row for the dialog's last-run display.
  // Tag manually_triggered so the UI can label it "manual" vs "cron".
  await (supabase as any)
    .from('scheduled_scans')
    .update({
      last_run_at: new Date().toISOString(),
      last_run_status: status,
      last_run_summary: { ...scanResult, manually_triggered: true },
      updated_at: new Date().toISOString(),
    })
    .eq('schedule_key', SCHEDULE_KEY);

  return NextResponse.json({
    status,
    summary: scanResult,
    manually_triggered: true,
  });
}

function resolveBaseUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_BASE_URL;
  if (explicit) {
    return explicit.startsWith('http') ? explicit : `https://${explicit}`;
  }
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return 'http://localhost:3000';
}
