import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Action Board automation — Jdot's "Onboarding Action Board Map v1" (23 Jul 2026).
 *
 * The client-facing Action Board is a downstream mirror of HQ. Each board item
 * completes when its linked signal fires; HQ stays the single source of truth.
 *
 * Two completion mechanisms, and the split matters:
 *
 *   1. TASK-DRIVEN — the item carries `template_step_id`. Nothing here writes
 *      the item. We set `tasks.client_action_item_id` at spawn time, and the
 *      live DB trigger `trg_tasks_propagate_milestone` mirrors the task's
 *      status onto the item whenever it completes. The trigger is the right
 *      layer: nine separate code paths mark a task complete and five bypass
 *      TaskService entirely (three Telegram handlers on the service role, the
 *      meeting-action-items route, the deliverable cascade). Anything in
 *      application code would miss them.
 *
 *   2. EVENT-DRIVEN — the item carries `auto_rule`. A real-world event fires
 *      `fireActionBoardRule`. If the item ALSO has a template_step_id we close
 *      that HQ task and let the trigger flip the item, so HQ and the board
 *      never disagree. Only when there is no HQ task do we write the item
 *      directly — "Kickoff call attended" has none by design.
 *
 * Every rule keys on `item_key` / `auto_rule`, never on item text. Board
 * wording differs by client vintage (Altura's board predates Umia's), so a
 * text match would silently miss.
 */

export type ActionBoardRule =
  | 'form_submitted'
  | 'portal_first_visit'
  | 'first_call_note'
  | 'client_tracker_visit'
  | 'first_content_link'
  | 'first_metrics_pull'
  | 'approval_48h'
  | 'content_live_48h';

/**
 * Internal-team email domains.
 *
 * Both are needed. `portal_visits.is_external` is computed as
 * `!email.endsWith('@holohive.io')` — one domain — while /clients filters
 * internal traffic on both. That inconsistency means a @holohive.agency
 * teammate opening a client portal currently reads as an external visit. If
 * the portal rule trusted `is_external`, our own team would tick the client's
 * board. Check the address here instead.
 */
const INTERNAL_EMAIL_DOMAINS = ['@holohive.io', '@holohive.agency'];

export function isInternalEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const e = email.toLowerCase().trim();
  return INTERNAL_EMAIL_DOMAINS.some(d => e.endsWith(d));
}

type FireResult = {
  fired: number;      // items that actually moved
  viaTask: number;    // closed the HQ task, trigger flips the item
  direct: number;     // no HQ task, item written directly
  skipped: number;    // already done, or client has no such item
};

/**
 * Fire an event rule for one client. Idempotent: already-done items are left
 * alone, so replaying a signal (the portal logs a row on every visit, not just
 * the first) is harmless.
 */
export async function fireActionBoardRule(
  supabase: SupabaseClient,
  clientId: string,
  rule: ActionBoardRule,
): Promise<FireResult> {
  const out: FireResult = { fired: 0, viaTask: 0, direct: 0, skipped: 0 };
  if (!clientId) return out;

  const { data: items, error } = await supabase
    .from('client_action_items')
    .select('id, item_key, template_step_id, is_done')
    .eq('client_id', clientId)
    .eq('auto_rule', rule)
    .eq('is_done', false);

  if (error) {
    console.error(`[ActionBoard] ${rule}: lookup failed for client ${clientId}`, error.message);
    return out;
  }
  if (!items?.length) return out;

  const nowIso = new Date().toISOString();

  for (const item of items) {
    // Prefer closing the HQ task — keeps HQ authoritative and lets the
    // existing trigger do the write, so the board can never drift from HQ.
    if (item.template_step_id) {
      const { data: task } = await supabase
        .from('tasks')
        .select('id, status')
        .eq('client_action_item_id', item.id)
        .neq('status', 'complete')
        .limit(1)
        .maybeSingle();

      if (task?.id) {
        const { error: taskErr } = await supabase
          .from('tasks')
          .update({ status: 'complete', completed_at: nowIso, updated_at: nowIso })
          .eq('id', task.id);
        if (!taskErr) { out.fired++; out.viaTask++; continue; }
        console.error(`[ActionBoard] ${rule}: task close failed`, taskErr.message);
      }
      // Fall through: mapped to a step but no task exists for this client yet
      // (the SOP was never run, or ran before linking shipped). Writing the
      // item directly is better than leaving a real-world event unrecorded.
    }

    const { error: itemErr } = await supabase
      .from('client_action_items')
      .update({
        is_done: true,
        completed_at: nowIso,
        completion_source: rule === 'approval_48h' || rule === 'content_live_48h'
          ? 'auto_48h'
          : 'auto_event',
        updated_at: nowIso,
      })
      .eq('id', item.id)
      .eq('is_done', false);   // re-check: another path may have won the race

    if (itemErr) {
      console.error(`[ActionBoard] ${rule}: item update failed`, itemErr.message);
      out.skipped++;
    } else {
      out.fired++;
      out.direct++;
    }
  }

  if (out.fired > 0) {
    console.log(`[ActionBoard] ${rule} → client ${clientId}: ${out.fired} item(s) (${out.viaTask} via task, ${out.direct} direct)`);
  }
  return out;
}

/**
 * Resolve which board item a freshly-spawned SOP task belongs to, so the
 * trigger has something to act on when the task is completed.
 *
 * Returns the action item id, or null when this client's board has no item
 * mapped to that step — normal for clients on an older board vintage, and for
 * SOP steps that were never meant to surface to the client.
 */
export async function resolveActionItemForStep(
  supabase: SupabaseClient,
  clientId: string,
  templateStepId: string,
): Promise<string | null> {
  if (!clientId || !templateStepId) return null;

  const { data, error } = await supabase
    .from('client_action_items')
    .select('id')
    .eq('client_id', clientId)
    .eq('template_step_id', templateStepId)
    .eq('is_hidden', false)
    .order('display_order', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    // Not fatal: a task that spawns without a board link still works, it just
    // won't auto-flip. Never block task creation on this.
    console.error('[ActionBoard] step→item resolve failed', error.message);
    return null;
  }
  return data?.id ?? null;
}

/**
 * Batch variant for the spawn paths, which create a whole step tree at once.
 * One query instead of N.
 */
export async function resolveActionItemsForSteps(
  supabase: SupabaseClient,
  clientId: string,
  templateStepIds: string[],
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (!clientId || !templateStepIds.length) return map;

  const { data, error } = await supabase
    .from('client_action_items')
    .select('id, template_step_id, display_order')
    .eq('client_id', clientId)
    .in('template_step_id', templateStepIds)
    .eq('is_hidden', false)
    .order('display_order', { ascending: true });

  if (error) {
    console.error('[ActionBoard] batch step→item resolve failed', error.message);
    return map;
  }
  for (const row of data || []) {
    // First wins — two board items can share a step (M1's "form shared" and
    // "workspace initialized" both hang off task 1), and the task can only
    // carry one link. display_order makes the choice deterministic.
    if (row.template_step_id && !map.has(row.template_step_id)) {
      map.set(row.template_step_id, row.id);
    }
  }
  return map;
}
