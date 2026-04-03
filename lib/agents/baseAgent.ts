import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { callClaude, callClaudeWithTools, ClaudeResponse, ClaudeToolResult, ClaudeTool, ClaudeModel } from '@/lib/claude';

// ============================================
// Agent Types
// ============================================

export type AgentName = 'RADAR' | 'ATLAS' | 'MERCURY' | 'SENTINEL' | 'ORACLE' | 'SCOUT' | 'COLDCRAFT' | 'FORGE';
export type RunType = 'scheduled' | 'on_demand' | 'handoff';
export type RunStatus = 'running' | 'completed' | 'failed';
export type HandoffType =
  | 'SIGNAL_HANDOFF'
  | 'OUTREACH_REQUEST'
  | 'OUTREACH_LOG'
  | 'STALE_ALERT'
  | 'CALL_PREP_REQUEST'
  | 'PROOF_UPDATE'
  | 'SCORE_UPDATE';

export interface AgentRunRecord {
  id: string;
  agent_name: AgentName;
  run_type: RunType;
  status: RunStatus;
  started_at: string;
  completed_at: string | null;
  duration_ms: number | null;
  input_params: Record<string, unknown>;
  output_summary: Record<string, unknown>;
  error_message: string | null;
  triggered_by: string | null;
  tokens_used: number;
  cost_usd: number;
}

export interface AgentHandoff {
  id: string;
  from_agent: AgentName;
  to_agent: AgentName;
  handoff_type: HandoffType;
  payload: Record<string, unknown>;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  priority: number;
  opportunity_id: string | null;
  created_by_run_id: string | null;
  processed_by_run_id: string | null;
  created_at: string;
  processed_at: string | null;
}

export interface AgentResult {
  success: boolean;
  summary: Record<string, unknown>;
  handoffs?: Array<{
    toAgent: AgentName;
    type: HandoffType;
    payload: Record<string, unknown>;
    opportunityId?: string;
    priority?: number;
  }>;
}

// ============================================
// Base Agent Abstract Class
// ============================================

export abstract class BaseAgent {
  readonly name: AgentName;
  readonly model: ClaudeModel;
  protected supabase: SupabaseClient;
  protected runId: string | null = null;

  constructor(name: AgentName, model: ClaudeModel = 'claude-sonnet-4-20250514') {
    this.name = name;
    this.model = model;

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Supabase configuration missing: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required');
    }

