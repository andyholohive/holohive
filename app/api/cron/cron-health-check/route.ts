import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { TelegramService } from '@/lib/telegramService';
import { escapeHtml } from '@/lib/telegramHtml';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * GET /api/cron/cron-health-check
 *
 * Meta-cron that sweeps the last 24h of cron activity and DMs the
 * configured Telegram terminal chat if anything looks wrong. Runs
 * daily at 08:00 UTC (17:00 KST — late afternoon, after most other
 * crons have had their windows).
 *
 * Catches two failure modes that have bitten us in production:
 *
 *   1. SILENT FAILURE — cron route returns 200 but the inner logic
 *      didn't actually do anything. Example caught 2026-05-28: the
 *      discovery-scheduled cron's POST to /api/prospects/discovery/scan
 *      was being 401'd by middleware. scheduled_scans recorded
 *      last_run_status='failed' but no agent_runs row was created,
 *      so unless you specifically queried scheduled_scans you'd never
 *      know. Weeks of dead scheduled scans before anyone noticed.
 *
 *   2. RUNAWAY FREQUENCY — cron ran successfully but WAY more times
 *      than expected. Example caught 2026-05-28: the new Telegram
 *      metrics cron ran 1,775 times in 13 hours because a stale
 *      polling loop was triggering it every 15 seconds (vs expected
 *      1 run/day). Burned ~14 hours of Vercel compute before caught.
 *      Each run was "successful" so no failure flag fired.
 *
 * Message format: ONE message per sweep, only if there are findings.
 * Healthy days send nothing — keeps Andy's TG quiet so the alert
 * means something when it does fire.
 *
 * Auth: same Bearer ${CRON_SECRET} pattern as the other crons.
 */

// Expected max runs per day per cron. If actual > 5× this, flag as
// runaway. Set generously to avoid false positives on hourly crons
// (24 expected, 120 = 5× threshold).
const EXPECTED_DAILY_MAX: Record<string, number> = {
  KOREAN_EXCHANGES: 24,        // hourly
  ACTIVATION_SYNC: 24,         // hourly — activation microsite snapshot sync
  MINDSHARE_SCAN: 48,          // every 30 min
  GOOGLE_MEETING_REMINDERS: 288, // every 5 min
  DISCOVERY: 2,                // daily (sometimes 2x if runs_per_day=2)
  TELEGRAM_METRICS: 1,         // daily
  X_METRICS: 1,                // daily
  EXPENSE_RECURRENCE: 1,       // daily
  BACKLOG_WEEKLY_SUMMARY: 1,   // weekly (Monday) — Phase 5 of HHP Backlog spec
  LINEUP_COMPLETION: 1,        // daily — HHP Lineup Manager Spec § 4.1 auto-completion
  DELIVERABLE_RECURRENCE: 1,   // daily — HHP Deliverable Templates spec Template 2 Notes
  STINT_LAPSE_SWEEP: 1,        // daily — HHP Stint+Period F1 auto-stamp churn after grace
  DASHBOARD_ESCALATIONS: 1,    // daily 08:00 UTC — HHP Team Dashboard v2 escalations
  KOL_AVATAR_REFRESH: 1,       // daily 05:00 UTC — KOL-AVATAR.10 staleness cron
  KOL_NICHE_DRIFT: 1,          // daily 04:30 UTC — PROF.6 / Doc 2 Q7b 30-day niche drift sweep
  TG_SCAN_NUDGE: 1,            // monthly (1st @ 03:00 UTC) — TG-CRON.1 manual scan reminder
  COMMENT_SENTIMENT: 1,        // daily 07:00 UTC — SENT.7 sentiment scoring of ingested TG comments
  CAMPAIGN_WEEKLY_SNAPSHOT: 1, // weekly (Monday) — Client Portal stats-row snapshots
  LIST_ACCESS_CLEANUP: 1,      // daily 08:00 UTC — expired list-access grant revocation
  REMINDERS: 1,                // daily 09:00 UTC — reminder rules sweep
  SNAPSHOT_TG_FOLLOWERS: 1,    // monthly (1st) — KOL TG follower snapshots
  CRON_HEALTH_CHECK: 1,        // daily 08:00 UTC — this sweep's own self-log
  TASK_ALERTS: 1,              // weekdays 00:00 UTC (09:00 KST) — overdue/stale task DMs
  LINEUP_DEADLINES: 1,         // Fri/Mon/Thu 12:00 UTC — lineup propose/approve/posted reminders
  WEEKLY_CONTENT_RECAP: 1,     // Mon 12:00 UTC — per-campaign weekly content recap post
  DAILY_PULSE_DM: 1,           // weekdays 06:00 UTC — Daily Pulse morning blocker DM
  DAILY_PULSE_DIGEST: 1,       // weekdays 12:00 UTC — Daily Pulse digest to HH Ops terminal
  KOL_BRIEF_NUDGE: 1,          // Fri 00:00 UTC (09:00 KST) — un-opened KOL brief nudge to team
  KR_SIGNAL_WEEKLY_GENERATE: 1, // weekly (Saturday 12:00 UTC) — builds the weekly report + queues it for review
  KR_SIGNAL_WEEKLY: 1,         // weekly (Sunday 12:00 UTC) — sends APPROVED reports; nudges the ops chat about unapproved ones
  KR_SIGNAL_BASELINES: 1,      // weekly (Sunday 12:30 UTC) — KR Signal §5 regime baseline refresh
  KR_SIGNAL_LISTINGS: 24,      // hourly — KR Signal listings alert + digest sweep (Feature B)
  // Fires daily 15:00 UTC but posts at most once a week, so a healthy
  // week logs exactly ONE run — the skip paths (already sent / no notes
  // yet) return without logging. See the route's header for why.
  WEEKLY_STRATEGIC_DIGEST: 1,  // weekly (first day notes exist) — cross-client strategic direction roll-up
  ACTION_BOARD_APPROVALS: 1,   // daily 02:00 UTC — logs once per run, including no-op days
  // Anything else defaults to 5 (daily-or-less crons)
};
const DEFAULT_DAILY_MAX = 5;
const RUNAWAY_MULTIPLIER = 5;  // flag at 5× expected

