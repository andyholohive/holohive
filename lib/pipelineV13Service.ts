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
  created_at: string;
  tg_handle: string | null;
  /** Off the working board but still readable. Not an outcome. */
  archived_at: string | null;
  archived_reason: string | null;
  /** Set when this deal came from a TG Outreach prospect. */
  outreach_id: string | null;
  outreach_status: string | null;
  /** Every Outreach contact attached to this project. One card per project,
   *  however many people we are talking to there [Yano 2026-10-26]. */
  contacts: DealContact[];
  /** Who brought the deal in. Fixed at creation; a reassign never changes it. */
  sourced_by: string | null;
  sourced_by_name: string | null;
  /** Set when the deal is an expansion on an existing client. */
  client_id: string | null;
  client_name: string | null;
}

export interface DealContact { id: string; telegram: string | null; status: string | null }

/** Days a Proposal gets before its next step is due [Yano 2026-10-26]. */
export const PROPOSAL_FOLLOW_UP_DAYS = 7;

const DAY = 86_400_000;
export const isoDaysFromNow = (days: number) => new Date(Date.now() + days * DAY).toISOString().slice(0, 10);

/** Next step date in the past (by calendar day, UTC). */
export function nextStepOverdue(d: Pick<PipelineDeal, 'next_action_at'>, now = Date.now()): boolean {
  if (!d.next_action_at) return false;
  return d.next_action_at.slice(0, 10) < new Date(now).toISOString().slice(0, 10);
}

/** Days since anything happened on the deal. */
export function daysIdle(d: PipelineDeal): number {
  const last = d.last_contacted_at ?? d.updated_at;
  return Math.floor((Date.now() - new Date(last).getTime()) / 86_400_000);
}

export function isStalled(d: PipelineDeal): boolean {
  return daysIdle(d) >= STALLED_DAYS;
}

export const DEFAULT_ORBIT_FOLLOW_UP_DAYS = 90;
export const ORBIT_FOLLOW_UP_OPTIONS = [30, 60, 90, 180];

export function orbitFollowUpAt(parkedAt: string | null, days: number | null): string | null {
  if (!parkedAt) return null;
  return new Date(Date.parse(parkedAt) + (days ?? DEFAULT_ORBIT_FOLLOW_UP_DAYS) * DAY).toISOString();
}

const OUTREACH_RANK = ['lead_trial', 'lead', 'team_engaged', 'response_referred', 'response_interested'];
function bestOutreachStatus(rows: Array<{ status?: string | null }>): string | null {
  const statuses = rows.map(r => r.status).filter(Boolean) as string[];
  if (!statuses.length) return null;
  const ranked = statuses.filter(s => OUTREACH_RANK.includes(s)).sort((a, b) => OUTREACH_RANK.indexOf(a) - OUTREACH_RANK.indexOf(b));
  return ranked[0] ?? statuses[0];
}

/** The old Sales board's value for each outcome, written alongside pipeline_stage. */
const LEGACY_OUTCOME_STAGE: Record<'closed_won' | 'closed_lost' | 'orbit', string> = {
  closed_won: 'v2_closed_won',
  closed_lost: 'v2_closed_lost',
  orbit: 'orbit',
};

