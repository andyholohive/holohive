-- Migration 039: Discovery snapshot on prospects
--
-- Stores the full Discovery agent output per prospect: ICP verdict (PASS/FAIL/
-- BORDERLINE), the 6-criteria breakdown with evidence, the 0-100 prospect score
-- with its three sub-scores, the computed action tier, and rejection /
-- consideration reasons. Keeps Discovery's scoring separate from the Korea
-- Signals scoring (which writes to prospects.action_tier) so the two systems
-- don't overwrite each other.

ALTER TABLE prospects
  ADD COLUMN IF NOT EXISTS discovery_snapshot JSONB DEFAULT NULL;

COMMENT ON COLUMN prospects.discovery_snapshot IS
  'Latest Discovery agent qualification output: { icp_verdict, icp_checks, prospect_score, action_tier, disqualification_reason, consideration_reason, scanned_at }';
