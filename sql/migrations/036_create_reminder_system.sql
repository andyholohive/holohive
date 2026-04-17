-- Migration 036: Create reminder system tables
-- Supports 10 reminder types with configurable TG chatroom routing

CREATE TABLE IF NOT EXISTS reminder_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  rule_type TEXT NOT NULL,
  description TEXT,
  telegram_chat_id TEXT NOT NULL,
  telegram_thread_id INTEGER,
  schedule_type TEXT NOT NULL DEFAULT 'daily',
  params JSONB NOT NULL DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_run_at TIMESTAMPTZ,
  last_run_result JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS reminder_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id UUID NOT NULL REFERENCES reminder_rules(id) ON DELETE CASCADE,
  run_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  items_found INTEGER NOT NULL DEFAULT 0,
  message_sent BOOLEAN NOT NULL DEFAULT false,
  message_text TEXT,
  error TEXT,
  duration_ms INTEGER
);

CREATE INDEX IF NOT EXISTS idx_reminder_rules_active ON reminder_rules (is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_reminder_rules_type ON reminder_rules (rule_type);
CREATE INDEX IF NOT EXISTS idx_reminder_logs_rule ON reminder_logs (rule_id, run_at DESC);

-- Seed default rules (placeholder chat IDs — update with real ones)
INSERT INTO reminder_rules (name, rule_type, description, telegram_chat_id, schedule_type, params) VALUES
  ('KOL Stats Stale 90+ Days', 'kol_stats_stale', 'Alert when KOL stats haven''t been updated in 90+ days', 'PLACEHOLDER_CHAT_ID', 'daily', '{"threshold_days": 90}'),
  ('Client Check-in Reminder', 'client_checkin', 'Remind team members of upcoming client check-in meetings', 'PLACEHOLDER_CHAT_ID', 'daily', '{"advance_days": 1}'),
  ('CDL Needs Updating', 'cdl_needs_update', 'Flag clients with no recent delivery log entries', 'PLACEHOLDER_CHAT_ID', 'daily', '{"threshold_days": 14}'),
  ('Weekly CDL Review', 'weekly_cdl_review', 'Weekly reminder to review all client delivery logs', 'PLACEHOLDER_CHAT_ID', 'weekly', '{"day_of_week": 1}'),
  ('KOL Content Metrics Stale', 'content_metrics_stale', 'Published content with no metrics recorded', 'PLACEHOLDER_CHAT_ID', 'daily', '{"threshold_days": 7}'),
  ('Form/Link New Submission', 'form_submission', 'Route form submission notifications to specific chatroom', 'PLACEHOLDER_CHAT_ID', 'on_event', '{}'),
  ('CRM Follow-up Reminder', 'crm_followup', 'Remind to follow up on CRM opportunities with no recent contact', 'PLACEHOLDER_CHAT_ID', 'daily', '{"threshold_days": 7}'),
  ('Saturday Payment Reminder', 'payment_reminder', 'Published content with unpaid payments (excluding KOL Round campaigns)', 'PLACEHOLDER_CHAT_ID', 'saturday_only', '{"exclude_campaign_patterns": ["KOL Round"]}'),
  ('New KOL — Connect GC', 'new_kol_no_gc', 'New KOLs added without group chat connected', 'PLACEHOLDER_CHAT_ID', 'daily', '{"lookback_days": 7}'),
  ('New CRM Opp — Connect GC', 'new_crm_no_gc', 'New CRM opportunities without group chat connected', 'PLACEHOLDER_CHAT_ID', 'daily', '{"lookback_days": 7}');
