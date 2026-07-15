import { NextResponse } from 'next/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { formatDate } from '@/lib/dateFormat';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * GET /api/cron/spawn-recurring-deliverables
 *
 * [2026-06-11] Daily at 00:30 UTC. For each active row in
 * `recurring_deliverables` whose configured day_of_week matches today
 * AND whose last_fired_at is BEFORE today, spawn the linked template's
 * task tree for the bound client.
 *
 * Honors the HQ Deliverable Templates spec § Template 2 Notes:
 *   "This template should auto-generate as a recurring deliverable per
 *    active client, every week."
 *
 * Pattern: mirror of /api/cron/generate-expense-instances — same agent_runs
 * logging shape, same Bearer ${CRON_SECRET} auth, same idempotency model
 * (per-row last-fire tracking instead of a unique constraint on instances,
 * because deliverables are tree structures and a per-instance unique
 * constraint doesn't generalize cleanly across templates with variable
 * step counts).
 *
 * Cadence handling:
 *   - 'weekly': fire if day_of_week matches today's ISO weekday AND
 *     last_fired_at < this week's anchor day.
 *   - 'biweekly': same check, plus last_fired_at must be ≥14 days before
 *     today (= the week we last fired + 1).
 *   - 'monthly': fire if today is the same day-of-month as last_fired_at
 *     was originally created OR last_fired_at is null AND it's day_of_week's
 *     equivalent for first-month fire. (For HHP v1 only 'weekly' is in use;
 *     monthly/biweekly are scaffolded but unsanitized — guard before
 *     production use.)
 *
 * Assignee: tasks spawn UNASSIGNED (assigned_to=NULL). CMs claim from the
 * unassigned bucket Monday morning during normal triage. This is
 * deliberate per the deep-dive 2026-06-11 — see DeliverableService
 * .spawnFromTemplateUnassigned header.
 */

// ISO weekday: Mon=1, Sun=7. JS getUTCDay() returns Sun=0..Sat=6.
function isoWeekday(d: Date): number {
  const day = d.getUTCDay();
  return day === 0 ? 7 : day;
}

// Monday-anchored ISO date for the week containing `d`.
function mondayOf(d: Date): string {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const delta = isoWeekday(x) - 1;
  x.setUTCDate(x.getUTCDate() - delta);
  return x.toISOString().slice(0, 10);
}

type RecurringRow = {
  id: string;
  client_id: string;
  template_id: string;
  cadence: 'weekly' | 'biweekly' | 'monthly';
  day_of_week: number;
  active: boolean;
  last_fired_at: string | null;
  created_by: string | null;
  /** Map of deliverable_template_steps.id -> users.id. Pre-assignment set on
   *  the recurring row; cron stamps spawned subtask assigned_to from it. */
  step_assignees: Record<string, string> | null;
};

