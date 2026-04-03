import { BaseAgent, AgentResult } from './baseAgent';
import { MERCURY_SYSTEM_PROMPT } from './brains/mercury';

/**
 * MERCURY Agent — Outreach Crafter
 *
 * Drafts personalized cold messages using the 4-Touch Framework.
 * Processes OUTREACH_REQUEST handoffs from ATLAS.
 * Applies 18-point quality gate to every message.
 *
 * Schedule: Daily 9:30 AM KST (after RADAR's 7 AM scan)
 */
export class MercuryAgent extends BaseAgent {
  constructor() {
    super('MERCURY', 'claude-sonnet-4-20250514');
  }

  protected getSystemPrompts(): string[] {
    return [
      'You are part of HoloHive\'s multi-agent sales system. You craft personalized cold messages.',
      MERCURY_SYSTEM_PROMPT,
    ];
  }

  protected async execute(params: Record<string, unknown>): Promise<AgentResult> {
    const opportunityId = params.opportunity_id as string | undefined;

    // Single opportunity draft (on-demand, similar to COLDCRAFT but lighter)
    if (opportunityId) {
      return this.draftForOpportunity(opportunityId, params);
    }

    // Batch drafting (scheduled run — process handoffs)
    return this.batchDraft();
  }

  /**
   * Draft message for a single opportunity
   */
  private async draftForOpportunity(
    opportunityId: string,
    params: Record<string, unknown>
  ): Promise<AgentResult> {
    const channel = (params.channel as string) || 'telegram';
    const touchNumber = (params.touch_number as number) || 1;

    const { data: opp, error } = await this.supabase
      .from('crm_opportunities')
      .select('*, affiliate:crm_affiliates(*)')
      .eq('id', opportunityId)
      .single();

    if (error || !opp) {
      return { success: false, summary: { error: `Opportunity not found: ${opportunityId}` } };
    }

    // Fetch previous outreach for this opportunity
    const { data: previousOutreach } = await this.supabase
      .from('outreach_drafts')
      .select('touch_number, channel, framework_used, message_draft')
      .eq('opportunity_id', opportunityId)
      .order('touch_number', { ascending: true });

    const prompt = this.buildDraftPrompt(opp, channel, touchNumber, previousOutreach || []);
    const response = await this.callAgent(prompt, { maxTokens: 2048, temperature: 0.4 });

    const draft = this.parseDraft(response.content);
    if (!draft) {
      return {
        success: false,
        summary: {
          error: 'Failed to parse message draft',
          raw_response: response.content,
          tokens_used: response.usage.input_tokens + response.usage.output_tokens,
          cost_usd: response.cost_usd,
        },
      };
    }

    // Store the draft
    const trackingId = `MERC-${new Date().toISOString().split('T')[0].replace(/-/g, '')}-${Math.random().toString(36).substring(2, 5).toUpperCase()}`;

    const { data: savedDraft } = await this.supabase
      .from('outreach_drafts')
      .insert({
        opportunity_id: opportunityId,
        tracking_id: trackingId,
        touch_number: draft.touch_number || touchNumber,
        channel: draft.channel || channel,
        trigger_used: draft.template_type || null,
        message_draft: draft.message_draft,
        framework_used: draft.framework_used || null,
        template_type: draft.template_type || null,
        outcome_framing: draft.outcome_framing || {},
        quality_gate_passed: draft.quality_gate_passed || false,
        quality_gate_details: draft.quality_gate_details || {},
        status: 'draft',
        created_by: 'MERCURY',
      })
      .select('id')
      .single();

    // Create handoff to SENTINEL for tracking
    const handoffs: AgentResult['handoffs'] = [{
      toAgent: 'SENTINEL',
      type: 'OUTREACH_LOG',
      payload: {
        tracking_id: trackingId,
        project: opp.name,
        touch_number: draft.touch_number || touchNumber,
        channel: draft.channel || channel,
        quality_gate_passed: draft.quality_gate_passed || false,
      },
      opportunityId,
      priority: 5,
    }];

    return {
      success: true,
      summary: {
        project_name: opp.name,
        tracking_id: trackingId,
        touch_number: draft.touch_number || touchNumber,
        channel: draft.channel || channel,
        framework_used: draft.framework_used,
        quality_gate_passed: draft.quality_gate_passed || false,
        message_preview: draft.message_draft?.substring(0, 100),
        draft_id: savedDraft?.id || null,
        tokens_used: response.usage.input_tokens + response.usage.output_tokens,
        cost_usd: response.cost_usd,
        draft, // Full draft for UI
      },
      handoffs,
    };
  }

