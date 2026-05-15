-- Migration 071: KOL Database Overhaul, Phase 1.
--
-- Per the May 2026 spec ("HHP KOL Database Overhaul"). This migration
-- handles the cleanup half — Phase 2 (kol_deliverables) and Phase 3
-- (kol_channel_snapshots + scoring) are separate migrations.
--
-- Changes:
--   1. CUT: pricing tier (was column `tier`) and rating. Both were
--      "almost no one fills these in" per the spec; tier will be
--      replaced by an auto-derived tier badge from the Score (Phase 3),
--      rating by the composite Score itself.
--   2. ADD: community_link — paired with the existing `community`
--      boolean. Spec renames "Community" → "Community Founder" in the
--      UI; if a KOL is one, we want a link to their community.
--   3. ADD: projects_worked_together — free-text tag list per spec
--      ("Free text tags for v1"). v2 will link to Campaigns properly,
--      but v1 just stores chips on the row.
--   4. NEW TABLE: kol_call_logs — repeatable call entries on each KOL
--      profile. One row per call, reverse-chronological in the UI.
--      Fields lifted directly from the spec's Call Log table.
--
-- Deferred to Phase 2/3:
--   - kol_deliverables (Phase 2 — the per-brief tracking table)
--   - kol_channel_snapshots (Phase 3 — monthly health snapshots)
--   - score column / scoring formula (Phase 3 — depends on the above)
--
-- DROP COLUMN is irreversible. We're confident in cutting these because
-- (a) the spec explicitly says they're abandoned, (b) the data was
-- inconsistent so losing it isn't a real loss, (c) field cleanup is
-- the whole point of Phase 1. If this turns out to be wrong, the data
-- can be re-added later but won't be re-populated automatically.

ALTER TABLE master_kols
  DROP COLUMN IF EXISTS tier,
  DROP COLUMN IF EXISTS rating;

ALTER TABLE master_kols
  ADD COLUMN IF NOT EXISTS community_link TEXT,
  ADD COLUMN IF NOT EXISTS projects_worked_together TEXT[];

COMMENT ON COLUMN master_kols.community_link IS
  'URL of the KOL''s community/group when community=true. Paired with the "Community Founder" label in the /kols UI.';

COMMENT ON COLUMN master_kols.projects_worked_together IS
  'Free-text tag list of projects/clients this KOL has worked with. v1 = chips entered manually; v2 will derive from campaign_kols.';

-- Call log: one row per call with a KOL. Quazo / Andy fill these in
-- after onboarding/check-in calls so we have a paper trail of intel,
-- recommended angles, and feedback. Profile UI shows them reverse-
-- chronologically with an "Add Call Log" button at the top.
CREATE TABLE IF NOT EXISTS kol_call_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kol_id UUID NOT NULL REFERENCES master_kols(id) ON DELETE CASCADE,

  -- The call itself. Project is "dropdown or free text" per spec —
  -- text for v1, can wire to a campaigns FK later if needed.
  call_date DATE NOT NULL,
  project TEXT,
  call_type TEXT,  -- "First Onboarding" | "Repeat Onboarding" | "Check-in"

  -- Long-form fields. All optional — partial entries are useful;
  -- forcing all four would mean nothing gets logged.
  notes TEXT,
  market_intel TEXT,
  recommended_angle TEXT,
  feedback_on_hh TEXT,

  -- Audit. created_by is who logged the call (typically the person
  -- who took it); never auto-set so we can reassign retroactively.
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_kol_call_logs_kol_date
  ON kol_call_logs (kol_id, call_date DESC);

COMMENT ON TABLE kol_call_logs IS
  'One row per call with a KOL. Reverse-chronological on the KOL profile page; powers the "Call Log" section in the May 2026 KOL overhaul spec.';

-- RLS: same pattern as other admin-managed tables. Service-role
-- (server endpoints) bypasses RLS; the /kols UI runs as authed users.
-- For now, allow all authenticated reads + writes — tighten to admin-
-- only in a later migration if needed.
ALTER TABLE kol_call_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY auth_read_kol_call_logs ON kol_call_logs
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY auth_write_kol_call_logs ON kol_call_logs
  FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY auth_update_kol_call_logs ON kol_call_logs
  FOR UPDATE
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY auth_delete_kol_call_logs ON kol_call_logs
  FOR DELETE
  USING (auth.uid() IS NOT NULL);
