import { supabase } from './supabase';

export interface CampaignKOL {
  id: string;
  campaign_id: string;
  master_kol_id: string;
  hh_status: 'Curated' | 'Contacted' | 'Interested' | 'Onboarded' | 'Concluded' | null;
  client_status?: 'Rejected' | 'Preferred' | null;
  notes?: string | null;
  allocated_budget?: number | null;
  budget_type?: 'Token' | 'Fiat' | 'WL' | null;
  paid?: number | null;
  wallet?: string | null;
  hidden?: boolean | null;
  agreed_rate?: number | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface CampaignKOLWithDetails extends CampaignKOL {
  master_kol: {
    id: string;
    name: string;
    link?: string | null;
    platform?: string[] | null;
    followers?: number | null;
    region?: string | null;
    /** Spec-canonical (HHP KOL DB Overhaul). */
    community_founder?: boolean | null;
    /** @deprecated Use community_founder. */
    community?: boolean | null;
    content_type?: string[] | null;
    /** Spec-canonical (HHP Creator Taxonomy). */
    creator_types?: string[] | null;
    /** @deprecated Use creator_types. */
    creator_type?: string[] | null;
    /** Spec-canonical (HHP Creator Taxonomy). */
    niche_tags?: string[] | null;
    /** @deprecated Use niche_tags. */
    niche?: string[] | null;
    pricing?: string | null;
    standard_rate?: number | null;
    tier?: string | null;
    rating?: number | null;
    group_chat?: boolean | null;
    /** Spec-canonical (HHP KOL DB Overhaul). */
    notes?: string | null;
    /** @deprecated Use notes. */
    description?: string | null;
    wallet?: string | null;
    /** KOL "Style" profile — surfaced as the KOL-notes block on both the
     * internal and public campaign KOL Dashboard cards. */
    style_summary?: string | null;
  };
}

export class CampaignKOLService {
  static async getCampaignKOLs(campaignId: string): Promise<CampaignKOLWithDetails[]> {
    const { data, error } = await supabase
      .from('campaign_kols')
      .select(`
        *,
        master_kol:master_kols(*)
      `)
      .eq('campaign_id', campaignId)
      // Hide soft-deleted rows from the default active-roster path.
      // Use `getCampaignKOLsWithDeleted` when you need the full set
      // (e.g. the Budget tab's payment-name lookup, where you want
      // to keep showing "Alice (removed)" instead of "Unknown KOL").
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching campaign KOLs:', error);
      throw new Error('Failed to fetch campaign KOLs');
    }

    return (data || []) as CampaignKOLWithDetails[];
  }

  /**
   * Like `getCampaignKOLs` but includes soft-deleted rows. Used by
   * the Budget tab's payment table so a payment to a since-removed
   * KOL still shows the KOL's name (with a "(removed)" suffix)
   * instead of "Unknown KOL". Don't use this on writable surfaces —
   * deleted rows should stay out of the editable roster.
   */
  static async getCampaignKOLsWithDeleted(campaignId: string): Promise<CampaignKOLWithDetails[]> {
    const { data, error } = await supabase
      .from('campaign_kols')
      .select(`
        *,
        master_kol:master_kols(*)
      `)
      .eq('campaign_id', campaignId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching campaign KOLs (incl. deleted):', error);
      throw new Error('Failed to fetch campaign KOLs');
    }

    return (data || []) as CampaignKOLWithDetails[];
  }

  static async addCampaignKOL(campaignId: string, masterKolId: string, hhStatus: CampaignKOL['hh_status'], notes?: string): Promise<CampaignKOL> {
    const { data, error } = await supabase
      .from('campaign_kols')
      .insert({
        campaign_id: campaignId,
        master_kol_id: masterKolId,
        hh_status: hhStatus,
        notes: notes || null
      })
      .select()
      .single();

    if (error) {
      console.error('Error adding campaign KOL:', error);
      throw new Error('Failed to add campaign KOL');
    }

    return data as CampaignKOL;
  }

  static async updateCampaignKOL(id: string, updates: Partial<CampaignKOL>): Promise<CampaignKOL> {
    const { data, error } = await supabase
      .from('campaign_kols')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating campaign KOL:', error);
      throw new Error('Failed to update campaign KOL');
    }

    return data as CampaignKOL;
  }

  /**
   * Soft-delete a campaign_kol row. Switched from hard `.delete()` on
   * 2026-06-02 because the FK on payments.campaign_kol_id is
   * ON DELETE CASCADE — a hard delete was destroying the payment
   * audit trail AND the page's React state for `payments` wasn't
   * being refetched, so the Budget table kept showing orphan
   * payment rows with "Unknown KOL" in the name column. Soft-delete
   * preserves both: the payments stay intact, and the Budget table's
   * lookup via `getCampaignKOLsWithDeleted` can still resolve the
   * KOL's name (we render it with a "(removed)" suffix so it's
   * obvious the KOL is no longer on the campaign).
   */
  static async deleteCampaignKOL(id: string): Promise<void> {
    // Cast because `deleted_at` was added to the table on 2026-06-02
    // but the generated supabase types haven't been regenerated yet
    // (typegen runs as a separate step). Remove the cast once
    // `lib/database.types.ts` includes the column.
    const { error } = await supabase
      .from('campaign_kols')
      .update({ deleted_at: new Date().toISOString() } as any)
      .eq('id', id);

    if (error) {
      console.error('Error deleting campaign KOL:', error);
      throw new Error('Failed to delete campaign KOL');
    }
  }

  static async getAvailableKOLs(campaignId: string): Promise<any[]> {
    // First get the IDs of KOLs already assigned to this campaign
    const { data: assignedKOLs, error: assignedError } = await supabase
      .from('campaign_kols')
      .select('master_kol_id')
      .eq('campaign_id', campaignId);

    if (assignedError) {
      console.error('Error fetching assigned KOLs:', assignedError);
      throw new Error('Failed to fetch assigned KOLs');
    }

    // Get the IDs of assigned KOLs
    const assignedIds = assignedKOLs?.map(kol => kol.master_kol_id) || [];

    // If no KOLs are assigned, return all non-archived KOLs
    if (assignedIds.length === 0) {
      const { data, error } = await supabase
        .from('master_kols')
        .select('*')
        .is('archived_at', null)
        .order('name');

      if (error) {
        console.error('Error fetching all KOLs:', error);
        throw new Error('Failed to fetch KOLs');
      }

      return data || [];
    }

    // Get all non-archived KOLs that are not in the assigned list
    const { data, error } = await supabase
      .from('master_kols')
      .select('*')
      .is('archived_at', null)
      .not('id', 'in', `(${assignedIds.join(',')})`)
      .order('name');

    if (error) {
      console.error('Error fetching available KOLs:', error);
      throw new Error('Failed to fetch available KOLs');
    }

    return data || [];
  }

  static getHHStatusOptions(): CampaignKOL['hh_status'][] {
    return ['Curated', 'Contacted', 'Interested', 'Onboarded', 'Concluded'];
  }

  static getClientStatusOptions(): ('Rejected' | 'Preferred')[] {
    return ['Rejected', 'Preferred'];
  }
} 