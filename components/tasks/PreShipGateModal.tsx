'use client';

/**
 * Pre-Ship Gate modal — Jdot's June 2026 v1 spec.
 *
 * Forcing function on completing a client-linked task. 5 always-visible
 * checkboxes, all required. "Go Back" cancels (task stays open).
 * "Complete Task" only enabled when all 5 are checked.
 *
 * Caller is responsible for:
 *   1. Deciding when to open the modal (task has client_id + status is
 *      transitioning to complete)
 *   2. Performing the actual status flip on confirm
 *   3. Writing the pre_ship_gate_log row on confirm (the helper below
 *      provides logPreShipGate())
 *
 * Why caller-owned writes: the same modal serves two intercept points
 * (TaskDetailModal handleSubmit + /tasks page saveSelectField). Each has
 * its own existing status-update mechanism we don't want to duplicate.
 * The modal handles UX; the caller handles persistence.
 */

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { ShieldCheck } from 'lucide-react';

// The 5 checkboxes, in order, with the verbatim spec text. Storing them
// here (not inside the JSX) so the same text can drive the TG /done
// inline-button flow without diverging.
export const PRE_SHIP_GATE_CHECKBOXES: Array<{
  key: 'check_1_read_not_skimmed' | 'check_2_makes_sense_to_client' | 'check_3_campaign_specific_insight' | 'check_4_clean_execution' | 'check_5_not_ai_replaceable';
  label: string;
  description: string;
}> = [
  {
    key: 'check_1_read_not_skimmed',
    label: 'I read the request, not skimmed it.',
    description:
      "The actual task, doc, or message, word by word. If something was crossed out, I didn't do it. If it built on a past discussion, I found what was decided and matched my work to it.",
  },
  {
    key: 'check_2_makes_sense_to_client',
    label: 'If the client saw this right now with zero explanation, it would work and make sense.',
    description:
      "For content: it stands on its own without our internal context. For platform work: I opened the client-facing URL, clicked through everything. Correct data, logical experience.",
  },
  {
    key: 'check_3_campaign_specific_insight',
    label: 'I can point to one insight, data point, or recommendation I could only produce by being on this campaign.',
    description:
      "Not just the client's name. A metric from this week, a pattern across their KOLs, a recommendation from the last call. If I can't find one, it's template work.",
  },
  {
    key: 'check_4_clean_execution',
    label: 'The execution is clean.',
    description:
      'Spelling, grammar, client name correct, numbers accurate, links functional, formatting consistent. For platform work: every button, field, and status tested.',
  },
  {
    key: 'check_5_not_ai_replaceable',
    label: 'The client could NOT get this from AI in 5 minutes.',
    description:
      'This contains thinking, context, or judgment that required being embedded in this campaign. Generic summaries, template language, and surface-level recommendations all fail this.',
  },
];

export type PreShipGateState = Record<
  typeof PRE_SHIP_GATE_CHECKBOXES[number]['key'],
  boolean
>;

const blankState = (): PreShipGateState =>
  PRE_SHIP_GATE_CHECKBOXES.reduce((acc, c) => {
    acc[c.key] = false;
    return acc;
  }, {} as PreShipGateState);

export function PreShipGateModal({
  open,
  taskName,
  onConfirm,
  onCancel,
  submitting = false,
}: {
  open: boolean;
  /** Used in the modal title for context — "Complete: {taskName}". */
  taskName: string | null;
  onConfirm: (state: PreShipGateState) => void;
  onCancel: () => void;
  /** True while the caller is writing the gate log + flipping status. */
  submitting?: boolean;
}) {
  const [state, setState] = useState<PreShipGateState>(blankState);

  // Reset the checkboxes whenever the modal opens — never carry state
  // from a previous task. (Edge case: user opens modal A, cancels,
  // opens modal B. Without this reset, B starts with A's state.)
  useEffect(() => {
    if (open) setState(blankState());
  }, [open]);

  const allChecked = PRE_SHIP_GATE_CHECKBOXES.every(c => state[c.key]);

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => { if (!o && !submitting) onCancel(); }}
    >
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-brand" />
            Pre-Ship Gate
          </DialogTitle>
          <DialogDescription>
            {taskName
              ? <>Before completing <span className="font-medium text-ink-warm-900">{taskName}</span>, confirm all 5. Required for client-linked work.</>
              : 'Before completing this task, confirm all 5. Required for client-linked work.'}
          </DialogDescription>
        </DialogHeader>

        <ul className="space-y-4 py-2">
          {PRE_SHIP_GATE_CHECKBOXES.map((c, idx) => (
            <li key={c.key} className="flex items-start gap-3">
              <Checkbox
                id={`psg-${c.key}`}
                checked={state[c.key]}
                onCheckedChange={(checked) =>
                  setState(prev => ({ ...prev, [c.key]: checked === true }))
                }
                className="mt-0.5"
                disabled={submitting}
              />
              <label
                htmlFor={`psg-${c.key}`}
                className="flex-1 cursor-pointer select-none"
              >
                <p className="text-sm font-medium text-ink-warm-900 leading-snug">
                  <span className="text-ink-warm-500 mr-1.5">{idx + 1}.</span>
                  {c.label}
                </p>
                <p className="text-xs text-ink-warm-600 mt-1 leading-relaxed">
                  {c.description}
                </p>
              </label>
            </li>
          ))}
        </ul>

        <DialogFooter className="border-t border-cream-200 pt-3">
          <Button
            variant="outline"
            size="sm"
            onClick={onCancel}
            disabled={submitting}
          >
            Go Back
          </Button>
          <Button
            variant="brand"
            size="sm"
            onClick={() => onConfirm(state)}
            disabled={!allChecked || submitting}
            title={!allChecked ? 'Check all 5 boxes to enable' : undefined}
          >
            {submitting ? 'Completing…' : 'Complete Task'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Helper used by both intercept points to write the append-only log
 * row on a successful gate pass. Caller still owns the status flip.
 *
 * Returns true on success, false on failure (caller decides whether to
 * roll back the status update or just surface a toast).
 */
export async function logPreShipGate(
  supabase: any,
  args: {
    taskId: string;
    state: PreShipGateState;
    completedBy: string | null;
    completedByName: string | null;
    viaSource: 'hq' | 'tg';
  },
): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('pre_ship_gate_log')
      .insert({
        task_id: args.taskId,
        completed_by: args.completedBy,
        completed_by_name: args.completedByName,
        via_source: args.viaSource,
        check_1_read_not_skimmed: args.state.check_1_read_not_skimmed,
        check_2_makes_sense_to_client: args.state.check_2_makes_sense_to_client,
        check_3_campaign_specific_insight: args.state.check_3_campaign_specific_insight,
        check_4_clean_execution: args.state.check_4_clean_execution,
        check_5_not_ai_replaceable: args.state.check_5_not_ai_replaceable,
      });
    if (error) {
      console.error('[PreShipGate] log insert failed:', error);
      return false;
    }
    return true;
  } catch (err) {
    console.error('[PreShipGate] log insert threw:', err);
    return false;
  }
}
