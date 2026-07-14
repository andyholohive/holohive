/**
 * GET /api/dashboard/v2/internal — Layer 1: Internal Success
 *
 * Answers "are we executing?" Returns:
 *   - kpis: active client count (standard only), open tasks, overdue tasks,
 *           tasks completed this week, completion rate
 *   - workload: tasks per active team member, with overdue counts
 *   - escalations: users above the person_escalation_threshold
 *   - initiatives: active initiatives + stale tones (amber 14d / red 30d)
 *   - adHocWork: count + last 10 ad-hoc tasks (surfaced, not filtered)
 *
 * Read-only, real-time on each call. The spec asks for a 60s in-memory
 * cache for performance — that lives in route.ts as a top-level cache
 * keyed by nothing (single-tenant dashboard).
 */

import { NextResponse } from 'next/server';
import { adminSupabase, getStandardClients, getRelevantClients, overdueToneFor } from '@/lib/dashboard/queries';
import { getDashboardConfig } from '@/lib/dashboard/config';

export const dynamic = 'force-dynamic';

const CACHE_TTL_MS = 60_000;
let cached: { value: any; at: number } | null = null;

function startOfWeekUtc(d = new Date()): Date {
  const x = new Date(d);
  const day = x.getUTCDay();
  const diff = day === 0 ? 6 : day - 1;
  x.setUTCDate(x.getUTCDate() - diff);
  x.setUTCHours(0, 0, 0, 0);
  return x;
}