export const PipelineV13Service = {
  /** Board rows. Outcomes are excluded — the board shows deals in flight.
   *  Archived rows are excluded by default and fetched on request, so the
   *  board is what is being worked rather than everything ever entered. */
  async listBoard(opts?: { archived?: boolean }): Promise<PipelineDeal[]> {
    let query = (supabase as any)
      .from('crm_opportunities')
      .select(
        'id, name, pipeline_stage, deal_value, source, owner_id, temperature_score, '
        + 'next_action_at, next_action_notes, last_contacted_at, updated_at, created_at, tg_handle, '
        + 'archived_at, archived_reason, sourced_by, client_id, client:clients(name), '
        + 'outreach:outreach_prospects!outreach_prospects_crm_opportunity_id_fkey(id, telegram, status)',
      )
      .in('pipeline_stage', BOARD_STAGES);

    if (opts?.archived) query = query.not('archived_at', 'is', null);
    else query = query.is('archived_at', null);

    const { data, error } = await query;
    if (error) throw new Error(`Failed to load pipeline: ${error.message}`);

    // Owner names are a separate lookup, not an embed: crm_opportunities.owner_id
    // references auth.users, which PostgREST cannot join to public.users.
    const ownerIds = Array.from(new Set(
      ((data ?? []) as any[]).flatMap(r => [r.owner_id, r.sourced_by]).filter(Boolean),
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
      created_at: r.created_at,
      tg_handle: r.tg_handle,
      archived_at: r.archived_at ?? null,
      archived_reason: r.archived_reason ?? null,
      outreach_id: r.outreach?.[0]?.id ?? null,
      // The furthest-along contact speaks for the project on the chip.
      outreach_status: bestOutreachStatus(r.outreach ?? []),
      contacts: ((r.outreach ?? []) as any[]).map(c => ({ id: c.id, telegram: c.telegram ?? null, status: c.status ?? null })),
      sourced_by: r.sourced_by ?? null,
      sourced_by_name: r.sourced_by ? (ownerNameById.get(r.sourced_by) ?? null) : null,
      client_id: r.client_id ?? null,
      client_name: r.client?.name ?? null,
    }));
  },

  /** A deal entered by hand — a referral, an inbound, a project that never
   *  went through TG Outreach. Until now the only door onto the board was a
   *  contact reaching Lead [Yano 2026-10-26]. `clientId` marks an expansion
   *  on an existing client. */
  async create(input: {
    name: string; dealValue: number | null; ownerId: string | null; sourcedBy: string | null;
    source: string; clientId: string | null; notes?: string | null;
  }): Promise<string> {
    const now = new Date().toISOString();
    const { data, error } = await (supabase as any)
      .from('crm_opportunities')
      .insert({
        name: input.name.trim(),
        stage: 'warm',
        pipeline_stage: 'new_lead',
        deal_value: input.dealValue,
        owner_id: input.ownerId,
        sourced_by: input.sourcedBy,
        source: input.source,
        client_id: input.clientId,
        scope: input.clientId ? 'expansion' : null,
        notes: input.notes ?? null,
        created_at: now, updated_at: now,
      })
      .select('id').single();
    if (error) throw new Error(`Could not create the deal: ${error.message}`);
    return data.id as string;
  },

  /** Clients a new deal can attach to as an expansion. */
  async attachableClients(): Promise<Array<{ id: string; name: string; status: string | null }>> {
    const { data, error } = await (supabase as any)
      .from('clients').select('id, name, engagement_status').order('name');
    if (error) throw new Error(`Could not load clients: ${error.message}`);
    return ((data ?? []) as any[]).map(c => ({ id: c.id, name: c.name, status: c.engagement_status ?? null }));
  },

  /** Move a deal. Entering Proposal stamps proposal_sent_at and, unless a
   *  future next-step date is already set, puts the next step
   *  PROPOSAL_FOLLOW_UP_DAYS out — a proposal with no follow-up date is how
   *  deals go quiet [Yano 2026-10-26]. Returns what else changed so the board
   *  can patch its copy. */
  async setStage(
    id: string, stage: PipelineStage, extra: { dealValue?: number | null; currentNextAt?: string | null } = {},
  ): Promise<Partial<PipelineDeal>> {
    const patch: Record<string, unknown> = { pipeline_stage: stage, updated_at: new Date().toISOString() };
    if (extra.dealValue !== undefined) patch.deal_value = extra.dealValue;
    if (stage === 'proposal') {
      patch.proposal_sent_at = new Date().toISOString();
      const keep = extra.currentNextAt && !nextStepOverdue({ next_action_at: extra.currentNextAt });
      if (!keep) patch.next_action_at = isoDaysFromNow(PROPOSAL_FOLLOW_UP_DAYS);
    }
    const { error } = await (supabase as any)
      .from('crm_opportunities').update(patch).eq('id', id);
    if (error) throw new Error(`Could not move the deal: ${error.message}`);
    const out: Partial<PipelineDeal> = { pipeline_stage: stage, updated_at: patch.updated_at as string };
    if ('deal_value' in patch) out.deal_value = patch.deal_value as number | null;
    if ('next_action_at' in patch) out.next_action_at = patch.next_action_at as string;
    return out;
  },

  /** Close a deal. A loss always carries a reason — an unexplained loss
   *  teaches nobody anything, which is the whole point of recording it. */
  async close(
    id: string, outcome: 'closed_won' | 'closed_lost' | 'orbit',
    reason?: string, subReason?: string,
  ): Promise<void> {
    const patch: Record<string, unknown> = {
      pipeline_stage: outcome,
      // The old Sales board reads `stage`. Without this, a deal closed or
      // orbited here stayed "warm" over there and never reached its Orbit
      // tab [Yano 2026-10-07: "where do orbits go?"].
      stage: LEGACY_OUTCOME_STAGE[outcome],
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

  /** Deals parked in Orbit, with when to come back to each: parked date plus
   *  orbit_followup_days (90 unless someone set otherwise) [Yano 2026-10-26]. */
  async listOrbit(): Promise<Array<{
    id: string; name: string; orbit_reason: string | null; owner_name: string | null;
    parked_at: string | null; tg_handle: string | null; followup_days: number; follow_up_at: string | null;
  }>> {
    const { data, error } = await (supabase as any)
      .from('crm_opportunities')
      .select('id, name, orbit_reason, owner_id, closed_at, updated_at, tg_handle, orbit_followup_days')
      .eq('pipeline_stage', 'orbit')
      .is('archived_at', null)
      .order('closed_at', { ascending: false, nullsFirst: false });
    if (error) throw new Error(`Failed to load Orbit: ${error.message}`);
    const ownerIds = Array.from(new Set(((data ?? []) as any[]).map(r => r.owner_id).filter(Boolean)));
    const names = new Map<string, string>();
    if (ownerIds.length) {
      const { data: owners } = await (supabase as any).from('users').select('id, name').in('id', ownerIds);
      for (const u of (owners ?? []) as any[]) names.set(u.id, u.name);
    }
    return ((data ?? []) as any[]).map(r => ({
      id: r.id, name: r.name ?? 'Untitled', orbit_reason: r.orbit_reason ?? null,
      owner_name: r.owner_id ? names.get(r.owner_id) ?? null : null,
      parked_at: r.closed_at ?? r.updated_at ?? null, tg_handle: r.tg_handle ?? null,
      followup_days: r.orbit_followup_days ?? DEFAULT_ORBIT_FOLLOW_UP_DAYS,
      follow_up_at: orbitFollowUpAt(r.closed_at ?? r.updated_at ?? null, r.orbit_followup_days),
    }));
  },

  async setOrbitFollowUpDays(id: string, days: number): Promise<void> {
    const { error } = await (supabase as any)
      .from('crm_opportunities').update({ orbit_followup_days: days }).eq('id', id);
    if (error) throw new Error(`Could not change the follow-up: ${error.message}`);
  },

  /** Bring a deal back from Orbit onto the board, as a new lead. */
  async reopenFromOrbit(id: string): Promise<void> {
    const { error } = await (supabase as any)
      .from('crm_opportunities')
      .update({ pipeline_stage: 'new_lead', stage: 'warm', closed_at: null, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw new Error(`Could not bring the deal back: ${error.message}`);
  },

  /** Archiving says only "this predates how we work now" — it is not a
   *  verdict on the deal, and unarchiving restores it untouched. */
  async setArchived(id: string, archived: boolean, reason?: string): Promise<void> {
    const { error } = await (supabase as any)
      .from('crm_opportunities')
      .update(archived
        ? { archived_at: new Date().toISOString(), archived_reason: reason ?? 'Archived from the board.' }
        : { archived_at: null, archived_reason: null })
      .eq('id', id);
    if (error) throw new Error(`Could not archive: ${error.message}`);
  },

  async setValue(id: string, value: number | null): Promise<void> {
    const { error } = await (supabase as any)
      .from('crm_opportunities')
      .update({ deal_value: value, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw new Error(`Could not update the value: ${error.message}`);
  },

  /** Team members a deal can be assigned to. */
  async assignableOwners(): Promise<Array<{ id: string; name: string }>> {
    const { data, error } = await (supabase as any)
      .from('users')
      .select('id, name, email, is_active')
      .eq('is_active', true)
      .order('name');
    if (error) throw new Error(`Could not load the team: ${error.message}`);
    return ((data ?? []) as any[]).map(u => ({ id: u.id, name: u.name || u.email || 'Unnamed' }));
  },

  /**
   * The next step and when it is due.
   *
   * [2026-09-07, Yano] "Doesn't let me do much besides change price and drag."
   * A board that only records stage tells you where a deal is and nothing
   * about what happens next, which is the thing a rep actually holds in their
   * head. Writing it down is also what makes the idle counter meaningful.
   */
  async setNextAction(
    id: string, notes: string | null, at: string | null,
  ): Promise<void> {
    const { error } = await (supabase as any)
      .from('crm_opportunities')
      .update({
        next_action_notes: notes,
        next_action_at: at,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);
    if (error) throw new Error(`Could not save the next step: ${error.message}`);
  },

  /** Stamp "I spoke to them today". Resets the idle/stalled counter, which
   *  otherwise only moves when some other field is edited — so a deal being
   *  actively worked could still show as stalled. */
  async logContact(id: string): Promise<void> {
    const now = new Date().toISOString();
    const { error } = await (supabase as any)
      .from('crm_opportunities')
      .update({ last_contacted_at: now, updated_at: now })
      .eq('id', id);
    if (error) throw new Error(`Could not log the contact: ${error.message}`);
  },

  async setOwner(id: string, ownerId: string | null): Promise<void> {
    const { error } = await (supabase as any)
      .from('crm_opportunities')
      .update({ owner_id: ownerId, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw new Error(`Could not reassign: ${error.message}`);
  },
};
