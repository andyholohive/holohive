import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { applyScoreDecay } from '@/lib/signals/scoringEngine';

export const dynamic = 'force-dynamic';
export const maxDuration = 180;

/**
 * GET /api/cron/signals-scan — Automated signal scan triggered by cron
 *
 * Bible v3 cadence-based scanning:
 * - Daily cron always runs daily scanners (~5 min)
 * - First run of week also includes weekly scanners (~20 min)
 * - First run of month also includes monthly scanners (~45 min)
 * - Score decay runs after every scan
 */
export async function GET(request: Request) {
  try {
    // Verify cron secret
    const authHeader = request.headers.get('authorization');
    const { searchParams } = new URL(request.url);
    const querySecret = searchParams.get('secret');
    const cronSecret = process.env.CRON_SECRET;

    if (cronSecret && authHeader !== `Bearer ${cronSecret}` && querySecret !== cronSecret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

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
      if (frequency === 'weekly' && hoursSince < 144) {
        return NextResponse.json({ skipped: true, reason: 'Too soon for weekly scan', hours_since_last: Math.round(hoursSince) });
      }
      if (frequency === 'biweekly' && hoursSince < 312) {
        return NextResponse.json({ skipped: true, reason: 'Too soon for biweekly scan', hours_since_last: Math.round(hoursSince) });
      }
    }

    // Determine cadence based on timing
    const lastWeeklyRun = settings.last_weekly_run ? new Date(settings.last_weekly_run) : null;
    const lastMonthlyRun = settings.last_monthly_run ? new Date(settings.last_monthly_run) : null;

    let cadence: 'daily' | 'weekly' | 'monthly' = 'daily';

    // First run of month → monthly (includes all daily + weekly + monthly scanners)
    if (!lastMonthlyRun || (now.getTime() - lastMonthlyRun.getTime()) > 25 * 24 * 60 * 60 * 1000) {
      cadence = 'monthly';
    }
    // First run of week → weekly (includes all daily + weekly scanners)
    else if (!lastWeeklyRun || (now.getTime() - lastWeeklyRun.getTime()) > 6 * 24 * 60 * 60 * 1000) {
      cadence = 'weekly';
    }

    // Call the scan endpoint with cadence
    const modes = settings.modes || ['api', 'web', 'claude'];
    const recencyMonths = settings.recency_months || 1;

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : 'http://localhost:3000';

    const scanRes = await fetch(`${baseUrl}/api/prospects/signals/scan`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-cron-secret': cronSecret || 'dev',
      },
      body: JSON.stringify({
        cadence,
        modes, // Fallback if cadence not supported
        recency_months: recencyMonths,
        _cron: true,
      }),
    });

    const scanResult = await scanRes.json();

    // Apply score decay after scan
    const decayResult = await applyScoreDecay(supabase);

    // Update timestamps
    const updatedSettings = {
      ...settings,
      last_cron_run: now.toISOString(),
      last_cron_result: {
        cadence,
        signals_found: scanResult.signals_found,
        signals_inserted: scanResult.signals_inserted,
        duration_seconds: scanResult.scan_duration_seconds,
        decay: decayResult,
      },
    };

    // Track weekly/monthly run times
    if (cadence === 'weekly' || cadence === 'monthly') {
      updatedSettings.last_weekly_run = now.toISOString();
    }
    if (cadence === 'monthly') {
      updatedSettings.last_monthly_run = now.toISOString();
    }

    await supabase
      .from('prospect_signals')
      .update({ snippet: JSON.stringify(updatedSettings) })
      .eq('project_name', '__scan_schedule__')
      .eq('signal_type', 'scan_schedule');

    return NextResponse.json({
      success: true,
      frequency,
      cadence,
      scan_result: {
        scanners_run: scanResult.scanners_run,
        signals_found: scanResult.signals_found,
        signals_inserted: scanResult.signals_inserted,
        prospects_with_signals: scanResult.prospects_with_signals,
        duration_seconds: scanResult.scan_duration_seconds,
        claude: scanResult.claude,
      },
      decay: decayResult,
    });
  } catch (error: any) {
    console.error('Cron signal scan error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
