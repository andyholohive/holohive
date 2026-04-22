-- Migration 038: Per-prospect outreach contacts
--
-- Adds structured contact info for decision-makers on each prospect
-- (founders, BD leads, CMOs, etc.) — distinct from the project's public
-- Telegram channel. The Discovery agent writes into this when it finds
-- a team member's handle on Twitter/X bios, project "team" pages, etc.
--
-- Shape (JSONB array of objects):
--   [
--     {
--       "name": "Alice Founder",
--       "role": "CEO",
--       "twitter_handle": "@alice",
--       "telegram_handle": "@alice_tg",
--       "source_url": "https://x.com/alice",
--       "confidence": "high" | "medium" | "low",
--       "notes": "Signed a recent fundraising tweet; active responder"
--     }
--   ]

ALTER TABLE prospects
  ADD COLUMN IF NOT EXISTS outreach_contacts JSONB DEFAULT '[]'::jsonb;

COMMENT ON COLUMN prospects.outreach_contacts IS
  'Array of individual decision-maker contacts for BD outreach (distinct from project-level telegram_url / twitter_url which are community channels).';
