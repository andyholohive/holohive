-- Migration 029: Create signals table
-- Supports RADAR and SCOUT agent signal detection

CREATE TABLE IF NOT EXISTS signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id UUID REFERENCES crm_opportunities(id) ON DELETE CASCADE,
  signal_type TEXT NOT NULL,
  signal_category TEXT DEFAULT 'TRIGGER_EVENT',
  signal_detail TEXT NOT NULL,
  source_url TEXT,
  tier INT DEFAULT 3,
  confidence TEXT DEFAULT 'LIKELY',
  shelf_life_days INT DEFAULT 30,
  detected_date DATE DEFAULT CURRENT_DATE,
  expires_at DATE,
  is_active BOOLEAN DEFAULT true,
  detected_by TEXT DEFAULT 'MANUAL',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_signals_opportunity ON signals (opportunity_id);
CREATE INDEX IF NOT EXISTS idx_signals_active ON signals (is_active, tier);
CREATE INDEX IF NOT EXISTS idx_signals_type ON signals (signal_type);
CREATE INDEX IF NOT EXISTS idx_signals_expires ON signals (expires_at);

ALTER TABLE signals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view signals" ON signals FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can insert signals" ON signals FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Users can update signals" ON signals FOR UPDATE TO authenticated USING (true);
