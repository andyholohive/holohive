-- Migration 073: kol_channel_snapshots — monthly channel-health snapshots.
--
-- Phase 3 of the May 2026 KOL overhaul spec. One row per (kol, month).
-- Two of the five composite-Score dimensions (Channel Health, Growth
-- Trajectory) read from this table; the other three (Engagement
-- Quality, Reach Efficiency, Activation Impact) read from
-- kol_deliverables (mig 072).
--
-- Spec quote:
--   "Auto-pulled for public channels, manual for private."
--
-- v1 ships with the manual path only. The "auto-pulled" half waits on
-- the data-source decision (Telegram Bot API vs scraping vs manual).
-- Whichever path lands, it'll insert into this same table — no schema
-- rev needed.
--
-- Computed columns (engagement_rate, follower_growth_pct):
--   The spec marks these "comp" — derived from the raw fields. We
--   could implement them as Postgres GENERATED columns, but the
--   formulas need cross-row context (engagement_rate = avg_views /
--   follower_count is single-row, but follower_growth_pct compares
--   THIS month to LAST month). Easier to compute client-side in the
--   scoring engine — see lib/kolScoringEngine.ts.
--
-- Uniqueness: one snapshot per (kol, month). The spec says
-- "snapshot_date = first of month" so we constrain on that as a
-- sanity check at the DB layer too.

CREATE TABLE IF NOT EXISTS kol_channel_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kol_id UUID NOT NULL REFERENCES master_kols(id) ON DELETE CASCADE,

  -- Always the first of the month per spec. We trust the input rather
  -- than enforce via CHECK (a CHECK constraint would block legitimate
  -- backfills with mid-month dates if the team ever wants finer
  -- granularity later).
  snapshot_date DATE NOT NULL,

  -- The one required metric. Without follower count there's nothing
  -- to anchor the rest of the math against — engagement_rate, growth,
  -- and reach all need it as a denominator/baseline.
  follower_count INTEGER NOT NULL,

  -- Engagement averages across the last 20 organic posts per spec.
  -- All optional — partial entries are still useful (a snapshot with
  -- just follower_count gates "Insufficient data" out at the scoring
  -- layer rather than at insert time).
  avg_views_per_post INTEGER,
  avg_forwards_per_post INTEGER,
  avg_reactions_per_post INTEGER,

  -- Posts per week (organic only).
  posting_frequency NUMERIC(5,2),

  -- Free text for any explanation needed (e.g. "took a 2-week break
  -- for vacation, posting frequency dipped"). Not a "rating" or
  -- "quality" field — same trap that killed master_kols.tier/.rating.
  notes TEXT,

  -- Audit. created_by = whoever logged the row (or null for auto-
  -- pulled snapshots once that path ships).
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- One snapshot per (kol, month). Lets us safely re-run an auto-pull
  -- without dupes — second insert at the same month becomes an UPSERT
  -- target (handled in the service layer, not here).
  CONSTRAINT uq_kol_snapshot_month UNIQUE (kol_id, snapshot_date)
);

-- Lookup: "this KOL's snapshot history for trend analysis" — most
-- common, hits the scoring engine.
CREATE INDEX IF NOT EXISTS idx_kol_snapshots_kol_date
  ON kol_channel_snapshots (kol_id, snapshot_date DESC);

COMMENT ON TABLE kol_channel_snapshots IS
  'Monthly channel-health snapshots per KOL. Two scoring dimensions (Channel Health, Growth Trajectory) read from here. Currently manual-entry only; auto-pull path waits on data-source decision.';

COMMENT ON COLUMN kol_channel_snapshots.snapshot_date IS
  'First of the month per spec. UNIQUE with kol_id so monthly auto-pulls can UPSERT safely.';

-- RLS: same pattern as kol_deliverables / kol_call_logs.
ALTER TABLE kol_channel_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY auth_read_kol_snapshots ON kol_channel_snapshots
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY auth_write_kol_snapshots ON kol_channel_snapshots
  FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY auth_update_kol_snapshots ON kol_channel_snapshots
  FOR UPDATE
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY auth_delete_kol_snapshots ON kol_channel_snapshots
  FOR DELETE
  USING (auth.uid() IS NOT NULL);
