-- Migration 077: pending_bulk_tasks — staging table for the /bulk
-- multi-task confirm flow.
--
-- Why a new table instead of reusing pending_tasks (mig 070):
--   The single-/task pending row stores ONE parsed task. The /bulk
--   flow needs to stage many tasks across multiple clients with
--   per-task issues/warnings. Different shape, different lifecycle
--   (one click confirms ALL tasks in the batch, not one at a time),
--   so a separate table keeps both flows clean.
--
-- Lifecycle:
--   1. /bulk → parser → INSERT pending_bulk_tasks row
--   2. Bot posts preview with [✅ Create all] / [❌ Cancel] buttons
--   3. User clicks ✅ → callback inserts N tasks atomically + DELETEs
--      the pending row
--   4. User clicks ❌ → callback DELETEs the pending row
--
-- Multi-assignee design note:
--   tasks has only `assigned_to` (single user), no co_owner_ids array.
--   When the parser sees multiple @-mentions on one line, the FIRST
--   becomes the primary assignee and the rest are recorded in the
--   task's description as "Co-owners: @handle, @handle". Preserves
--   the team-side intent without forcing a schema change or
--   exploding into N duplicate tasks.
--
-- Already-complete markers (✅ in the input):
--   Parser flags these as `is_complete: true`. Callback SKIPS them
--   at insert time — they don't pollute the active task list. The
--   preview still shows them with a "done" badge so the user can
--   verify the parser caught all the right ones before confirming.

CREATE TABLE IF NOT EXISTS pending_bulk_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Who typed /bulk. Used to anti-grief the confirm callback (only
  -- this user can ✅/❌ the batch).
  created_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Where /bulk was typed — needed so the callback can reply in the
  -- correct chat/topic.
  origin_chat_id TEXT NOT NULL,
  origin_message_id BIGINT,
  origin_thread_id INTEGER,

  -- Full parsed structure. Shape:
  --   {
  --     sections: [{
  --       client_name: string,
  --       client_id: string | null,    // resolved or null if no match
  --       tasks: [{
  --         task_name: string,
  --         due_date: string | null,    // YYYY-MM-DD
  --         primary_assignee_id: string | null,
  --         primary_assignee_name: string | null,
  --         co_owner_handles: string[], // for the description footer
  --         is_complete: boolean,        // skip on insert when true
  --         notes: string | null
  --       }]
  --     }],
  --     issues: [{ severity: 'warn' | 'error', message: string }]
  --   }
  parsed JSONB NOT NULL,

  -- Original message body — kept for debugging the parser when it
  -- misroutes. Easier than re-tracing through Claude logs.
  raw_text TEXT NOT NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pending_bulk_tasks_created_by
  ON pending_bulk_tasks (created_by_user_id);
CREATE INDEX IF NOT EXISTS idx_pending_bulk_tasks_created_at
  ON pending_bulk_tasks (created_at);

ALTER TABLE pending_bulk_tasks ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE pending_bulk_tasks IS
  'Staged parse results from /bulk command. Rows are deleted on Create or Cancel; orphaned rows are harmless (no consumer beyond the callback). Service-role webhook bypasses RLS.';
