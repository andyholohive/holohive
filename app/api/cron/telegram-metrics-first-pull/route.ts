import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { applyTelegramMetrics, isTelegramPostUrl } from '@/lib/telegramPostMetrics';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/**
 * GET /api/cron/telegram-metrics-first-pull
 *
 * Hourly. Records a Telegram post's first view + reaction count as soon as
 * it is 48h old by Telegram's own post time [Andy + Quazo 2026-11-24].
 *
 * The daily refresh-telegram-metrics job runs once at 06:00 UTC, so with
 * the 48h rule alone a post's first numbers landed anywhere from 48h to
 * 72h after it went live. This job only looks at the handful of recent
 * posts that still have no views, so it stays cheap; the daily job keeps
 * refreshing every post afterwards.
 *
 * applyTelegramMetrics does the work: it reads the post time from the
 * embed page, leaves a post under 48h untouched (reason 'too_new'), and
 * only ever writes a number higher than the stored one.
 *
 * Same scope as the daily job: posted, t.me link, active client, on or
 * after the 2026-07-10 auto-fill cutoff.
 *
 * Auth: `Authorization: Bearer {CRON_SECRET}`
 */

const METRICS_AUTOFILL_CUTOFF = '2026-07-10';
const FETCH_THROTTLE_MS = 200;

export async function GET(request: Request) {
  const startedAt = new Date();

  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseServiceKey) {
    return NextResponse.json({ error: 'Missing Supabase config' }, { status: 500 });
  }
  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const sb = supabase as any;

  const { data: runRow } = await sb
    .from('agent_runs')
    .insert({
      agent_name: 'TELEGRAM_METRICS_FIRST',
      run_type: 'scheduled',
      status: 'running',
      started_at: startedAt.toISOString(),
      input_params: {},
    })
    .select('id')
    .single();
  const runId = runRow?.id;

  const finishRun = async (status: 'completed' | 'failed', output: any, error?: string) => {
    if (!runId) return;
    const endedAt = new Date();
    await sb
      .from('agent_runs')
      .update({
        status,
        completed_at: endedAt.toISOString(),
        duration_ms: endedAt.getTime() - startedAt.getTime(),
        output_summary: output,
        error_message: error ?? null,
      })
      .eq('id', runId);
  };

  try {
    const { data: activeCampaignRows, error: campErr } = await sb
      .from('campaigns')
      .select('id, clients!inner(id, is_active, archived_at)')
      .is('archived_at', null)
      .eq('clients.is_active', true)
      .is('clients.archived_at', null);
    if (campErr) {
      await finishRun('failed', { error: campErr.message }, campErr.message);
      return NextResponse.json({ error: campErr.message }, { status: 500 });
    }
    const activeCampaignIds = (activeCampaignRows || []).map((c: any) => c.id);
    if (activeCampaignIds.length === 0) {
      await finishRun('completed', { rows_considered: 0, filled: 0, too_new: 0, failed: 0 });
      return NextResponse.json({ success: true, rows_considered: 0 });
    }

    // A post turning 48h old now went live 2 days ago (UTC). Five days back
    // covers a day stored in KST plus a post the daily job has not reached;
    // anything older than that already had its daily pass.
    const day = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);
    const { data: rows, error: loadErr } = await sb
      .from('contents')
      .select('id, content_link')
      .eq('status', 'posted')
      .ilike('content_link', '%t.me/%')
      .in('campaign_id', activeCampaignIds)
      .gte('activation_date', day(5) > METRICS_AUTOFILL_CUTOFF ? day(5) : METRICS_AUTOFILL_CUTOFF)
      .lte('activation_date', day(1))
      .or('impressions.is.null,impressions.eq.0');
    if (loadErr) {
      await finishRun('failed', { error: loadErr.message }, loadErr.message);
      return NextResponse.json({ error: loadErr.message }, { status: 500 });
    }

    let filled = 0;
    let tooNew = 0;
    let failed = 0;
    const firstFailures: string[] = [];
    for (const row of rows || []) {
      if (!isTelegramPostUrl(row.content_link)) continue;
      // No post time on the embed: leave it to the daily job's date check.
      const r = await applyTelegramMetrics(supabase, row.id, { requirePostTime: true });
      if (r.ok) {
        if (r.updated.impressions != null || r.updated.likes != null) filled++;
      } else if (r.reason === 'too_new') {
        tooNew++;
      } else {
        failed++;
        if (firstFailures.length < 10) firstFailures.push(`${row.content_link}: ${r.reason}`);
      }
      await new Promise(res => setTimeout(res, FETCH_THROTTLE_MS));
    }

    const summary = { rows_considered: rows?.length || 0, filled, too_new: tooNew, failed, first_failures: firstFailures };
    await finishRun('completed', summary);
    return NextResponse.json({ success: true, ...summary });
  } catch (err: any) {
    const msg = err?.message || 'Unknown error';
    await finishRun('failed', { error: msg }, msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
