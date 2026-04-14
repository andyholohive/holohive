import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';
export const maxDuration = 180;

/**
 * GET /api/cron/signals-scan — Automated signal scan triggered by cron
 *
 * Vercel Cron config (add to vercel.json):
 * {
 *   "crons": [{
 *     "path": "/api/cron/signals-scan",
 *     "schedule": "0 9 * * *"
 *   }]
 * }
 *
 * Security: Vercel Cron sets CRON_SECRET header automatically.
 * For manual testing, pass ?secret=YOUR_CRON_SECRET
 */
export async function GET(request: Request) {
  try {
    // Verify cron secret (Vercel sets this automatically for cron jobs)
    const authHeader = request.headers.get('authorization');
    const { searchParams } = new URL(request.url);
    const querySecret = searchParams.get('secret');
    const cronSecret = process.env.CRON_SECRET;

    // In production, verify the secret. In development, allow without secret.
    if (cronSecret && authHeader !== `Bearer ${cronSecret}` && querySecret !== cronSecret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Use service role key for cron (no user session)
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json({ error: 'Missing Supabase config' }, { status: 500 });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Check if auto-scan is enabled
    const { data: scheduleRecord } = await supabase
      .from('prospect_signals')
      .select('headline, snippet, is_active')
      .eq('project_name', '__scan_schedule__')
      .eq('signal_type', 'scan_schedule')
      .limit(1)
      .single();

    if (!scheduleRecord || !scheduleRecord.is_active || scheduleRecord.headline === 'off') {
      return NextResponse.json({ skipped: true, reason: 'Auto-scan is disabled' });
    }

    const frequency = scheduleRecord.headline;
    let settings: any = {};
    try { settings = JSON.parse(scheduleRecord.snippet || '{}'); } catch {}

    // Check if it's time to run based on frequency
    const lastUpdated = settings.last_cron_run ? new Date(settings.last_cron_run) : null;
    const now = new Date();

    if (lastUpdated) {
      const hoursSince = (now.getTime() - lastUpdated.getTime()) / (1000 * 60 * 60);

      if (frequency === 'daily' && hoursSince < 20) {
        return NextResponse.json({ skipped: true, reason: 'Too soon for daily scan', hours_since_last: Math.round(hoursSince) });
      }
      if (frequency === 'weekly' && hoursSince < 144) { // ~6 days
        return NextResponse.json({ skipped: true, reason: 'Too soon for weekly scan', hours_since_last: Math.round(hoursSince) });
      }
      if (frequency === 'biweekly' && hoursSince < 312) { // ~13 days
        return NextResponse.json({ skipped: true, reason: 'Too soon for biweekly scan', hours_since_last: Math.round(hoursSince) });
      }
    }

    // Trigger the scan internally
    const modes = settings.modes || ['api', 'web', 'claude'];
    const recencyMonths = settings.recency_months || 1;

    // Call the scan endpoint internally
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : 'http://localhost:3000';

    const scanRes = await fetch(`${baseUrl}/api/prospects/signals/scan`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Pass service role auth for the scan endpoint
        'x-cron-secret': cronSecret || 'dev',
      },
      body: JSON.stringify({ modes, recency_months: recencyMonths, _cron: true }),
    });

    const scanResult = await scanRes.json();

    // Update last_cron_run timestamp
    await supabase
      .from('prospect_signals')
      .update({
        snippet: JSON.stringify({
          ...settings,
          last_cron_run: now.toISOString(),
          last_cron_result: {
            signals_found: scanResult.signals_found,
            signals_inserted: scanResult.signals_inserted,
            duration_seconds: scanResult.scan_duration_seconds,
          },
        }),
      })
      .eq('project_name', '__scan_schedule__')
      .eq('signal_type', 'scan_schedule');

    return NextResponse.json({
      success: true,
      frequency,
      scan_result: {
        signals_found: scanResult.signals_found,
        signals_inserted: scanResult.signals_inserted,
        prospects_with_signals: scanResult.prospects_with_signals,
        duration_seconds: scanResult.scan_duration_seconds,
        claude: scanResult.claude,
      },
    });
  } catch (error: any) {
    console.error('Cron signal scan error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
