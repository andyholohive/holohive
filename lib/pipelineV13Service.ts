import { supabase } from './supabase';

/**
 * Pipeline v1.3 — the deal funnel from Yano's CRM spec.
 *
 * Reads the same `crm_opportunities` rows as the legacy Sales board, through
 * the `pipeline_stage` column rather than `stage`. The two vocabularies do not
 * map cleanly (12 DM-funnel values vs 6 deal-funnel ones), so both columns
 * exist during the changeover and a database trigger carries legacy moves
 * forward. Nothing was deleted; when this board has proved itself the old
 * column and page retire together.
 *
 * This service deliberately writes only `pipeline_stage`. Mapping v1.3 back
 * onto the legacy vocabulary is lossy — 'negotiation' has no value the old
 * kanban renders — and a lossy write-back would make cards vanish from the old
 * board with nothing to explain it.
 */

export type PipelineStage =
  | 'prospect' | 'new_lead' | 'qualified' | 'discovery' | 'proposal'
  | 'negotiation' | 'contract' | 'closed_won' | 'closed_lost' | 'orbit';

/** The six columns on the board.
 *
 *  'prospect' is deliberately absent: 602 opportunities are still being cold-
 *  DM'd and belong to the Outreach board. Putting them here would bury the
 *  ~40 real deals and drown the weighted total, which is the one number this
 *  board exists to produce. They join at new_lead the moment outreach gets a
 *  reply. Won / lost / orbit are outcomes, not columns. */
export const BOARD_STAGES: PipelineStage[] = [
  'new_lead', 'qualified', 'discovery', 'proposal', 'negotiation', 'contract',
];

export const STAGE_LABELS: Record<PipelineStage, string> = {
  prospect: 'Prospect',
  new_lead: 'New Lead',
  qualified: 'Qualified',
  discovery: 'Discovery',
  proposal: 'Proposal',
  negotiation: 'Negotiation',
  contract: 'Contract',
  closed_won: 'Closed Won',
  closed_lost: 'Closed Lost',
  orbit: 'Orbit',
};

/** Weighted-pipeline percentages, per the spec's STAGE_WIN_PCT. */
export const STAGE_WIN_PCT: Record<PipelineStage, number> = {
  prospect: 0,
  new_lead: 10, qualified: 25, discovery: 40, proposal: 60,
  negotiation: 75, contract: 90, closed_won: 100, closed_lost: 0, orbit: 0,
};

/** Sub-reasons under Fit.
 *
 *  [Andy, 2026-09-01] "Fit" alone says the deal was wrong for us without
 *  saying which way, and those are different lessons — targeting, timing and
 *  pricing all show up as "fit" otherwise. Required when Fit is picked, so the
 *  cheapest reason to reach for is no longer the least informative one. */
export const FIT_SUB_REASONS: Array<{ key: string; label: string }> = [
  { key: 'unqualified', label: 'Unqualified' },
  { key: 'not_korea', label: 'Not targeting Korea' },
  { key: 'too_early', label: 'Too early — pre-token / pre-product' },
  { key: 'budget_too_small', label: 'Budget below our floor' },
  { key: 'wrong_service', label: 'Needs a service we do not offer' },
];

/** Loss reasons. The two flagged `orbit` prompt to park rather than close —
 *  a deal lost on timing is not lost on merit and comes back. `subReasons`
 *  makes a second dropdown appear and be required. */
export const LOSS_REASONS: Array<{
  key: string; label: string; orbit?: boolean;
  subReasons?: Array<{ key: string; label: string }>;
}> = [
  { key: 'price', label: 'Price' },
  { key: 'timing', label: 'Timing', orbit: true },
  { key: 'fit', label: 'Fit', subReasons: FIT_SUB_REASONS },
  { key: 'competitor', label: 'Competitor' },
  { key: 'no_decision', label: 'No decision' },
  { key: 'ghosted', label: 'Ghosted' },
  { key: 'wrong_dm', label: 'Wrong DM' },
  { key: 'internal_priority', label: 'Internal priority', orbit: true },
];

/** Untouched for this long and it is drifting, not progressing. */
export const STALLED_DAYS = 21;

