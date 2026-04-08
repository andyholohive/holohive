-- Migration 031: Create prospects table for scraped project data
-- Stores projects from external sources (dropstab.com, etc.) before promotion to pipeline

CREATE TABLE IF NOT EXISTS prospects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  symbol TEXT,
  category TEXT,
  market_cap DECIMAL,
  price DECIMAL,
  volume_24h DECIMAL,
  website_url TEXT,
  twitter_url TEXT,
  telegram_url TEXT,
  discord_url TEXT,
  logo_url TEXT,
  source_url TEXT,
  source TEXT DEFAULT 'dropstab',
  status TEXT DEFAULT 'new',
  promoted_opportunity_id UUID REFERENCES crm_opportunities(id) ON DELETE SET NULL,
  scraped_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(name, source)
);

CREATE INDEX IF NOT EXISTS idx_prospects_status ON prospects (status);
CREATE INDEX IF NOT EXISTS idx_prospects_source ON prospects (source);
CREATE INDEX IF NOT EXISTS idx_prospects_category ON prospects (category);
CREATE INDEX IF NOT EXISTS idx_prospects_market_cap ON prospects (market_cap DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_prospects_scraped_at ON prospects (scraped_at DESC);

ALTER TABLE prospects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view prospects" ON prospects FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can insert prospects" ON prospects FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Users can update prospects" ON prospects FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Users can delete prospects" ON prospects FOR DELETE TO authenticated USING (true);
