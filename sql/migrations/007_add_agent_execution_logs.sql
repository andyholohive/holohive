-- Migration 007: Agent Execution Logs Table
-- Purpose: Track all agent tool executions for auditing, analytics, and debugging
--
-- Author: AI Assistant
-- Date: 2025-10-02

-- Create agent_execution_logs table
CREATE TABLE IF NOT EXISTS agent_execution_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_id UUID REFERENCES chat_sessions(id) ON DELETE SET NULL,
  tool_name TEXT NOT NULL,
  parameters JSONB NOT NULL DEFAULT '{}'::jsonb,
  result JSONB NOT NULL DEFAULT '{}'::jsonb,
  success BOOLEAN NOT NULL DEFAULT false,
  execution_time_ms INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX idx_agent_logs_user_id ON agent_execution_logs(user_id);
CREATE INDEX idx_agent_logs_session_id ON agent_execution_logs(session_id);
CREATE INDEX idx_agent_logs_tool_name ON agent_execution_logs(tool_name);
CREATE INDEX idx_agent_logs_success ON agent_execution_logs(success);
CREATE INDEX idx_agent_logs_created_at ON agent_execution_logs(created_at DESC);

-- Enable Row Level Security
ALTER TABLE agent_execution_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies

-- Users can view their own logs
CREATE POLICY "Users can view their own logs" ON agent_execution_logs
  FOR SELECT
  USING (auth.uid() = user_id);

-- Service role can insert logs (for server-side operations)
CREATE POLICY "Service role can insert logs" ON agent_execution_logs
  FOR INSERT
  WITH CHECK (true);

-- Admins can view all logs
CREATE POLICY "Admins can view all logs" ON agent_execution_logs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
    )
  );

-- Add helpful comments
COMMENT ON TABLE agent_execution_logs IS 'Stores execution logs for all agent tool calls';
COMMENT ON COLUMN agent_execution_logs.user_id IS 'User who initiated the tool execution';
COMMENT ON COLUMN agent_execution_logs.session_id IS 'Chat session ID if executed within a chat context';
COMMENT ON COLUMN agent_execution_logs.tool_name IS 'Name of the tool that was executed (e.g., search_kols, create_campaign)';
COMMENT ON COLUMN agent_execution_logs.parameters IS 'Input parameters passed to the tool as JSON';
COMMENT ON COLUMN agent_execution_logs.result IS 'Execution result including success/failure and returned data as JSON';
COMMENT ON COLUMN agent_execution_logs.success IS 'Whether the tool execution was successful';
COMMENT ON COLUMN agent_execution_logs.execution_time_ms IS 'Time taken to execute the tool in milliseconds';
COMMENT ON COLUMN agent_execution_logs.created_at IS 'Timestamp when the tool was executed';
