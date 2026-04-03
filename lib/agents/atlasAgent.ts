import { BaseAgent, AgentResult } from './baseAgent';
import { ATLAS_SYSTEM_PROMPT } from './brains/atlas';

/**
 * ATLAS Agent — Prospect Database Manager & Scoring Engine
 *
 * Calculates ICP Fit + Signal Strength + Timing scores for opportunities.
 * Determines action tiers and creates OUTREACH_REQUEST handoffs for high-scoring prospects.
 *
 * Schedule: Sunday 8:00 PM KST (full refresh) + on-demand per opportunity
 */
export class AtlasAgent extends BaseAgent {
  constructor() {
    super('ATLAS', 'claude-sonnet-4-20250514');
  }

  protected getSystemPrompts(): string[] {
    return [
      'You are part of HoloHive\'s multi-agent sales system. You communicate with other agents via structured handoffs.',
      ATLAS_SYSTEM_PROMPT,
    ];
  }

  protected async execute(params: Record<string, unknown>): Promise<AgentResult> {
    const opportunityId = params.opportunity_id as string | undefined;

    // Single opportunity scoring (on-demand)
    if (opportunityId) {
      return this.scoreOpportunity(opportunityId);
    }

    // Batch scoring (scheduled run)
    return this.batchScore(params);
  }

  /**
   * Score a single opportunity on-demand
   */
  private async scoreOpportunity(opportunityId: string): Promise<AgentResult> {
    // Fetch the opportunity
    const { data: opp, error } = await this.supabase
      .from('crm_opportunities')
      .select('*, affiliate:crm_affiliates(*), client:clients(*)')
      .eq('id', opportunityId)
      .single();

    if (error || !opp) {
      return { success: false, summary: { error: `Opportunity not found: ${opportunityId}` } };
    }

    // Fetch any active signals for this opportunity
    const { data: signals } = await this.supabase
      .from('signals')
      .select('*')
      .eq('opportunity_id', opportunityId)
      .eq('is_active', true)
      .order('detected_date', { ascending: false });

    const prompt = this.buildScoringPrompt([opp], signals || []);
    const response = await this.callAgent(prompt, { maxTokens: 2048 });

    // Parse the response
    const scored = this.parseScoreResponse(response.content);
    if (!scored || scored.length === 0) {
      return { success: false, summary: { error: 'Failed to parse scoring response', raw: response.content } };
    }

    const result = scored[0];

    // Update the opportunity with scores
    await this.updateOpportunity(opportunityId, {
      icp_fit_score: result.icp_fit_score,
      signal_strength_score: result.signal_strength_score,
      timing_score: result.timing_score,
      composite_score: result.composite_score,
      action_tier: result.action_tier,
      last_scored_at: new Date().toISOString(),
    });

    // Create handoff if score >= 60
    const handoffs: AgentResult['handoffs'] = [];
    if (result.composite_score >= 60) {
      handoffs.push({
        toAgent: 'MERCURY',
        type: 'OUTREACH_REQUEST',
        payload: {
          project: opp.name,
          score: result.composite_score,
          action_tier: result.action_tier,
          trigger: result.score_breakdown?.top_signal || 'High ICP fit',
          context: result.recommended_next_action || '',
        },
        opportunityId,
        priority: result.composite_score >= 80 ? 1 : 3,
      });
    }

    return {
      success: true,
      summary: {
        scored: 1,
        opportunity: opp.name,
        composite_score: result.composite_score,
        action_tier: result.action_tier,
        tokens_used: response.usage.input_tokens + response.usage.output_tokens,
        cost_usd: response.cost_usd,
      },
      handoffs,
    };
  }

