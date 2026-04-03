import { BaseAgent, AgentResult } from './baseAgent';
import { FORGE_SYSTEM_PROMPT } from './brains/forge';

/**
 * FORGE Agent — Content Engine
 *
 * Generates proof material, case studies, and @0xYano content.
 * Maintains the proof-index for MERCURY Touch 3+ messages.
 *
 * Schedule: Tuesday + Thursday 10:00 AM KST (batch production)
 */
export class ForgeAgent extends BaseAgent {
  constructor() {
    super('FORGE', 'claude-sonnet-4-20250514');
  }

  protected getSystemPrompts(): string[] {
    return [
      'You are part of HoloHive\'s multi-agent sales system. You generate proof material and content.',
      FORGE_SYSTEM_PROMPT,
    ];
  }

  protected async execute(params: Record<string, unknown>): Promise<AgentResult> {
    const contentType = (params.content_type as string) || 'batch';
    const topic = params.topic as string | undefined;

    // Fetch recent closed-won deals for case study material
    const { data: closedWon } = await this.supabase
      .from('crm_opportunities')
      .select('name, deal_value, category, notes, closed_at')
      .eq('stage', 'v2_closed_won')
      .order('closed_at', { ascending: false })
      .limit(10);

    // Fetch high-score opportunities for proof point context
    const highScoreOpps = await this.getOpportunities({
      stages: ['booked', 'discovery_done', 'proposal_call', 'v2_contract'],
      minScore: 60,
      limit: 10,
    });

    const prompt = this.buildContentPrompt(contentType, topic, closedWon || [], highScoreOpps);
    const response = await this.callAgent(prompt, { maxTokens: 4096, temperature: 0.6 });

    const content = this.parseContent(response.content);
    if (!content) {
      return {
        success: false,
        summary: {
          error: 'Failed to parse content output',
          tokens_used: response.usage.input_tokens + response.usage.output_tokens,
          cost_usd: response.cost_usd,
        },
      };
    }

    // Store content items as prospect intel (proof material)
    let itemsStored = 0;
    if (content.content_items?.length) {
      for (const item of content.content_items) {
        await this.supabase.from('prospect_intel').insert({
          opportunity_id: null, // General proof material, not tied to specific opportunity
          intel_type: `forge_${item.type || 'content'}`,
          content: item,
          confidence: 1.0,
          refreshed_at: new Date().toISOString(),
        });
        itemsStored++;
      }
    }

    // Create PROOF_UPDATE handoffs to notify MERCURY
    const handoffs: AgentResult['handoffs'] = [];
    if (itemsStored > 0) {
      handoffs.push({
        toAgent: 'MERCURY',
        type: 'PROOF_UPDATE',
        payload: {
          items_produced: itemsStored,
          categories: content.summary?.categories || {},
          content_types: content.content_items?.map((i: any) => i.type) || [],
        },
        priority: 7,
      });
    }

    return {
      success: true,
      summary: {
        content_type: contentType,
        items_produced: itemsStored,
        categories: content.summary?.categories || {},
        tokens_used: response.usage.input_tokens + response.usage.output_tokens,
        cost_usd: response.cost_usd,
      },
      handoffs,
    };
  }

  private buildContentPrompt(
    contentType: string,
    topic: string | undefined,
    closedWon: any[],
    highScoreOpps: any[]
  ): string {
    const closedWonSummary = closedWon.map((o: any) => ({
      name: o.name,
      deal_value: o.deal_value,
      category: o.category,
      closed_at: o.closed_at,
    }));

    const pipelineContext = highScoreOpps.map((o: any) => ({
      name: o.name,
      category: o.category,
      stage: o.stage,
      composite_score: o.composite_score,
    }));

    const topicLine = topic ? `\nFOCUS TOPIC: ${topic}\n` : '';

    return `Generate a ${contentType === 'batch' ? 'batch of 3-5' : 'single'} content piece(s) for HoloHive's sales enablement.

Today's date is ${new Date().toISOString().split('T')[0]}.
${topicLine}
RECENT CLOSED DEALS (for case study material):
${closedWonSummary.length > 0 ? JSON.stringify(closedWonSummary, null, 2) : 'No recent closed deals.'}

ACTIVE HIGH-VALUE PIPELINE (for relevant proof points):
${pipelineContext.length > 0 ? JSON.stringify(pipelineContext, null, 2) : 'No high-score opportunities currently.'}

Generate content that can be used by:
- MERCURY for Touch 3+ outreach (proof material)
- ORACLE for call prep (case studies, market data)
- @0xYano Twitter threads (thought leadership)

Each piece should include specific, verifiable claims where possible.
Focus on Korea market dynamics, Web3 expansion strategy, and sector-specific insights.

Return your output as a JSON object matching the FORGE output format.
Do NOT include any text outside the JSON object.`;
  }

  private parseContent(content: string): any | null {
    try {
      const jsonMatch = content.match(/\{[\s\S]*"content_items"[\s\S]*\}/);
      if (jsonMatch) return JSON.parse(jsonMatch[0]);
      return JSON.parse(content);
    } catch {
      console.error('[FORGE] Failed to parse content output');
      return null;
    }
  }
}
