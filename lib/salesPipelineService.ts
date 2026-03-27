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
  v2_closed_lost: { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200', solid: 'bg-red-500' },
  nurture: { bg: 'bg-lime-50', text: 'text-lime-700', border: 'border-lime-200', solid: 'bg-lime-500' },
};

export const BUCKET_COLORS: Record<Bucket, { bg: string; text: string }> = {
  A: { bg: 'bg-green-100', text: 'text-green-800' },
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
}

export interface CRMActivity {
  id: string;
  opportunity_id: string;
  type: ActivityType;
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
}

export interface CreateActivityData {
  opportunity_id: string;
  type: ActivityType;
  title: string;
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
    return data || [];
  }

  static async createActivity(activityData: CreateActivityData): Promise<CRMActivity> {
    const { data: { user } } = await supabase.auth.getUser();

    const { data, error } = await supabase
      .from('crm_activities')
      .insert([{
        ...activityData,
        owner_id: user?.id || null,
      }])
      .select()
      .single();

    if (error) throw error;

    // Recalculate temperature score (new activity affects engagement)
    await this.recalcTemperature(activityData.opportunity_id);

    return data;
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

  static async getMetrics(): Promise<{
    totalCount: number;
    bucketA: number;
    bucketB: number;
    bucketC: number;
    activeValue: number;
    bamfamViolations: number;
  }> {
    const { data, error } = await supabase
      .from('crm_opportunities')
      .select('stage, bucket, deal_value, next_meeting_at')
      .in('stage', ALL_V2_STAGES);

    if (error) throw error;

    const opps = data || [];
    const activeStages = PIPELINE_STAGES;
    const active = opps.filter(o => activeStages.includes(o.stage as SalesPipelineStage));

    const postDiscovery = ['discovery_done', 'proposal_call', 'v2_contract'];
    const now = new Date().toISOString();
    const bamfam = opps.filter(o =>
      postDiscovery.includes(o.stage) &&
      (!o.next_meeting_at || o.next_meeting_at < now)
    );

    return {
      totalCount: opps.length,
      bucketA: opps.filter(o => o.bucket === 'A').length,
      bucketB: opps.filter(o => o.bucket === 'B').length,
      bucketC: opps.filter(o => o.bucket === 'C').length,
      activeValue: active.reduce((sum, o) => sum + (o.deal_value || 0), 0),
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
