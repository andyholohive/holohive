-- ─────────────────────────────────────────────────────────────────────
-- 044_add_activity_direction_and_milestone_backfill
-- ─────────────────────────────────────────────────────────────────────
--
-- Two changes that together unlock the canonical 5-stage Sales funnel
-- (Outreach → Replies → Calls Booked → Calls Taken → Proposals) on
-- /crm/sales-pipeline:
--
--   1. Add `direction` column to crm_activities so we can distinguish
--      outbound (DMs the team sent) from inbound (replies received).
--      Without this, type='message' covers both and we have no way to
--      count replies. Defaults to 'outbound' so all 1500+ historical
--      rows get the correct value (the team has only ever logged
--      outbound activity manually — replies were never tracked).
--
--   2. Backfill the milestone columns on crm_opportunities from the
--      activity history so the funnel works for HISTORICAL data, not
--      just newly-logged activities. Specifically:
--        - last_team_message_at = MAX(created_at) of outbound message+bump
--        - proposal_sent_at     = MIN(created_at) of proposal activity
--                                 (only if currently null)
--      These columns existed in the schema but were never written —
--      the salesPipelineService now writes them on every createActivity.
--
-- Together these changes mean the funnel widget can read real numbers
-- for Outreach (outbound DMs), Replies (inbound DMs), and Proposals
-- (auto-stamped). Calls Booked + Calls Taken are derived from
-- crm_activities type='meeting' split by next_step_date — no schema
-- change needed for those.

-- ── 1. Add direction column ─────────────────────────────────────────
ALTER TABLE crm_activities
  ADD COLUMN IF NOT EXISTS direction text NOT NULL DEFAULT 'outbound'
    CHECK (direction IN ('outbound', 'inbound'));

-- Index for the funnel queries: COUNT(opportunity_id) WHERE direction
-- AND created_at >= since. The (direction, created_at) prefix lets
-- Postgres skip the heap entirely.
CREATE INDEX IF NOT EXISTS idx_crm_activities_direction_created
  ON crm_activities (direction, created_at DESC);

-- ── 2. Backfill last_team_message_at from activity history ─────────
-- Take MAX(created_at) per opp across outbound message+bump activities.
-- We DON'T overwrite values that are already set in case any other
-- code path populated them (currently no such path exists, but defensive).
UPDATE crm_opportunities o
SET last_team_message_at = sub.max_at
FROM (
  SELECT opportunity_id, MAX(created_at) AS max_at
  FROM crm_activities
  WHERE type IN ('message', 'bump')
    AND direction = 'outbound'
  GROUP BY opportunity_id
) sub
WHERE o.id = sub.opportunity_id
  AND o.last_team_message_at IS NULL;

-- ── 3. Backfill proposal_sent_at from activity history ─────────────
-- First proposal activity per opp = when the proposal was first sent.
-- Only fills NULLs so we don't clobber any manually-set values.
UPDATE crm_opportunities o
SET proposal_sent_at = sub.min_at
FROM (
  SELECT opportunity_id, MIN(created_at) AS min_at
  FROM crm_activities
  WHERE type = 'proposal'
  GROUP BY opportunity_id
) sub
WHERE o.id = sub.opportunity_id
  AND o.proposal_sent_at IS NULL;
