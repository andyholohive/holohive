-- ─────────────────────────────────────────────────────────────────────
-- 047_drop_tasks_task_type_check
-- ─────────────────────────────────────────────────────────────────────
--
-- Drop the tasks_task_type_check constraint.
--
-- Why: deliverable template steps reference task_type values (e.g.
-- 'Internal') that the constraint didn't allow. Creating a deliverable
-- whose template included an 'Internal' step would fail the constraint
-- and prevent the deliverable + sub-tasks from being inserted.
--
-- Two ways to fix:
--   1. Expand the constraint to include the missing value(s)
--   2. Drop the constraint entirely
--
-- Going with (2) because the valid-value vocabulary is managed by the
-- UI Selects on /tasks/templates and /tasks/deliverables/templates,
-- plus the deliverable_template_steps table. Every time the team adds
-- a new category in those UIs, the DB constraint would also need an
-- update — that's exactly the drift this fixes.
--
-- Validation moves to the application layer (the UI's TYPE_TONES /
-- typeBadge mappings + the Select option lists).
--
-- Idempotent: IF EXISTS so re-running is safe.

ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_task_type_check;

COMMENT ON COLUMN tasks.task_type IS
  'Free-text category. Vocabulary controlled by UI Selects + deliverable_template_steps (no DB check constraint as of 2026-05-07 — see migration 047). Common values: Admin & Operations, Finance & Invoicing, General, Tech & Tools, Marketing & Sales, Client Delivery, Performance Review, Research & Analytics, Internal, Client SOP.';
