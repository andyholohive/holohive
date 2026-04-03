import { BaseAgent, AgentResult } from './baseAgent';
import { ORACLE_SYSTEM_PROMPT } from './brains/oracle';

/**
 * ORACLE Agent — Intel Analyst
 *
 * Provides deep prospect intelligence and call preparation.
 * Generates GATEKEEPER scores, 5-for-5 readiness checks, and call briefs.
 *
 * Trigger: On-demand — when a call is booked or deep research is requested
 */
export class OracleAgent extends BaseAgent {
  constructor() {
    super('ORACLE', 'claude-sonnet-4-20250514');
  }

  protected getSystemPrompts(): string[] {
    return [
      'You are part of HoloHive\'s multi-agent sales system. You provide deep intelligence and call preparation.',
      ORACLE_SYSTEM_PROMPT,
    ];
  }

  protected async execute(params: Record<string, unknown>): Promise<AgentResult> {
    const opportunityId = params.opportunity_id as string;
    const callType = (params.call_type as string) || 'DISCOVERY';

    if (!opportunityId) {
      return { success: false, summary: { error: 'opportunity_id is required' } };
    }

    // Fetch the opportunity with related data
    const { data: opp, error } = await this.supabase
      .from('crm_opportunities')
      .select('*, affiliate:crm_affiliates(*), client:clients(*)')
      .eq('id', opportunityId)
      .single();

    if (error || !opp) {
      return { success: false, summary: { error: `Opportunity not found: ${opportunityId}` } };
    }

    // Fetch existing intel
    const { data: existingIntel } = await this.supabase
      .from('prospect_intel')
      .select('*')
      .eq('opportunity_id', opportunityId)
      .order('created_at', { ascending: false });

    // Fetch activity history
    const { data: activities } = await this.supabase
      .from('crm_activities')
      .select('*')
      .eq('opportunity_id', opportunityId)
      .order('created_at', { ascending: false })
      .limit(20);

    // Fetch any active signals
    const { data: signals } = await this.supabase
      .from('signals')
      .select('*')
      .eq('opportunity_id', opportunityId)
      .eq('is_active', true)
      .catch(() => ({ data: null }));

    const prompt = this.buildResearchPrompt(opp, callType, existingIntel || [], activities || [], signals || []);
    const response = await this.callAgent(prompt, { maxTokens: 6144, temperature: 0.2 });

    // Parse the call brief
    const brief = this.parseBrief(response.content);
    if (!brief) {
      return {
        success: false,
        summary: {
          error: 'Failed to parse call brief',
          raw_response: response.content,
          tokens_used: response.usage.input_tokens + response.usage.output_tokens,
          cost_usd: response.cost_usd,
        },
      };
    }

    // Save the call brief
    const { data: savedBrief, error: saveError } = await this.supabase
      .from('call_briefs')
      .insert({
        opportunity_id: opportunityId,
        call_type: callType,
        gatekeeper_score: brief.gatekeeper_score || {},
        five_for_five_status: brief.five_for_five || {},
        talking_points: brief.talking_points || [],
        risk_flags: brief.risk_flags || [],
        objection_handlers: brief.objection_handlers || {},
        intel_summary: brief.intel_summary || {},
        created_by: 'ORACLE',
      })
      .select('id')
      .single();

    if (saveError) {
      console.error('[ORACLE] Failed to save call brief:', saveError);
    }

    // Save enrichment data as prospect intel
    if (brief.intel_summary) {
      for (const [intelType, content] of Object.entries(brief.intel_summary)) {
        if (content && typeof content === 'object' && Object.keys(content as object).length > 0) {
          await this.supabase.from('prospect_intel').upsert(
            {
              opportunity_id: opportunityId,
              intel_type: intelType,
              content: content as Record<string, unknown>,
              confidence: 0.75,
              refreshed_at: new Date().toISOString(),
            },
            { onConflict: 'opportunity_id,intel_type', ignoreDuplicates: false }
          ).catch(() => {
            // If upsert fails (no unique constraint), just insert
            this.supabase.from('prospect_intel').insert({
              opportunity_id: opportunityId,
              intel_type: intelType,
              content: content as Record<string, unknown>,
              confidence: 0.75,
              refreshed_at: new Date().toISOString(),
            });
          });
        }
      }
    }

    // Determine if escalation is needed
    const handoffs: AgentResult['handoffs'] = [];
    const gatekeeperTotal = brief.gatekeeper_score?.total || 0;

    if (gatekeeperTotal < 50) {
      // Low gatekeeper score — flag for human review
      handoffs.push({
        toAgent: 'SENTINEL',
        type: 'STALE_ALERT',
        payload: {
          alert_type: 'low_gatekeeper_score',
          project: opp.name,
          gatekeeper_score: gatekeeperTotal,
          risk_flags: brief.risk_flags || [],
          recommendation: 'Review before proceeding to proposal',
        },
        opportunityId,
        priority: 2,
      });
    }

    return {
      success: true,
      summary: {
        project_name: opp.name,
        call_type: callType,
        gatekeeper_score: gatekeeperTotal,
        five_for_five_gates: brief.five_for_five?.gates_passed || '0/5',
        risk_flags_count: (brief.risk_flags || []).length,
        talking_points_count: (brief.talking_points || []).length,
        brief_id: savedBrief?.id || null,
        tokens_used: response.usage.input_tokens + response.usage.output_tokens,
        cost_usd: response.cost_usd,
        brief, // Full brief for UI display
      },
      handoffs,
    };
  }

