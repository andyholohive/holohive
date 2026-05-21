-- Migration 079: campaign_weekly_snapshots — historical metric snapshots
-- for the Client Portal's Stats Row trend arrows.
--
-- Why a dedicated snapshot table instead of computing on the fly:
--   "Δ vs last week" requires KNOWING what last week's numbers were.
--   The contents.impressions field is current-state (updates as the
--   post accrues views), so we can't reconstruct historical state from
--   it. We have to LOG a snapshot at a fixed point in time.
--
-- Cadence: cron writes one row per active campaign per Monday 00:00 UTC.
-- ON CONFLICT keeps re-runs idempotent (Vercel cron can retry; admin
-- can manually trigger).
--
-- Read pattern: portal looks up the snapshot from ~7 days ago per
-- campaign to compute week-over-week deltas on:
--   - kols_activated (raw Δ)
--   - content_live   (raw Δ)
--   - impressions    (% Δ)
--   - engagements    (% Δ)

CREATE TABLE IF NOT EXISTS campaign_weekly_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,

  -- Day the snapshot was taken (UTC date). One snapshot per campaign
  -- per day max — the UNIQUE constraint enforces this.
  snapshot_date DATE NOT NULL,

  -- Mirror of the 4 Stats Row metrics, frozen at snapshot time.
  kols_activated INTEGER NOT NULL DEFAULT 0,
  content_live   INTEGER NOT NULL DEFAULT 0,
  impressions    INTEGER NOT NULL DEFAULT 0,
  engagements    INTEGER NOT NULL DEFAULT 0,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- One snapshot per (campaign, day). Re-running the cron upserts
  -- rather than appending duplicates.
  CONSTRAINT campaign_weekly_snapshots_unique UNIQUE (campaign_id, snapshot_date)
);

-- "Find the prior snapshot for this campaign" — the hot path the
-- portal hits on every Live mode render.
CREATE INDEX IF NOT EXISTS idx_campaign_weekly_snapshots_campaign_date
  ON campaign_weekly_snapshots (campaign_id, snapshot_date DESC);

ALTER TABLE campaign_weekly_snapshots ENABLE ROW LEVEL SECURITY;

-- Service-role writes (cron); public read (portal needs it).
-- No write policy for anon — only the service role from the cron
-- inserts rows.
CREATE POLICY public_read_campaign_weekly_snapshots
  ON campaign_weekly_snapshots
  FOR SELECT
  USING (true);

COMMENT ON TABLE campaign_weekly_snapshots IS
  'Weekly metric snapshots per campaign. Written by /api/cron/campaign-weekly-snapshot every Monday 00:00 UTC. Read by the Client Portal to compute week-over-week trend deltas on the Stats Row.';
