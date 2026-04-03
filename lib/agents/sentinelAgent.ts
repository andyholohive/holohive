import { BaseAgent, AgentResult } from './baseAgent';
import { SENTINEL_SYSTEM_PROMPT } from './brains/sentinel';

/**
 * SENTINEL Agent — Pipeline Manager
 *
 * Monitors pipeline health, flags stale deals, enforces stage gates,
 * and schedules follow-ups. Creates STALE_ALERT handoffs to MERCURY
 * and CALL_PREP_REQUEST handoffs to ORACLE.
 *
 * Schedule: Monday 8:00 AM KST (full review) + Thursday 8:00 AM KST (mid-week check)
 */
export class SentinelAgent extends BaseAgent {
  constructor() {
    super('SENTINEL', 'claude-sonnet-4-20250514');
  }

  protected getSystemPrompts(): string[] {
    return [
      'You are part of HoloHive\'s multi-agent sales system. You monitor pipeline health.',
      SENTINEL_SYSTEM_PROMPT,
    ];
  }

  protected async execute(params: Record<string, unknown>): Promise<AgentResult> {
    const reviewType = (params.review_type as string) || 'full';

    // Fetch all active pipeline opportunities
    const activeStages = [
      'cold_dm', 'warm', 'tg_intro', 'booked', 'discovery_done',
      'proposal_call', 'v2_contract', 'orbit', 'nurture',
    ];
    const opportunities = await this.getOpportunities({ stages: activeStages, limit: 200 });

    if (opportunities.length === 0) {
      return { success: true, summary: { reviewed: 0, message: 'No active opportunities' } };
    }

    // Fetch recent activities
    const oppIds = opportunities.map((o: any) => o.id);
    const { data: recentActivities } = await this.supabase
      .from('crm_activities')
      .select('opportunity_id, type, title, created_at')
      .in('opportunity_id', oppIds.slice(0, 50)) // Limit to avoid query size issues
      .order('created_at', { ascending: false })
      .limit(200);

    // Fetch outreach drafts status
    const { data: pendingDrafts } = await this.supabase
      .from('outreach_drafts')
      .select('opportunity_id, status, touch_number, created_at')
      .in('opportunity_id', oppIds.slice(0, 50))
      .eq('status', 'draft');

    // Build pipeline snapshot for Claude
    const prompt = this.buildReviewPrompt(opportunities, recentActivities || [], pendingDrafts || [], reviewType);
    const response = await this.callAgent(prompt, { maxTokens: 4096, temperature: 0.2 });

    const review = this.parseReview(response.content);
    if (!review) {
      return {
        success: false,
        summary: {
          error: 'Failed to parse pipeline review',
          tokens_used: response.usage.input_tokens + response.usage.output_tokens,
          cost_usd: response.cost_usd,
        },
      };
    }

    // Process recommended actions and create handoffs
    const handoffs: AgentResult['handoffs'] = [];

    // STALE_ALERTs → MERCURY for re-engagement drafts
    if (review.pipeline_health?.stale_deals?.length) {
      for (const stale of review.pipeline_health.stale_deals) {
        const opp = opportunities.find((o: any) =>
          o.id === stale.opportunity_id || o.name === stale.name
        );
        if (opp) {
          handoffs.push({
            toAgent: 'MERCURY',
            type: 'STALE_ALERT',
            payload: {
              project: opp.name,
              stage: opp.stage,
              days_stale: stale.days_stale || 7,
              recommendation: stale.action || 'Follow up',
            },
            opportunityId: opp.id,
            priority: 3,
          });
        }
      }
    }

    // CALL_PREP_REQUESTs → ORACLE for booked calls
    if (review.pipeline_health?.deals_at_risk?.length) {
      for (const deal of review.pipeline_health.deals_at_risk) {
        const opp = opportunities.find((o: any) =>
          o.id === deal.opportunity_id || o.name === deal.name
        );
        if (opp && ['booked', 'discovery_done', 'proposal_call'].includes(opp.stage)) {
          handoffs.push({
            toAgent: 'ORACLE',
            type: 'CALL_PREP_REQUEST',
            payload: {
              project: opp.name,
              stage: opp.stage,
              reason: deal.reason || 'At risk',
            },
            opportunityId: opp.id,
            priority: 2,
          });
        }
      }
    }

    return {
      success: true,
      summary: {
        review_type: reviewType,
        deals_reviewed: opportunities.length,
        stale_flagged: review.pipeline_health?.stale_deals?.length || 0,
        overdue_followups: review.pipeline_health?.overdue_followups?.length || 0,
        deals_at_risk: review.pipeline_health?.deals_at_risk?.length || 0,
        gate_violations: review.pipeline_health?.gate_violations?.length || 0,
        actions_recommended: review.recommended_actions?.length || 0,
        handoffs_created: handoffs.length,
        tokens_used: response.usage.input_tokens + response.usage.output_tokens,
        cost_usd: response.cost_usd,
        review, // Full review for UI display
      },
      handoffs,
    };
  }

  private buildReviewPrompt(
    opportunities: any[],
    activities: any[],
    pendingDrafts: any[],
    reviewType: string
  ): string {
    const now = new Date();
    const pipelineSnapshot = opportunities.map((o: any) => {
      const lastTouched = o.updated_at ? new Date(o.updated_at) : new Date(o.created_at);
      const daysSinceTouch = Math.floor((now.getTime() - lastTouched.getTime()) / 86400000);
      const oppActivities = activities.filter((a: any) => a.opportunity_id === o.id);
      const oppDrafts = pendingDrafts.filter((d: any) => d.opportunity_id === o.id);

      return {
        id: o.id,
        name: o.name,
        stage: o.stage,
        deal_value: o.deal_value,
        temperature_score: o.temperature_score,
        bump_number: o.bump_number,
        composite_score: o.composite_score,
        action_tier: o.action_tier,
        days_since_touch: daysSinceTouch,
        next_meeting_at: o.next_meeting_at,
        proposal_sent_at: o.proposal_sent_at,
        discovery_call_at: o.discovery_call_at,
        orbit_reason: o.orbit_reason,
        orbit_followup_days: o.orbit_followup_days,
        recent_activities: oppActivities.slice(0, 3).map((a: any) => ({
          type: a.type,
          title: a.title,
          date: a.created_at,
        })),
        pending_drafts: oppDrafts.length,
      };
    });

    return `Run a ${reviewType === 'full' ? 'full pipeline' : 'mid-week'} review.

Today's date is ${now.toISOString().split('T')[0]}.

PIPELINE SNAPSHOT (${opportunities.length} active deals):
${JSON.stringify(pipelineSnapshot, null, 2)}

Analyze the entire pipeline and identify:
1. Stale deals (>7 days without contact in active stages)
2. Overdue follow-ups
3. Deals at risk (low temperature in closing stages)
4. Gate violations (deals advancing without proper qualification)
5. Proposals past the 21-day death clock

For each issue, recommend a specific action.

Return your analysis as a JSON object matching the SENTINEL output format.
Do NOT include any text outside the JSON object.`;
  }

  private parseReview(content: string): any | null {
    try {
      const jsonMatch = content.match(/\{[\s\S]*"pipeline_health"[\s\S]*\}/);
      if (jsonMatch) return JSON.parse(jsonMatch[0]);
      return JSON.parse(content);
    } catch {
      console.error('[SENTINEL] Failed to parse pipeline review');
      return null;
    }
  }
}
