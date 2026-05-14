-- Migration 070: Pending tasks for the /task confirm-flow.
--
-- The Telegram webhook is stateless per-message, but /task needs to
-- carry parsed-task data across two updates: the initial /task command
-- and the subsequent button-click (callback_query). Telegram's
-- callback_data is capped at 64 bytes, which won't hold a full parsed
-- task — it can only hold a UUID pointer. So: parse → INSERT pending
-- row → store the row's ID in the button's callback_data → on click
-- look up by ID, act, delete.
--
-- Lifecycle:
--   1. /task fires → parser INSERTs row, status='pending'
--   2. User clicks ✅ Create  → row read → tasks INSERTed → row DELETEd
--   3. User clicks ❌ Cancel  → row DELETEd
--   4. User does nothing      → row sits forever (harmless — see below)
--
-- We don't run a sweeper. Orphaned pending rows cost ~1KB each and
-- have no functional impact (the only consumer is the callback handler,
-- which only acts when the user clicks). If we ever care, a daily
-- "DELETE FROM pending_tasks WHERE created_at < now() - interval '1
-- day'" cron is one line; not worth building until volume justifies it.
--
-- created_by_user_id (FK to users.id) is the resolved app user, NOT
-- the raw Telegram from.id. This lets the callback handler verify "is
-- the clicker the same person who created this?" without re-resolving
-- the Telegram → users mapping on every click.

CREATE TABLE IF NOT EXISTS pending_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Who initiated /task. Used to gate ✅/❌ clicks — only the creator
  -- can confirm/cancel their own pending task.
  created_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Where the /task was typed — needed so the callback handler knows
  -- where to send the "Created T-068" / "Cancelled" follow-up message.
  -- Stored as text since Telegram chat IDs can be negative bigints
  -- and we're consistent with how telegram_chats stores them.
  origin_chat_id TEXT NOT NULL,
  origin_message_id BIGINT,
  origin_thread_id INTEGER,

  -- Parsed fields. JSONB because the shape will evolve (add categories,
  -- subtasks, etc.) and we don't want a migration for every prompt
  -- iteration. Always has: { task_name, assignee_user_id?, due_date?,
  -- description?, why?, good_looks_like? }.
  parsed JSONB NOT NULL,

  -- Raw input text — useful for debugging "why did Claude parse this
  -- weirdly" and for any future re-parse-with-corrections flow.
  raw_text TEXT NOT NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pending_tasks_created_by ON pending_tasks (created_by_user_id);
CREATE INDEX IF NOT EXISTS idx_pending_tasks_created_at ON pending_tasks (created_at);

-- RLS: pending_tasks is a server-side-only table. Webhook uses service-
-- role key, which bypasses RLS entirely. Lock down all client access
-- by enabling RLS with no policies — defense in depth in case anything
-- ever queries this with the anon key by mistake.
ALTER TABLE pending_tasks ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE pending_tasks IS
  'Parsed-but-not-yet-confirmed tasks from /task. One row per pending preview message; deleted on ✅ Create or ❌ Cancel.';
