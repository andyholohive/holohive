import { BaseAgent, AgentResult } from './baseAgent';
import { COLDCRAFT_SYSTEM_PROMPT } from './brains/coldcraft';

/**
 * COLDCRAFT Agent — Cold Message Generator
 *
 * Deep per-prospect message generation with the full 8-step process.
 * More thorough than MERCURY — does individual research per prospect.
 *
 * Trigger: On-demand — user requests a cold message for a specific prospect
 */
export class ColdcraftAgent extends BaseAgent {
  constructor() {
    super('COLDCRAFT', 'claude-sonnet-4-20250514');
  }

  protected getSystemPrompts(): string[] {
    return [
      'You are part of HoloHive\'s multi-agent sales system. You generate deeply personalized cold messages.',
      COLDCRAFT_SYSTEM_PROMPT,
    ];
  }

  protected async execute(params: Record<string, unknown>): Promise<AgentResult> {
    const opportunityId = params.opportunity_id as string;
    const channel = (params.channel as string) || 'telegram';
    const touchNumber = (params.touch_number as number) || 1;

    if (!opportunityId) {
      return { success: false, summary: { error: 'opportunity_id is required' } };
    }

    // Fetch the opportunity
    const { data: opp, error } = await this.supabase
      .from('crm_opportunities')
      .select('*, affiliate:crm_affiliates(*)')
      .eq('id', opportunityId)
      .single();

    if (error || !opp) {
      return { success: false, summary: { error: `Opportunity not found: ${opportunityId}` } };
    }

    // Fetch existing intel
    const { data: intel } = await this.supabase
      .from('prospect_intel')
      .select('*')
      .eq('opportunity_id', opportunityId)
      .order('refreshed_at', { ascending: false });

    // Fetch previous outreach
    const { data: previousOutreach } = await this.supabase
      .from('outreach_drafts')
      .select('touch_number, channel, framework_used, message_draft, quality_gate_passed')
      .eq('opportunity_id', opportunityId)
      .order('touch_number', { ascending: true });

    // Fetch active signals
    const { data: signals } = await this.supabase
      .from('signals')
      .select('*')
      .eq('opportunity_id', opportunityId)
      .eq('is_active', true);

    const prompt = this.buildColdcraftPrompt(opp, channel, touchNumber, intel || [], previousOutreach || [], signals || []);
    const response = await this.callAgent(prompt, { maxTokens: 4096, temperature: 0.4 });

    const draft = this.parseDraft(response.content);
    if (!draft) {
      return {
        success: false,
        summary: {
          error: 'Failed to parse COLDCRAFT response',
          raw_response: response.content,
          tokens_used: response.usage.input_tokens + response.usage.output_tokens,
          cost_usd: response.cost_usd,
        },
      };
    }

    // Store the draft
    const trackingId = `COLD-${new Date().toISOString().split('T')[0].replace(/-/g, '')}-${Math.random().toString(36).substring(2, 5).toUpperCase()}`;

    const { data: savedDraft } = await this.supabase
      .from('outreach_drafts')
      .insert({
        opportunity_id: opportunityId,
        tracking_id: trackingId,
        touch_number: draft.touch_number || touchNumber,
        channel: draft.channel || channel,
        trigger_used: draft.generation_steps?.template_type || null,
        message_draft: draft.message_draft,
        framework_used: draft.generation_steps?.framework_selected || null,
        template_type: draft.generation_steps?.template_type || null,
        outcome_framing: draft.generation_steps?.outcome_framing || {},
        quality_gate_passed: draft.quality_gate_passed || false,
        quality_gate_details: draft.quality_gate_details || {},
        status: 'draft',
        created_by: 'COLDCRAFT',
      })
      .select('id')
      .single();

    // Also store alternatives if provided
    if (draft.alternative_messages?.length) {
      for (const alt of draft.alternative_messages) {
        await this.supabase.from('outreach_drafts').insert({
          opportunity_id: opportunityId,
          tracking_id: `${trackingId}-ALT`,
          touch_number: draft.touch_number || touchNumber,
          channel: draft.channel || channel,
          message_draft: alt,
          status: 'draft',
          created_by: 'COLDCRAFT',
        });
      }
    }

    return {
      success: true,
      summary: {
        project_name: opp.name,
        tracking_id: trackingId,
        touch_number: draft.touch_number || touchNumber,
        channel: draft.channel || channel,
        framework_used: draft.generation_steps?.framework_selected,
        quality_gate_passed: draft.quality_gate_passed || false,
        message_draft: draft.message_draft,
        alternative_count: draft.alternative_messages?.length || 0,
        draft_id: savedDraft?.id || null,
        tokens_used: response.usage.input_tokens + response.usage.output_tokens,
        cost_usd: response.cost_usd,
        draft, // Full response for UI
      },
    };
  }

  private buildColdcraftPrompt(
    opp: any,
    channel: string,
    touchNumber: number,
    intel: any[],
    previousOutreach: any[],
    signals: any[]
  ): string {
    const oppData = {
      name: opp.name,
      stage: opp.stage,
      category: opp.category,
      website_url: opp.website_url,
      funding_stage: opp.funding_stage,
      funding_amount: opp.funding_amount,
      lead_investors: opp.lead_investors,
      token_status: opp.token_status,
      tge_date: opp.tge_date,
      korea_presence: opp.korea_presence,
      product_status: opp.product_status,
      twitter_handle: opp.twitter_handle,
      twitter_followers: opp.twitter_followers,
      personality_type: opp.personality_type,
      narrative_fit: opp.narrative_fit,
      temperature_score: opp.temperature_score,
      composite_score: opp.composite_score,
      action_tier: opp.action_tier,
      notes: opp.notes,
      tg_handle: opp.tg_handle,
    };

    const intelSummary = intel.map((i: any) => ({
      type: i.intel_type,
      content: i.content,
    }));

    return `Generate a deeply personalized cold message using the full 8-step COLDCRAFT process.

Today's date is ${new Date().toISOString().split('T')[0]}.

PROSPECT:
${JSON.stringify(oppData, null, 2)}

CHANNEL: ${channel}
TOUCH NUMBER: ${touchNumber}

EXISTING INTELLIGENCE:
${intelSummary.length > 0 ? JSON.stringify(intelSummary, null, 2) : 'No existing intel.'}

ACTIVE SIGNALS:
${signals.length > 0 ? JSON.stringify(signals.map((s: any) => ({ type: s.signal_type, detail: s.signal_detail, tier: s.tier })), null, 2) : 'No active signals.'}

PREVIOUS OUTREACH:
${previousOutreach.length > 0 ? JSON.stringify(previousOutreach, null, 2) : 'No previous touches.'}

Run the complete 8-step generation process:
1. Gather inputs
2. Run Outcome Framing Engine
3. Qualify (ICP fit, trigger freshness)
4. Understand current state
5. Find the bottleneck
6. Select pattern interrupt + template
7. Write the message
8. Run Quality Gate (all 18 checks)

Also generate 2 alternative messages using different frameworks.

Return your response as a single JSON object matching the COLDCRAFT output format.
Do NOT include any text outside the JSON object.`;
  }

  private parseDraft(content: string): any | null {
    try {
      const jsonMatch = content.match(/\{[\s\S]*"message_draft"[\s\S]*\}/);
      if (jsonMatch) return JSON.parse(jsonMatch[0]);
      return JSON.parse(content);
    } catch {
      console.error('[COLDCRAFT] Failed to parse response');
      return null;
    }
  }
}
