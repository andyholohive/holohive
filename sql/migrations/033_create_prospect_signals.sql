-- Migration 033: Korean Market Signal Scanner
-- Stores signals detected from Korean news, exchange listings, etc.

-- Prospect signals table
CREATE TABLE IF NOT EXISTS prospect_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_id UUID REFERENCES prospects(id) ON DELETE CASCADE,
  project_name TEXT NOT NULL,
  signal_type TEXT NOT NULL,  -- 'exchange_listing', 'news_mention', 'korea_community', 'korea_partnership', 'korea_event', 'korea_localization', 'korea_hiring', 'social_presence'
  headline TEXT NOT NULL,
  snippet TEXT,
  source_url TEXT,
  source_name TEXT,           -- 'upbit', 'bithumb', 'coindesk_korea', 'blockmedia', 'tokenpost', 'google_news'
  relevancy_weight INT DEFAULT 10,  -- 10-100 weight for scoring
  detected_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_prospect_signals_prospect ON prospect_signals (prospect_id);
CREATE INDEX IF NOT EXISTS idx_prospect_signals_type ON prospect_signals (signal_type);
CREATE INDEX IF NOT EXISTS idx_prospect_signals_project ON prospect_signals (project_name);
CREATE INDEX IF NOT EXISTS idx_prospect_signals_active ON prospect_signals (is_active, detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_prospect_signals_detected ON prospect_signals (detected_at DESC);

ALTER TABLE prospect_signals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view prospect signals" ON prospect_signals FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can insert prospect signals" ON prospect_signals FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Users can update prospect signals" ON prospect_signals FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Users can delete prospect signals" ON prospect_signals FOR DELETE TO authenticated USING (true);

-- Add korea_relevancy_score to prospects
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS korea_relevancy_score INT DEFAULT 0;
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS korea_signal_count INT DEFAULT 0;
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS last_signal_scan TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_prospects_korea_score ON prospects (korea_relevancy_score DESC);
