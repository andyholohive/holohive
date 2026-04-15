-- Migration 035: Add Signal & Trigger Bible v3 columns
-- Adds tier, confidence, shelf_life, metadata to prospect_signals
-- Adds action_tier, last_new_signal_date, disqualification fields to prospects

-- New columns on prospect_signals
ALTER TABLE prospect_signals ADD COLUMN IF NOT EXISTS tier INT DEFAULT 3;
ALTER TABLE prospect_signals ADD COLUMN IF NOT EXISTS confidence TEXT DEFAULT 'likely';
ALTER TABLE prospect_signals ADD COLUMN IF NOT EXISTS shelf_life_days INT DEFAULT 30;
ALTER TABLE prospect_signals ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';

-- New columns on prospects
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS action_tier TEXT DEFAULT 'SKIP';
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS last_new_signal_date TIMESTAMPTZ;
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS is_disqualified BOOLEAN DEFAULT FALSE;
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS disqualification_reason TEXT;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_prospects_action_tier ON prospects(action_tier);
CREATE INDEX IF NOT EXISTS idx_prospect_signals_tier ON prospect_signals(tier);
