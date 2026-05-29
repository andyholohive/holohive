import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { shouldGenerateInstance, Expense } from '@/lib/expenseService';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * GET /api/cron/generate-expense-instances
 *
 * Daily cron at 00:30 UTC (30 min after midnight, so end-of-day
 * activity has settled). For each active expense template, decides
 * whether today is a generation day per the template's frequency +
 * recurrence_start_date, then INSERTs an instance row if one doesn't
 * already exist for (template_id, expense_date=today).
 *
 * The instance generation logic lives in shouldGenerateInstance()
 * inside lib/expenseService.ts. End-of-month edge cases (Jan 31 +
 * Feb has no 31st) use clampDayOfMonth — defaulting to "last day of
 * month" per Andy 2026-05-29 design call.
 *
 * Idempotency: relies on the uniq_expense_instance_per_period unique
 * index in the DB. If a row already exists for (template_id, today),
 * the INSERT fails silently and we skip — even if the existing row is
 * soft-deleted (so a deleted instance stays deleted).
 *
 * Auth: Bearer ${CRON_SECRET}.
 */

export async function GET(request: Request) {
  // Auth
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
  // Use today in UTC. Cron fires at 00:30 UTC so "today" is unambiguous.
  const today = new Date(
    Date.UTC(startedAt.getUTCFullYear(), startedAt.getUTCMonth(), startedAt.getUTCDate())
  );
  const todayIso = today.toISOString().slice(0, 10);

  // Log run start
  const { data: runRow } = await (supabase as any)
    .from('agent_runs')
    .insert({
      agent_name: 'EXPENSE_RECURRENCE',
      run_type: 'scheduled',
      status: 'running',
      started_at: startedAt.toISOString(),
      input_params: { today: todayIso },
    })
    .select('id')
    .single();
  const runId = runRow?.id;

  const finishRun = async (status: 'completed' | 'failed', summary: any, error?: string) => {
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
    // Pull active templates (not deleted, not yet ended)
    const { data: templates, error: loadErr } = await (supabase as any)
      .from('expenses')
      .select('*')
      .eq('is_template', true)
      .is('deleted_at', null)
      .or(`recurrence_end_date.is.null,recurrence_end_date.gte.${todayIso}`);

    if (loadErr) {
      await finishRun('failed', { error: loadErr.message }, loadErr.message);
      return NextResponse.json({ error: loadErr.message }, { status: 500 });
    }

    let considered = 0;
    let generated = 0;
    let skippedExisting = 0;
    let skippedNotDue = 0;
    let failed = 0;
    const failures: string[] = [];

    for (const tmpl of (templates || []) as Expense[]) {
      considered++;

      if (!shouldGenerateInstance(tmpl, today)) {
        skippedNotDue++;
        continue;
      }

      // Insert instance. The unique index on (template_id, expense_date)
      // means if a row already exists (including soft-deleted), this
      // INSERT will fail with a unique-violation. Treat as "skipped".
      const { error: insErr } = await (supabase as any)
        .from('expenses')
        .insert({
          template_id: tmpl.id,
          user_id: tmpl.user_id,
          amount_usd: tmpl.amount_usd,
          frequency: tmpl.frequency,
          expense_type: tmpl.expense_type,
          description: tmpl.description,
          notes: tmpl.notes,
          expense_date: todayIso,
          is_template: false,
          created_by: tmpl.created_by,
        });

      if (insErr) {
        // 23505 = unique_violation = row already exists. Expected on re-runs.
        if (insErr.code === '23505') {
          skippedExisting++;
        } else {
          failed++;
          if (failures.length < 10) failures.push(`${tmpl.id}: ${insErr.message}`);
        }
      } else {
        generated++;
      }
    }

    const summary = {
      today: todayIso,
      templates_considered: considered,
      instances_generated: generated,
      skipped_existing: skippedExisting,
      skipped_not_due: skippedNotDue,
      failed,
      first_failures: failures,
    };

    await finishRun('completed', summary);
    return NextResponse.json({ success: true, ...summary });
  } catch (err: any) {
    console.error('[generate-expense-instances]', err);
    await finishRun('failed', {}, err?.message ?? 'Unknown error');
    return NextResponse.json({ error: err?.message ?? 'Generation failed' }, { status: 500 });
  }
}
