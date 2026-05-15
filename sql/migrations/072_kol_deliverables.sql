-- Migration 072: kol_deliverables — per-brief outcome tracking.
--
-- The May 2026 KOL overhaul spec, Phase 2. One row per brief delivered
-- to a KOL. Quazo/Jeremyin fills these in after checking post links.
-- This is the data source for the Phase 3 composite Score (engagement
-- quality + reach efficiency + activation impact dimensions all read
-- from these rows).
--
-- Design choices per the spec:
--   - Only objective, trackable fields. NO subjective ratings or notes
--     that "won't get filled consistently" (the same trap that killed
--     master_kols.tier and .rating in migration 071).
--   - Numeric metrics are nullable — we want partial entries to be
--     useful. A brief with just `views_24h` filled is better than no
--     row at all.
--   - brief_number is a sequence within (kol_id, campaign_id) so
--     "first brief for X on campaign Y" is just `brief_number = 1`.
--     Manual for v1; could automate later via a trigger.
--   - post_link is the canonical reference — if you don't have the
--     link, you can't verify the metrics, so the row probably
--     shouldn't exist. That's why it's NOT NULL.
--
-- What this enables (Phase 3):
--   - Composite Score: views_24h / followers, forwards / views, etc.
--   - "Insufficient data" gating until the KOL has 3+ rows
--   - Per-campaign deliverable breakdowns in client portals
--
-- Naming: kol_deliverables (plural) follows the convention of
-- kol_call_logs (mig 071), kol_channel_snapshots (Phase 3, coming).
-- Don't confuse with the existing `deliverables` table (different
-- concept — that one is project-management deliverables tied to
-- deliverable_templates, not KOL post tracking).

CREATE TABLE IF NOT EXISTS kol_deliverables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- The two parties in the deliverable. Both required because a
  -- deliverable always exists in the context of (this KOL, this
  -- campaign). ON DELETE CASCADE so cleaning up either side cleans up
  -- the deliverable rows automatically.
  kol_id UUID NOT NULL REFERENCES master_kols(id) ON DELETE CASCADE,
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,

  -- Sequencing within the (kol, campaign) pair. Manual integer for v1
  -- — not auto-generated because Quazo might log brief #2 before brief
  -- #1 if she's catching up retroactively.
  brief_number INTEGER NOT NULL,

  -- Short label for the brief — what the KOL was asked to post about.
  -- Free text because campaigns rarely have neat per-brief topic names
  -- in HHP today. Will normalize later if it matters.
  brief_topic TEXT NOT NULL,

  -- The post itself. Required — without a link, no metrics are
  -- verifiable, no row should exist.
  post_link TEXT NOT NULL,

  -- Timestamps. brief_sent comes from the campaign management flow;
  -- posted comes from when the KOL actually published. Both required
  -- because the time delta between them is itself a useful signal
  -- (slow-poster KOLs, etc.) — Phase 3 might use this.
  date_brief_sent TIMESTAMPTZ NOT NULL,
  date_posted TIMESTAMPTZ NOT NULL,

  -- Engagement metrics. All optional. Phase 3's scoring formula
  -- defensively handles nulls (KOL with 5 rows where 3 have full
  -- metrics and 2 are partial = still scoreable).
  views_24h INTEGER,
  views_48h INTEGER,
  forwards INTEGER,
  reactions INTEGER,
  activation_participants INTEGER,

  -- Free-form context. NOT a "rating" or "quality" — just notes about
  -- anomalies ("KOL switched account mid-campaign", "viral organic
  -- repost added 50K views").
  notes TEXT,

  -- Audit trail. created_by = whoever logged the row (Quazo most of
  -- the time). updated_at gets bumped by the app on edit, not a
  -- trigger — keeps the migration minimal.
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Lookup patterns:
--   - "all deliverables for this KOL" — most common, hits Phase 3 score recalc
--   - "all deliverables for this campaign" — for campaign-level reporting
--   - "this KOL's deliverables for this campaign in order" — KOL profile view
CREATE INDEX IF NOT EXISTS idx_kol_deliverables_kol
  ON kol_deliverables (kol_id, date_posted DESC);

CREATE INDEX IF NOT EXISTS idx_kol_deliverables_campaign
  ON kol_deliverables (campaign_id, date_posted DESC);

CREATE INDEX IF NOT EXISTS idx_kol_deliverables_kol_campaign_brief
  ON kol_deliverables (kol_id, campaign_id, brief_number);

COMMENT ON TABLE kol_deliverables IS
  'One row per brief delivered to a KOL within a campaign. Phase 2 of the May 2026 KOL overhaul. Powers the composite Score in Phase 3 (engagement quality, reach efficiency, activation impact dimensions all sourced from here).';

COMMENT ON COLUMN kol_deliverables.brief_number IS
  'Sequence within (kol_id, campaign_id). Manual integer; not auto-generated to allow retroactive logging out of order.';

COMMENT ON COLUMN kol_deliverables.post_link IS
  'Required. No link means no verifiable metrics, so no row should exist.';

-- RLS: same pattern as kol_call_logs (mig 071). Authenticated users
-- can read/write; service-role bypasses entirely. Tighten to admin
-- only later if we add that distinction.
ALTER TABLE kol_deliverables ENABLE ROW LEVEL SECURITY;

CREATE POLICY auth_read_kol_deliverables ON kol_deliverables
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY auth_write_kol_deliverables ON kol_deliverables
  FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY auth_update_kol_deliverables ON kol_deliverables
  FOR UPDATE
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY auth_delete_kol_deliverables ON kol_deliverables
  FOR DELETE
  USING (auth.uid() IS NOT NULL);
