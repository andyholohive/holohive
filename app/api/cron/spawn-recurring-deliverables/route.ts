import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { DeliverableService } from '@/lib/deliverableService';

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
};

export async function GET(request: Request) {
  // Auth — same Bearer + query-param fallback as the other crons
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = request.headers.get('authorization') || '';
    const querySecret = new URL(request.url).searchParams.get('secret');
    if (auth !== `Bearer ${cronSecret}` && querySecret !== cronSecret) {
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

    let considered = 0;
    let spawned = 0;
    let skippedNotDue = 0;
    let skippedAlreadyFired = 0;
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

      // Resolve client name for a useful title
      const { data: client } = await (supabase as any)
        .from('clients')
        .select('name')
        .eq('id', row.client_id)
        .maybeSingle();
      const clientName = (client as any)?.name || 'Client';

      // Resolve template name + slug — same call but lighter shape
      const { data: template } = await (supabase as any)
        .from('deliverable_templates')
        .select('name')
        .eq('id', row.template_id)
        .maybeSingle();
      const templateName = (template as any)?.name || 'Recurring Deliverable';

      // Title format mirrors what a human would type in the wizard:
      // "{Template} · {Client} · Wk of {Mon date}"
      const monLabel = new Date(weekAnchorIso + 'T00:00:00Z').toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
      });
      const title = `${templateName} · ${clientName} · Wk of ${monLabel}`;

      try {
        const { parentTask } = await DeliverableService.spawnFromTemplateUnassigned({
          templateId: row.template_id,
          clientId: row.client_id,
          title,
          startDate: weekAnchorIso,
          createdBy: systemUserId,
          createdByName: systemUserName,
          priority: 'medium',
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
