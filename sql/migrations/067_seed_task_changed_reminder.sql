-- Migration 067: Seed the task_changed reminder rule.
--
-- Event-driven companion to task_assigned (migration 056). Fires inline
-- from /api/tasks/notify-changed whenever status / due_date / assigned_to
-- moves on a task — gives the team one chat to watch for "what shifted
-- today" without requiring everyone to keep the /tasks page open.
--
-- Surfacing it in /reminders means the user can:
--   - swap the destination chat without a deploy
--   - flip is_active=false to silence announcements during heavy edit
--     sessions (e.g. the weekly retro where we re-shuffle a lot of dates)
--
-- Chat ID is a placeholder; user fills in the real one from /reminders
-- after migration runs.

INSERT INTO reminder_rules (name, rule_type, description, telegram_chat_id, schedule_type, params)
SELECT
  'Task Auto-Shift Announcer',
  'task_changed',
  'Posts to a shared chat whenever a task''s status, due date, or assignee changes. Fires inline from the save handler — not on a schedule. Toggle is_active=false to silence without deploying.',
  'PLACEHOLDER_CHAT_ID',
  'on_event',
  '{}'::jsonb
WHERE NOT EXISTS (
  SELECT 1 FROM reminder_rules WHERE rule_type = 'task_changed'
);
