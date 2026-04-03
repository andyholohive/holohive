import { BaseAgent, AgentResult } from './baseAgent';
import { SCOUT_SYSTEM_PROMPT } from './brains/scout';

/**
 * SCOUT Agent — Prospect Qualifier
 *
 * Evaluates a project URL or name against ICP criteria.
 * Returns a qualification report with scores and recommended actions.
 * Can optionally create a new crm_opportunity if qualified.
 *
 * Trigger: On-demand — user submits a URL with "scout this project"
 */
export class ScoutAgent extends BaseAgent {
  constructor() {
    super('SCOUT', 'claude-sonnet-4-20250514');
  }

  protected getSystemPrompts(): string[] {
    return [
      'You are part of HoloHive\'s multi-agent sales system. You qualify Web3 projects for Korea market entry services.',
      SCOUT_SYSTEM_PROMPT,
    ];
  }

  protected async execute(params: Record<string, unknown>): Promise<AgentResult> {
    const url = params.url as string | undefined;
    const companyName = params.company_name as string | undefined;
    const autoCreate = params.auto_create as boolean ?? false;

    if (!url && !companyName) {
      return { success: false, summary: { error: 'Either url or company_name is required' } };
    }

    // Build the qualification prompt
    const prompt = this.buildQualificationPrompt(url, companyName);
    const response = await this.callAgent(prompt, { maxTokens: 4096, temperature: 0.2 });

    // Parse the report
    const report = this.parseReport(response.content);
    if (!report) {
      return {
        success: false,
        summary: {
          error: 'Failed to parse qualification report',
          raw_response: response.content,
          tokens_used: response.usage.input_tokens + response.usage.output_tokens,
          cost_usd: response.cost_usd,
        },
      };
    }

    const handoffs: AgentResult['handoffs'] = [];

    // If qualified and auto_create, create an opportunity
    if (report.qualified && autoCreate) {
      const oppId = await this.createOpportunityFromReport(report);
      if (oppId) {
        report.opportunity_id = oppId;

        // Hand off to ATLAS for scoring
        handoffs.push({
          toAgent: 'ATLAS',
          type: 'SCORE_UPDATE',
          payload: {
            project: report.project_name,
            source: 'SCOUT',
            signals: report.signals_detected || [],
            enrichment: report.enrichment || {},
          },
          opportunityId: oppId,
          priority: report.scores?.composite >= 60 ? 2 : 5,
        });
      }
    }

    return {
      success: true,
      summary: {
        project_name: report.project_name,
        qualified: report.qualified,
        criteria_passed: report.icp_check?.criteria_passed || '0/6',
        composite_score: report.scores?.composite || 0,
        action_tier: report.action_tier || 'SKIP',
        disqualification_reason: report.disqualification_reason || null,
        opportunity_created: !!report.opportunity_id,
        opportunity_id: report.opportunity_id || null,
        tokens_used: response.usage.input_tokens + response.usage.output_tokens,
        cost_usd: response.cost_usd,
        report, // Full report included for UI display
      },
      handoffs,
    };
  }

  private buildQualificationPrompt(url?: string, companyName?: string): string {
    const target = url
      ? `URL to analyze: ${url}`
      : `Company/project name to research: ${companyName}`;

    return `Qualify the following prospect for HoloHive's Korea market entry services.

${target}

Today's date is ${new Date().toISOString().split('T')[0]}.

Complete all 7 steps of the qualification process:
1. Research the project
2. Run ICP qualification (all 6 criteria must pass)
3. Extract active signals
4. Run enrichment pipeline
5. Calculate prospect score (0-100)
6. Determine action tier
7. Deliver structured report

IMPORTANT: Based on publicly available information, provide your best assessment.
If you cannot verify certain criteria, note your confidence level.

Return your complete analysis as a single JSON object matching the SCOUT output format.
Do NOT include any text outside the JSON object.`;
  }

  private parseReport(content: string): any | null {
    try {
      // Try to extract JSON from response
      const jsonMatch = content.match(/\{[\s\S]*"project_name"[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }

      // Try parsing whole content
      return JSON.parse(content);
    } catch {
      console.error('[SCOUT] Failed to parse qualification report');
      return null;
    }
  }

  private async createOpportunityFromReport(report: any): Promise<string | null> {
    try {
      const enrichment = report.enrichment || {};
      const scores = report.scores || {};

      const { data, error } = await this.supabase
        .from('crm_opportunities')
        .insert({
          name: report.project_name,
          stage: 'cold_dm',
          source: 'ai_scout',
          website_url: report.url_analyzed || null,
          category: enrichment.category || null,
          funding_stage: enrichment.funding_round || null,
          funding_amount: enrichment.funding_amount || null,
          lead_investors: enrichment.lead_investors || null,
          korea_presence: enrichment.korea_presence || 'NONE',
          token_status: enrichment.token_status || null,
          tge_date: enrichment.tge_date || null,
          product_status: enrichment.product_status || null,
          team_doxxed: enrichment.team_doxxed || null,
          narrative_fit: enrichment.narrative_fit || null,
          twitter_followers: enrichment.twitter_followers || null,
          icp_fit_score: scores.icp_fit || 0,
          signal_strength_score: scores.signal_strength || 0,
          timing_score: scores.timing || 0,
          composite_score: scores.composite || 0,
          action_tier: report.action_tier || null,
          last_scored_at: new Date().toISOString(),
          notes: `Qualified by SCOUT agent. ${report.recommended_next_step || ''}`.trim(),
        })
        .select('id')
        .single();

      if (error) {
        console.error('[SCOUT] Failed to create opportunity:', error);
        return null;
      }

      // Store intel data
      if (report.enrichment) {
        await this.supabase.from('prospect_intel').insert({
          opportunity_id: data.id,
          intel_type: 'scout_report',
          content: report,
          confidence: 0.7,
        });
      }

      // Store detected signals
      if (report.signals_detected?.length) {
        const signalRecords = report.signals_detected.map((s: any) => ({
          opportunity_id: data.id,
          signal_type: s.signal_type,
          signal_detail: s.signal_detail,
          tier: s.tier,
          confidence: s.confidence,
          detected_date: new Date().toISOString().split('T')[0],
          is_active: true,
          detected_by: 'SCOUT',
          shelf_life_days: s.tier === 1 ? 14 : s.tier === 2 ? 30 : 60,
          expires_at: new Date(Date.now() + (s.tier === 1 ? 14 : s.tier === 2 ? 30 : 60) * 86400000).toISOString().split('T')[0],
        }));

        await this.supabase.from('signals').insert(signalRecords).throwOnError().catch(() => {
          // signals table may not exist yet (Phase 3), skip silently
        });
      }

      return data.id;
    } catch (error) {
      console.error('[SCOUT] Error creating opportunity:', error);
      return null;
    }
  }
}
