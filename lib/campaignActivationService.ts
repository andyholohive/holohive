import { supabase } from '@/lib/supabase';

export interface CampaignActivation {
  id: string;
  campaign_id: string;
  effective_date: string;
  budget_delta_usd: number;
  extra_deliverables: Array<{ platform?: string; type?: string; count?: number; notes?: string }>;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface NewActivationInput {
  campaign_id: string;
  effective_date: string;
  budget_delta_usd: number;
  extra_deliverables: CampaignActivation['extra_deliverables'];
  notes?: string | null;
}

export const campaignActivationService = {
  async list(campaignId: string): Promise<CampaignActivation[]> {
    const { data, error } = await (supabase as any)
      .from('campaign_activations')
      .select('*')
      .eq('campaign_id', campaignId)
      .order('effective_date', { ascending: false });
    if (error) throw error;
    return (data ?? []) as CampaignActivation[];
  },

  async create(input: NewActivationInput): Promise<CampaignActivation> {
    const { data: { user } } = await supabase.auth.getUser();
    const { data, error } = await (supabase as any)
      .from('campaign_activations')
      .insert({
        campaign_id: input.campaign_id,
        effective_date: input.effective_date,
        budget_delta_usd: input.budget_delta_usd,
        extra_deliverables: input.extra_deliverables,
        notes: input.notes ?? null,
        created_by: user?.id ?? null,
      })
      .select()
      .single();
    if (error) throw error;
    return data as CampaignActivation;
  },

  async remove(id: string): Promise<void> {
    const { error } = await (supabase as any)
      .from('campaign_activations')
      .delete()
      .eq('id', id);
    if (error) throw error;
  },
};
