import { supabase } from './supabase';
import { CRMService, CRMOpportunity, OpportunityStage, CRMAffiliate } from './crmService';

// ============================================
// Sales Pipeline v2 Types
// ============================================

export type SalesPipelineStage =
  | 'cold_dm' | 'warm' | 'tg_intro' | 'booked' | 'discovery_done'
  | 'proposal_sent' | 'proposal_call' | 'v2_contract' | 'v2_closed_won'
  | 'orbit' | 'v2_closed_lost' | 'nurture';

export type Bucket = 'A' | 'B' | 'C';
export type DmAccount = 'closer' | 'sdr' | 'other';
export type WarmSubState = 'interested' | 'silent';
export type CalendlySentVia = 'dm' | 'tg' | 'not_yet';
export type OrbitReason = 'no_budget' | 'bad_timing' | 'no_response' | 'competitor' | 'other';
export type ActivityType = 'call' | 'message' | 'meeting' | 'proposal' | 'note' | 'bump';
export type PocPlatform = 'twitter' | 'instagram' | 'linkedin' | 'telegram' | 'discord' | 'email' | 'other';

export const POC_PLATFORMS: { value: PocPlatform; label: string }[] = [
  { value: 'twitter', label: 'Twitter/X' },
  { value: 'instagram', label: 'Instagram' },
  { value: 'linkedin', label: 'LinkedIn' },
  { value: 'telegram', label: 'Telegram' },
  { value: 'discord', label: 'Discord' },
  { value: 'email', label: 'Email' },
  { value: 'other', label: 'Other' },
];

export const ORBIT_REASONS: { value: OrbitReason; label: string }[] = [
  { value: 'no_budget', label: 'No Budget' },
  { value: 'bad_timing', label: 'Bad Timing' },
  { value: 'no_response', label: 'No Response' },
  { value: 'competitor', label: 'Went with Competitor' },
  { value: 'other', label: 'Other' },
];

export const PIPELINE_STAGES: SalesPipelineStage[] = [
  'cold_dm', 'warm', 'tg_intro', 'booked', 'discovery_done',
  'proposal_call', 'v2_contract', 'v2_closed_won',
];

export const PATH_A_STAGES: SalesPipelineStage[] = [
  'cold_dm', 'warm', 'booked', 'discovery_done',
  'proposal_call', 'v2_contract', 'v2_closed_won',
];

export const PATH_B_STAGES: SalesPipelineStage[] = [
  'cold_dm', 'warm', 'tg_intro', 'booked', 'discovery_done',
  'proposal_call', 'v2_contract', 'v2_closed_won',
];

export const ALL_V2_STAGES: SalesPipelineStage[] = [
  'cold_dm', 'warm', 'tg_intro', 'booked', 'discovery_done',
  'proposal_sent', 'proposal_call', 'v2_contract', 'v2_closed_won',
  'orbit', 'v2_closed_lost', 'nurture',
];

export const STAGE_LABELS: Record<SalesPipelineStage, string> = {
  cold_dm: 'Cold DM',
  warm: 'Warm',
  tg_intro: 'TG Intro',
  booked: 'Booked',
  discovery_done: 'Discovery Done',
  proposal_sent: 'Proposal Sent',
  proposal_call: 'Proposal Call',
  v2_contract: 'Contract',
  v2_closed_won: 'Closed Won',
  orbit: 'Orbit',
  v2_closed_lost: 'Closed Lost',
  nurture: 'Nurture',
};

