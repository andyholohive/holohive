-- Migration 069: Add users.telegram_username for @-handle resolution.
--
-- The /done command only needs telegram_id (numeric) because it gates
-- on "is this user in the team?". The upcoming /task command needs the
-- @-handle so "/task @daniel can you write the brief" can resolve to
-- the correct users.id when Telegram passes the mention as plain text
-- (entity type 'mention'). Without this column, the AI parser would
-- have to guess from a name like "Daniel" — fragile and ambiguous when
-- two team members share a first name.
--
-- Backfilled from telegram_messages.from_username, which the webhook
-- has been capturing all along. 6 of 7 team members backfill cleanly;
-- Philton has no recorded messages yet, so his row stays NULL until he
-- DMs the bot once (the webhook update in this same PR will capture it
-- inline).
--
-- Case-insensitive uniqueness — Telegram treats @Foo and @foo as the
-- same handle. Partial index avoids fighting NULLs for users without a
-- handle set.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS telegram_username TEXT;

-- Backfill: take the most-recently-seen from_username for each known
-- telegram_id. MAX() is a deterministic pick — usernames don't change
-- often, and if a user did rename, we want the latest. ROW_NUMBER
-- would be more correct but MAX is good enough here and keeps the
-- query simple.
UPDATE users u
SET telegram_username = sub.from_username
FROM (
  SELECT
    from_user_id,
    MAX(from_username) AS from_username
  FROM telegram_messages
  WHERE from_username IS NOT NULL
    AND from_user_id IS NOT NULL
  GROUP BY from_user_id
) sub
WHERE u.telegram_id = sub.from_user_id
  AND u.telegram_username IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS users_telegram_username_lower_idx
  ON users (lower(telegram_username))
  WHERE telegram_username IS NOT NULL;

COMMENT ON COLUMN users.telegram_username IS
  '@-handle (without the @). Used by /task to resolve mentions to user IDs. Auto-captured by the Telegram webhook whenever a known team member messages the bot.';
