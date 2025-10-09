import { supabase } from './supabase';
import { ToolResult } from './agentTools';

// ============================================================================
// Agent Tool Execution Logger
// ============================================================================

/**
 * Log entry for tool execution
 */
export interface ToolExecutionLog {
  id?: string;
  user_id: string;
  session_id?: string;
  tool_name: string;
  parameters: any;
  result: ToolResult;
  execution_time_ms: number;
  created_at?: string;
}

/**
 * Service for logging and tracking agent tool executions
 */
export class AgentToolLogger {
  /**
   * Log a tool execution to the database
   */
  static async logExecution(log: Omit<ToolExecutionLog, 'id' | 'created_at'>): Promise<void> {
    try {
      // For now, we'll store logs in a simple table structure
      // In production, you might want to create a dedicated table for this
      const { error } = await (supabase as any)
        .from('agent_execution_logs')
        .insert({
          user_id: log.user_id,
          session_id: log.session_id || null,
          tool_name: log.tool_name,
          parameters: log.parameters,
          result: log.result,
          execution_time_ms: log.execution_time_ms,
          success: log.result.success,
        });

      if (error) {
        // If table doesn't exist yet, log to console
        if (error.code === '42P01') {
          console.log('[AgentToolLogger] agent_execution_logs table not yet created. Logging to console:');
          console.log(JSON.stringify(log, null, 2));
        } else {
          console.error('[AgentToolLogger] Error logging execution:', error);
        }
      }
    } catch (error) {
      console.error('[AgentToolLogger] Failed to log execution:', error);
    }
  }

  /**
   * Get execution logs for a user
   */
  static async getUserLogs(
    userId: string,
    options?: {
      limit?: number;
      sessionId?: string;
      toolName?: string;
    }
  ): Promise<ToolExecutionLog[]> {
    try {
      let query = (supabase as any)
        .from('agent_execution_logs')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (options?.sessionId) {
        query = query.eq('session_id', options.sessionId);
      }

      if (options?.toolName) {
        query = query.eq('tool_name', options.toolName);
      }

      if (options?.limit) {
        query = query.limit(options.limit);
      }

      const { data, error } = await query;

      if (error) {
        if (error.code === '42P01') {
          console.log('[AgentToolLogger] agent_execution_logs table not yet created');
          return [];
        }
        throw error;
      }

      return data || [];
    } catch (error) {
      console.error('[AgentToolLogger] Error fetching logs:', error);
      return [];
    }
  }

  /**
   * Get execution statistics for a user
   */
  static async getUserStats(userId: string): Promise<{
    total_executions: number;
    successful_executions: number;
    failed_executions: number;
    avg_execution_time_ms: number;
    most_used_tools: { tool_name: string; count: number }[];
  }> {
    try {
      const logs = await this.getUserLogs(userId, { limit: 1000 });

      const stats = {
        total_executions: logs.length,
        successful_executions: logs.filter(l => l.result.success).length,
        failed_executions: logs.filter(l => !l.result.success).length,
        avg_execution_time_ms: logs.length > 0
          ? Math.round(logs.reduce((sum, l) => sum + l.execution_time_ms, 0) / logs.length)
          : 0,
        most_used_tools: this.calculateToolUsage(logs),
      };

      return stats;
    } catch (error) {
      console.error('[AgentToolLogger] Error calculating stats:', error);
      return {
        total_executions: 0,
        successful_executions: 0,
        failed_executions: 0,
        avg_execution_time_ms: 0,
        most_used_tools: [],
      };
    }
  }

  /**
   * Calculate tool usage statistics
   */
  private static calculateToolUsage(logs: ToolExecutionLog[]): { tool_name: string; count: number }[] {
    const toolCounts = logs.reduce((acc, log) => {
      acc[log.tool_name] = (acc[log.tool_name] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return Object.entries(toolCounts)
      .map(([tool_name, count]) => ({ tool_name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }

  /**
   * Wrapper function to execute a tool with automatic logging
   */
  static async executeWithLogging<T>(
    toolName: string,
    userId: string,
    sessionId: string | undefined,
    parameters: any,
    executeFn: () => Promise<ToolResult>
  ): Promise<ToolResult> {
    const startTime = Date.now();

    try {
      const result = await executeFn();
      const executionTime = Date.now() - startTime;

      // Log the execution
      await this.logExecution({
        user_id: userId,
        session_id: sessionId,
        tool_name: toolName,
        parameters,
        result,
        execution_time_ms: executionTime,
      });

      return result;
    } catch (error) {
      const executionTime = Date.now() - startTime;
      const errorResult: ToolResult = {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      };

      // Log the failed execution
      await this.logExecution({
        user_id: userId,
        session_id: sessionId,
        tool_name: toolName,
        parameters,
        result: errorResult,
        execution_time_ms: executionTime,
      });

      return errorResult;
    }
  }

  /**
   * Get recent failed executions for debugging
   */
  static async getRecentFailures(userId: string, limit: number = 10): Promise<ToolExecutionLog[]> {
    try {
      const { data, error } = await (supabase as any)
        .from('agent_execution_logs')
        .select('*')
        .eq('user_id', userId)
        .eq('success', false)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) {
        if (error.code === '42P01') return [];
        throw error;
      }

      return data || [];
    } catch (error) {
      console.error('[AgentToolLogger] Error fetching failures:', error);
      return [];
    }
  }

  /**
   * Clear old logs (for maintenance)
   */
  static async clearOldLogs(daysToKeep: number = 30): Promise<number> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

      const { data, error } = await (supabase as any)
        .from('agent_execution_logs')
        .delete()
        .lt('created_at', cutoffDate.toISOString())
        .select('id');

      if (error) {
        if (error.code === '42P01') return 0;
        throw error;
      }

      return data?.length || 0;
    } catch (error) {
      console.error('[AgentToolLogger] Error clearing logs:', error);
      return 0;
    }
  }
}

// SQL Migration for agent_execution_logs table
// Run this migration to enable database logging:
/*

-- Migration: Create agent_execution_logs table
-- This table stores all agent tool executions for auditing and analytics

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

-- Indexes for performance
CREATE INDEX idx_agent_logs_user_id ON agent_execution_logs(user_id);
CREATE INDEX idx_agent_logs_session_id ON agent_execution_logs(session_id);
CREATE INDEX idx_agent_logs_tool_name ON agent_execution_logs(tool_name);
CREATE INDEX idx_agent_logs_success ON agent_execution_logs(success);
CREATE INDEX idx_agent_logs_created_at ON agent_execution_logs(created_at DESC);

-- RLS Policies
ALTER TABLE agent_execution_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own logs" ON agent_execution_logs
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role can insert logs" ON agent_execution_logs
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Admins can view all logs" ON agent_execution_logs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
    )
  );

-- Comments
COMMENT ON TABLE agent_execution_logs IS 'Stores execution logs for all agent tool calls';
COMMENT ON COLUMN agent_execution_logs.tool_name IS 'Name of the tool that was executed';
COMMENT ON COLUMN agent_execution_logs.parameters IS 'Input parameters passed to the tool';
COMMENT ON COLUMN agent_execution_logs.result IS 'Execution result including success/failure and data';
COMMENT ON COLUMN agent_execution_logs.execution_time_ms IS 'Time taken to execute the tool in milliseconds';

*/
