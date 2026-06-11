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
import { adminSupabase, getStandardClients, overdueToneFor } from '@/lib/dashboard/queries';
import { getDashboardConfig } from '@/lib/dashboard/config';
import { getMondayFormStatus, MONDAY_FORM_SLUG } from '@/lib/dashboard/monday-form';

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
      tasksRes,
      adHocTasksRes,
      initiativesRes,
      initiativeLinkedTasksRes,
      usersRes,
      mondayFormStatus,
    ] = await Promise.all([
      getStandardClients(sb),
      (sb as any)
        .from('tasks')
        .select('id, status, due_date, assigned_to, assigned_to_name, completed_at, is_ad_hoc, client_id')
        .neq('status', 'complete'),
      (sb as any)
        .from('tasks')
        .select('id, task_name, assigned_to_name, due_date, status, created_at, client_id')
        .eq('is_ad_hoc', true)
        .order('created_at', { ascending: false })
        .limit(10),
      (sb as any)
        .from('initiatives')
        .select('id, name, owner_user_id, status, category_tags, updated_at')
        .eq('status', 'active')
        .is('deleted_at', null)
        .order('updated_at', { ascending: false }),
      // [2026-06-11] All tasks linked to ANY initiative. We aggregate
      // counts in JS rather than running N count queries — typical
      // active-initiative list is 5-20 entries so the join is cheap.
      (sb as any)
        .from('tasks')
        .select('id, linked_initiative')
        .not('linked_initiative', 'is', null),
      (sb as any)
        .from('users')
        .select('id, name, role, profile_photo_url'),
      getMondayFormStatus(sb, cfg.form_deadline_hour_utc),
    ]);

    const openTasks = (tasksRes.data ?? []) as any[];

    // Tasks completed this week — separate count query (smaller payload)
    const completedThisWeekRes = await (sb as any)
      .from('tasks')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'complete')
      .gte('completed_at', weekStart);

    const completedThisWeek = completedThisWeekRes.count ?? 0;
    const openCount = openTasks.length;

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

    // Workload + escalations: per-user open + overdue counts
    // Build a photo lookup from the users query so each workload entry
    // can render the real profile pic instead of an initials avatar.
    const usersById = new Map<string, { name: string; photo: string | null }>();
    for (const u of (usersRes.data ?? []) as any[]) {
      usersById.set(u.id, { name: u.name, photo: u.profile_photo_url || null });
    }
    type WorkloadEntry = { id: string | null; name: string; photo: string | null; open: number; overdue: number };
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
      };
      cur.open += 1;
      if (overdueToneFor(t.due_date, t.status, cfg.overdue_yellow_days, cfg.overdue_red_days) !== 'none') {
        cur.overdue += 1;
      }
      perUser.set(key, cur);
    }
    const workload = Array.from(perUser.values()).sort((a, b) => b.overdue - a.overdue || b.open - a.open);
    const escalations = workload.filter(w => w.overdue >= cfg.person_escalation_threshold);

    // [2026-06-11] Per-initiative linked task counts. Pre-aggregate
    // once for the whole map below.
    const linkedTaskCountByInitiative = new Map<string, number>();
    for (const t of (initiativeLinkedTasksRes.data ?? []) as any[]) {
      if (!t.linked_initiative) continue;
      linkedTaskCountByInitiative.set(
        t.linked_initiative,
        (linkedTaskCountByInitiative.get(t.linked_initiative) ?? 0) + 1,
      );
    }

    // Initiative stale tones + denormalized owner name + linked tasks +
    // updated_at exposed so the dashboard card grid can render the
    // mockup's "Updated Nd ago" line without a follow-up join.
    const initiatives = ((initiativesRes.data ?? []) as any[]).map(i => {
      const daysIdle = i.updated_at
        ? Math.floor((Date.now() - new Date(i.updated_at).getTime()) / 86_400_000)
        : 999;
      const tone: 'red' | 'amber' | 'fresh' =
        daysIdle >= cfg.initiative_stale_red_days ? 'red'
        : daysIdle >= cfg.initiative_stale_amber_days ? 'amber'
        : 'fresh';
      const owner = i.owner_user_id ? usersById.get(i.owner_user_id) : null;
      return {
        id: i.id,
        name: i.name,
        owner_user_id: i.owner_user_id,
        owner_name: owner?.name ?? null,
        category_tags: i.category_tags ?? [],
        daysIdle,
        updated_at: i.updated_at,
        linkedTaskCount: linkedTaskCountByInitiative.get(i.id) ?? 0,
        tone,
      };
    });

    const adHocOpen = (adHocTasksRes.data ?? []) as any[];

    const payload = {
      asOf: new Date().toISOString(),
      thresholds: cfg,
      kpis: {
        activeStandardClients: standardClients.length,
        openTasks: openCount,
        overdueTasks: overdue.length,
        overdueRed: overdueRed.length,
        completedThisWeek,
        completionRate,
      },
      workload,
      escalations,
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
      mondayForm: {
        ...mondayFormStatus,
        formSlug: MONDAY_FORM_SLUG,
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
