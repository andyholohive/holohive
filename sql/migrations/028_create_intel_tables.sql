-- Migration 028: Create call_briefs and prospect_intel tables
-- Supports ORACLE agent call preparation and SCOUT/ORACLE enrichment

CREATE TABLE IF NOT EXISTS call_briefs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id UUID NOT NULL REFERENCES crm_opportunities(id) ON DELETE CASCADE,
  call_type TEXT NOT NULL DEFAULT 'DISCOVERY',
  gatekeeper_score JSONB DEFAULT '{}',
  five_for_five_status JSONB DEFAULT '{}',
  talking_points JSONB DEFAULT '[]',
  risk_flags JSONB DEFAULT '[]',
  objection_handlers JSONB DEFAULT '{}',
  intel_summary JSONB DEFAULT '{}',
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS prospect_intel (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id UUID REFERENCES crm_opportunities(id) ON DELETE CASCADE,
  intel_type TEXT NOT NULL,
  content JSONB DEFAULT '{}',
  source_urls TEXT[] DEFAULT '{}',
  confidence DECIMAL(3,2) DEFAULT 0.5,
  refreshed_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_call_briefs_opportunity ON call_briefs (opportunity_id);
CREATE INDEX IF NOT EXISTS idx_call_briefs_created_at ON call_briefs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_prospect_intel_opportunity ON prospect_intel (opportunity_id);
CREATE INDEX IF NOT EXISTS idx_prospect_intel_type ON prospect_intel (intel_type);

ALTER TABLE call_briefs ENABLE ROW LEVEL SECURITY;
ALTER TABLE prospect_intel ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view call briefs" ON call_briefs FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can insert call briefs" ON call_briefs FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Users can update call briefs" ON call_briefs FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Users can view prospect intel" ON prospect_intel FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can insert prospect intel" ON prospect_intel FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Users can update prospect intel" ON prospect_intel FOR UPDATE TO authenticated USING (true);
