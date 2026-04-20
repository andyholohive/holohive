-- Migration 037: Payment terms per KOL
--
-- Fixes a bug where newly-added content auto-creates a payment row with amount = 0
-- for KOLs with no previous payment history. The app had no place to persist an
-- "agreed rate" for the KOL, so content creation had nothing to pre-fill with.
--
-- Adds:
--   - campaign_kols.agreed_rate  — the per-content rate agreed with this KOL for
--                                  this specific campaign (the one used to
--                                  pre-fill payment rows when content is added)
--   - master_kols.standard_rate  — the KOL's standard rate stored on the master
--                                  profile (the "mastersheet" value). Optionally
--                                  updated when someone sets new campaign terms.
--
-- Both are nullable because:
--   - standard_rate: some KOLs don't have a single rate (negotiated per campaign)
--   - agreed_rate:   gets set when status -> Onboarded, not at KOL-add time
-- A value of 0 means "intentionally free" (WL / comped), distinct from NULL
-- which means "not yet set".

ALTER TABLE campaign_kols
  ADD COLUMN IF NOT EXISTS agreed_rate NUMERIC;

ALTER TABLE master_kols
  ADD COLUMN IF NOT EXISTS standard_rate NUMERIC;

COMMENT ON COLUMN campaign_kols.agreed_rate IS
  'Agreed per-content USD rate for this KOL in this campaign. NULL = not yet set; used to pre-fill auto-created payment rows.';

COMMENT ON COLUMN master_kols.standard_rate IS
  'KOL mastersheet standard USD rate per content. NULL = no standard rate recorded.';
