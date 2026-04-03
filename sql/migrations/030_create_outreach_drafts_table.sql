-- Migration 030: Create outreach_drafts table
-- Supports MERCURY and COLDCRAFT agent message generation

CREATE TABLE IF NOT EXISTS outreach_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id UUID NOT NULL REFERENCES crm_opportunities(id) ON DELETE CASCADE,
  tracking_id TEXT,
  touch_number INT DEFAULT 1,
  channel TEXT DEFAULT 'telegram',
  trigger_used TEXT,
  message_draft TEXT NOT NULL,
  framework_used TEXT,
  template_type TEXT,
  outcome_framing JSONB DEFAULT '{}',
  quality_gate_passed BOOLEAN DEFAULT false,
  quality_gate_details JSONB DEFAULT '{}',
  status TEXT DEFAULT 'draft',
  outcome TEXT,
  reply_sentiment TEXT,
  created_by TEXT DEFAULT 'MERCURY',
  approved_by UUID REFERENCES auth.users(id),
  sent_at TIMESTAMPTZ,
  replied_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_outreach_drafts_opportunity ON outreach_drafts (opportunity_id);
CREATE INDEX IF NOT EXISTS idx_outreach_drafts_status ON outreach_drafts (status);
CREATE INDEX IF NOT EXISTS idx_outreach_drafts_created_at ON outreach_drafts (created_at DESC);

ALTER TABLE outreach_drafts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view outreach drafts" ON outreach_drafts FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can insert outreach drafts" ON outreach_drafts FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Users can update outreach drafts" ON outreach_drafts FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Users can delete outreach drafts" ON outreach_drafts FOR DELETE TO authenticated USING (true);