export async function GET(request: Request) {
  // Auth
  if (!process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 });
  }
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = request.headers.get('authorization') || '';
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseServiceKey) {
    return NextResponse.json({ error: 'Missing Supabase config' }, { status: 500 });
  }
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const startedAt = new Date();
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

  try {
    // ─── 1. Failed agent_runs in last 24h ─────────────────────────
    const { data: failedRuns, error: runsErr } = await (supabase as any)
      .from('agent_runs')
      .select('agent_name, run_type, started_at, error_message, output_summary')
      .eq('status', 'failed')
      .gte('started_at', since.toISOString())
      .order('started_at', { ascending: false });

    if (runsErr) {
      console.error('[cron-health-check] agent_runs query failed:', runsErr);
    }

    // ─── 2. Failed scheduled_scans in last 24h ────────────────────
    // These don't always create agent_runs rows (the discovery 401
    // case was exactly this — failure was only in scheduled_scans).
    const { data: scheduleRows, error: schedErr } = await (supabase as any)
      .from('scheduled_scans')
      .select('schedule_key, last_run_at, last_run_status, last_run_summary')
      .gte('last_run_at', since.toISOString())
      .like('last_run_status', '%failed%');

    if (schedErr) {
      console.error('[cron-health-check] scheduled_scans query failed:', schedErr);
    }

    // ─── 3. Runaway frequency detection ───────────────────────────
    // Pull up to 50k rows for the count (Supabase default cap is
    // 1000 — a runaway loop can produce far more than that). 50k
    // covers ~3 runs/minute for 24h which is the practical ceiling
    // before Vercel itself would rate-limit us.
    const { data: allRuns, error: countErr } = await (supabase as any)
      .from('agent_runs')
      .select('agent_name, run_type')
      .gte('started_at', since.toISOString())
      .range(0, 49999);

    if (countErr) {
      console.error('[cron-health-check] count query failed:', countErr);
    }

    // [2026-07-05 AUDIT-FIX] User-triggered runs share agent_name with
    // the scheduled cron (e.g. DISCOVERY logs on_demand scans + grok
    // deep dives under the same name, expected max 2/day). Counting
    // them tripped false "runaway" alerts on busy manual days — only
    // machine-scheduled runs count against EXPECTED_DAILY_MAX.
    const MANUAL_RUN_TYPES = new Set([
      'on_demand', 'grok_deep_dive', 'poc_enrichment', 'grok_poc_enrichment', 'manual',
    ]);
    const runCounts: Record<string, number> = {};
    for (const r of allRuns || []) {
      if (MANUAL_RUN_TYPES.has(r.run_type)) continue;
      const name = r.agent_name || '(unknown)';
      runCounts[name] = (runCounts[name] || 0) + 1;
    }

    const runaways: Array<{ agent: string; actual: number; expected: number }> = [];
    for (const [agent, actual] of Object.entries(runCounts)) {
      const expected = EXPECTED_DAILY_MAX[agent] ?? DEFAULT_DAILY_MAX;
      if (actual > expected * RUNAWAY_MULTIPLIER) {
        runaways.push({ agent, actual, expected });
      }
    }

    // ─── 3.5 Stale data feeds ─────────────────────────────────────
    //
    // [2026-08-05] Everything above watches whether crons RAN. Nothing watched
    // whether they PRODUCED anything, and those are different failures.
    //
    // The mindshare pipeline sat dead from 07-27 to 08-05 without tripping a
    // single check here: the GitHub Actions scraper exited 0 on runs that
    // ingested nothing (its per-channel errors were caught and the exit code
    // never consulted them), and HHP's own mindshare-scan cron then ran 48×/day
    // logging `status: success, mentions_added: 0` — because there was nothing
    // new in tg_channel_posts to scan. Two green checks, one frozen table, nine
    // days. A pipeline that fails by going quiet needs a watcher that notices
    // quiet.
    //
    // So this checks the OUTPUT tables directly. `max_age_hours` is generous —
    // several times the feed's own cadence — because the point is catching a
    // dead pipeline, not a slow afternoon.
    const FEEDS: Array<{ table: string; column: string; maxAgeHours: number; label: string }> = [
      // 3-hourly GHA scrape; 24h means ~8 consecutive misses before it fires.
      { table: 'tg_channel_posts', column: 'pulled_at', maxAgeHours: 24, label: 'Mindshare channel scrape' },
    ];

    const staleFeeds: Array<{ label: string; ageHours: number; last: string | null }> = [];
    for (const feed of FEEDS) {
      try {
        const { data: newest } = await (supabase as any)
          .from(feed.table)
          .select(feed.column)
          .order(feed.column, { ascending: false })
          .limit(1)
          .maybeSingle();
        const lastRaw = newest ? (newest as any)[feed.column] : null;
        // An empty table is reported as stale too — "never produced anything"
        // is at least as broken as "stopped producing".
        const ageHours = lastRaw
          ? (Date.now() - new Date(lastRaw).getTime()) / 3_600_000
          : Number.POSITIVE_INFINITY;
        if (ageHours > feed.maxAgeHours) {
          staleFeeds.push({ label: feed.label, ageHours, last: lastRaw });
        }
      } catch (err) {
        console.error(`[cron-health-check] freshness probe failed for ${feed.table}`, err);
        // Don't let a probe error mask the rest of the sweep.
      }
    }

    // ─── 4. Build message ─────────────────────────────────────────
    const failureCount = (failedRuns?.length || 0) + (scheduleRows?.length || 0);
    const anomalyCount = runaways.length + staleFeeds.length;

    if (failureCount === 0 && anomalyCount === 0) {
      // Healthy — log + return without DMing
      try {
        await (supabase as any).from('agent_runs').insert({
          agent_name: 'CRON_HEALTH_CHECK',
          run_type: 'cron',
          started_at: startedAt.toISOString(),
          completed_at: new Date().toISOString(),
          status: 'success',
          output_summary: 'All clear — no failed runs or anomalies in last 24h.',
        });
      } catch { /* swallow */ }
      return NextResponse.json({
        ok: true,
        message: 'All clear — no failed runs or anomalies in last 24h.',
        sample_size: allRuns?.length || 0,
      });
    }

    const lines: string[] = [];
    lines.push('🚨 <b>Cron Health Sweep</b>');
    lines.push(`<i>${startedAt.toISOString().slice(0, 16).replace('T', ' ')} UTC · last 24h</i>`);
    lines.push('');

    if (failedRuns && failedRuns.length > 0) {
      lines.push(`❌ <b>Failed runs (${failedRuns.length})</b>`);
      for (const r of failedRuns.slice(0, 10)) {
        const when = String(r.started_at).slice(11, 16);
        const err = (r.error_message || '(no message)').slice(0, 80);
        lines.push(`• <code>${r.agent_name}</code> · ${when} · ${escapeHtml(err)}`);
      }
      if (failedRuns.length > 10) {
        lines.push(`  …and ${failedRuns.length - 10} more`);
      }
      lines.push('');
    }

    if (scheduleRows && scheduleRows.length > 0) {
      lines.push(`⚠️ <b>Scheduled scans with failed status (${scheduleRows.length})</b>`);
      for (const s of scheduleRows.slice(0, 10)) {
        const when = String(s.last_run_at).slice(11, 16);
        const summary = s.last_run_summary?.error
          ? String(s.last_run_summary.error).slice(0, 80)
          : String(s.last_run_status);
        lines.push(`• <code>${s.schedule_key}</code> · ${when} · ${escapeHtml(summary)}`);
      }
      lines.push('');
    }

    if (runaways.length > 0) {
      lines.push(`📈 <b>Runaway frequency (${runaways.length})</b>`);
      for (const r of runaways) {
        lines.push(
          `• <code>${r.agent}</code>: ${r.actual.toLocaleString()} runs (expected ~${r.expected}/day)`,
        );
      }
      lines.push('  <i>Likely a stuck loop, retry storm, or misconfigured schedule.</i>');
      lines.push('');
    }

    if (staleFeeds.length > 0) {
      lines.push(`🕸 <b>Stale data feeds (${staleFeeds.length})</b>`);
      for (const f of staleFeeds) {
        const age = Number.isFinite(f.ageHours)
          ? f.ageHours >= 48
            ? `${Math.floor(f.ageHours / 24)}d`
            : `${Math.floor(f.ageHours)}h`
          : 'never';
        lines.push(`• ${escapeHtml(f.label)}: no new rows in <b>${age}</b>`);
      }
      lines.push('  <i>The job may be running green while producing nothing — check its logs, not its status.</i>');
      lines.push('');
    }

    lines.push(`<i>Investigate: query <code>agent_runs</code> + <code>scheduled_scans</code> for details.</i>`);

    const message = lines.join('\n');

    // ─── 5. Send DM ───────────────────────────────────────────────
    const sent = await TelegramService.sendMessage(message, 'HTML');

    // agent_runs log — the watcher watches itself.
    try {
      await (supabase as any).from('agent_runs').insert({
        agent_name: 'CRON_HEALTH_CHECK',
        run_type: 'cron',
        started_at: startedAt.toISOString(),
        completed_at: new Date().toISOString(),
        status: 'success',
        output_summary: `${failureCount} failure(s), ${anomalyCount} anomaly(ies) flagged.`,
      });
    } catch { /* swallow */ }

    return NextResponse.json({
      ok: true,
      sent,
      failures: failureCount,
      anomalies: anomalyCount,
      sample_size: allRuns?.length || 0,
    });
  } catch (err: any) {
    console.error('[cron-health-check] crashed:', err);
    // Try to DM about our own crash — meta-failure
    try {
      await TelegramService.sendMessage(
        `🚨 <b>Cron Health Sweep CRASHED</b>\n<code>${escapeHtml(err?.message || 'unknown')}</code>`,
        'HTML',
      );
    } catch {
      // Nothing to do
    }
    return NextResponse.json({ error: err?.message || 'Sweep failed' }, { status: 500 });
  }
}

