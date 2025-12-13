import { supabase } from './supabase';
import { Database } from './database.types';

type Campaign = Database['public']['Tables']['campaigns']['Row'];
type CampaignBudgetAllocation = Database['public']['Tables']['campaign_budget_allocations']['Row'];

export interface CampaignWithDetails extends Campaign {
  client_name?: string;
  client_email?: string;
  budget_allocations?: CampaignBudgetAllocation[];
  total_allocated?: number;
  share_creator_type?: boolean;
}

export class CampaignService {
  /**
   * Get campaigns based on user role (RLS enforced at database level)
   * - Admins: See all campaigns
   * - Members: See campaigns they created (created_by) or are assigned to (manager)
   */
  static async getCampaignsForUser(userRole: 'admin' | 'member' | 'client', userId: string, supabaseClient?: any): Promise<CampaignWithDetails[]> {
    try {
      const client = supabaseClient || supabase;

      // RLS policies handle access control:
      // - Admins: can see all campaigns
      // - Members: can see campaigns they created (created_by) or are assigned to (manager)
      const { data: campaigns, error } = await client
        .from('campaigns')
        .select(`
          *,
          clients!campaigns_client_id_fkey(name, email),
          campaign_budget_allocations(*)
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;

      return campaigns?.map(campaign => ({
        ...campaign,
        client_name: (campaign.clients as any)?.name,
        client_email: (campaign.clients as any)?.email,
        budget_allocations: campaign.campaign_budget_allocations || [],
        total_allocated: campaign.campaign_budget_allocations?.reduce((sum: number, allocation: any) => sum + allocation.allocated_budget, 0) || 0,
      })) || [];
    } catch (error) {
      console.error('Error fetching campaigns:', error);
      throw error;
    }
  }

  /**
   * Get a single campaign by ID with budget allocations
   */
  static async getCampaignById(campaignId: string, supabaseClient?: any): Promise<CampaignWithDetails | null> {
    try {
      const client = supabaseClient || supabase;
      const { data: campaign, error } = await client
        .from('campaigns')
        .select(`
          *,
          clients!campaigns_client_id_fkey(name, email),
          campaign_budget_allocations(*)
        `)
        .eq('id', campaignId)
        .single();

      if (error) throw error;
      if (!campaign) return null;

      return {
        ...campaign,
        client_name: (campaign.clients as any)?.name,
        client_email: (campaign.clients as any)?.email,
        budget_allocations: campaign.campaign_budget_allocations || [],
        total_allocated: campaign.campaign_budget_allocations?.reduce((sum: number, allocation: any) => sum + allocation.allocated_budget, 0) || 0,

      };
    } catch (error) {
      console.error('Error fetching campaign:', error);
      throw error;
    }
  }

  /**
   * Create a new campaign
   */
  static async createCampaign(
    campaignData: {
      client_id: string;
      name: string;
      total_budget: number;
      status?: 'Planning' | 'Active' | 'Paused' | 'Completed';
      start_date: string;
      end_date?: string;
      description?: string;
      intro_call?: boolean;
      intro_call_date?: string | null;
      region?: string;
      client_choosing_kols?: boolean;
      multi_activation?: boolean;
      manager?: string | null;
      call_support?: boolean;
      proposal_sent?: boolean;
      nda_signed?: boolean;
      budget_type?: string[];
      created_by?: string;
    },
    supabaseClient?: any
  ): Promise<Campaign> {
    try {
      const client = supabaseClient || supabase;

      // Get current user ID for created_by if not provided
      let dataToInsert = { ...campaignData };
      if (!dataToInsert.created_by) {
        const { data: { user } } = await client.auth.getUser();
        if (user) {
          dataToInsert.created_by = user.id;
        }
      }

      const { data, error } = await client
        .from('campaigns')
        .insert(dataToInsert)
        .select()
        .single();
      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error creating campaign:', error);
      throw error;
    }
  }

  /**
   * Update campaign
   */
  static async updateCampaign(
    id: string,
    updates: Partial<Pick<Campaign, 'name' | 'total_budget' | 'status' | 'start_date' | 'end_date' | 'description' | 'region' | 'intro_call' | 'intro_call_date' | 'manager' | 'call_support' | 'client_choosing_kols' | 'multi_activation' | 'proposal_sent' | 'nda_signed' | 'budget_type' | 'outline'>>,
    supabaseClient?: any
  ): Promise<Campaign> {
    try {
      const client = supabaseClient || supabase;
      const { data, error } = await client
        .from('campaigns')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error updating campaign:', error);
      throw error;
    }
  }

  /**
   * Delete campaign
   */
  static async deleteCampaign(id: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('campaigns')
        .delete()
        .eq('id', id);

      if (error) throw error;
    } catch (error) {
      console.error('Error deleting campaign:', error);
      throw error;
    }
  }

  /**
   * Add budget allocation to campaign
   */
  static async addBudgetAllocation(
    campaignId: string, 
    region: string, 
    allocatedBudget: number
  ): Promise<CampaignBudgetAllocation> {
    try {
      const { data, error } = await supabase
        .from('campaign_budget_allocations')
        .insert({
          campaign_id: campaignId,
          region,
          allocated_budget: allocatedBudget
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error adding budget allocation:', error);
      throw error;
    }
  }

  /**
   * Update budget allocation
   */
  static async updateBudgetAllocation(
    id: string,
    updates: Partial<Pick<CampaignBudgetAllocation, 'region' | 'allocated_budget'>>
  ): Promise<CampaignBudgetAllocation> {
    try {
      const { data, error } = await supabase
        .from('campaign_budget_allocations')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error updating budget allocation:', error);
      throw error;
    }
  }

  /**
   * Delete budget allocation
   */
  static async deleteBudgetAllocation(id: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('campaign_budget_allocations')
        .delete()
        .eq('id', id);

      if (error) throw error;
    } catch (error) {
      console.error('Error deleting budget allocation:', error);
      throw error;
    }
  }

  /**
   * Get budget allocations for a campaign
   */
  static async getBudgetAllocations(campaignId: string): Promise<CampaignBudgetAllocation[]> {
    try {
      const { data, error } = await supabase
        .from('campaign_budget_allocations')
        .select('*')
        .eq('campaign_id', campaignId)
        .order('region');

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error fetching budget allocations:', error);
      throw error;
    }
  }

  /**
   * Get all campaigns for a list of client IDs
   */
  static async getCampaignsByClientIds(clientIds: string[]): Promise<Campaign[]> {
    if (!clientIds.length) return [];
    const { data, error } = await supabase
      .from('campaigns')
      .select('*')
      .in('client_id', clientIds);
    if (error) throw error;
    return data || [];
  }

  /**
   * Format currency for display
   */
  static formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  }

  /**
   * Calculate budget utilization percentage
   */
  static calculateBudgetUtilization(totalBudget: number, totalAllocated: number): number {
    if (totalBudget === 0) return 0;
    return Math.round((totalAllocated / totalBudget) * 100);
  }
} 