export async function GET(request: Request) {
  // Auth — same Bearer + query-param fallback as the other crons
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
  const today = new Date(
    Date.UTC(startedAt.getUTCFullYear(), startedAt.getUTCMonth(), startedAt.getUTCDate()),
  );
  const todayIso = today.toISOString().slice(0, 10);
  const todayWeekday = isoWeekday(today);
  const weekAnchorIso = mondayOf(today);

  // ── Log run start ─────────────────────────────────────────────────
  const { data: runRow } = await (supabase as any)
    .from('agent_runs')
    .insert({
      agent_name: 'DELIVERABLE_RECURRENCE',
      run_type: 'scheduled',
      status: 'running',
      started_at: startedAt.toISOString(),
      input_params: { today: todayIso, todayWeekday, weekAnchorIso },
    })
    .select('id')
    .single();
  const runId = runRow?.id;

  const finishRun = async (
    status: 'completed' | 'failed',
    summary: any,
    error?: string,
  ) => {
    if (!runId) return;
    const endedAt = new Date();
    await (supabase as any)
      .from('agent_runs')
      .update({
        status,
        completed_at: endedAt.toISOString(),
        duration_ms: endedAt.getTime() - startedAt.getTime(),
        output_summary: summary,
        error_message: error ?? null,
      })
      .eq('id', runId);
  };

  try {
    // ── Pull active recurring deliverables ─────────────────────────
    // Index `idx_recurring_deliverables_active_ready` covers this lookup.
    const { data: rows, error: loadErr } = await (supabase as any)
      .from('recurring_deliverables')
      .select('*')
      .eq('active', true);

    if (loadErr) {
      await finishRun('failed', { error: loadErr.message }, loadErr.message);
      return NextResponse.json({ error: loadErr.message }, { status: 500 });
    }

    const recurring = ((rows ?? []) as RecurringRow[]);

    // System user for created_by audit trail. Falls back to Andy
    // (super_admin) so the row always has an owner for joins.
    const { data: systemUser } = await (supabase as any)
      .from('users')
      .select('id, name, email')
      .eq('email', 'andy@holohive.io')
      .maybeSingle();
    const systemUserId = systemUser?.id ?? null;
    const systemUserName = systemUser?.name ?? 'System';

    // Resolve assignee names once for the pre-assignment feature (small table).
    const { data: allUsers } = await (supabase as any)
      .from('users')
      .select('id, name');
    const userNameById = new Map<string, string>(
      ((allUsers ?? []) as any[]).map((u) => [u.id, u.name]),
    );

    let considered = 0;
    let spawned = 0;
    let skippedNotDue = 0;
    let skippedAlreadyFired = 0;
    let skippedClientPaused = 0;
    let failed = 0;
    const failures: Array<{ id: string; reason: string }> = [];
    const spawnedSummary: Array<{ id: string; client_id: string; template_id: string; parent_task_id: string }> = [];

    for (const row of recurring) {
      considered++;

      // Day-of-week match: skip if today isn't this row's configured fire day
      if (row.day_of_week !== todayWeekday) {
        skippedNotDue++;
        continue;
      }

      // Cadence check
      let shouldFire = false;
      if (row.cadence === 'weekly') {
        // Fire if we haven't fired since this week's anchor day
        shouldFire = !row.last_fired_at || row.last_fired_at < weekAnchorIso;
      } else if (row.cadence === 'biweekly') {
        if (!row.last_fired_at) {
          shouldFire = true;
        } else {
          const last = new Date(row.last_fired_at + 'T00:00:00Z');
          const daysSince = Math.floor((today.getTime() - last.getTime()) / 86_400_000);
          shouldFire = daysSince >= 14;
        }
      } else if (row.cadence === 'monthly') {
        // Naive: if last_fired_at is null or older than 28 days, fire.
        // Real "same day of month" logic is queued for when biweekly /
        // monthly graduate from scaffolded to in-use (see route comment).
        if (!row.last_fired_at) {
          shouldFire = true;
        } else {
          const last = new Date(row.last_fired_at + 'T00:00:00Z');
          const daysSince = Math.floor((today.getTime() - last.getTime()) / 86_400_000);
          shouldFire = daysSince >= 28;
        }
      }

      if (!shouldFire) {
        skippedAlreadyFired++;
        continue;
      }

      // Resolve client name + active flag for the title and the pause guard.
      const { data: client } = await (supabase as any)
        .from('clients')
        .select('name, is_active')
        .eq('id', row.client_id)
        .maybeSingle();
      const clientName = (client as any)?.name || 'Client';

      // [2026-07-15, per Bolt] Stop generating cycles for clients whose
      // engagement has lapsed or been switched off. The recurring row's own
      // `active` flag is a manual stop (see the /sops management panel); this
      // is the automatic one so a paused client self-heals without anyone
      // remembering to toggle it. Skip when EITHER:
      //   - the client is switched off (clients.is_active = false), OR
      //   - coverage has lapsed (client_coverage_status.coverage_tone =
      //     'inactive' — no stint covers today). red/amber/green all still
      //     count as covered, so an expiring-soon client keeps generating.
      const clientActive = (client as any)?.is_active !== false;
      let coverageLapsed = false;
      const { data: coverage } = await (supabase as any)
        .from('client_coverage_status')
        .select('coverage_tone')
        .eq('client_id', row.client_id)
        .maybeSingle();
      if (coverage && (coverage as any).coverage_tone === 'inactive') {
        coverageLapsed = true;
      }
      if (!clientActive || coverageLapsed) {
        skippedClientPaused++;
        continue;
      }

      // Resolve template name + slug — same call but lighter shape
      const { data: template } = await (supabase as any)
        .from('deliverable_templates')
        .select('name')
        .eq('id', row.template_id)
        .maybeSingle();
      const templateName = (template as any)?.name || 'Recurring Deliverable';

      // Title format mirrors what a human would type in the wizard:
      // "{Template} · {Client} · Wk of {Mon date}"
      const monLabel = formatDate(weekAnchorIso + 'T00:00:00Z');
      const title = `${templateName} · ${clientName} · Wk of ${monLabel}`;

      try {
        // [2026-06-16] Inlined spawn logic using the cron's service-role
        // client. Previously called DeliverableService.spawnFromTemplateUnassigned,
        // which reaches its own imported anon supabase client and gets
        // blocked by RLS in unauthenticated cron context — all 4 Monday
        // runs since launch failed with "Template not found". The
        // service path stays for in-app UI calls; the cron uses this
        // service-role variant.
        const { parentTask } = await spawnTemplateAsServiceRole(supabase, {
          templateId: row.template_id,
          clientId: row.client_id,
          title,
          startDate: weekAnchorIso,
          createdBy: systemUserId,
          createdByName: systemUserName,
          templateName,
          templateCategory: (await getTemplateCategory(supabase, row.template_id)) || 'client',
          stepAssignees: row.step_assignees ?? {},
          userNameById,
        });

        // Stamp the recurring row's last_fired_at so we don't dup later today
        await (supabase as any)
          .from('recurring_deliverables')
          .update({ last_fired_at: todayIso })
          .eq('id', row.id);

        spawned++;
        spawnedSummary.push({
          id: row.id,
          client_id: row.client_id,
          template_id: row.template_id,
          parent_task_id: parentTask.id,
        });
      } catch (err) {
        failed++;
        const reason = (err as Error).message || 'unknown error';
        failures.push({ id: row.id, reason });
        console.error('[spawn-recurring-deliverables] spawn failed for', row.id, err);
      }
    }

    const summary = {
      today: todayIso,
      todayWeekday,
      considered,
      spawned,
      skippedNotDue,
      skippedAlreadyFired,
      skippedClientPaused,
      failed,
      failures,
      spawnedSummary,
    };
    await finishRun(failed > 0 ? 'completed' : 'completed', summary);

    return NextResponse.json({ ok: true, ...summary });
  } catch (err) {
    const message = (err as Error).message;
    await finishRun('failed', { error: message }, message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ─── Service-role spawn helpers ───────────────────────────────────────
// Inlined replacement for DeliverableService.spawnFromTemplateUnassigned.
// All reads/writes use the service-role client passed in so RLS doesn't
// block the cron's unauthenticated context. Mirrors the service's shape
// (parent task + deliverables row + per-step subtasks) so UI consumers
// see no difference from manually-spawned deliverables.

async function getTemplateCategory(
  db: SupabaseClient,
  templateId: string,
): Promise<string | null> {
  const { data } = await (db as any)
    .from('deliverable_templates')
    .select('category')
    .eq('id', templateId)
    .maybeSingle();
  return (data as any)?.category ?? null;
}

type SpawnArgs = {
  templateId: string;
  clientId: string;
  title: string;
  startDate: string;        // YYYY-MM-DD
  createdBy: string | null;
  createdByName: string | null;
  templateName: string;
  templateCategory: string;  // 'client' | 'internal' | 'bd'
  /** Map of template step id -> user id (pre-assignment). Empty = unassigned. */
  stepAssignees: Record<string, string>;
  /** Resolver for assigned_to_name so the task shows a name without a join. */
  userNameById: Map<string, string>;
};

async function spawnTemplateAsServiceRole(
  db: SupabaseClient,
  args: SpawnArgs,
): Promise<{ parentTask: { id: string } }> {
  // 1. Pull the template's steps (service-role bypasses RLS).
  const { data: steps, error: stepsErr } = await (db as any)
    .from('deliverable_template_steps')
    .select('id, step_name, step_order, description, estimated_duration_days, task_type')
    .eq('template_id', args.templateId)
    .order('step_order');
  if (stepsErr) throw stepsErr;
  if (!steps || steps.length === 0) {
    throw new Error(`Template ${args.templateId} has no steps`);
  }

  // 2. Parent task — unassigned, in_progress.
  const parentTaskType =
    args.templateCategory === 'bd' ? 'Marketing & Sales' : 'Client Delivery';
  const { data: parentTask, error: parentErr } = await (db as any)
    .from('tasks')
    .insert({
      task_name: args.title,
      task_type: parentTaskType,
      frequency: 'one-time',
      status: 'in_progress',
      priority: 'medium',
      client_id: args.clientId,
      assigned_to: null,
      assigned_to_name: null,
      created_by: args.createdBy,
      created_by_name: args.createdByName,
      due_date: args.startDate,
      description: `<p>Deliverable: ${args.templateName}</p><p><em>Auto-spawned by recurring cron.</em></p>`,
      source: 'recurring_deliverable',
      source_date: args.startDate,
    })
    .select('id')
    .single();
  if (parentErr) throw parentErr;

  // 3. Compute target completion from cumulative step durations.
  const totalDays = steps.reduce(
    (sum: number, s: any) => sum + (s.estimated_duration_days || 0),
    0,
  );
  const target = new Date(args.startDate + 'T00:00:00Z');
  target.setUTCDate(target.getUTCDate() + totalDays);
  const targetCompletion = target.toISOString().slice(0, 10);

  // 4. Deliverable row (UI lookup key for the parent task's progress card).
  await (db as any)
    .from('deliverables')
    .insert({
      template_id: args.templateId,
      parent_task_id: (parentTask as any).id,
      client_id: args.clientId,
      title: args.title,
      status: 'active',
      role_assignments: {},
      start_date: args.startDate,
      target_completion: targetCompletion,
      metadata: {
        template_name: args.templateName,
        source: 'recurring_cron',
        auto_spawned_at: new Date().toISOString(),
      },
      created_by: args.createdBy,
    });

  // 5. Sync parent's due_date to the computed target completion.
  await (db as any)
    .from('tasks')
    .update({ due_date: targetCompletion })
    .eq('id', (parentTask as any).id);

  // 6. One subtask per step — all unassigned. Due date = startDate +
  //    cumulative duration so a 3-day step starting on Mon shows due Thu.
  let cumulativeDays = 0;
  for (const step of steps as any[]) {
    cumulativeDays += step.estimated_duration_days || 0;
    const due = new Date(args.startDate + 'T00:00:00Z');
    due.setUTCDate(due.getUTCDate() + cumulativeDays);
    const dueDate = due.toISOString().slice(0, 10);
    // Pre-assignment: stamp assigned_to from the recurring row's step map.
    // Because the cron inserts directly (not via TaskService), this fires NO
    // notification — replacing the manual weekly reassignment that generated
    // ~100 Telegram DMs. Unmapped steps stay unassigned (legacy behaviour).
    const assignedTo = args.stepAssignees[step.id] || null;
    const assignedToName = assignedTo ? (args.userNameById.get(assignedTo) ?? null) : null;
    const { error: subErr } = await (db as any)
      .from('tasks')
      .insert({
        task_name: `${step.step_order}. ${step.step_name}`,
        parent_task_id: (parentTask as any).id,
        task_type: step.task_type || parentTaskType,
        frequency: 'one-time',
        status: 'to_do',
        priority: 'medium',
        client_id: args.clientId,
        assigned_to: assignedTo,
        assigned_to_name: assignedToName,
        created_by: args.createdBy,
        created_by_name: args.createdByName,
        due_date: dueDate,
        description: step.description || '',
        sort_order: step.step_order,
        source: 'recurring_deliverable',
        source_date: args.startDate,
        source_ref: step.id,
      });
    if (subErr) throw subErr;
  }

  return { parentTask: { id: (parentTask as any).id } };
}
