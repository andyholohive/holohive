-- Migration 026: Add AI scoring columns to crm_opportunities
-- Supports the multi-agent sales automation system (ATLAS scoring engine)

-- AI Scoring Fields
ALTER TABLE crm_opportunities ADD COLUMN IF NOT EXISTS icp_fit_score SMALLINT DEFAULT 0;
ALTER TABLE crm_opportunities ADD COLUMN IF NOT EXISTS signal_strength_score SMALLINT DEFAULT 0;
ALTER TABLE crm_opportunities ADD COLUMN IF NOT EXISTS timing_score SMALLINT DEFAULT 0;
ALTER TABLE crm_opportunities ADD COLUMN IF NOT EXISTS composite_score SMALLINT DEFAULT 0;
ALTER TABLE crm_opportunities ADD COLUMN IF NOT EXISTS action_tier TEXT;
ALTER TABLE crm_opportunities ADD COLUMN IF NOT EXISTS last_scored_at TIMESTAMPTZ;

-- Prospect Enrichment Fields
ALTER TABLE crm_opportunities ADD COLUMN IF NOT EXISTS funding_stage TEXT;
ALTER TABLE crm_opportunities ADD COLUMN IF NOT EXISTS funding_amount TEXT;
ALTER TABLE crm_opportunities ADD COLUMN IF NOT EXISTS lead_investors TEXT;
ALTER TABLE crm_opportunities ADD COLUMN IF NOT EXISTS korea_presence TEXT DEFAULT 'NONE';
ALTER TABLE crm_opportunities ADD COLUMN IF NOT EXISTS personality_type TEXT;
ALTER TABLE crm_opportunities ADD COLUMN IF NOT EXISTS website_url TEXT;
ALTER TABLE crm_opportunities ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE crm_opportunities ADD COLUMN IF NOT EXISTS token_status TEXT;
ALTER TABLE crm_opportunities ADD COLUMN IF NOT EXISTS tge_date DATE;
ALTER TABLE crm_opportunities ADD COLUMN IF NOT EXISTS product_status TEXT;
ALTER TABLE crm_opportunities ADD COLUMN IF NOT EXISTS team_doxxed BOOLEAN;
ALTER TABLE crm_opportunities ADD COLUMN IF NOT EXISTS narrative_fit TEXT;
ALTER TABLE crm_opportunities ADD COLUMN IF NOT EXISTS twitter_handle TEXT;
ALTER TABLE crm_opportunities ADD COLUMN IF NOT EXISTS twitter_followers INT;
ALTER TABLE crm_opportunities ADD COLUMN IF NOT EXISTS last_signal_at TIMESTAMPTZ;

-- Indexes for scoring queries
CREATE INDEX IF NOT EXISTS idx_crm_opportunities_composite_score ON crm_opportunities (composite_score DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_crm_opportunities_action_tier ON crm_opportunities (action_tier);

-- Add comments for documentation
COMMENT ON COLUMN crm_opportunities.icp_fit_score IS 'ICP fit component of prospect score (0-40)';
COMMENT ON COLUMN crm_opportunities.signal_strength_score IS 'Signal strength component of prospect score (0-35)';
COMMENT ON COLUMN crm_opportunities.timing_score IS 'Timing component of prospect score (0-25)';
COMMENT ON COLUMN crm_opportunities.composite_score IS 'Total prospect score = icp_fit + signal_strength + timing (0-100)';
COMMENT ON COLUMN crm_opportunities.action_tier IS 'REACH_OUT_NOW, PRE_TOKEN_PRIORITY, RESEARCH_FIRST, WATCH_FOR_TRIGGER, NURTURE, SKIP';
COMMENT ON COLUMN crm_opportunities.korea_presence IS 'NONE, MINIMAL, ACTIVE';
COMMENT ON COLUMN crm_opportunities.token_status IS 'PRE_TOKEN, PRE_TGE, POST_LAUNCH, NO_TOKEN';
COMMENT ON COLUMN crm_opportunities.product_status IS 'WHITEPAPER, TESTNET, MAINNET, LIVE_WITH_USERS';
COMMENT ON COLUMN crm_opportunities.narrative_fit IS 'HOT, NEUTRAL, COLD';
