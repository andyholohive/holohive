-- Migration 057: Internal-chat classification + soft-hide for telegram_chats.
--
-- Adds:
--   is_internal — flag chats as internal team/working chats (not for
--                 clients/leads/KOLs). Surfaced as a new "Internal" tab
--                 in /crm/telegram so internal chatter can be tracked
--                 without polluting the unassigned/leads views.
--   is_hidden   — soft-hide a chat from every list. Useful for noisy
--                 chats nobody wants in their feed but that we don't
--                 want to hard-delete (the webhook would just recreate
--                 the row on the next message).
--
-- Soft-hide chosen over hard-delete-only because deleting doesn't stop
-- new messages from re-creating the row. Both options are exposed in
-- the UI: "Hide" for stash-it-away, "Delete" for full removal.

ALTER TABLE telegram_chats
  ADD COLUMN IF NOT EXISTS is_internal BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_hidden   BOOLEAN NOT NULL DEFAULT false;

-- Indexes for the tab-filter queries that hit them most.
CREATE INDEX IF NOT EXISTS idx_telegram_chats_is_internal
  ON telegram_chats (is_internal) WHERE is_internal = true;
CREATE INDEX IF NOT EXISTS idx_telegram_chats_is_hidden
  ON telegram_chats (is_hidden) WHERE is_hidden = true;
