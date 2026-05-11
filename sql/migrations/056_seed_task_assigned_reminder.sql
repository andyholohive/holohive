-- Migration 056: Seed the task_assigned reminder rule.
--
-- Event-driven (fires inline from /api/tasks/notify-assignment, NOT
-- the daily reminder cron). Surfacing it in /reminders gives users one
-- place to toggle whether assignment DMs go out at all — flipping
-- is_active=false short-circuits the notify endpoint without a deploy.

INSERT INTO reminder_rules (name, rule_type, description, telegram_chat_id, schedule_type, params)
SELECT
  'Task Assignment',
  'task_assigned',
  'DM the assignee on Telegram whenever a task is assigned (or reassigned). Fires inline when the assignment is saved — not on a schedule.',
  'PLACEHOLDER_CHAT_ID',
  'on_event',
  '{}'::jsonb
WHERE NOT EXISTS (
  SELECT 1 FROM reminder_rules WHERE rule_type = 'task_assigned'
);