  private buildResearchPrompt(
    opp: any,
    callType: string,
    existingIntel: any[],
    activities: any[],
    signals: any[]
  ): string {
    const oppData = {
      id: opp.id,
      name: opp.name,
      stage: opp.stage,
      deal_value: opp.deal_value,
      website_url: opp.website_url,
      category: opp.category,
      funding_stage: opp.funding_stage,
      funding_amount: opp.funding_amount,
      lead_investors: opp.lead_investors,
      korea_presence: opp.korea_presence,
      token_status: opp.token_status,
      tge_date: opp.tge_date,
      product_status: opp.product_status,
      team_doxxed: opp.team_doxxed,
      narrative_fit: opp.narrative_fit,
      twitter_handle: opp.twitter_handle,
      twitter_followers: opp.twitter_followers,
      tg_handle: opp.tg_handle,
      temperature_score: opp.temperature_score,
      bump_number: opp.bump_number,
      composite_score: opp.composite_score,
      action_tier: opp.action_tier,
      notes: opp.notes,
      gc: opp.gc,
    };

    const activitySummary = activities.map((a: any) => ({
      type: a.type,
      title: a.title,
      description: a.description,
      outcome: a.outcome,
      date: a.created_at,
    }));

    const existingIntelSummary = existingIntel.map((i: any) => ({
      type: i.intel_type,
      content: i.content,
      confidence: i.confidence,
      refreshed_at: i.refreshed_at,
    }));

    return `Generate a comprehensive call brief for an upcoming ${callType} call with this prospect.

Today's date is ${new Date().toISOString().split('T')[0]}.

PROSPECT DATA:
${JSON.stringify(oppData, null, 2)}

CONVERSATION HISTORY (${activities.length} interactions):
${activitySummary.length > 0 ? JSON.stringify(activitySummary, null, 2) : 'No recorded interactions yet.'}

EXISTING INTEL:
${existingIntelSummary.length > 0 ? JSON.stringify(existingIntelSummary, null, 2) : 'No existing intelligence gathered.'}

ACTIVE SIGNALS:
${signals.length > 0 ? JSON.stringify(signals, null, 2) : 'No active signals.'}

Based on all available information, provide:
1. GATEKEEPER score (10 dimensions, 0-10 each)
2. 5-for-5 readiness check
3. Talking points (prioritized)
4. Risk flags
5. Objection handlers for likely objections
6. Intel summary organized by the 8 enrichment areas

Return your analysis as a single JSON object matching the ORACLE call brief format.
Do NOT include any text outside the JSON object.`;
  }

  private parseBrief(content: string): any | null {
    try {
      // Try to extract JSON
      const jsonMatch = content.match(/\{[\s\S]*"gatekeeper_score"[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }

      // Try full content
      const parsed = JSON.parse(content);
      return parsed;
    } catch {
      console.error('[ORACLE] Failed to parse call brief');
      return null;
    }
  }
}
