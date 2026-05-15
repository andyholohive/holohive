import { supabase } from './supabase';

/**
 * Service for kol_deliverables (per-brief tracking).
 *
 * Created in migration 072 as Phase 2 of the May 2026 KOL overhaul
 * spec. One row per brief delivered to a KOL within a campaign — the
 * objective metric source that Phase 3's composite Score reads from.
 *
 * Read patterns:
 *   - getForKol(kolId): all deliverables for a KOL across campaigns
 *     (used by the profile view)
 *   - getForCampaign(campaignId): all deliverables for a campaign
 *     across KOLs (will be used by campaign-detail page later)
 */

export interface KolDeliverable {
  id: string;
  kol_id: string;
  campaign_id: string;
  brief_number: number;
  brief_topic: string;
  post_link: string;
  date_brief_sent: string;
  date_posted: string;
  views_24h: number | null;
  views_48h: number | null;
  forwards: number | null;
  reactions: number | null;
  activation_participants: number | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  // Optional join — present when we select with `campaigns(...)` shorthand.
  campaign?: { id: string; name: string; slug: string | null } | null;
}

export interface CreateKolDeliverableInput {
  kol_id: string;
  campaign_id: string;
  brief_number: number;
  brief_topic: string;
  post_link: string;
  date_brief_sent: string;
  date_posted: string;
  views_24h?: number | null;
  views_48h?: number | null;
  forwards?: number | null;
  reactions?: number | null;
  activation_participants?: number | null;
  notes?: string | null;
}

export type UpdateKolDeliverableInput = Partial<Omit<CreateKolDeliverableInput, 'kol_id' | 'campaign_id'>>;

export class KolDeliverableService {
  /**
   * All deliverables for a KOL — newest first. Joins campaigns so the
   * UI can show the campaign name without a second round-trip.
   */
  static async getForKol(kolId: string): Promise<KolDeliverable[]> {
    const { data, error } = await (supabase as any)
      .from('kol_deliverables')
      .select('*, campaign:campaigns(id, name, slug)')
      .eq('kol_id', kolId)
      .order('date_posted', { ascending: false });
    if (error) {
      console.error('[KolDeliverableService.getForKol]', error);
      throw error;
    }
    return (data || []) as KolDeliverable[];
  }

  /**
   * All deliverables for a campaign — for campaign-side rollups later.
   * Currently unused by the UI; here so the service surface is complete.
   */
  static async getForCampaign(campaignId: string): Promise<KolDeliverable[]> {
    const { data, error } = await (supabase as any)
      .from('kol_deliverables')
      .select('*')
      .eq('campaign_id', campaignId)
      .order('date_posted', { ascending: false });
    if (error) {
      console.error('[KolDeliverableService.getForCampaign]', error);
      throw error;
    }
    return (data || []) as KolDeliverable[];
  }

  static async create(input: CreateKolDeliverableInput): Promise<KolDeliverable> {
    const { data, error } = await (supabase as any)
      .from('kol_deliverables')
      .insert(input)
      .select('*, campaign:campaigns(id, name, slug)')
      .single();
    if (error) {
      console.error('[KolDeliverableService.create]', error);
      throw error;
    }
    return data as KolDeliverable;
  }

  static async update(id: string, input: UpdateKolDeliverableInput): Promise<KolDeliverable> {
    const payload: Record<string, any> = { ...input, updated_at: new Date().toISOString() };
    const { data, error } = await (supabase as any)
      .from('kol_deliverables')
      .update(payload)
      .eq('id', id)
      .select('*, campaign:campaigns(id, name, slug)')
      .single();
    if (error) {
      console.error('[KolDeliverableService.update]', error);
      throw error;
    }
    return data as KolDeliverable;
  }

  static async delete(id: string): Promise<void> {
    const { error } = await (supabase as any)
      .from('kol_deliverables')
      .delete()
      .eq('id', id);
    if (error) {
      console.error('[KolDeliverableService.delete]', error);
      throw error;
    }
  }

  /**
   * Suggest the next brief_number for a (kol, campaign) pair.
   * Convenience for the input form so the user doesn't have to count.
   * Returns 1 if no rows exist yet.
   */
  static async nextBriefNumber(kolId: string, campaignId: string): Promise<number> {
    const { data, error } = await (supabase as any)
      .from('kol_deliverables')
      .select('brief_number')
      .eq('kol_id', kolId)
      .eq('campaign_id', campaignId)
      .order('brief_number', { ascending: false })
      .limit(1);
    if (error) {
      console.error('[KolDeliverableService.nextBriefNumber]', error);
      return 1;
    }
    const max = data?.[0]?.brief_number ?? 0;
    return max + 1;
  }
}
