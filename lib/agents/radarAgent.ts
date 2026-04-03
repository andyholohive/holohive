import { BaseAgent, AgentResult } from './baseAgent';
import { RADAR_SYSTEM_PROMPT } from './brains/radar';

/**
 * RADAR Agent — Signal Scanner
 *
 * Scans for actionable signals across active pipeline opportunities.
 * Detects TGE announcements, funding rounds, Korea hires, exchange listings, etc.
 * Creates SIGNAL_HANDOFF to ATLAS for scoring updates.
 *
 * Schedule: Daily 7:00 AM KST (morning scan) + 6:00 PM KST (emergency Tier 1 only)
 */
export class RadarAgent extends BaseAgent {
  constructor() {
    super('RADAR', 'claude-sonnet-4-20250514');
  }

  protected getSystemPrompts(): string[] {
    return [
      'You are part of HoloHive\'s multi-agent sales system. You scan for actionable signals.',
      RADAR_SYSTEM_PROMPT,
    ];
  }

  protected async execute(params: Record<string, unknown>): Promise<AgentResult> {
    const scanType = (params.scan_type as string) || 'morning';
    const tierFilter = scanType === 'emergency' ? [1] : [1, 2, 3];

    // Fetch active opportunities to scan
    const stages = [
      'cold_dm', 'warm', 'tg_intro', 'booked', 'discovery_done',
      'proposal_call', 'v2_contract', 'orbit', 'nurture',
    ];
    const opportunities = await this.getOpportunities({ stages, limit: 50 });

    if (opportunities.length === 0) {
      return { success: true, summary: { signals_found: 0, message: 'No opportunities to scan' } };
    }

    // Fetch recent signals to avoid duplicates
    const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();
    const { data: recentSignals } = await this.supabase
      .from('signals')
      .select('opportunity_id, signal_type, signal_detail')
      .gte('created_at', sevenDaysAgo);

    const prompt = this.buildScanPrompt(opportunities, recentSignals || [], tierFilter);
    const response = await this.callAgent(prompt, { maxTokens: 4096, temperature: 0.2 });

    // Parse signals from response
    const parsed = this.parseSignals(response.content);
    if (!parsed || !parsed.signals?.length) {
      return {
        success: true,
        summary: {
          signals_found: 0,
          scan_type: scanType,
          opportunities_scanned: opportunities.length,
          tokens_used: response.usage.input_tokens + response.usage.output_tokens,
          cost_usd: response.cost_usd,
        },
      };
    }

    // Store signals and create handoffs
    let signalsStored = 0;
    const handoffs: AgentResult['handoffs'] = [];

    for (const signal of parsed.signals) {
      // Find matching opportunity
      const opp = opportunities.find((o: any) =>
        o.name?.toLowerCase() === signal.project?.toLowerCase() ||
        o.name?.toLowerCase().includes(signal.project?.toLowerCase())
      );

      const opportunityId = opp?.id || null;

      // Insert signal
      const { error } = await this.supabase.from('signals').insert({
        opportunity_id: opportunityId,
        signal_type: signal.signal_type,
        signal_category: signal.tier <= 2 ? 'TRIGGER_EVENT' : 'BEHAVIORAL',
        signal_detail: signal.signal_detail,
        source_url: signal.source_url || null,
        tier: signal.tier,
        confidence: signal.confidence || 'LIKELY',
        shelf_life_days: signal.shelf_life_days || 30,
        detected_date: signal.detected || new Date().toISOString().split('T')[0],
        expires_at: this.calculateExpiry(signal.detected, signal.shelf_life_days),
        is_active: true,
        detected_by: 'RADAR',
      });

      if (!error) {
        signalsStored++;

        // Update last_signal_at on the opportunity
        if (opportunityId) {
          await this.updateOpportunity(opportunityId, {
            last_signal_at: new Date().toISOString(),
          });

          // Create handoff to ATLAS for re-scoring
          handoffs.push({
            toAgent: 'ATLAS',
            type: 'SIGNAL_HANDOFF',
            payload: {
              project: signal.project,
              signal_type: signal.signal_type,
              signal_detail: signal.signal_detail,
              tier: signal.tier,
              confidence: signal.confidence,
              recommended_action_tier: signal.recommended_action_tier,
            },
            opportunityId,
            priority: signal.tier === 1 ? 1 : signal.tier === 2 ? 3 : 5,
          });
        }
      }
    }

    return {
      success: true,
      summary: {
        signals_found: parsed.signals.length,
        signals_stored: signalsStored,
        scan_type: scanType,
        opportunities_scanned: opportunities.length,
        tier_1: parsed.scan_summary?.tier_1 || 0,
        tier_2: parsed.scan_summary?.tier_2 || 0,
        tier_3: parsed.scan_summary?.tier_3 || 0,
        tokens_used: response.usage.input_tokens + response.usage.output_tokens,
        cost_usd: response.cost_usd,
      },
      handoffs,
    };
  }

  private buildScanPrompt(opportunities: any[], recentSignals: any[], tierFilter: number[]): string {
    const oppList = opportunities.map((o: any) => ({
      name: o.name,
      stage: o.stage,
      website_url: o.website_url,
      category: o.category,
      twitter_handle: o.twitter_handle,
      token_status: o.token_status,
      tge_date: o.tge_date,
      last_signal_at: o.last_signal_at,
    }));

    const recentSignalsList = recentSignals.map((s: any) => ({
      project: s.opportunity_id,
      type: s.signal_type,
      detail: s.signal_detail,
    }));

    return `Run a ${tierFilter.includes(3) ? 'full morning' : 'emergency Tier 1'} signal scan.

Today's date is ${new Date().toISOString().split('T')[0]}.

CURRENT PROSPECT DATABASE (${opportunities.length} prospects):
${JSON.stringify(oppList, null, 2)}

SIGNALS FROM LAST 7 DAYS (avoid duplicates):
${recentSignalsList.length > 0 ? JSON.stringify(recentSignalsList, null, 2) : 'None detected recently.'}

TIER FILTER: Only report Tier ${tierFilter.join(', ')} signals.

Scan for signals across all prospects. For each signal detected, include it in your response.
Based on publicly available information and your knowledge, identify any:
- TGE announcements, funding rounds, Korea BD hires
- Exchange listings, mainnet launches, partnerships
- Behavioral signals (social media activity about Asia/Korea)
- Contextual signals (market trends relevant to these projects)

Return your response as a JSON object:
{ "signals": [...], "scan_summary": { "total_found": N, "tier_1": N, "tier_2": N, "tier_3": N } }

If no new signals are found, return: { "signals": [], "scan_summary": { "total_found": 0, "tier_1": 0, "tier_2": 0, "tier_3": 0 } }`;
  }

  private parseSignals(content: string): any | null {
    try {
      const jsonMatch = content.match(/\{[\s\S]*"signals"[\s\S]*\}/);
      if (jsonMatch) return JSON.parse(jsonMatch[0]);
      return JSON.parse(content);
    } catch {
      console.error('[RADAR] Failed to parse signal scan response');
      return null;
    }
  }

  private calculateExpiry(detected: string | undefined, shelfLifeDays: number | undefined): string {
    const base = detected ? new Date(detected) : new Date();
    const days = shelfLifeDays || 30;
    base.setDate(base.getDate() + days);
    return base.toISOString().split('T')[0];
  }
}
