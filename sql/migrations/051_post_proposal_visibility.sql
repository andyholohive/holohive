-- Migration 051: Post-proposal visibility fields on crm_opportunities
--
-- Adds the metadata needed to track deals after the proposal goes out:
--   - proposal_sent_at: when the proposal was actually sent (auto-set
--     by trigger when stage transitions to 'proposal_sent'; backfilled
--     from updated_at for opps already past that stage)
--   - expected_close_date / next_action_at: forecast & follow-up dates
--   - decision_maker_*: who's actually making the call on their side
--   - proposal_doc_url: link to the actual proposal artifact
--
-- The Forecast tab in /crm/sales-pipeline reads these to surface
-- at-risk deals (proposal_sent 14+ days ago with no recent activity).

ALTER TABLE crm_opportunities
  ADD COLUMN IF NOT EXISTS proposal_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS expected_close_date DATE,
  ADD COLUMN IF NOT EXISTS next_action_at DATE,
  ADD COLUMN IF NOT EXISTS next_action_notes TEXT,
  ADD COLUMN IF NOT EXISTS proposal_doc_url TEXT,
  ADD COLUMN IF NOT EXISTS decision_maker_name TEXT,
  ADD COLUMN IF NOT EXISTS decision_maker_role TEXT;

-- Index for at-risk queries (sort by oldest proposal first)
CREATE INDEX IF NOT EXISTS idx_crm_opps_proposal_sent_at
  ON crm_opportunities (proposal_sent_at DESC)
  WHERE proposal_sent_at IS NOT NULL;

-- Backfill: best-effort proposal_sent_at for opps already in/past
-- proposal_sent. We don't have stage-transition history, so use
-- updated_at as the proxy. Better than NULL — gives the Forecast tab
-- something to render and the user can correct manually if needed.
UPDATE crm_opportunities
   SET proposal_sent_at = updated_at
 WHERE proposal_sent_at IS NULL
   AND stage IN ('proposal_sent', 'proposal_call', 'v2_contract', 'v2_closed_won', 'v2_closed_lost');

-- Trigger: auto-set proposal_sent_at the first time stage transitions
-- to 'proposal_sent'. Won't overwrite if the field is already set, so
-- manual corrections stick.
CREATE OR REPLACE FUNCTION touch_proposal_sent_at()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.stage = 'proposal_sent'
     AND (OLD.stage IS DISTINCT FROM NEW.stage)
     AND NEW.proposal_sent_at IS NULL THEN
    NEW.proposal_sent_at := now();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_touch_proposal_sent_at ON crm_opportunities;
CREATE TRIGGER trg_touch_proposal_sent_at
  BEFORE UPDATE ON crm_opportunities
  FOR EACH ROW EXECUTE FUNCTION touch_proposal_sent_at();