export async function GET() {
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return NextResponse.json(cached.value);
  }

  try {
    const sb = adminSupabase();
    const cfg = await getDashboardConfig();
    const weekStart = startOfWeekUtc().toISOString();
    const todayIso = new Date().toISOString().slice(0, 10);

    const [
      standardClients,
      relevantClients,
      tasksRes,
      adHocTasksRes,
      initiativesRes,
      initiativeLinkedTasksRes,
      initiativeMilestonesRes,
      usersRes,
      quarterTasksRes,
    ] = await Promise.all([
      getStandardClients(sb),
      getRelevantClients(sb),
      (sb as any)
        .from('tasks')
        .select('id, task_name, status, due_date, assigned_to, assigned_to_name, completed_at, is_ad_hoc, client_id, created_at')
        .neq('status', 'complete'),
      (sb as any)
        .from('tasks')
        .select('id, task_name, assigned_to_name, due_date, status, created_at, client_id')
        .eq('is_ad_hoc', true)
        .order('created_at', { ascending: false })
        .limit(10),
      // [2026-07-14] Initiatives merged into specs (Plan A): read promoted
      // specs (is_initiative) with active initiative_status. Shaped below
      // to the same fields the card expects (owner_user_id ← owner_id,
      // status ← initiative_status).
      (sb as any)
        .from('specs')
        .select('id, name, owner_id, initiative_status, category_tags, updated_at')
        .eq('is_initiative', true)
        .eq('initiative_status', 'active')
        .order('updated_at', { ascending: false }),
      // [2026-06-11] All tasks linked to ANY initiative. We aggregate
      // counts in JS rather than running N count queries — typical
      // active-initiative list is 5-20 entries so the join is cheap.
      (sb as any)
        .from('tasks')
        .select('id, linked_initiative, assigned_to')
        .not('linked_initiative', 'is', null),
      // [2026-06-19] Initiative milestones — used to compute the
      // "current gate" badge per TD §3.3. The current gate is the
      // lowest-sort_order row that isn't completed yet. Pulled in
      // bulk and reduced per-initiative below.
      (sb as any)
        .from('initiative_milestones')
        .select('spec_id, name, sort_order, completed')
        .order('sort_order', { ascending: true }),
      (sb as any)
        .from('users')
        .select('id, name, role, profile_photo_url'),
      // [2026-07-02] Current-quarter task set for the quarterly overdue
      // rollup that feeds Jaymz + Quazo scorecards and the Overdue panel.
      // Fetches BOTH open and completed tasks with due_date in the quarter
      // — "was overdue" needs history, so a resolved-late task still
      // counts and stays in the list. Deriving from existing fields, no
      // schema change (was_overdue = completed_at > due_date OR still-open-past-due).
      (async () => {
        const now = new Date();
        const q = Math.floor(now.getUTCMonth() / 3);
        const qStart = new Date(Date.UTC(now.getUTCFullYear(), q * 3, 1));
        const qEnd   = new Date(Date.UTC(now.getUTCFullYear(), q * 3 + 3, 1));
        return (sb as any)
          .from('tasks')
          .select('id, task_name, status, due_date, assigned_to, assigned_to_name, completed_at, client_id')
          .gte('due_date', qStart.toISOString().slice(0, 10))
          .lt('due_date', qEnd.toISOString().slice(0, 10));
      })(),
    ]);

    // [2026-07-06] Scope every task rollup to the relevant-client
    // universe. A task counts if it's client-linked to a LIVE client
    // (standard ∪ ad-hoc, non-archived, non-test) OR is orphan/internal
    // (no client_id — team ops work, kept per TD §3). Tasks on archived,
    // inactive, or test/seed clients are dropped so they can't inflate
    // open/overdue/completed/workload numbers.
    const relevantClientSet = new Set(relevantClients.liveIds);
    const isRelevantTask = (t: { client_id?: string | null }) =>
      !t.client_id || relevantClientSet.has(t.client_id);

    const openTasks = ((tasksRes.data ?? []) as any[]).filter(isRelevantTask);

    // Tasks completed this week — keep the rows (not just count) so we
    // can roll up per-user completion counts for the workload table.
    // Per Andy 2026-06-19 + TD § 3.2: workload card shows "completed
    // this week" in place of the old Status badge.
    const completedThisWeekRes = await (sb as any)
      .from('tasks')
      .select('id, assigned_to, assigned_to_name, client_id')
      .eq('status', 'complete')
      .gte('completed_at', weekStart);

    const completedThisWeekRows = ((completedThisWeekRes.data ?? []) as any[]).filter(isRelevantTask);
    const completedThisWeek = completedThisWeekRows.length;

    // ─── Quarterly overdue rollup (Andy 2026-07-02) ─────────────────
    // Persistent-history overdue metric. Every task with due_date in the
    // current calendar quarter is a candidate; "was overdue" = the task
    // slipped past its due date at any point. A resolved-late task stays
    // in the numerator so the record survives completion — the whole
    // point of the ask.
    //
    // was_overdue rule:
    //   • Open past due: status != 'complete' AND due_date < today
    //   • Resolved late: completed_at (date) > due_date
    // Otherwise on-time (open with future due, or done on/before due).
    const nowMs = Date.now();
    const nowUTC = new Date();
    const currentQuarter = Math.floor(nowUTC.getUTCMonth() / 3);
    const currentQuarterYear = nowUTC.getUTCFullYear();
    const quarterLabel = `Q${currentQuarter + 1} ${currentQuarterYear}`;
    const quarterTasks = ((quarterTasksRes.data ?? []) as any[]).filter(isRelevantTask);

    type QuarterStats = { total: number; wasOverdue: number; stillOverdue: number; resolvedLate: number };
    const quarterStatsByUser = new Map<string, QuarterStats>();
    const quarterOverduePanelRows: Array<{
      id: string;
      task_name: string;
      client_id: string | null;
      client_name: string | null;
      assignee_name: string | null;
      due_date: string | null;
      completed_at: string | null;
      daysOverdue: number;
      wasResolved: boolean;
    }> = [];

    for (const t of quarterTasks) {
      if (!t.due_date) continue;
      const dueMs = new Date(t.due_date as string).getTime();
      const doneAt = t.completed_at ? new Date(t.completed_at as string) : null;
      // Days late: peak. Resolved-late = completed_at - due_date. Still-
      // overdue = now - due_date. Both floored to whole days.
      let daysOverdue = 0;
      let wasOverdue = false;
      let wasResolved = false;
      let stillOverdue = false;
      if (doneAt) {
        // Compare by whole-day boundary — a task due 07-01 and completed
        // 07-01 later that day is on-time.
        const doneDayMs = new Date(doneAt.toISOString().slice(0, 10)).getTime();
        if (doneDayMs > dueMs) {
          wasOverdue = true;
          wasResolved = true;
          daysOverdue = Math.floor((doneDayMs - dueMs) / 86_400_000);
        }
      } else if (t.status !== 'complete') {
        if (dueMs < nowMs - (nowMs % 86_400_000)) {
          // due_date is strictly before today (in UTC-day terms).
          wasOverdue = true;
          stillOverdue = true;
          daysOverdue = Math.floor((nowMs - dueMs) / 86_400_000);
        }
      }
      // Roll into the assignee bucket. Skip unassigned tasks — they'd
      // dilute the on-time metric for named teammates. Anonymous work
      // still shows up in the panel list (see below).
      const uid = (t.assigned_to as string | null) ?? null;
      if (uid) {
        const cur = quarterStatsByUser.get(uid) ?? { total: 0, wasOverdue: 0, stillOverdue: 0, resolvedLate: 0 };
        cur.total += 1;
        if (wasOverdue) cur.wasOverdue += 1;
        if (stillOverdue) cur.stillOverdue += 1;
        if (wasResolved) cur.resolvedLate += 1;
        quarterStatsByUser.set(uid, cur);
      }
      // Panel row: only include tasks that were overdue at some point.
      // Filter to active-client / orphan later once clientNameById exists.
      if (wasOverdue) {
        quarterOverduePanelRows.push({
          id: t.id as string,
          task_name: (t.task_name as string) || '(no name)',
          client_id: (t.client_id as string | null) ?? null,
          client_name: null,
          assignee_name: (t.assigned_to_name as string | null) ?? null,
          due_date: t.due_date as string,
          completed_at: (t.completed_at as string | null) ?? null,
          daysOverdue,
          wasResolved,
        });
      }
    }

    // ─── Scorecards data (TD Scorecards block) ───────────────────────
    // Per HHP Team Dashboard Spec § Scorecards: one anchor metric per
    // role, auto-pulled from HQ. Data sources, computed in JS below:
    //   - Bolt   — Client renewal rate over the last 90 days
    //   - Jaymz  — On-time rate (1 - overdue/total)
    //   - Quazo  — On-time rate (1 - overdue/total)
    //   - Andy   — Composite: initiatives shipped (50%) + bug count (30%)
    //              + ext. visits (20%, TBD until portal analytics ships;
    //              omitted so weights renormalize to 62.5/37.5)
    // The 30d / 90d windows are chosen to balance signal vs. recency.
    const SCORE_LOOKBACK_30D_ISO = new Date(Date.now() - 30 * 86_400_000).toISOString();
    const SCORE_LOOKBACK_90D_ISO = new Date(Date.now() - 90 * 86_400_000).toISOString();
    const [stintsRes, completedInitiativesRes, liveBugsRes] = await Promise.all([
      (sb as any)
        .from('client_stints')
        .select('client_id, start_date, end_date, status')
        .order('start_date', { ascending: true }),
      // Promoted specs completed in the last 30d (Andy scorecard). Merged
      // model: initiatives are specs with is_initiative=true.
      (sb as any)
        .from('specs')
        .select('id, owner_id, initiative_status, updated_at')
        .eq('is_initiative', true)
        .eq('initiative_status', 'completed')
        .gte('updated_at', SCORE_LOOKBACK_30D_ISO),
      (sb as any)
        .from('backlog_items')
        .select('id, assignee_id, type, live_at')
        .eq('type', 'bug')
        .not('live_at', 'is', null)
        .gte('live_at', SCORE_LOOKBACK_30D_ISO),
    ]);

    // ─── Week-over-week deltas for Layer 1 KPI trend arrows ──────
    // Per HHP Initiative Feature Checklist vF (TD §2.3 · HHP-C §6):
    // "all live from HQ with trend arrows". We compare each metric
    // to the same window shifted back 7 days.
    //   - completedThisWeekPrev: tasks completed [weekStart-7d, weekStart)
    //   - openTasksPrev:         tasks that were not completed as of weekStart
    //                            (i.e. created on/before, with no completed_at
    //                            yet or completed_at >= weekStart)
    //   - overduePrev:           tasks where due_date < weekStart that were
    //                            still open at weekStart
    // No snapshot table needed — HQ tasks are authoritative and the
    // relevant fields (created_at / completed_at / due_date) are
    // immutable post-hoc.
    const weekStartDate = new Date(weekStart);
    const prevWeekStart = new Date(weekStartDate.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const weekStartDateStr = weekStart.slice(0, 10);
    // [2026-07-06] Fetch client_id (not head-only counts) so the prior-week
    // baseline is scoped to the same relevant-client universe as the
    // current week — otherwise the WoW delta would compare a filtered
    // "now" against an unfiltered "then".
    const [completedPrevRes, openPrevRes, overduePrevRes] = await Promise.all([
      (sb as any)
        .from('tasks')
        .select('id, client_id')
        .eq('status', 'complete')
        .gte('completed_at', prevWeekStart)
        .lt('completed_at', weekStart),
      (sb as any)
        .from('tasks')
        .select('id, client_id')
        .lte('created_at', weekStart)
        .or(`completed_at.is.null,completed_at.gte.${weekStart}`),
      (sb as any)
        .from('tasks')
        .select('id, client_id')
        .lte('created_at', weekStart)
        .or(`completed_at.is.null,completed_at.gte.${weekStart}`)
        .lt('due_date', weekStartDateStr),
    ]);
    const completedPrev = ((completedPrevRes.data ?? []) as any[]).filter(isRelevantTask).length;
    const openPrev = ((openPrevRes.data ?? []) as any[]).filter(isRelevantTask).length;
    const overduePrev = ((overduePrevRes.data ?? []) as any[]).filter(isRelevantTask).length;
    const openCount = openTasks.length;

    // [2026-07-13] Week-before-last (prev-prev) window, so the "Last Week"
    // KPI toggle can show its own trend arrows (last week vs the week
    // before). Same query shapes as the prev window, shifted back another
    // 7 days. Only 3 head queries — cheap, and gated behind the toggle in
    // the UI so it's always available without a second fetch.
    const prevPrevWeekStart = new Date(weekStartDate.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString();
    const prevWeekStartDateStr = prevWeekStart.slice(0, 10);
    const [completedPrevPrevRes, openPrevPrevRes, overduePrevPrevRes] = await Promise.all([
      (sb as any)
        .from('tasks')
        .select('id, client_id')
        .eq('status', 'complete')
        .gte('completed_at', prevPrevWeekStart)
        .lt('completed_at', prevWeekStart),
      (sb as any)
        .from('tasks')
        .select('id, client_id')
        .lte('created_at', prevWeekStart)
        .or(`completed_at.is.null,completed_at.gte.${prevWeekStart}`),
      (sb as any)
        .from('tasks')
        .select('id, client_id')
        .lte('created_at', prevWeekStart)
        .or(`completed_at.is.null,completed_at.gte.${prevWeekStart}`)
        .lt('due_date', prevWeekStartDateStr),
    ]);
    const completedPrevPrev = ((completedPrevPrevRes.data ?? []) as any[]).filter(isRelevantTask).length;
    const openPrevPrev = ((openPrevPrevRes.data ?? []) as any[]).filter(isRelevantTask).length;
    const overduePrevPrev = ((overduePrevPrevRes.data ?? []) as any[]).filter(isRelevantTask).length;
    const totalPrevPrev = completedPrevPrev + openPrevPrev;
    const completionRatePrevPrev = totalPrevPrev > 0
      ? Math.round((completedPrevPrev / totalPrevPrev) * 100)
      : 0;

    // [2026-07-10] Per Andy (superseding his 2026-07-06 created-this-week
    // definition, after Jdot's dashboard pass): "Active Tasks" = the FULL
    // open backlog, so the KPI always equals the Team Workload table's
    // per-person open sum (both iterate the same openTasks set, workload
    // includes an Unassigned bucket). Trend = true week-over-week delta
    // vs open-as-of-week-start (openPrev, already fetched for the
    // completion-rate comparable).

    // KPI rollups
    const overdue = openTasks.filter(
      t => overdueToneFor(t.due_date, t.status, cfg.overdue_yellow_days, cfg.overdue_red_days) !== 'none',
    );
    const overdueRed = overdue.filter(
      t => overdueToneFor(t.due_date, t.status, cfg.overdue_yellow_days, cfg.overdue_red_days) === 'red',
    );

    const totalThisWeek = completedThisWeek + openCount;
    const completionRate = totalThisWeek > 0
      ? Math.round((completedThisWeek / totalThisWeek) * 100)
      : 0;
    // Prior completion rate uses the same shape: completedPrev /
    // (completedPrev + openPrev). openPrev is "open as of weekStart",
    // which is the right denominator for the comparable window.
    const totalPrev = completedPrev + openPrev;
    const completionRatePrev = totalPrev > 0
      ? Math.round((completedPrev / totalPrev) * 100)
      : 0;

    // Workload + escalations: per-user open + overdue counts
    // Build a photo lookup from the users query so each workload entry
    // can render the real profile pic instead of an initials avatar.
    const usersById = new Map<string, { name: string; photo: string | null }>();
    for (const u of (usersRes.data ?? []) as any[]) {
      usersById.set(u.id, { name: u.name, photo: u.profile_photo_url || null });
    }
    type WorkloadEntry = { id: string | null; name: string; photo: string | null; open: number; overdue: number; completed: number };
    const perUser = new Map<string, WorkloadEntry>();
    for (const t of openTasks) {
      const key = t.assigned_to || t.assigned_to_name || 'unassigned';
      const display = t.assigned_to_name || 'Unassigned';
      const user = t.assigned_to ? usersById.get(t.assigned_to) : null;
      const cur = perUser.get(key) ?? {
        id: t.assigned_to ?? null,
        name: display,
        photo: user?.photo ?? null,
        open: 0,
        overdue: 0,
        completed: 0,
      };
      cur.open += 1;
      if (overdueToneFor(t.due_date, t.status, cfg.overdue_yellow_days, cfg.overdue_red_days) !== 'none') {
        cur.overdue += 1;
      }
      perUser.set(key, cur);
    }
    // Roll completed-this-week counts back into the same per-user map.
    // Users who only completed (no open) still get a row so their 7d
    // throughput is visible. Keyed identically (id first, then name).
    for (const t of completedThisWeekRows) {
      const key = t.assigned_to || t.assigned_to_name || 'unassigned';
      const display = t.assigned_to_name || 'Unassigned';
      const user = t.assigned_to ? usersById.get(t.assigned_to) : null;
      const cur = perUser.get(key) ?? {
        id: t.assigned_to ?? null,
        name: display,
        photo: user?.photo ?? null,
        open: 0,
        overdue: 0,
        completed: 0,
      };
      cur.completed += 1;
      perUser.set(key, cur);
    }
    const workload = Array.from(perUser.values()).sort((a, b) => b.overdue - a.overdue || b.open - a.open || b.completed - a.completed);
    const escalations = workload.filter(w => w.overdue >= cfg.person_escalation_threshold);

    // ─── Scorecards (TD Scorecards block) ───────────────────────────
    // Resolve the four named teammates dynamically by first-name match
    // (case-insensitive) — keeps the rollup working if their user id
    // ever changes. Falls back to null if a person isn't found.
    // Match priority: exact full-name match (case-insensitive) wins; if
    // none, fall back to first-name prefix match, excluding any user
    // whose name contains "test" so seeded test accounts (Andy Test /
    // bolt test) don't shadow the real teammates.
    const findUserByFirstName = (first: string) => {
      const lowered = first.toLowerCase();
      const users = ((usersRes.data ?? []) as any[]).filter(
        x => !(x.name || '').toLowerCase().includes('test'),
      );
      const exact = users.find(x => (x.name || '').toLowerCase() === lowered);
      const u = exact ?? users.find(
        x => (x.name || '').toLowerCase().split(/\s+/)[0] === lowered,
      );
      return u ? { id: u.id as string, name: u.name as string, photo: (u.profile_photo_url || null) as string | null } : null;
    };
    const scoreUserBolt = findUserByFirstName('Bolt');
    const scoreUserJaymz = findUserByFirstName('Jaymz');
    const scoreUserQuazo = findUserByFirstName('Quazo');
    const scoreUserAndy = findUserByFirstName('Andy');

    // Helper: quarter-scoped on-time rate. Denominator = every task
    // assigned to userId with due_date in the current calendar quarter
    // (open + completed). Numerator = tasks that were overdue at any
    // point (open past due OR completed after their due date). This
    // metric persists across completion: a task that slipped and got
    // resolved still counts toward Was-Overdue for the whole quarter.
    // Per Andy 2026-07-02. Returns null when the user has no tasks
    // due in the quarter — UI shows "—" instead of a misleading 100%.
    const onTimeRateFor = (userId: string | null) => {
      if (!userId) return null;
      const stats = quarterStatsByUser.get(userId);
      if (!stats || stats.total === 0) return null;
      return Math.round((1 - stats.wasOverdue / stats.total) * 100);
    };
    const quarterDetailFor = (userId: string | null) => {
      if (!userId) return `No tasks due this quarter.`;
      const stats = quarterStatsByUser.get(userId);
      if (!stats || stats.total === 0) return `No tasks due this quarter.`;
      return `${stats.wasOverdue} of ${stats.total} tasks due this quarter were overdue`
        + (stats.stillOverdue > 0 ? ` (${stats.stillOverdue} still open, ${stats.resolvedLate} resolved late).` : ` (${stats.resolvedLate} resolved late).`);
    };

    // Renewal rate (Bolt): of clients whose stint ended in the last
    // 90 days, what fraction have a subsequent stint that starts after
    // that end? Same client can only be eligible once per window —
    // we anchor on their most recent ended stint in the window.
    //
    // [2026-07-02] Filter to the standardClients allowlist (active,
    // non-ad-hoc, non-archived) — otherwise the denominator picks up
    // archived brands, test clients, and churned accounts that shouldn't
    // count toward Bolt's renewal KPI.
    const standardClientIdSet = new Set(standardClients.map(c => c.id));
    const NINETY_DAYS_AGO_DATE = new Date(Date.now() - 90 * 86_400_000);
    const stintsByClient = new Map<string, Array<{ start: Date; end: Date | null }>>();
    for (const s of ((stintsRes.data ?? []) as any[])) {
      if (!s.client_id || !s.start_date) continue;
      if (!standardClientIdSet.has(s.client_id)) continue;
      const arr = stintsByClient.get(s.client_id) ?? [];
      arr.push({
        start: new Date(s.start_date),
        end: s.end_date ? new Date(s.end_date) : null,
      });
      stintsByClient.set(s.client_id, arr);
    }
    let renewalEligible = 0;
    let renewalRenewed = 0;
    for (const [, stints] of stintsByClient) {
      // Most recent stint that ENDED within the 90d window.
      const recentEnded = stints
        .filter(s => s.end && s.end >= NINETY_DAYS_AGO_DATE && s.end <= new Date())
        .sort((a, b) => (b.end as Date).getTime() - (a.end as Date).getTime())[0];
      if (!recentEnded) continue;
      renewalEligible += 1;
      // Renewed = any subsequent stint that started after the end.
      const renewedAfter = stints.some(s => s.start > (recentEnded.end as Date));
      if (renewedAfter) renewalRenewed += 1;
    }
    const renewalRatePct = renewalEligible > 0
      ? Math.round((renewalRenewed / renewalEligible) * 100)
      : null;

    // Andy composite: initiatives shipped (50%) + bug count (30%).
    // Ext. visits (20%) is omitted until portal analytics ships, so we
    // renormalize to 62.5 / 37.5. Counts are normalized against a soft
    // monthly target of 5 of each — anything above scores 100%.
    const ANDY_TARGET = 5;
    const initShippedAndy = scoreUserAndy
      ? ((completedInitiativesRes.data ?? []) as any[]).filter(i => i.owner_user_id === scoreUserAndy.id).length
      : 0;
    const bugsShippedAndy = scoreUserAndy
      ? ((liveBugsRes.data ?? []) as any[]).filter(b => b.assignee_id === scoreUserAndy.id).length
      : 0;
    const initShippedPct = Math.min(100, Math.round((initShippedAndy / ANDY_TARGET) * 100));
    const bugsShippedPct = Math.min(100, Math.round((bugsShippedAndy / ANDY_TARGET) * 100));
    const andyCompositePct = scoreUserAndy
      ? Math.round(initShippedPct * 0.625 + bugsShippedPct * 0.375)
      : null;

    const scorecards = [
      scoreUserBolt && {
        kind: 'renewal' as const,
        person: scoreUserBolt,
        valuePct: renewalRatePct,
        formulaCaption: 'Renewed ÷ Eligible (90d)',
        sourceCaption: 'Source · client_stints end_date + status',
        detail: renewalRatePct === null
          ? 'No stints ended in the last 90 days.'
          : `${renewalRenewed} of ${renewalEligible} clients renewed in the last 90 days.`,
      },
      scoreUserJaymz && {
        kind: 'on_time' as const,
        person: scoreUserJaymz,
        valuePct: onTimeRateFor(scoreUserJaymz.id),
        formulaCaption: `${quarterLabel} · 1 − (Was Overdue ÷ Total)`,
        sourceCaption: `Source · tasks with due_date in ${quarterLabel}`,
        detail: quarterDetailFor(scoreUserJaymz.id),
      },
      scoreUserQuazo && {
        kind: 'on_time' as const,
        person: scoreUserQuazo,
        valuePct: onTimeRateFor(scoreUserQuazo.id),
        formulaCaption: `${quarterLabel} · 1 − (Was Overdue ÷ Total)`,
        sourceCaption: `Source · tasks with due_date in ${quarterLabel}`,
        detail: quarterDetailFor(scoreUserQuazo.id),
      },
      scoreUserAndy && {
        kind: 'composite' as const,
        person: scoreUserAndy,
        valuePct: andyCompositePct,
        formulaCaption: 'Initiatives 50% + Bugs 30% (Ext visits 20% TBD)',
        sourceCaption: 'Source · Initiative Tracker / backlog_items.live_at',
        detail: `${initShippedAndy} init shipped (30d) · ${bugsShippedAndy} bugs shipped (30d). Ext-visits omitted until portal analytics ships; weights renormalize to 62.5 / 37.5.`,
      },
    ].filter(Boolean) as Array<{
      kind: 'renewal' | 'on_time' | 'composite';
      person: { id: string; name: string; photo: string | null };
      valuePct: number | null;
      formulaCaption: string;
      sourceCaption: string;
      detail: string;
    }>;

    // ─── Overdue panel per TD §3.2 ───────────────────────────────────
    // Task-level list sorted by days-overdue desc. Spec wording:
    // "Overdue panel (sorted by days overdue descending, active clients
    // only, Inactive/Test excluded)". getStandardClients already returns
    // the active non-archived non-ad-hoc set; we use it as the allowlist
    // here. Orphan tasks (no client_id) are kept too so they aren't lost.
    const clientNameById = new Map<string, string>();
    for (const c of standardClients) clientNameById.set(c.id, c.name);

    // Quarter-scoped panel: every task with a due_date in the current
    // quarter that was overdue at any point. Resolved-late tasks stay
    // so the record survives completion — per Andy 2026-07-02.
    //
    // No active-client filter: the panel is a record of what slipped,
    // and dropping inactive-client rows would make the row list not
    // match the subtitle count. Client name is populated from the
    // standard-clients allowlist; unknown/inactive fall back to '(client
    // not in active roster)'.
    const overduePanel = quarterOverduePanelRows
      .map(r => ({
        ...r,
        client_name: r.client_id ? (clientNameById.get(r.client_id) ?? '(inactive client)') : null,
      }))
      .sort((a, b) => {
        // Still overdue rows first (more urgent), then resolved.
        if (a.wasResolved !== b.wasResolved) return a.wasResolved ? 1 : -1;
        return b.daysOverdue - a.daysOverdue;
      });

    // Team-wide quarter rollup for the panel subtitle: X of Y quarter
    // tasks were overdue = Z% overdue.
    let quarterTotal = 0;
    let quarterWasOverdue = 0;
    let quarterStillOverdue = 0;
    let quarterResolvedLate = 0;
    for (const [, s] of quarterStatsByUser) {
      quarterTotal += s.total;
      quarterWasOverdue += s.wasOverdue;
      quarterStillOverdue += s.stillOverdue;
      quarterResolvedLate += s.resolvedLate;
    }
    const quarterOverduePct = quarterTotal > 0
      ? Math.round((quarterWasOverdue / quarterTotal) * 100)
      : null;
    const quarterRollup = {
      label: quarterLabel,
      total: quarterTotal,
      wasOverdue: quarterWasOverdue,
      stillOverdue: quarterStillOverdue,
      resolvedLate: quarterResolvedLate,
      overduePct: quarterOverduePct,
    };

    // [2026-06-11] Per-initiative linked task counts. Pre-aggregate
    // once for the whole map below.
    const linkedTaskCountByInitiative = new Map<string, number>();
    // [2026-07-14] Distinct contributors per initiative — everyone with a
    // task linked to it, not just the single owner. Powers the avatar
    // stack on the dashboard initiative cards ("2-3 people behind a
    // priority"). Deduped per user via the inner Map.
    const contributorsByInitiative = new Map<string, Map<string, { id: string; name: string; photo: string | null }>>();
    for (const t of (initiativeLinkedTasksRes.data ?? []) as any[]) {
      if (!t.linked_initiative) continue;
      linkedTaskCountByInitiative.set(
        t.linked_initiative,
        (linkedTaskCountByInitiative.get(t.linked_initiative) ?? 0) + 1,
      );
      if (t.assigned_to) {
        const u = usersById.get(t.assigned_to);
        if (u) {
          let set = contributorsByInitiative.get(t.linked_initiative);
          if (!set) { set = new Map(); contributorsByInitiative.set(t.linked_initiative, set); }
          if (!set.has(t.assigned_to)) set.set(t.assigned_to, { id: t.assigned_to, name: u.name, photo: u.photo });
        }
      }
    }

    // Initiative stale tones + denormalized owner name + linked tasks +
    // updated_at exposed so the dashboard card grid can render the
    // mockup's "Updated Nd ago" line without a follow-up join.
    // [2026-06-19] Per-initiative current-gate map per TD §3.3.
    // "Current gate" = lowest sort_order milestone that isn't done.
    // The query above is already sorted ascending so we take the first
    // not-completed row per initiative.
    // Keyed by spec id (initiatives are promoted specs now); milestones
    // carry spec_id after the merge.
    const currentGateByInitiative = new Map<string, string>();
    for (const m of ((initiativeMilestonesRes.data ?? []) as any[])) {
      if (m.completed) continue;
      const key = m.spec_id;
      if (key && !currentGateByInitiative.has(key)) {
        currentGateByInitiative.set(key, m.name);
      }
    }
    const initiatives = ((initiativesRes.data ?? []) as any[]).map(i => {
      const daysIdle = i.updated_at
        ? Math.floor((Date.now() - new Date(i.updated_at).getTime()) / 86_400_000)
        : 999;
      const tone: 'red' | 'amber' | 'fresh' =
        daysIdle >= cfg.initiative_stale_red_days ? 'red'
        : daysIdle >= cfg.initiative_stale_amber_days ? 'amber'
        : 'fresh';
      const owner = i.owner_id ? usersById.get(i.owner_id) : null;
      // Everyone behind this initiative = its owner + every distinct
      // teammate with a task linked to it. Owner leads the stack.
      const contribMap = new Map<string, { id: string; name: string; photo: string | null }>();
      if (i.owner_id && owner) contribMap.set(i.owner_id, { id: i.owner_id, name: owner.name, photo: owner.photo });
      for (const [uid, c] of (contributorsByInitiative.get(i.id) ?? new Map())) {
        if (!contribMap.has(uid)) contribMap.set(uid, c);
      }
      return {
        id: i.id,
        name: i.name,
        owner_user_id: i.owner_id,
        owner_name: owner?.name ?? null,
        contributors: Array.from(contribMap.values()),
        category_tags: i.category_tags ?? [],
        daysIdle,
        updated_at: i.updated_at,
        linkedTaskCount: linkedTaskCountByInitiative.get(i.id) ?? 0,
        tone,
        currentGate: currentGateByInitiative.get(i.id) ?? null,
      };
    });

    const adHocOpen = ((adHocTasksRes.data ?? []) as any[]).filter(isRelevantTask);

    const payload = {
      asOf: new Date().toISOString(),
      thresholds: cfg,
      kpis: {
        activeStandardClients: standardClients.length,
        // [2026-07-10] "Active Tasks" = full open backlog (matches the
        // Team Workload sum). See definition comment above.
        openTasks: openCount,
        overdueTasks: overdue.length,
        overdueRed: overdueRed.length,
        completedThisWeek,
        completionRate,
        // Week-over-week deltas for the trend arrows on Layer 1.
        // `null` indicates we couldn't form a comparable prior — UI
        // suppresses the arrow rather than rendering 0.
        openTasksDelta: openCount - openPrev,
        overdueDelta: overdue.length - overduePrev,
        completedThisWeekDelta: completedThisWeek - completedPrev,
        completionRateDelta: completionRate - completionRatePrev,
        // [2026-07-13] Last-week snapshot for the This Week / Last Week
        // toggle. Absolutes are the prior 7-day window; deltas compare
        // last week to the week before (prev vs prev-prev) so the toggle's
        // trend arrows stay meaningful. Same field names as above so the
        // UI can render either object through one code path.
        lastWeek: {
          openTasks: openPrev,
          overdueTasks: overduePrev,
          overdueRed: 0, // not computed historically; red-count tone is a live-only detail
          completedThisWeek: completedPrev,
          completionRate: completionRatePrev,
          openTasksDelta: openPrev - openPrevPrev,
          overdueDelta: overduePrev - overduePrevPrev,
          completedThisWeekDelta: completedPrev - completedPrevPrev,
          completionRateDelta: completionRatePrev - completionRatePrevPrev,
        },
      },
      workload,
      escalations,
      scorecards,
      quarterRollup,
      overdueTasks: overduePanel,
      initiatives,
      adHocWork: {
        recentCount: adHocOpen.length,
        recent: adHocOpen.map(t => ({
          id: t.id,
          name: t.task_name,
          assignee: t.assigned_to_name,
          due_date: t.due_date,
          status: t.status,
          created_at: t.created_at,
          client_id: t.client_id,
        })),
      },
    };

    cached = { value: payload, at: Date.now() };
    return NextResponse.json(payload);
  } catch (err) {
    return NextResponse.json(
      { error: 'Failed to load Internal Success layer', detail: (err as Error).message },
      { status: 500 },
    );
  }
}
