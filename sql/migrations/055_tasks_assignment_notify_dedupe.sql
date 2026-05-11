-- Migration 055: Dedupe column for task-assignment Telegram notifications.
--
-- When a task is assigned (or re-assigned) we DM the new assignee on
-- Telegram. To avoid double-DMs on minor edits (status changes, priority
-- bumps, etc. that don't touch the assignee), we track which user we've
-- already notified for the current assignment in last_assignee_notified_to.
--
-- Logic in /api/tasks/notify-assignment:
--   - if assigned_to == last_assignee_notified_to → skip (already DM'd this person)
--   - else → DM them, then set last_assignee_notified_to := assigned_to
-- When the task gets reassigned to someone else, the field updates and
-- the next notify call fires for the new person.

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS last_assignee_notified_to UUID REFERENCES users(id) ON DELETE SET NULL;
