-- Migration 049: Google Calendar integration for meeting reminders
--
-- Adds:
--   1. google_oauth_tokens — per-user OAuth tokens (one row per user)
--   2. google_meeting_reminders_sent — dedupe table so we don't fire the
--      same reminder twice if the 5-min cron drifts
--   3. Seeds the google_meeting_reminder reminder_rules entry so it shows
--      up in /reminders alongside the other 10 rules
--
-- Why a dedicated dedupe table: the cron runs every 5 minutes and the
-- "10 min before" window is a 5-min slice. If a cron run is delayed or
-- a user adds an event between two runs, we want exactly-once semantics
-- per (user, event_id, reminder_kind). A simple primary key on
-- (user_id, google_event_id, reminder_kind) gives us that for free.

-- ── 1. OAuth tokens table ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS google_oauth_tokens (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  google_email TEXT NOT NULL,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  -- expires_at is updated every time we refresh; access_token is short-lived (~1h)
  expires_at TIMESTAMPTZ NOT NULL,
  scope TEXT NOT NULL,
  connected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_google_oauth_tokens_email ON google_oauth_tokens (google_email);

-- ── 2. Sent-reminder dedupe table ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS google_meeting_reminders_sent (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  google_event_id TEXT NOT NULL,
  -- 'before' = N minutes before meeting; 'start' = at meeting start
  reminder_kind TEXT NOT NULL CHECK (reminder_kind IN ('before', 'start')),
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  meeting_start_at TIMESTAMPTZ NOT NULL,
  meet_link TEXT,
  PRIMARY KEY (user_id, google_event_id, reminder_kind)
);

-- Periodic cleanup: events older than 30 days are dead weight.
-- (Could add a cron later; for now the index is enough.)
CREATE INDEX IF NOT EXISTS idx_gmrs_meeting_start
  ON google_meeting_reminders_sent (meeting_start_at);

-- ── 3. Seed the reminder rule ──────────────────────────────────────────
-- Uses on_event so the daily reminder cron skips it (the dedicated 5-min
-- cron at /api/cron/google-meeting-reminders evaluates it directly).
INSERT INTO reminder_rules (name, rule_type, description, telegram_chat_id, schedule_type, params)
SELECT
  'Google Meeting Reminders',
  'google_meeting_reminder',
  'DM each connected team member 10 min before + at the start of their Google Meet calendar events',
  'PLACEHOLDER_CHAT_ID',
  'on_event',
  '{"advance_minutes": 10, "send_at_start": true, "lookahead_minutes": 60}'::jsonb
WHERE NOT EXISTS (
  SELECT 1 FROM reminder_rules WHERE rule_type = 'google_meeting_reminder'
);

-- updated_at trigger for tokens table — keeps the column honest when we
-- refresh access tokens via the API.
CREATE OR REPLACE FUNCTION touch_google_oauth_tokens_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_google_oauth_tokens_updated_at ON google_oauth_tokens;
CREATE TRIGGER trg_google_oauth_tokens_updated_at
  BEFORE UPDATE ON google_oauth_tokens
  FOR EACH ROW EXECUTE FUNCTION touch_google_oauth_tokens_updated_at();
