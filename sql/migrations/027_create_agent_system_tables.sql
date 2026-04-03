-- Migration 027: Create agent system tables
-- Supports agent execution logging and inter-agent handoff communication

-- ============================================
-- 1. AGENT RUNS TABLE
-- Logs every agent execution for monitoring and cost tracking
-- ============================================
CREATE TABLE IF NOT EXISTS agent_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Agent identification
  agent_name TEXT NOT NULL, -- RADAR, ATLAS, MERCURY, SENTINEL, ORACLE, SCOUT, COLDCRAFT, FORGE
  run_type TEXT NOT NULL DEFAULT 'on_demand', -- scheduled, on_demand, handoff

  -- Execution status
  status TEXT NOT NULL DEFAULT 'running', -- running, completed, failed
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  duration_ms INT,

  -- Input/Output
  input_params JSONB DEFAULT '{}',
  output_summary JSONB DEFAULT '{}',
  error_message TEXT,

  -- Trigger context
  triggered_by UUID REFERENCES auth.users(id),

  -- Cost tracking
  tokens_used INT DEFAULT 0,
  cost_usd DECIMAL(10, 6) DEFAULT 0,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 2. AGENT HANDOFFS TABLE
-- Inter-agent communication bus
-- Each handoff is a structured message from one agent to another
-- ============================================
CREATE TABLE IF NOT EXISTS agent_handoffs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Routing
  from_agent TEXT NOT NULL,
  to_agent TEXT NOT NULL,
  handoff_type TEXT NOT NULL, -- SIGNAL_HANDOFF, OUTREACH_REQUEST, OUTREACH_LOG, STALE_ALERT, CALL_PREP_REQUEST, PROOF_UPDATE, SCORE_UPDATE

  -- Payload
  payload JSONB NOT NULL DEFAULT '{}',

  -- Processing state
  status TEXT NOT NULL DEFAULT 'pending', -- pending, processing, completed, failed
  priority INT DEFAULT 5, -- 1 = highest, 10 = lowest

  -- Reference to opportunity if applicable
  opportunity_id UUID REFERENCES crm_opportunities(id) ON DELETE SET NULL,

  -- Run tracking
  created_by_run_id UUID REFERENCES agent_runs(id) ON DELETE SET NULL,
  processed_by_run_id UUID REFERENCES agent_runs(id) ON DELETE SET NULL,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  processed_at TIMESTAMPTZ
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_agent_runs_agent_name ON agent_runs (agent_name);
CREATE INDEX IF NOT EXISTS idx_agent_runs_status ON agent_runs (status);
CREATE INDEX IF NOT EXISTS idx_agent_runs_started_at ON agent_runs (started_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_handoffs_to_agent_status ON agent_handoffs (to_agent, status);
CREATE INDEX IF NOT EXISTS idx_agent_handoffs_opportunity ON agent_handoffs (opportunity_id);
CREATE INDEX IF NOT EXISTS idx_agent_handoffs_created_at ON agent_handoffs (created_at DESC);

-- RLS Policies
ALTER TABLE agent_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_handoffs ENABLE ROW LEVEL SECURITY;

-- All authenticated users can view agent runs and handoffs
CREATE POLICY "Users can view agent runs"
  ON agent_runs FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can insert agent runs"
  ON agent_runs FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Users can update agent runs"
  ON agent_runs FOR UPDATE
  TO authenticated
  USING (true);

CREATE POLICY "Users can view agent handoffs"
  ON agent_handoffs FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can insert agent handoffs"
  ON agent_handoffs FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Users can update agent handoffs"
  ON agent_handoffs FOR UPDATE
  TO authenticated
  USING (true);
