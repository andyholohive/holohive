-- Add funding columns to prospects table
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS funding_total DECIMAL;
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS funding_round TEXT;
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS last_funding_date TEXT;
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS investors TEXT;
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS has_korean_vc BOOLEAN DEFAULT FALSE;

-- Create funding_rounds table for detailed round history
CREATE TABLE IF NOT EXISTS funding_rounds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_id UUID REFERENCES prospects(id) ON DELETE CASCADE,
  project_name TEXT NOT NULL,
  round_type TEXT,              -- seed, series_a, series_b, strategic, private, public
  amount_usd DECIMAL,
  investors TEXT,               -- comma-separated investor names
  lead_investor TEXT,
  has_korean_vc BOOLEAN DEFAULT FALSE,
  korean_vcs TEXT,              -- comma-separated Korean VC names found
  source_url TEXT,
  source TEXT DEFAULT 'web',    -- web, dropstab, manual
  announced_date TEXT,
  detected_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_funding_rounds_prospect ON funding_rounds(prospect_id);
CREATE INDEX IF NOT EXISTS idx_funding_rounds_korean_vc ON funding_rounds(has_korean_vc) WHERE has_korean_vc = TRUE;
CREATE INDEX IF NOT EXISTS idx_funding_rounds_detected ON funding_rounds(detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_prospects_korean_vc ON prospects(has_korean_vc) WHERE has_korean_vc = TRUE;
CREATE INDEX IF NOT EXISTS idx_prospects_funding ON prospects(funding_total DESC NULLS LAST);

-- RLS
ALTER TABLE funding_rounds ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read funding rounds" ON funding_rounds
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can insert funding rounds" ON funding_rounds
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Users can update funding rounds" ON funding_rounds
  FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Users can delete funding rounds" ON funding_rounds
  FOR DELETE TO authenticated USING (true);
CREATE POLICY "Service role full access to funding_rounds" ON funding_rounds
  FOR ALL TO service_role USING (true) WITH CHECK (true);