    this.supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }

  // ============================================
  // Main run method — wraps execute with logging
  // ============================================

  async run(
    params: Record<string, unknown>,
    runType: RunType = 'on_demand',
    triggeredBy?: string
  ): Promise<AgentResult> {
    const startTime = Date.now();

    // Create run record
    const { data: runRecord, error: insertError } = await this.supabase
      .from('agent_runs')
      .insert({
        agent_name: this.name,
        run_type: runType,
        status: 'running',
        input_params: params,
        triggered_by: triggeredBy || null,
      })
      .select('id')
      .single();

    if (insertError || !runRecord) {
      console.error(`[${this.name}] Failed to create run record:`, insertError);
      throw new Error(`Failed to create agent run record: ${insertError?.message}`);
    }

    this.runId = runRecord.id;

    try {
      // Process any pending handoffs first
      await this.processHandoffs();

      // Execute agent-specific logic
      const result = await this.execute(params);

      // Create any outbound handoffs
      if (result.handoffs?.length) {
        for (const handoff of result.handoffs) {
          await this.createHandoff(
            handoff.toAgent,
            handoff.type,
            handoff.payload,
            handoff.opportunityId,
            handoff.priority
          );
        }
      }

      const durationMs = Date.now() - startTime;

      // Update run record to completed
      await this.supabase
        .from('agent_runs')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          duration_ms: durationMs,
          output_summary: result.summary,
          tokens_used: (result.summary.tokens_used as number) || 0,
          cost_usd: (result.summary.cost_usd as number) || 0,
        })
        .eq('id', this.runId);

      return result;
    } catch (error) {
      const durationMs = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      // Update run record to failed
      await this.supabase
        .from('agent_runs')
        .update({
          status: 'failed',
          completed_at: new Date().toISOString(),
          duration_ms: durationMs,
          error_message: errorMessage,
        })
        .eq('id', this.runId);

      return {
        success: false,
        summary: { error: errorMessage },
      };
    }
  }

  // ============================================
  // Abstract method — each agent implements this
  // ============================================

  protected abstract execute(params: Record<string, unknown>): Promise<AgentResult>;

  // ============================================
  // Brain prompts — each agent provides its system prompts
  // ============================================

  protected abstract getSystemPrompts(): string[];

  // ============================================
  // Claude API helpers
  // ============================================

  protected async callAgent(userPrompt: string, options?: {
    maxTokens?: number;
    temperature?: number;
  }): Promise<ClaudeResponse> {
    return callClaude(this.getSystemPrompts(), userPrompt, {
      model: this.model,
      ...options,
    });
  }

  protected async callAgentWithTools(
    userPrompt: string,
    tools: ClaudeTool[],
    options?: {
      maxTokens?: number;
      temperature?: number;
      maxSteps?: number;
    }
  ): Promise<ClaudeToolResult> {
    return callClaudeWithTools(this.getSystemPrompts(), userPrompt, tools, {
      model: this.model,
      ...options,
    });
  }

  // ============================================
  // Handoff management
  // ============================================

  protected async createHandoff(
    toAgent: AgentName,
    type: HandoffType,
    payload: Record<string, unknown>,
    opportunityId?: string,
    priority?: number
  ): Promise<void> {
    const { error } = await this.supabase.from('agent_handoffs').insert({
      from_agent: this.name,
      to_agent: toAgent,
      handoff_type: type,
      payload,
      opportunity_id: opportunityId || null,
      priority: priority ?? 5,
      created_by_run_id: this.runId,
    });

    if (error) {
      console.error(`[${this.name}] Failed to create handoff to ${toAgent}:`, error);
    }
  }

  protected async processHandoffs(): Promise<AgentHandoff[]> {
    // Fetch pending handoffs for this agent
    const { data: handoffs, error } = await this.supabase
      .from('agent_handoffs')
      .select('*')
      .eq('to_agent', this.name)
      .eq('status', 'pending')
      .order('priority', { ascending: true })
      .order('created_at', { ascending: true });

    if (error || !handoffs?.length) {
      return [];
    }

    // Mark them as processing
    const handoffIds = handoffs.map((h: AgentHandoff) => h.id);
    await this.supabase
      .from('agent_handoffs')
      .update({
        status: 'processing',
        processed_by_run_id: this.runId,
      })
      .in('id', handoffIds);

    return handoffs as AgentHandoff[];
  }

  protected async completeHandoff(handoffId: string): Promise<void> {
    await this.supabase
      .from('agent_handoffs')
      .update({
        status: 'completed',
        processed_at: new Date().toISOString(),
      })
      .eq('id', handoffId);
  }

  protected async failHandoff(handoffId: string): Promise<void> {
    await this.supabase
      .from('agent_handoffs')
      .update({
        status: 'failed',
        processed_at: new Date().toISOString(),
      })
      .eq('id', handoffId);
  }

  // ============================================
  // Database helpers
  // ============================================

  protected async getOpportunities(filters?: {
    stages?: string[];
    minScore?: number;
    actionTiers?: string[];
    limit?: number;
  }): Promise<any[]> {
    let query = this.supabase
      .from('crm_opportunities')
      .select('*, affiliate:crm_affiliates(*), client:clients(*)');

    if (filters?.stages?.length) {
      query = query.in('stage', filters.stages);
    }
    if (filters?.minScore !== undefined) {
      query = query.gte('composite_score', filters.minScore);
    }
    if (filters?.actionTiers?.length) {
      query = query.in('action_tier', filters.actionTiers);
    }

    query = query.order('composite_score', { ascending: false, nullsFirst: false });

    if (filters?.limit) {
      query = query.limit(filters.limit);
    }

    const { data, error } = await query;
    if (error) {
      console.error(`[${this.name}] Error fetching opportunities:`, error);
      return [];
    }
    return data || [];
  }

  protected async updateOpportunity(
    id: string,
    updates: Record<string, unknown>
  ): Promise<boolean> {
    const { error } = await this.supabase
      .from('crm_opportunities')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id);

    if (error) {
      console.error(`[${this.name}] Error updating opportunity ${id}:`, error);
      return false;
    }
    return true;
  }
}
