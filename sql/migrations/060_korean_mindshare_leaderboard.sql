-- Migration 060: Korean mindshare leaderboard infrastructure.
--
-- Adds:
--   1. mindshare_projects — universal project ledger. Includes both
--      HoloHive clients and benchmark competitors (BTC, ETH, SOL,
--      Hyperliquid, etc.) so the Korean leaderboard can rank you
--      against the broader market.
--   2. mindshare_daily — daily mention rollups per project, indexed
--      for time-range queries (24h / 7d / 30d) and sparkline data.
--   3. project_id column on tg_mentions — canonical pointer going
--      forward; existing client_id rows preserved for backward compat.
--   4. mindshare_scan_state — singleton row tracking scan watermark
--      so the cron only processes new messages.
--   5. Seed mindshare_projects from existing client_mindshare_config.

CREATE TABLE IF NOT EXISTS mindshare_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  tracked_keywords JSONB NOT NULL DEFAULT '[]'::jsonb,
  category TEXT,
  is_pre_tge BOOLEAN NOT NULL DEFAULT false,
  twitter_handle TEXT,
  website_url TEXT,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mindshare_projects_active
  ON mindshare_projects (is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_mindshare_projects_client
  ON mindshare_projects (client_id) WHERE client_id IS NOT NULL;

CREATE OR REPLACE FUNCTION touch_mindshare_projects_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_touch_mindshare_projects ON mindshare_projects;
CREATE TRIGGER trg_touch_mindshare_projects
  BEFORE UPDATE ON mindshare_projects
  FOR EACH ROW EXECUTE FUNCTION touch_mindshare_projects_updated_at();

CREATE TABLE IF NOT EXISTS mindshare_daily (
  project_id UUID NOT NULL REFERENCES mindshare_projects(id) ON DELETE CASCADE,
  day DATE NOT NULL,
  mention_count INTEGER NOT NULL DEFAULT 0,
  channel_reach INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (project_id, day)
);

CREATE INDEX IF NOT EXISTS idx_mindshare_daily_day_desc
  ON mindshare_daily (day DESC, project_id);

ALTER TABLE tg_mentions
  ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES mindshare_projects(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_tg_mentions_project_date
  ON tg_mentions (project_id, message_date DESC) WHERE project_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS mindshare_scan_state (
  id INT PRIMARY KEY DEFAULT 1,
  last_scanned_message_date TIMESTAMPTZ,
  last_run_at TIMESTAMPTZ,
  last_run_mentions_added INTEGER,
  last_run_duration_ms INTEGER,
  CONSTRAINT mindshare_scan_state_singleton CHECK (id = 1)
);

INSERT INTO mindshare_scan_state (id) VALUES (1)
ON CONFLICT (id) DO NOTHING;

INSERT INTO mindshare_projects (name, client_id, tracked_keywords, is_active)
SELECT
  c.name,
  c.id,
  cmc.tracked_keywords,
  cmc.is_enabled
FROM client_mindshare_config cmc
JOIN clients c ON c.id = cmc.client_id
WHERE NOT EXISTS (
  SELECT 1 FROM mindshare_projects mp WHERE mp.client_id = c.id
);