export const STAGE_COLORS: Record<SalesPipelineStage, { bg: string; text: string; border: string; solid: string }> = {
  cold_dm: { bg: 'bg-sky-50', text: 'text-sky-700', border: 'border-sky-200', solid: 'bg-sky-500' },
  warm: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200', solid: 'bg-amber-500' },
  tg_intro: { bg: 'bg-violet-50', text: 'text-violet-700', border: 'border-violet-200', solid: 'bg-violet-500' },
  booked: { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200', solid: 'bg-blue-500' },
  discovery_done: { bg: 'bg-indigo-50', text: 'text-indigo-700', border: 'border-indigo-200', solid: 'bg-indigo-500' },
  proposal_sent: { bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200', solid: 'bg-purple-500' },
  proposal_call: { bg: 'bg-fuchsia-50', text: 'text-fuchsia-700', border: 'border-fuchsia-200', solid: 'bg-fuchsia-500' },
  v2_contract: { bg: 'bg-cyan-50', text: 'text-cyan-700', border: 'border-cyan-200', solid: 'bg-cyan-500' },
  v2_closed_won: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', solid: 'bg-emerald-500' },
  orbit: { bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200', solid: 'bg-orange-500' },
  v2_closed_lost: { bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-200', solid: 'bg-rose-500' },
  nurture: { bg: 'bg-lime-50', text: 'text-lime-700', border: 'border-lime-200', solid: 'bg-lime-500' },
};

export const BUCKET_COLORS: Record<Bucket, { bg: string; text: string }> = {
  A: { bg: 'bg-emerald-100', text: 'text-emerald-800' },
  B: { bg: 'bg-amber-100', text: 'text-amber-800' },
  C: { bg: 'bg-gray-100', text: 'text-gray-600' },
};

// ============================================
// Sales DM Template Interface
// ============================================

export interface SalesDmTemplate {
  id: string;
  name: string;
  stage: string;
  sub_type: string;
  content: string;
  variables: string[];
  tags: string[];
  attachments: { url: string; name: string }[];
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateSalesDmTemplateData {
  name: string;
  stage: string;
  sub_type?: string;
  content: string;
  variables?: string[];
  tags?: string[];
  attachments?: { url: string; name: string }[];
}

// ============================================
// Extended Interfaces
// ============================================

export type ActionTier = 'REACH_OUT_NOW' | 'PRE_TOKEN_PRIORITY' | 'RESEARCH_FIRST' | 'WATCH_FOR_TRIGGER' | 'NURTURE' | 'SKIP';
export type KoreaPresence = 'NONE' | 'MINIMAL' | 'ACTIVE';
export type TokenStatus = 'PRE_TOKEN' | 'PRE_TGE' | 'POST_LAUNCH' | 'NO_TOKEN';
export type ProductStatus = 'WHITEPAPER' | 'TESTNET' | 'MAINNET' | 'LIVE_WITH_USERS';
export type NarrativeFit = 'HOT' | 'NEUTRAL' | 'COLD';
export type ProspectCategory = 'DeFi' | 'Gaming' | 'AI' | 'DePIN' | 'RWA' | 'L1/L2' | 'Infrastructure' | 'Other';

export interface SalesPipelineOpportunity extends CRMOpportunity {
  bucket: Bucket | null;
  temperature_score: number;
  dm_account: DmAccount;
  bump_number: number;
  last_bump_date: string | null;
  warm_sub_state: WarmSubState | null;
  tg_handle: string | null;
  calendly_sent_via: CalendlySentVia;
  calendly_sent_date: string | null;
  calendly_booked_date: string | null;
  gc_opened: string;
  orbit_reason: OrbitReason | null;
  orbit_followup_days: number | null;
  closed_lost_reason: string | null;
  dedup_key: string | null;
  next_meeting_at: string | null;
  next_meeting_type: string | null;
  bucket_changed_at: string | null;
  discovery_call_at: string | null;
  proposal_sent_at: string | null;
  poc_platform: PocPlatform | null;
  poc_handle: string | null;

  // AI Scoring Fields (from ATLAS agent)
  icp_fit_score: number;
  signal_strength_score: number;
  timing_score: number;
  composite_score: number;
  action_tier: ActionTier | null;
  last_scored_at: string | null;

  // Prospect Enrichment Fields
  funding_stage: string | null;
  funding_amount: string | null;
  lead_investors: string | null;
  korea_presence: KoreaPresence | null;
  personality_type: string | null;
  website_url: string | null;
  category: ProspectCategory | null;
  token_status: TokenStatus | null;
  tge_date: string | null;
  product_status: ProductStatus | null;
  team_doxxed: boolean | null;
  narrative_fit: NarrativeFit | null;
  twitter_handle: string | null;
  twitter_followers: number | null;
  last_signal_at: string | null;

  // Post-Proposal Visibility Fields (migration 051) — used by the
  // Forecast tab and the stale-proposal reminder rule.
  expected_close_date: string | null;
  next_action_at: string | null;
  next_action_notes: string | null;
  proposal_doc_url: string | null;
  decision_maker_name: string | null;
  decision_maker_role: string | null;

  // 5-for-5 Qualification Fields (migration 052) — defaults align with
  // BANT+. Relabel via field-options if HoloHive's framework differs.
  // "Qualified conversation" = >= 3 of these checked.
  qual_budget: boolean;
  qual_dm: boolean;
  qual_timeline: boolean;
  qual_scope: boolean;
  qual_fit: boolean;
}

export type ActivityDirection = 'outbound' | 'inbound';

/**
 * Unified timeline entry — produced by getUnifiedTimeline().
 *
 * Wraps four heterogeneous sources (manual activities, stage history,
 * bookings, Telegram messages) in one shape so the slide-over render
 * doesn't have to branch per-source beyond an icon lookup. The
 * `source` discriminator is preserved so callers can style per origin
 * (e.g. dim Telegram rows, bold stage changes).
 */
export type TimelineSource = 'activity' | 'stage_change' | 'meeting' | 'telegram';
export interface TimelineEntry {
  /** Synthetic stable id — prefixed per source so it stays unique
   *  across the merged feed (act-XXX / stage-XXX / booking-XXX / tg-XXX). */
  id: string;
  source: TimelineSource;
  /** ActivityType when source='activity'. For other sources, a coarse
   *  category that maps to an icon in the render layer ('stage_change',
   *  'meeting', 'message'). */
  type: ActivityType | 'stage_change';
  title: string;
  description: string | null;
  outcome?: string | null;
  next_step?: string | null;
  next_step_date?: string | null;
  attachment_url?: string | null;
  attachment_name?: string | null;
  direction?: ActivityDirection;
  created_at: string;
}

/**
 * Human-readable stage label for the timeline ("Stage: cold DM → warm
 * response"). Mirrors STAGE_LABELS in the sales-pipeline page but kept
 * here because the service shouldn't depend on a UI module.
 */
function humanStage(s: string): string {
  return (s || '')
    .replace(/_/g, ' ')
    .replace(/\bv2\b/, '')
    .trim();
}

export interface CRMActivity {
  id: string;
  opportunity_id: string;
  type: ActivityType;
  /** Outbound = sent by the team. Inbound = reply received from prospect.
   *  Only meaningful for type='message' in practice — bumps/notes/etc.
   *  default to outbound. Added 2026-05-05 (migration 044). */
  direction: ActivityDirection;
  title: string;
  description: string | null;
  outcome: string | null;
  next_step: string | null;
  next_step_date: string | null;
  owner_id: string | null;
  attachment_url: string | null;
  attachment_name: string | null;
  created_at: string;
}

export interface CreateSalesPipelineOpportunityData {
  name: string;
  stage?: OpportunityStage;
  dm_account?: DmAccount;
  bucket?: Bucket;
  temperature_score?: number;
  source?: string;
  tg_handle?: string;
  owner_id?: string;
  co_owner_ids?: string[];
  referrer?: string;
  affiliate_id?: string;
  deal_value?: number;
  currency?: string;
  notes?: string;
  position?: number;
  poc_platform?: PocPlatform;
  poc_handle?: string;
  orbit_followup_days?: number;
  twitter_handle?: string | null;

  // Post-proposal visibility (migration 051)
  expected_close_date?: string | null;
  next_action_at?: string | null;
  next_action_notes?: string | null;
  proposal_doc_url?: string | null;
  decision_maker_name?: string | null;
  decision_maker_role?: string | null;

  // 5-for-5 qualification (migration 052)
  qual_budget?: boolean;
  qual_dm?: boolean;
  qual_timeline?: boolean;
  qual_scope?: boolean;
  qual_fit?: boolean;
}

export interface CreateActivityData {
  opportunity_id: string;
  type: ActivityType;
  title: string;
  /** Defaults to 'outbound' if omitted. Set to 'inbound' when logging
   *  a reply received from the prospect. Drives last_team_message_at vs
   *  last_reply_at auto-stamping in createActivity. */
  direction?: ActivityDirection;
  description?: string;
  outcome?: string;
  next_step?: string;
  next_step_date?: string;
  attachment_url?: string;
  attachment_name?: string;
}

// ============================================
// Sales Pipeline Service
// ============================================

export class SalesPipelineService {
  // ----------------------------------------
  // OPPORTUNITIES
  // ----------------------------------------

  static async getAll(): Promise<SalesPipelineOpportunity[]> {
    // Supabase defaults to 1000 rows — paginate to fetch all
    const pageSize = 1000;
    let allData: SalesPipelineOpportunity[] = [];
    let from = 0;
    let hasMore = true;

    while (hasMore) {
      const { data, error } = await supabase
        .from('crm_opportunities')
        .select(`
          *,
          affiliate:crm_affiliates(*),
          client:clients!crm_opportunities_client_id_fkey(id, name)
        `)
        .in('stage', ALL_V2_STAGES)
        .order('position', { ascending: true })
        .order('created_at', { ascending: false })
        .range(from, from + pageSize - 1);

      if (error) {
        console.error('Error fetching sales pipeline opportunities:', error);
        throw error;
      }

      allData = allData.concat((data || []) as SalesPipelineOpportunity[]);
      hasMore = (data?.length || 0) === pageSize;
      from += pageSize;
    }

    return allData;
  }

  static async create(data: CreateSalesPipelineOpportunityData): Promise<SalesPipelineOpportunity> {
    // Dedup check: name + tg_handle
    if (data.name && data.tg_handle) {
      const dedupKey = `${data.name.toLowerCase().trim()}::${data.tg_handle.toLowerCase().trim()}`;
      const { data: existing } = await supabase
        .from('crm_opportunities')
        .select('id')
        .eq('dedup_key', dedupKey)
        .maybeSingle();

      if (existing) {
        throw new Error('A deal with this name and TG handle already exists');
      }

      (data as any).dedup_key = dedupKey;
    }

    const insertData = {
      ...data,
      stage: data.stage || 'cold_dm',
    };

    const { data: created, error } = await supabase
      .from('crm_opportunities')
      .insert([insertData])
      .select()
      .single();

    if (error) throw error;

    // Record stage history
    await CRMService.recordStageHistory('opportunity', created.id, null, insertData.stage || 'cold_dm');

    // Auto-calculate temperature score
    await this.recalcTemperature(created.id);

    return created as SalesPipelineOpportunity;
  }

  static async update(
    id: string,
    updates: Partial<CreateSalesPipelineOpportunityData> & {
      warm_sub_state?: WarmSubState | null;
      orbit_reason?: OrbitReason | null;
      orbit_followup_days?: number;
      closed_lost_reason?: string | null;
      next_meeting_at?: string | null;
      next_meeting_type?: string | null;
      bump_number?: number;
      last_bump_date?: string | null;
      bucket?: Bucket | null;
      calendly_sent_via?: CalendlySentVia;
      calendly_sent_date?: string | null;
      calendly_booked_date?: string | null;
      gc_opened?: string;
      client_id?: string | null;
    }
  ): Promise<SalesPipelineOpportunity> {
    // Get current state for stage history
    const { data: current } = await supabase
      .from('crm_opportunities')
      .select('*')
      .eq('id', id)
      .single();

    const updateData: any = { ...updates, updated_at: new Date().toISOString() };

    // Auto-set timestamps on stage transitions
    if (updates.stage && current) {
      if (updates.stage === 'discovery_done' && !current.discovery_call_at) {
        updateData.discovery_call_at = new Date().toISOString();
      }
      if (updates.stage === 'proposal_sent' && !current.proposal_sent_at) {
        updateData.proposal_sent_at = new Date().toISOString();
      }
      if ((updates.stage === 'v2_closed_won' || updates.stage === 'v2_closed_lost') && !current.closed_at) {
        updateData.closed_at = new Date().toISOString();
      }
    }

    // Auto-set bucket_changed_at
    if (updates.bucket && current && updates.bucket !== current.bucket) {
      updateData.bucket_changed_at = new Date().toISOString();
    }

    const { data: updated, error } = await supabase
      .from('crm_opportunities')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    // Record stage change
    if (updates.stage && current && current.stage !== updates.stage) {
      await CRMService.recordStageHistory('opportunity', id, current.stage, updates.stage);
    }

    // Recalculate temperature score after stage/bucket/key field changes
    await this.recalcTemperature(id);

    return updated as SalesPipelineOpportunity;
  }

  static async delete(id: string): Promise<void> {
    const { error } = await supabase
      .from('crm_opportunities')
      .delete()
      .eq('id', id);

    if (error) throw error;
  }

  /**
   * Pulls a minimal slice of crm_activities for the per-user metrics
   * computation in the sales-pipeline page (touch1s + replies).
   *
   * Two call modes:
   *   getActivitiesForMetrics('outbound')           → ALL-time outbound
   *     messages + bumps (capped at 10k rows). All-time is needed so
   *     we can compute per-user FIRST-TOUCH per opp client-side,
   *     matching the funnel API's semantic.
   *
   *   getActivitiesForMetrics('inbound', 90)        → inbound messages
   *     in the last N days (capped at 5k rows). Older replies fall
   *     outside any current range option, so pulling more is waste.
   *
   * Returns just the fields the metrics math needs — small payload.
   */
  static async getActivitiesForMetrics(
    direction: 'inbound' | 'outbound',
    days?: number,
  ): Promise<Array<{
    id: string;
    opportunity_id: string | null;
    type: string;
    direction: 'inbound' | 'outbound' | null;
    created_at: string;
    owner_id: string | null;
  }>> {
    const cols = 'id, opportunity_id, type, direction, created_at, owner_id';
    let query = (supabase as any)
      .from('crm_activities')
      .select(cols)
      .eq('direction', direction);

    if (direction === 'outbound') {
      query = query.in('type', ['message', 'bump']).limit(10000);
    } else {
      query = query.eq('type', 'message').limit(5000);
    }

    if (days && days > 0) {
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
      query = query.gte('created_at', since);
    }

    const { data, error } = await query;
    if (error) {
      console.error('[getActivitiesForMetrics]', direction, error);
      return [];
    }
    return (data || []) as any[];
  }

  /**
   * Returns the set of opportunity IDs that have *ever* moved past
   * cold_dm — i.e. their crm_stage_history has at least one entry
   * whose to_stage is not cold_dm / orbit / v2_closed_lost.
   *
   * Used by the sales-pipeline UI to split Orbit into two buckets:
   *   - Cold-DM orbit:  never got a response, just went stale
   *   - Engaged orbit:  responded at some point, paused later
   *
   * The two have very different follow-up profiles, and counting them
   * together inflates "engaged pipeline" metrics. Per user feedback
   * 2026-05-25: "no data from outreach should get mixed into the
   * number that go with people that have responded and taken action."
   *
   * Implementation note: returns a Set rather than an array because
   * every call site checks membership for a specific opp.id.
   */
  static async getPreviouslyEngagedIds(): Promise<Set<string>> {
    // Paginate — stage history grows ~ N opps * stage transitions, so
    // it can exceed Supabase's default 1000-row cap once we pass a few
    // hundred opps with multi-step journeys.
    const pageSize = 1000;
    const ids = new Set<string>();
    let from = 0;
    let hasMore = true;
    while (hasMore) {
      const { data, error } = await supabase
        .from('crm_stage_history')
        .select('object_id')
        .eq('object_type', 'opportunity')
        .not('to_stage', 'in', '("cold_dm","orbit","v2_closed_lost")')
        .range(from, from + pageSize - 1);
      if (error) {
        console.error('Error fetching previously-engaged ids:', error);
        // Fail closed — return empty set, UI then falls back to the
        // legacy single-bucket orbit view rather than crashing.
        return ids;
      }
      (data || []).forEach((r: any) => ids.add(r.object_id as string));
      hasMore = (data?.length || 0) === pageSize;
      from += pageSize;
    }
    return ids;
  }

  // ----------------------------------------
  // BUMPS
  // ----------------------------------------

  static async recordBump(id: string): Promise<SalesPipelineOpportunity> {
    const { data: current } = await supabase
      .from('crm_opportunities')
      .select('bump_number')
      .eq('id', id)
      .single();

    const newBumpNumber = (current?.bump_number || 0) + 1;

    const { data, error } = await supabase
      .from('crm_opportunities')
      .update({
        bump_number: newBumpNumber,
        last_bump_date: new Date().toISOString(),
        last_contacted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    // Also create a bump activity
    await this.createActivity({
      opportunity_id: id,
      type: 'bump',
      title: `Bump #${newBumpNumber}`,
    });

    // Recalculate temperature score
    await this.recalcTemperature(id);

    return data as SalesPipelineOpportunity;
  }

  static async reduceBump(id: string): Promise<SalesPipelineOpportunity> {
    const { data: current } = await supabase
      .from('crm_opportunities')
      .select('bump_number')
      .eq('id', id)
      .single();

    const newBumpNumber = Math.max((current?.bump_number || 0) - 1, 0);

    const { data, error } = await supabase
      .from('crm_opportunities')
      .update({
        bump_number: newBumpNumber,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data as SalesPipelineOpportunity;
  }

  // ----------------------------------------
  // ACTIVITIES
  // ----------------------------------------

  static async getActivities(opportunityId: string): Promise<CRMActivity[]> {
    const { data, error } = await supabase
      .from('crm_activities')
      .select('*')
      .eq('opportunity_id', opportunityId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    // Cast: database.types.ts predates migration 044's `direction` column.
    // Runtime guarantee — the migration backfilled all rows to 'outbound'
    // and the createActivity write path always sets it.
    return (data || []) as unknown as CRMActivity[];
  }

  /**
   * Unified per-opportunity timeline. Merges four sources into one
   * chronological feed so the slide-over can render a single list
   * instead of users having to log everything manually.
   *
   * Sources (in priority order):
   *   1. crm_activities — manual logs + auto-stamped bumps (existing)
   *   2. crm_stage_history — every stage transition with prior/new stage
   *   3. bookings — meetings booked + their attendance status (held / no-show)
   *   4. telegram_messages — chat for this opp's Telegram group, when set.
   *      Capped at 25 most-recent messages to keep noise down. Skipped
   *      entirely when opportunity.gc is null.
   *
   * Temperature changes (a 5th source the user requested) are NOT
   * included — there's no temperature_score_history table, so we can't
   * surface a meaningful before/after. If a history table lands later,
   * the same shape can be plugged in here.
   *
   * Each source's rows are mapped to a common TimelineEntry shape so
   * the render layer doesn't need per-source branching beyond an
   * icon + variant lookup.
   */
  static async getUnifiedTimeline(
    opportunityId: string,
    opp?: { gc?: string | null },
  ): Promise<TimelineEntry[]> {
    type TelegramMsg = {
      id: string;
      from_user_name: string | null;
      from_username: string | null;
      text: string | null;
      message_date: string;
    };

    // Fire all reads in parallel — they're independent.
    const [actsRes, stageRes, bookingsRes, telegramRes] = await Promise.all([
      supabase
        .from('crm_activities')
        .select('*')
        .eq('opportunity_id', opportunityId)
        .order('created_at', { ascending: false }),
      supabase
        .from('crm_stage_history')
        .select('id, from_stage, to_stage, changed_at, notes')
        .eq('opportunity_id', opportunityId)
        .order('changed_at', { ascending: false }),
      supabase
        .from('bookings')
        .select('id, booker_name, booker_email, meeting_date, start_time, status, attendance_status, notes, created_at')
        .eq('opportunity_id', opportunityId)
        .order('created_at', { ascending: false }),
      // Skip Telegram fetch when there's no group chat set.
      // Cast as Promise<{ data: TelegramMsg[] | null }> so TS doesn't
      // complain about the conditional shape.
      opp?.gc
        ? supabase
            .from('telegram_messages')
            .select('id, from_user_name, from_username, text, message_date')
            .eq('chat_id', opp.gc)
            .order('message_date', { ascending: false })
            .limit(25)
        : Promise.resolve({ data: null as TelegramMsg[] | null }),
    ]);

    const entries: TimelineEntry[] = [];

    // 1. Manual + auto-stamped activities (existing crm_activities source)
    for (const a of (actsRes.data || []) as any[]) {
      entries.push({
        id: `act-${a.id}`,
        source: 'activity',
        type: a.type as ActivityType,
        title: a.title,
        description: a.description,
        outcome: a.outcome,
        next_step: a.next_step,
        next_step_date: a.next_step_date,
        attachment_url: a.attachment_url,
        attachment_name: a.attachment_name,
        direction: a.direction,
        created_at: a.created_at,
      });
    }

    // 2. Stage transitions
    for (const s of (stageRes.data || []) as any[]) {
      entries.push({
        id: `stage-${s.id}`,
        source: 'stage_change',
        type: 'stage_change',
        title: s.from_stage
          ? `Stage: ${humanStage(s.from_stage)} → ${humanStage(s.to_stage)}`
          : `Stage set to ${humanStage(s.to_stage)}`,
        description: s.notes,
        created_at: s.changed_at,
      });
    }

    // 3. Meeting events. Each booking emits one entry, with attendance
    //    folded into the title/outcome when present (so users see
    //    "Discovery call — Held" or "Discovery call — No-show").
    for (const b of (bookingsRes.data || []) as any[]) {
      const isPast = new Date(b.meeting_date) < new Date();
      const attendance = b.attendance_status as string | null;
      const attendanceSuffix = isPast && attendance
        ? attendance === 'held' ? ' — Held'
          : attendance === 'no_show' ? ' — No-show'
          : ''
        : '';
      entries.push({
        id: `booking-${b.id}`,
        source: 'meeting',
        type: 'meeting',
        title: `Meeting with ${b.booker_name || b.booker_email}${attendanceSuffix}`,
        description: b.notes,
        outcome: attendance,
        created_at: b.meeting_date || b.created_at,
      });
    }

    // 4. Telegram messages. Cleaned to remove media-only noise (the
    //    bot stores "[Media]" placeholders). Truncated to 200 chars
    //    inline; the slide-over already truncates long text on display.
    for (const m of (telegramRes.data || []) as TelegramMsg[]) {
      const text = (m.text || '').trim();
      if (!text || text === '[Media]') continue;
      const sender = m.from_user_name || m.from_username || 'Unknown';
      entries.push({
        id: `tg-${m.id}`,
        source: 'telegram',
        type: 'message',
        title: `Telegram · ${sender}`,
        description: text.length > 280 ? text.slice(0, 280) + '…' : text,
        created_at: m.message_date,
      });
    }

    // Sort newest-first across all sources.
    entries.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
    return entries;
  }

  static async createActivity(activityData: CreateActivityData): Promise<CRMActivity> {
    const { data: { user } } = await supabase.auth.getUser();

    // Default direction = outbound. Only matters for type='message' in
    // practice but we set it for all rows so the column never has nulls.
    const direction: ActivityDirection = activityData.direction ?? 'outbound';

    const { data, error } = await supabase
      .from('crm_activities')
      .insert([{
        ...activityData,
        direction,
        owner_id: user?.id || null,
      }])
      .select()
      .single();

    if (error) throw error;

    // ── Auto-stamp opportunity milestone timestamps ────────────────────
    // These columns existed but were never populated, which is why the
    // /crm/sales-pipeline Weekly Activity widget couldn't show real
    // Outreach / Reply / Proposal counts. Now every createActivity call
    // updates the relevant milestone, so the funnel stays current
    // without anyone needing to remember to set timestamps manually.
    //
    // Mapping (added 2026-05-05 with migration 044):
    //   - outbound message OR bump  → last_team_message_at = now()
    //   - inbound  message          → last_reply_at        = now()
    //   - proposal                  → proposal_sent_at     = now()
    //                                 (only if currently null — first proposal)
    //   - call                      → discovery_call_at    = now()
    //                                 (only if currently null — first call)
    //   - meeting                   → no auto-stamp (meeting type covers
    //                                 both "booked" and "happened" cases;
    //                                 the funnel splits them by next_step_date)
    //   - note                      → no auto-stamp
    //
    // We do these as best-effort updates: a failure here doesn't roll
    // back the activity insert. The activity row IS the source of truth;
    // milestone columns are denormalized convenience for fast funnel queries.
    const now = new Date().toISOString();
    const milestoneUpdate: Record<string, string> = {};
    let conditionalCols: string[] = [];

    if (activityData.type === 'message') {
      if (direction === 'outbound') {
        milestoneUpdate.last_team_message_at = now;
        // bump_number / last_bump_date are tracked separately by the
        // bump flow — outbound messages don't touch them.
      } else {
        milestoneUpdate.last_reply_at = now;
        // Replies also count as "contact" — refresh last_contacted_at
        // so stale-deal detection treats this as recent activity.
        milestoneUpdate.last_contacted_at = now;
      }
    } else if (activityData.type === 'bump') {
      // Bumps are always outbound; treat as a team message touch.
      milestoneUpdate.last_team_message_at = now;
    } else if (activityData.type === 'proposal') {
      // First-proposal-wins: only stamp if not already set so we capture
      // when the proposal originally went out, not the most recent edit.
      conditionalCols.push('proposal_sent_at');
    } else if (activityData.type === 'call') {
      // First-call-wins, same reasoning as proposal.
      conditionalCols.push('discovery_call_at');
    }

    if (Object.keys(milestoneUpdate).length > 0) {
      try {
        await (supabase as any)
          .from('crm_opportunities')
          .update(milestoneUpdate)
          .eq('id', activityData.opportunity_id);
      } catch (err) {
        // Don't break the activity insert path — log and move on.
        console.error('[createActivity] milestone update failed:', err);
      }
    }

    // Conditional updates (only set if currently null) need a prior fetch
    // since Supabase JS client doesn't expose `WHERE col IS NULL` on
    // .update(). Cheap — single round-trip for the columns we care about.
    if (conditionalCols.length > 0) {
      try {
        const { data: existing } = await (supabase as any)
          .from('crm_opportunities')
          .select(conditionalCols.join(','))
          .eq('id', activityData.opportunity_id)
          .single();
        const patch: Record<string, string> = {};
        for (const col of conditionalCols) {
          if (existing && existing[col] == null) patch[col] = now;
        }
        if (Object.keys(patch).length > 0) {
          await (supabase as any)
            .from('crm_opportunities')
            .update(patch)
            .eq('id', activityData.opportunity_id);
        }
      } catch (err) {
        console.error('[createActivity] conditional milestone update failed:', err);
      }
    }

    // Recalculate temperature score (new activity affects engagement)
    await this.recalcTemperature(activityData.opportunity_id);

    // Cast: same reason as getActivities — db types don't yet include the
    // direction column added by migration 044.
    return data as unknown as CRMActivity;
  }

  // ----------------------------------------
  // BAMFAM VIOLATIONS
  // ----------------------------------------

  static async getBAMFAMViolations(): Promise<SalesPipelineOpportunity[]> {
    // BAMFAM: past discovery_done with no next_meeting or overdue next_meeting
    const postDiscoveryStages: SalesPipelineStage[] = [
      'discovery_done', 'proposal_call', 'v2_contract',
    ];

    const { data, error } = await supabase
      .from('crm_opportunities')
      .select(`
        *,
        affiliate:crm_affiliates(*),
        client:clients!crm_opportunities_client_id_fkey(id, name)
      `)
      .in('stage', postDiscoveryStages)
      .or('next_meeting_at.is.null,next_meeting_at.lt.' + new Date().toISOString());

    if (error) throw error;
    return (data || []) as SalesPipelineOpportunity[];
  }

  // ----------------------------------------
  // STAGES HELPER
  // ----------------------------------------

  static getAvailableStages(dmAccount: DmAccount): SalesPipelineStage[] {
    if (dmAccount === 'closer') return PATH_A_STAGES;
    return PATH_B_STAGES;
  }

  // ----------------------------------------
  // METRICS
  // ----------------------------------------

  /**
   * Roll-up powering the Sales Dashboard's Bucket Breakdown row +
   * the BAMFAM-violations alert tile.
   *
   * 2026-06-03: `totalCount` and `activeValue` removed from the
   * return shape — they were computed but never consumed. If a UI
   * surface needs them again, recompute from `opportunities` in
   * the consumer (cheaper than refetching).
   */
  static async getMetrics(): Promise<{
    bucketA: number;
    bucketB: number;
    bucketC: number;
    bamfamViolations: number;
  }> {
    const { data, error } = await supabase
      .from('crm_opportunities')
      .select('stage, bucket, next_meeting_at')
      .in('stage', ALL_V2_STAGES);

    if (error) throw error;

    const opps = data || [];

    const postDiscovery = ['discovery_done', 'proposal_call', 'v2_contract'];
    const now = new Date().toISOString();
    const bamfam = opps.filter(o =>
      postDiscovery.includes(o.stage) &&
      (!o.next_meeting_at || o.next_meeting_at < now)
    );

    return {
      bucketA: opps.filter(o => o.bucket === 'A').length,
      bucketB: opps.filter(o => o.bucket === 'B').length,
      bucketC: opps.filter(o => o.bucket === 'C').length,
      bamfamViolations: bamfam.length,
    };
  }

  // ----------------------------------------
  // POSITION UPDATES
  // ----------------------------------------

  static async updatePositions(positions: { id: string; position: number; stage?: OpportunityStage }[]): Promise<void> {
    const updates = positions.map(({ id, position, stage }) => {
      const updateData: any = { position, updated_at: new Date().toISOString() };
      if (stage) updateData.stage = stage;
      return supabase
        .from('crm_opportunities')
        .update(updateData)
        .eq('id', id);
    });

    const results = await Promise.all(updates);
    const errors = results.filter(r => r.error);
    if (errors.length > 0) {
      console.error('Errors updating positions:', errors);
      throw errors[0].error;
    }
  }

  // ----------------------------------------
  // COLD DM PAGINATED (Outreach tab)
  // ----------------------------------------

  static async getColdDmsPaginated(
    page: number,
    pageSize: number,
    filters: {
      dm_account?: DmAccount;
      bucket?: Bucket;
      bumpRange?: 'none' | '1-2' | '3+';
      searchTerm?: string;
      sortBy?: string;
      sortAsc?: boolean;
      owner_id?: string;
    }
  ): Promise<{ data: SalesPipelineOpportunity[]; count: number }> {
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let query = supabase
      .from('crm_opportunities')
      .select(`
        *,
        affiliate:crm_affiliates(*),
        client:clients!crm_opportunities_client_id_fkey(id, name)
      `, { count: 'exact' })
      .eq('stage', 'cold_dm');

    // Optional filters
    if (filters.dm_account) {
      query = query.eq('dm_account', filters.dm_account);
    }
    if (filters.bucket) {
      query = query.eq('bucket', filters.bucket);
    }
    if (filters.searchTerm) {
      query = query.ilike('name', `%${filters.searchTerm}%`);
    }
    if (filters.owner_id) {
      query = query.eq('owner_id', filters.owner_id);
    }
    if (filters.bumpRange === 'none') {
      query = query.eq('bump_number', 0);
    } else if (filters.bumpRange === '1-2') {
      query = query.gte('bump_number', 1).lte('bump_number', 2);
    } else if (filters.bumpRange === '3+') {
      query = query.gte('bump_number', 3);
    }

    // Sorting
    const sortField = filters.sortBy || 'created_at';
    const ascending = filters.sortAsc ?? false;
    query = query.order(sortField, { ascending });

    // Pagination
    query = query.range(from, to);

    const { data, error, count } = await query;

    if (error) {
      console.error('Error fetching cold DMs paginated:', error);
      throw error;
    }

    return { data: (data || []) as SalesPipelineOpportunity[], count: count || 0 };
  }

  // ----------------------------------------
  // BULK OPERATIONS
  // ----------------------------------------

  // ----------------------------------------
  // TEMPERATURE SCORE
  // ----------------------------------------

  static async recalcTemperature(id: string): Promise<number | null> {
    const { data, error } = await supabase.rpc('calculate_temperature_score', { opp_id: id });
    if (error) {
      console.error('Error recalculating temperature:', error);
      return null;
    }
    return data;
  }

  static async recalcAllTemperatures(): Promise<number | null> {
    const { data, error } = await supabase.rpc('recalculate_all_temperature_scores');
    if (error) {
      console.error('Error recalculating all temperatures:', error);
      return null;
    }
    return data;
  }

  // ----------------------------------------
  // BULK OPERATIONS
  // ----------------------------------------

  static async bulkRecordBump(ids: string[]): Promise<void> {
    await Promise.all(ids.map(id => this.recordBump(id)));
  }

  static async bulkUpdateStage(ids: string[], stage: SalesPipelineStage): Promise<void> {
    const now = new Date().toISOString();
    const updates = ids.map(id =>
      supabase
        .from('crm_opportunities')
        .update({ stage, updated_at: now })
        .eq('id', id)
    );

    const results = await Promise.all(updates);
    const errors = results.filter(r => r.error);
    if (errors.length > 0) {
      console.error('Errors in bulk stage update:', errors);
      throw errors[0].error;
    }
  }

  static async bulkDelete(ids: string[]): Promise<void> {
    const deletes = ids.map(id =>
      supabase
        .from('crm_opportunities')
        .delete()
        .eq('id', id)
    );

    const results = await Promise.all(deletes);
    const errors = results.filter(r => r.error);
    if (errors.length > 0) {
      console.error('Errors in bulk delete:', errors);
      throw errors[0].error;
    }
  }

  /**
   * Reassign owner_id on multiple opportunities at once. Used when
   * rebalancing the SDR pool (e.g. someone leaves, new SDR onboards).
   * Pass `null` to clear the owner.
   */
  static async bulkUpdateOwner(ids: string[], ownerId: string | null): Promise<void> {
    const now = new Date().toISOString();
    // Single .in() update is atomic-ish in Postgrest and avoids N round-trips.
    const { error } = await supabase
      .from('crm_opportunities')
      .update({ owner_id: ownerId, updated_at: now })
      .in('id', ids);
    if (error) {
      console.error('Error in bulk owner reassign:', error);
      throw error;
    }
  }

  // ----------------------------------------
  // SALES DM TEMPLATES
  // ----------------------------------------

  static async getTemplates(): Promise<SalesDmTemplate[]> {
    const { data, error } = await supabase
      .from('sales_dm_templates')
      .select('*')
      .eq('is_active', true)
      .order('stage', { ascending: true })
      .order('sub_type', { ascending: true });

    if (error) {
      console.error('Error fetching sales DM templates:', error);
      throw error;
    }
    return (data || []) as SalesDmTemplate[];
  }

  static async createTemplate(templateData: CreateSalesDmTemplateData): Promise<SalesDmTemplate> {
    const { data: { user } } = await supabase.auth.getUser();

    const { data, error } = await supabase
      .from('sales_dm_templates')
      .insert([{
        ...templateData,
        created_by: user?.id || null,
      }])
      .select()
      .single();

    if (error) throw error;
    return data as SalesDmTemplate;
  }

  static async updateTemplate(id: string, updates: Partial<CreateSalesDmTemplateData>): Promise<SalesDmTemplate> {
    const { data, error } = await supabase
      .from('sales_dm_templates')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data as SalesDmTemplate;
  }

  static async deleteTemplate(id: string): Promise<void> {
    const { error } = await supabase
      .from('sales_dm_templates')
      .delete()
      .eq('id', id);

    if (error) throw error;
  }
}
