/**
 * The canonical task_type vocabulary.
 *
 * `tasks.task_type` has no CHECK constraint, so a list like this is the only
 * thing keeping the column tidy. Three near-copies already exist inline
 * (app/tasks/page.tsx, components/tasks/TaskDetailModal.tsx,
 * app/templates/_tabs/TaskTemplatesTab.tsx) and they have ALREADY diverged —
 * TaskTemplatesTab additionally offers 'Client SOP'. Repointing them here
 * would change what those pickers offer, so that reconciliation is left as a
 * deliberate decision rather than folded into an unrelated change.
 *
 * Live data also holds values that predate any of these lists ('Internal' on
 * 6 tasks + 3 template steps, 'Client SOP' on 8 template steps). Pickers
 * should union this list with whatever the record already holds rather than
 * silently dropping an off-list value on edit.
 */
export const TASK_TYPES = [
  'Admin & Operations',
  'Finance & Invoicing',
  'General',
  'Tech & Tools',
  'Marketing & Sales',
  'Client Delivery',
  'Performance Review',
  'Research & Analytics',
] as const;

export type TaskType = typeof TASK_TYPES[number];
