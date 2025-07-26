import { supabase } from './supabase';

export interface CampaignKOL {
  id: string;
  campaign_id: string;
  master_kol_id: string;
  hh_status: 'Curated' | 'Interested' | 'Onboarded' | 'Concluded';
  client_status?: 'Rejected' | 'Preferred';
  notes?: string;
  created_at?: string;
  updated_at?: string;
}

export interface CampaignKOLWithDetails extends CampaignKOL {
  master_kol: {
    id: string;
    name: string;
    link?: string;
    platform?: string[];
    followers?: number;
    region?: string;
    community?: boolean;
    content_type?: string[];
    niche?: string[];
    pricing?: string;
    tier?: string;
    rating?: number;
    group_chat?: boolean;
    description?: string;
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
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching campaign KOLs:', error);
      throw new Error('Failed to fetch campaign KOLs');
    }

    return data || [];
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

    return data;
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

    return data;
  }

  static async deleteCampaignKOL(id: string): Promise<void> {
    const { error } = await supabase
      .from('campaign_kols')
      .delete()
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

    // If no KOLs are assigned, return all KOLs
    if (assignedIds.length === 0) {
      const { data, error } = await supabase
        .from('master_kols')
        .select('*')
        .order('name');

      if (error) {
        console.error('Error fetching all KOLs:', error);
        throw new Error('Failed to fetch KOLs');
      }

      return data || [];
    }

    // Get all KOLs that are not in the assigned list
    const { data, error } = await supabase
      .from('master_kols')
      .select('*')
      .not('id', 'in', `(${assignedIds.join(',')})`)
      .order('name');

    if (error) {
      console.error('Error fetching available KOLs:', error);
      throw new Error('Failed to fetch available KOLs');
    }

    return data || [];
  }

  static getHHStatusOptions(): CampaignKOL['hh_status'][] {
    return ['Curated', 'Interested', 'Onboarded', 'Concluded'];
  }

  static getClientStatusOptions(): ('Rejected' | 'Preferred')[] {
    return ['Rejected', 'Preferred'];
  }
} 