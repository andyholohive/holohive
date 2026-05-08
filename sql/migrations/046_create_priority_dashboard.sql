-- ─────────────────────────────────────────────────────────────────────
-- 046_create_priority_dashboard
-- ─────────────────────────────────────────────────────────────────────
--
-- Foundations for the Priority Dashboard feature (the company-operating
-- view at /dashboard, replacing the misnamed "Infrastructure Spend"
-- panel I built in May from a misread of the requirements).
--
-- Three tables / one column added:
--
-- 1. dashboard_snapshots  — one row per weekly run. Stores the LLM-
--                           synthesized output (KPIs, objectives, time
--                           allocation, client health, initiatives,
--                           coordination conflicts) as a JSONB payload.
--                           Refresh-now creates/replaces the current
--                           week's row; Monday cron does the same.
--
-- 2. dashboard_self_reports — captures each team member's weekly check-
--                             in (top focus, blockers, next-week plan).
--                             Filled via /dashboard/check-in form;
--                             the bot DMs each member Sunday evening
--                             with the link.
--
-- 3. telegram_chats.dashboard_role — tags a chat as 'ops' / 'client' /
--                                    'team_personal' / null so the
--                                    Monday LLM run knows which message
--                                    histories to feed it.
--
-- Why split self-reports from snapshots: snapshots are LLM output
-- (regenerable), self-reports are user-entered ground truth (must
-- never be lost). Different lifecycle, different table.

-- ── 1. dashboard_snapshots ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dashboard_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Monday-of-the-week (date) the snapshot represents. UNIQUE so
  -- re-running for the same week replaces the existing row instead of
  -- creating duplicates.
  week_of DATE NOT NULL UNIQUE,

  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- 'cron' = automatic Monday refresh, 'manual' = user clicked
  -- "Refresh Now" on /dashboard.
  generation_method TEXT NOT NULL DEFAULT 'cron'
    CHECK (generation_method IN ('cron', 'manual')),

  -- Full LLM output. Shape (loose, the page renderer is the contract):
  --   {
  --     kpis: { active_clients, pipeline_count, qualified_leads_per_week, ... },
  --     objectives: [{category, title, owners, description}],
  --     time_allocation: { [user_id]: { role, items: [{name, pct}], callout? }},
  --     client_health: [{client, phase, lead, this_week}],
  --     initiative_health: [{name, status, owners}],
  --     coordination: [{type: 'conflict'|'handoff'|'overlap', text, people}]
  --   }
  payload JSONB NOT NULL,

  -- What the LLM analysis used as input — counts of chats / messages /
  -- self-reports it had to work with. Surfaced in the UI so the team
  -- can tell at a glance whether the snapshot was data-rich or thin.
  source_summary JSONB,

  cost_usd NUMERIC(10, 4),

  -- Who triggered a manual refresh (null for cron runs).
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dashboard_snapshots_week
  ON dashboard_snapshots (week_of DESC);

-- ── 2. dashboard_self_reports ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dashboard_self_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Monday of the week this check-in is for. UNIQUE per (user, week)
  -- so resubmits update instead of duplicate.
  week_of DATE NOT NULL,

  -- When the bot sent the DM prompt. Null if the user filled the form
  -- without being prompted (manual nav to /dashboard/check-in).
  prompted_at TIMESTAMPTZ,

  -- When the user submitted the form.
  responded_at TIMESTAMPTZ,

  -- Top 3 things they spent time on this week. Stored as text[] so the
  -- LLM aggregator can iterate cleanly and rank.
  primary_focus TEXT[],

  -- "What's blocked or waiting on someone else?" — open text.
  blockers TEXT,

  -- "What's on the docket for next week?" — open text.
  next_week TEXT,

  -- Optional: the team member can add anything else they want surfaced
  -- to the dashboard (a flag, a callout, a celebration).
  notes TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (user_id, week_of)
);

CREATE INDEX IF NOT EXISTS idx_dashboard_self_reports_week
  ON dashboard_self_reports (week_of DESC, user_id);

-- ── 3. telegram_chats.dashboard_role ─────────────────────────────────
-- Tag each chat for what it represents to the dashboard analyzer:
--   'ops'           — internal Ops chat (cross-functional team coord)
--   'client'        — a per-client group chat (also linked via opportunity_id/master_kol_id)
--   'team_personal' — a team member's DM with the bot (for self-reports)
--   null            — chat exists but isn't part of the dashboard input
ALTER TABLE telegram_chats
  ADD COLUMN IF NOT EXISTS dashboard_role TEXT
    CHECK (dashboard_role IN ('ops', 'client', 'team_personal'));

CREATE INDEX IF NOT EXISTS idx_telegram_chats_dashboard_role
  ON telegram_chats (dashboard_role) WHERE dashboard_role IS NOT NULL;

COMMENT ON TABLE dashboard_snapshots IS
  'Weekly Priority Dashboard snapshots — LLM-synthesized company-operating view. One row per week. Read by /dashboard.';
COMMENT ON TABLE dashboard_self_reports IS
  'Per-user weekly check-ins (top focus / blockers / next-week). Filled via /dashboard/check-in form, prompted by Sunday-evening DM cron.';
COMMENT ON COLUMN telegram_chats.dashboard_role IS
  'Tags this chat as input to the priority dashboard LLM analyzer. Set via /crm/telegram chat manager.';
