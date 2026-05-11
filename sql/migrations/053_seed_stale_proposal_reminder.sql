-- Migration 053: Seed the stale_proposal reminder rule.
--
-- Used by the daily reminder cron to surface post-proposal deals that
-- have been sitting unanswered. Pairs with the Forecast tab in
-- /crm/sales-pipeline (same "at-risk" definition).
--
-- Default thresholds: proposal sent ≥14 days ago + no activity ≥7 days.
-- Adjustable in /reminders → Edit. PLACEHOLDER_CHAT_ID skips actual
-- Telegram delivery until the user wires up a real chat.

INSERT INTO reminder_rules (name, rule_type, description, telegram_chat_id, schedule_type, params)
SELECT
  'Stale Proposal Follow-up',
  'stale_proposal',
  'Flag deals stuck in proposal_sent/proposal_call without recent activity. Drives the Forecast at-risk badge.',
  'PLACEHOLDER_CHAT_ID',
  'daily',
  '{"proposal_age_days": 14, "inactivity_days": 7}'::jsonb
WHERE NOT EXISTS (
  SELECT 1 FROM reminder_rules WHERE rule_type = 'stale_proposal'
);
