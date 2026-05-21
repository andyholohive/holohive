-- Migration 078: campaigns.current_phase — manually-set phase label
-- for the Client Portal "Campaign Live" hero.
--
-- The May 2026 portal spec (HoloHive Portal Campaign View v1) adds a
-- pill-styled phase badge to the active-campaign hero, e.g.
-- "Seeding Phase", "Amplification Phase", "Activation Phase".
--
-- v1: free text set manually by the CM during campaign management.
-- v2 (later): auto-advance by date ranges defined per campaign.
--
-- NULL means no badge is shown (graceful degradation — the hero still
-- renders without it).
--
-- Lifecycle:
--   - Set during initial campaign setup or whenever the CM advances a
--     campaign through phases.
--   - Read once per portal page load in the Campaign Live hero block.

ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS current_phase TEXT;

COMMENT ON COLUMN campaigns.current_phase IS
  'Manually-set phase label shown in the Client Portal Campaign Live hero (e.g. "Seeding Phase"). NULL = no badge shown. v1 manual entry; v2 may auto-advance by date.';
