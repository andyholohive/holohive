-- Migration 065: Allow per-campaign toggle for sharing content notes
-- to the public campaign view.
--
-- Context:
--   • campaigns.share_creator_type — KOL creator-type chips on public view
--   • campaigns.share_kol_notes    — per-KOL notes on public view (KOL roster)
--   • campaigns.share_content_notes (NEW) — per-content-piece notes on the
--     content table in the public view (contents.notes column)
--
-- Notes on content pieces live on the contents table and are filled by
-- editors during campaign delivery. Sharing them is opt-in per campaign
-- so the team can keep internal commentary private by default and surface
-- only the polished commentary when it's client-ready.

ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS share_content_notes BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN campaigns.share_content_notes IS
  'When true, contents.notes is rendered as an extra column on the public campaign view. Default false to keep editor commentary private until explicitly shared.';
