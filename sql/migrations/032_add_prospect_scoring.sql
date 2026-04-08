-- Migration 032: Add ICP scoring to prospects

-- ICP score column on prospects
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS icp_score INT DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_prospects_icp_score ON prospects (icp_score DESC);

-- Settings table for ICP scoring configuration
CREATE TABLE IF NOT EXISTS prospect_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT UNIQUE NOT NULL,
  value JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed default settings
INSERT INTO prospect_settings (key, value) VALUES
  ('category_tiers', '{"tier1": [], "tier2": [], "tier3": [], "skip": []}'),
  ('market_cap_range', '{"min": 0, "max": 0}'),
  ('disqualify_keywords', '[]')
ON CONFLICT (key) DO NOTHING;

ALTER TABLE prospect_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view prospect settings" ON prospect_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can update prospect settings" ON prospect_settings FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Users can insert prospect settings" ON prospect_settings FOR INSERT TO authenticated WITH CHECK (true);