  /**
   * Batch score all active opportunities (scheduled run)
   */
  private async batchScore(params: Record<string, unknown>): Promise<AgentResult> {
    const stages = (params.stages as string[]) || [
      'cold_dm', 'warm', 'tg_intro', 'booked', 'discovery_done',
      'proposal_call', 'v2_contract', 'orbit', 'nurture',
    ];

    const opportunities = await this.getOpportunities({ stages, limit: 100 });
    if (opportunities.length === 0) {
      return { success: true, summary: { scored: 0, message: 'No opportunities to score' } };
    }

    // Fetch all active signals
    const oppIds = opportunities.map((o: any) => o.id);
    const { data: allSignals } = await this.supabase
      .from('signals')
      .select('*')
      .in('opportunity_id', oppIds)
      .eq('is_active', true);

    // Process in batches of 10 to stay within token limits
    const batchSize = 10;
    let totalScored = 0;
    let totalHandoffs = 0;
    let totalTokens = 0;
    let totalCost = 0;
    const allHandoffs: AgentResult['handoffs'] = [];

    for (let i = 0; i < opportunities.length; i += batchSize) {
      const batch = opportunities.slice(i, i + batchSize);
      const batchSignals = (allSignals || []).filter((s: any) =>
        batch.some((o: any) => o.id === s.opportunity_id)
      );

      const prompt = this.buildScoringPrompt(batch, batchSignals);
      const response = await this.callAgent(prompt, { maxTokens: 4096 });

      totalTokens += response.usage.input_tokens + response.usage.output_tokens;
      totalCost += response.cost_usd;

      const scored = this.parseScoreResponse(response.content);
      if (!scored) continue;

      for (const result of scored) {
        const opp = batch.find((o: any) =>
          o.id === result.opportunity_id ||
          o.name?.toLowerCase() === result.project_name?.toLowerCase()
        );
        if (!opp) continue;

        await this.updateOpportunity(opp.id, {
          icp_fit_score: result.icp_fit_score,
          signal_strength_score: result.signal_strength_score,
          timing_score: result.timing_score,
          composite_score: result.composite_score,
          action_tier: result.action_tier,
          last_scored_at: new Date().toISOString(),
        });

        totalScored++;

        if (result.composite_score >= 60) {
          allHandoffs.push({
            toAgent: 'MERCURY',
            type: 'OUTREACH_REQUEST',
            payload: {
              project: opp.name,
              score: result.composite_score,
              action_tier: result.action_tier,
            },
            opportunityId: opp.id,
            priority: result.composite_score >= 80 ? 1 : 3,
          });
          totalHandoffs++;
        }
      }
    }

    return {
      success: true,
      summary: {
        scored: totalScored,
        total_opportunities: opportunities.length,
        outreach_requests: totalHandoffs,
        tokens_used: totalTokens,
        cost_usd: totalCost,
      },
      handoffs: allHandoffs,
    };
  }

  private buildScoringPrompt(opportunities: any[], signals: any[]): string {
    const oppData = opportunities.map((o: any) => ({
      id: o.id,
      name: o.name,
      stage: o.stage,
      deal_value: o.deal_value,
      website_url: o.website_url,
      category: o.category,
      funding_stage: o.funding_stage,
      funding_amount: o.funding_amount,
      lead_investors: o.lead_investors,
      korea_presence: o.korea_presence,
      token_status: o.token_status,
      tge_date: o.tge_date,
      product_status: o.product_status,
      team_doxxed: o.team_doxxed,
      narrative_fit: o.narrative_fit,
      twitter_handle: o.twitter_handle,
      twitter_followers: o.twitter_followers,
      temperature_score: o.temperature_score,
      bump_number: o.bump_number,
      notes: o.notes,
      current_scores: {
        icp_fit: o.icp_fit_score,
        signal_strength: o.signal_strength_score,
        timing: o.timing_score,
        composite: o.composite_score,
        action_tier: o.action_tier,
      },
      last_scored_at: o.last_scored_at,
      updated_at: o.updated_at,
    }));

    const signalData = signals.map((s: any) => ({
      opportunity_id: s.opportunity_id,
      signal_type: s.signal_type,
      signal_detail: s.signal_detail,
      tier: s.tier,
      confidence: s.confidence,
      detected_date: s.detected_date,
      expires_at: s.expires_at,
    }));

    return `Score the following prospects. Today's date is ${new Date().toISOString().split('T')[0]}.

PROSPECTS:
${JSON.stringify(oppData, null, 2)}

ACTIVE SIGNALS:
${signalData.length > 0 ? JSON.stringify(signalData, null, 2) : 'No active signals detected.'}

For each prospect, calculate ICP FIT (0-40), SIGNAL STRENGTH (0-35), TIMING (0-25), and COMPOSITE SCORE (0-100).
Apply score decay if last_scored_at is stale.
Determine the action tier based on the composite score.

Return your response as a JSON object with the structure:
{ "scored_prospects": [...], "summary": { "total_scored": N, "tier_changes": N, "outreach_requests": N } }`;
  }

  private parseScoreResponse(content: string): any[] | null {
    try {
      // Try to extract JSON from the response
      const jsonMatch = content.match(/\{[\s\S]*"scored_prospects"[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return parsed.scored_prospects || [];
      }

      // Try parsing the whole content as JSON
      const parsed = JSON.parse(content);
      if (Array.isArray(parsed)) return parsed;
      if (parsed.scored_prospects) return parsed.scored_prospects;

      return null;
    } catch {
      console.error('[ATLAS] Failed to parse score response');
      return null;
    }
  }
}