export interface PipelineDeal {
  id: string;
  name: string;
  pipeline_stage: PipelineStage;
  deal_value: number | null;
  source: string | null;
  owner_id: string | null;
  owner_name: string | null;
  temperature_score: number | null;
  next_action_at: string | null;
  next_action_notes: string | null;
  last_contacted_at: string | null;
  updated_at: string;
  tg_handle: string | null;
  /** Set when this deal came from a TG Outreach prospect. */
  outreach_id: string | null;
  outreach_status: string | null;
}

/** Days since anything happened on the deal. */
export function daysIdle(d: PipelineDeal): number {
  const last = d.last_contacted_at ?? d.updated_at;
  return Math.floor((Date.now() - new Date(last).getTime()) / 86_400_000);
}

export function isStalled(d: PipelineDeal): boolean {
  return daysIdle(d) >= STALLED_DAYS;
}

export const PipelineV13Service = {
  /** Board rows. Outcomes are excluded — the board shows deals in flight. */
  async listBoard(): Promise<PipelineDeal[]> {
    const { data, error } = await (supabase as any)
      .from('crm_opportunities')
      .select(
        'id, name, pipeline_stage, deal_value, source, owner_id, temperature_score, '
        + 'next_action_at, next_action_notes, last_contacted_at, updated_at, tg_handle, '
        + 'outreach:outreach_prospects!outreach_prospects_crm_opportunity_id_fkey(id, status)',
      )
      .in('pipeline_stage', BOARD_STAGES);
    if (error) throw new Error(`Failed to load pipeline: ${error.message}`);

    // Owner names are a separate lookup, not an embed: crm_opportunities.owner_id
    // references auth.users, which PostgREST cannot join to public.users.
    const ownerIds = Array.from(new Set(
      ((data ?? []) as any[]).map(r => r.owner_id).filter(Boolean),
    ));
    const ownerNameById = new Map<string, string>();
    if (ownerIds.length > 0) {
      const { data: owners } = await (supabase as any)
        .from('users').select('id, name').in('id', ownerIds);
      for (const u of ((owners ?? []) as any[])) ownerNameById.set(u.id, u.name);
    }

    return ((data ?? []) as any[]).map(r => ({
      id: r.id,
      name: r.name ?? 'Untitled',
      pipeline_stage: r.pipeline_stage,
      deal_value: r.deal_value === null ? null : Number(r.deal_value),
      source: r.source,
      owner_id: r.owner_id,
      owner_name: r.owner_id ? (ownerNameById.get(r.owner_id) ?? null) : null,
      temperature_score: r.temperature_score,
      next_action_at: r.next_action_at,
      next_action_notes: r.next_action_notes,
      last_contacted_at: r.last_contacted_at,
      updated_at: r.updated_at,
      tg_handle: r.tg_handle,
      outreach_id: r.outreach?.[0]?.id ?? null,
      outreach_status: r.outreach?.[0]?.status ?? null,
    }));
  },

  async setStage(id: string, stage: PipelineStage): Promise<void> {
    const { error } = await (supabase as any)
      .from('crm_opportunities')
      .update({ pipeline_stage: stage, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw new Error(`Could not move the deal: ${error.message}`);
  },

  /** Close a deal. A loss always carries a reason — an unexplained loss
   *  teaches nobody anything, which is the whole point of recording it. */
  async close(
    id: string, outcome: 'closed_won' | 'closed_lost' | 'orbit',
    reason?: string, subReason?: string,
  ): Promise<void> {
    const patch: Record<string, unknown> = {
      pipeline_stage: outcome,
      closed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    if (outcome === 'closed_lost') {
      patch.closed_lost_reason = reason ?? null;
      // Always written, including null: re-closing under a reason with no
      // detail must clear whatever detail a previous close left behind.
      patch.closed_lost_sub_reason = subReason ?? null;
    }
    if (outcome === 'orbit') patch.orbit_reason = reason ?? null;
    const { error } = await (supabase as any)
      .from('crm_opportunities').update(patch).eq('id', id);
    if (error) throw new Error(`Could not close the deal: ${error.message}`);
  },

  async setValue(id: string, value: number | null): Promise<void> {
    const { error } = await (supabase as any)
      .from('crm_opportunities')
      .update({ deal_value: value, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw new Error(`Could not update the value: ${error.message}`);
  },

  async setOwner(id: string, ownerId: string | null): Promise<void> {
    const { error } = await (supabase as any)
      .from('crm_opportunities')
      .update({ owner_id: ownerId, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw new Error(`Could not reassign: ${error.message}`);
  },
};
