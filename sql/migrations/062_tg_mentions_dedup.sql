-- Migration 062: Prevent duplicate mentions on re-scan / backfill.
--
-- The mindshare scanner walks telegram_messages and inserts a row into
-- tg_mentions for each (project, message) match. There's no
-- message_id FK back to telegram_messages, so the natural identity of
-- a mention is (project_id, message_text, message_date).
--
-- Without a unique constraint, hitting the Backfill button twice
-- would silently double the mention counts. Add a partial unique
-- index (only when project_id is set, since the table also stores
-- legacy non-project mentions for backward compat) and switch the
-- scanner to ON CONFLICT DO NOTHING.

CREATE UNIQUE INDEX IF NOT EXISTS uniq_tg_mentions_project_msg
  ON tg_mentions (project_id, message_date, md5(message_text))
  WHERE project_id IS NOT NULL;

-- Note: message_text can be very long; using md5() instead of the raw
-- text keeps the index entry small and within Postgres' 8KB row limit
-- for B-tree pages. Collisions on md5 within the same project + same
-- timestamp would be astronomically improbable.
