/**
 * Scanner: CRM Enrichment (Tier 4)
 * Checks internal CRM data for enrichment signals.
 * Signals: previous_contact_positive (+5), previous_contact_cold (-5), warm_intro_available (+10)
 */

import type { ScannerModule, ScanContext, RawSignal } from '../types';
import { SIGNAL_WEIGHTS } from '../types';

export const crmEnrichmentScanner: ScannerModule = {
  id: 'crm_enrichment',
  name: 'CRM Enrichment (Contact History)',
  cadence: 'daily',
  requires: 'api',
  signalTypes: ['previous_contact_positive', 'previous_contact_cold', 'warm_intro_available'],

  async scan(ctx: ScanContext): Promise<RawSignal[]> {
    const signals: RawSignal[] = [];

    // Get all promoted prospects with their opportunity data
    const promotedProspects = ctx.prospects.filter(p => p.status === 'promoted');
    if (promotedProspects.length === 0) return signals;

    const promotedIds = promotedProspects.map(p => p.id);

    // Fetch promoted prospects with opportunity links
    const { data: promotedData } = await ctx.supabase
      .from('prospects')
      .select('id, name, promoted_opportunity_id')
      .in('id', promotedIds)
      .not('promoted_opportunity_id', 'is', null);

    if (!promotedData || promotedData.length === 0) return signals;

    const oppIds = promotedData.map((p: any) => p.promoted_opportunity_id).filter(Boolean);
    if (oppIds.length === 0) return signals;

    // Fetch opportunity data (stage, bump count, etc.)
    const { data: opportunities } = await ctx.supabase
      .from('crm_opportunities')
      .select('id, name, stage, bump_number, last_reply_at, lead_investors')
      .in('id', oppIds);

    if (!opportunities) return signals;

    const oppMap = new Map(opportunities.map((o: any) => [o.id, o]));

    // Get all active client investors for warm intro matching
    const { data: activeClients } = await ctx.supabase
      .from('crm_opportunities')
      .select('lead_investors')
      .eq('stage', 'v2_closed_won')
      .not('lead_investors', 'is', null);

    const clientInvestors = new Set<string>();
    for (const client of activeClients || []) {
      if (client.lead_investors) {
        client.lead_investors.split(',').forEach((inv: string) => {
          const trimmed = inv.trim().toLowerCase();
          if (trimmed.length > 2) clientInvestors.add(trimmed);
        });
      }
    }

    for (const prospect of promotedData) {
      const opp = oppMap.get(prospect.promoted_opportunity_id);
      if (!opp) continue;

      const positiveStages = ['booked', 'discovery_done', 'proposal_sent', 'proposal_call', 'v2_contract', 'v2_closed_won'];
      const coldStages = ['cold_dm', 'warm'];

      // Previous contact positive: reached booked+ stage
      if (positiveStages.includes(opp.stage)) {
        const config = SIGNAL_WEIGHTS.previous_contact_positive;
        signals.push({
          prospect_id: prospect.id,
          project_name: prospect.name,
          signal_type: 'previous_contact_positive',
          headline: `Previous positive contact (stage: ${opp.stage})`,
          snippet: `Had a previous call or positive exchange. Follow-up on new signals converts higher. "We spoke previously. Since then, [new signal]. Worth reconnecting?"`,
          source_url: '',
          source_name: 'crm',
          relevancy_weight: config.weight,
          tier: config.tier,
          shelf_life_days: config.shelf_life_days,
          expires_at: new Date(Date.now() + config.shelf_life_days * 24 * 60 * 60 * 1000).toISOString(),
        });
      }

      // Previous contact cold: bumped 3+ times with no reply in cold_dm/warm stages
      if (coldStages.includes(opp.stage) && opp.bump_number >= 3 && !opp.last_reply_at) {
        const config = SIGNAL_WEIGHTS.previous_contact_cold;
        signals.push({
          prospect_id: prospect.id,
          project_name: prospect.name,
          signal_type: 'previous_contact_cold',
          headline: `Previous outreach with no response (${opp.bump_number} bumps)`,
          snippet: `Reached out ${opp.bump_number} times with no response. Same angle = spam. Only re-engage with a NEW Tier 1/2 signal. Never reference old outreach.`,
          source_url: '',
          source_name: 'crm',
          relevancy_weight: config.weight,
          tier: config.tier,
          shelf_life_days: config.shelf_life_days,
          expires_at: new Date(Date.now() + config.shelf_life_days * 24 * 60 * 60 * 1000).toISOString(),
        });
      }

      // Warm intro available: shared investors with active clients
      if (opp.lead_investors) {
        const prospectInvestors = opp.lead_investors.split(',').map((s: string) => s.trim().toLowerCase());
        const sharedInvestors = prospectInvestors.filter((inv: string) => clientInvestors.has(inv));

        if (sharedInvestors.length > 0) {
          const config = SIGNAL_WEIGHTS.warm_intro_available;
          signals.push({
            prospect_id: prospect.id,
            project_name: prospect.name,
            signal_type: 'warm_intro_available',
            headline: `Warm intro possible via shared investor: ${sharedInvestors[0]}`,
            snippet: `Shared investor(s): ${sharedInvestors.join(', ')}. Warm intros convert 5-10x higher than cold DMs. "We work with several other [investor] portfolio companies on their Korean market entry."`,
            source_url: '',
            source_name: 'crm',
            relevancy_weight: config.weight,
            tier: config.tier,
            shelf_life_days: config.shelf_life_days,
            expires_at: new Date(Date.now() + config.shelf_life_days * 24 * 60 * 60 * 1000).toISOString(),
          });
        }
      }
    }

    return signals;
  },
};