  /**
   * Batch draft for all pending OUTREACH_REQUEST handoffs
   */
  private async batchDraft(): Promise<AgentResult> {
    const handoffs = await this.processHandoffs();
    const outreachRequests = handoffs.filter(h => h.handoff_type === 'OUTREACH_REQUEST');

    if (outreachRequests.length === 0) {
      return { success: true, summary: { drafts_created: 0, message: 'No outreach requests pending' } };
    }

    let draftsCreated = 0;
    let totalTokens = 0;
    let totalCost = 0;
    const outboundHandoffs: AgentResult['handoffs'] = [];

    for (const handoff of outreachRequests) {
      const oppId = handoff.opportunity_id;
      if (!oppId) {
        await this.failHandoff(handoff.id);
        continue;
      }

      const result = await this.draftForOpportunity(oppId, {
        channel: (handoff.payload as any).channel || 'telegram',
        touch_number: (handoff.payload as any).touch_number || 1,
      });

      if (result.success) {
        draftsCreated++;
        totalTokens += (result.summary.tokens_used as number) || 0;
        totalCost += (result.summary.cost_usd as number) || 0;
        if (result.handoffs) outboundHandoffs.push(...result.handoffs);
        await this.completeHandoff(handoff.id);
      } else {
        await this.failHandoff(handoff.id);
      }
    }

    return {
      success: true,
      summary: {
        drafts_created: draftsCreated,
        requests_processed: outreachRequests.length,
        tokens_used: totalTokens,
        cost_usd: totalCost,
      },
      handoffs: outboundHandoffs,
    };
  }

  private buildDraftPrompt(
    opp: any,
    channel: string,
    touchNumber: number,
    previousOutreach: any[]
  ): string {
    const oppData = {
      name: opp.name,
      stage: opp.stage,
      category: opp.category,
      website_url: opp.website_url,
      funding_stage: opp.funding_stage,
      funding_amount: opp.funding_amount,
      token_status: opp.token_status,
      tge_date: opp.tge_date,
      korea_presence: opp.korea_presence,
      twitter_handle: opp.twitter_handle,
      twitter_followers: opp.twitter_followers,
      personality_type: opp.personality_type,
      temperature_score: opp.temperature_score,
      composite_score: opp.composite_score,
      action_tier: opp.action_tier,
      notes: opp.notes,
      tg_handle: opp.tg_handle,
    };

    return `Draft a Touch ${touchNumber} ${channel} message for this prospect.

Today's date is ${new Date().toISOString().split('T')[0]}.

PROSPECT:
${JSON.stringify(oppData, null, 2)}

CHANNEL: ${channel}
TOUCH NUMBER: ${touchNumber}

PREVIOUS OUTREACH:
${previousOutreach.length > 0 ? JSON.stringify(previousOutreach, null, 2) : 'No previous touches.'}

Write one message following the 4-Touch Framework and all voice rules.
Run the full 5-Step Outcome Framing Engine before writing.
Apply all 18 quality gate checks.

Return your response as a single JSON object matching the MERCURY output format.
Do NOT include any text outside the JSON object.`;
  }

  private parseDraft(content: string): any | null {
    try {
      const jsonMatch = content.match(/\{[\s\S]*"message_draft"[\s\S]*\}/);
      if (jsonMatch) return JSON.parse(jsonMatch[0]);
      return JSON.parse(content);
    } catch {
      console.error('[MERCURY] Failed to parse draft response');
      return null;
    }
  }
}
