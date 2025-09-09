import { supabase } from './supabase';

// TypeScript types for KOL data
export interface MasterKOL {
  id: string;
  name: string;
  link: string | null;
  platform: string[] | null;
  followers: number | null;
  region: string | null;
  community: boolean | null;
  deliverables: string[] | null;
  creator_type: string[] | null;
  content_type: string[] | null;
  niche: string[] | null;
  pricing: string | null;
  tier: string | null;
  rating: number | null;
  group_chat: boolean | null;
  description: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface CreateKOLData {
  name: string;
  link?: string;
  platform?: string[];
  followers?: number;
  region?: MasterKOL['region'];
  community?: boolean;
  deliverables?: string[];
  creator_type?: MasterKOL['creator_type'];
  content_type?: MasterKOL['content_type'];
  niche?: string[];
  pricing?: MasterKOL['pricing'];
  tier?: MasterKOL['tier'];
  rating?: number;
  group_chat?: boolean;
  description?: string;
}

export interface UpdateKOLData {
  id: string;
  name?: string;
  link?: string | null;
  platform?: string[] | null;
  followers?: number | null;
  region?: string | null;
  community?: boolean | null;
  deliverables?: string[] | null;
  creator_type?: string[] | null;
  content_type?: string[] | null;
  niche?: string[] | null;
  pricing?: string | null;
  tier?: string | null;
  rating?: number | null;
  group_chat?: boolean | null;
  description?: string | null;
}

export class KOLService {
  /**
   * Get all KOLs (admin only)
   */
  static async getAllKOLs(): Promise<MasterKOL[]> {
    try {
      const { data: kols, error } = await supabase
        .from('master_kols')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return kols || [];
    } catch (error) {
      console.error('Error fetching KOLs:', error);
      throw error;
    }
  }

  /**
   * Create a new KOL
   */
  static async createKOL(kolData: CreateKOLData): Promise<MasterKOL> {
    try {
      const { data: kol, error } = await supabase
        .from('master_kols')
        .insert([{
          name: kolData.name,
          link: kolData.link || null,
          platform: kolData.platform || [],
          followers: kolData.followers || null,
          region: kolData.region || null,
          community: kolData.community || false,
          deliverables: kolData.deliverables || [],
          niche: kolData.niche || [],
          pricing: kolData.pricing || null,
          tier: kolData.tier || null,
          rating: kolData.rating || null,
          group_chat: kolData.group_chat || false,
          description: kolData.description || null,
          creator_type: kolData.creator_type || null,
          content_type: kolData.content_type || null
        }])
        .select()
        .single();

      if (error) throw error;
      return kol;
    } catch (error) {
      console.error('Error creating KOL:', error);
      throw error;
    }
  }

  /**
   * Update a KOL
   */
  static async updateKOL(kolData: UpdateKOLData): Promise<MasterKOL> {
    try {
      const updateData: any = { ...kolData };
      delete updateData.id; // Remove id from update data

      const { data: kol, error } = await supabase
        .from('master_kols')
        .update(updateData)
        .eq('id', kolData.id)
        .select()
        .single();

      if (error) throw error;
      return kol;
    } catch (error) {
      console.error('Error updating KOL:', error);
      throw error;
    }
  }

  /**
   * Delete a KOL
   */
  static async deleteKOL(kolId: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('master_kols')
        .delete()
        .eq('id', kolId);

      if (error) throw error;
    } catch (error) {
      console.error('Error deleting KOL:', error);
      throw error;
    }
  }

  /**
   * Format followers count for display
   */
  static formatFollowers(followers: number | null): string {
    if (!followers) return '0';
    if (followers >= 1000000) {
      return `${(followers / 1000000).toFixed(1)}M`;
    }
    if (followers >= 1000) {
      return `${(followers / 1000).toFixed(1)}K`;
    }
    return followers.toString();
  }

  /**
   * Get available options for dropdowns
   */
  static getFieldOptions() {
    return {
      platforms: ['X', 'Telegram'],
      regions: ['Vietnam', 'Turkey', 'SEA', 'Philippines', 'Korea', 'Global', 'China', 'Brazil'],
      deliverables: ['Post', 'Video', 'Article', 'AMA', 'Ambassadorship', 'Alpha', 'QRT', 'Thread', 'Spaces', 'Newsletter'],
      niches: ['General', 'Gaming', 'Crypto', 'Memecoin', 'NFT', 'Trading', 'AI', 'Research', 'Airdrop', 'Art'],
      pricingTiers: ['<$200', '$200-500', '$500-1K', '$1K-2K', '$2K-3K', '>$3K'],
      tiers: ['Tier 1', 'Tier 2', 'Tier 3', 'Tier 4'],
      creatorTypes: ['General', 'Gaming', 'Crypto', 'Memecoin', 'NFT', 'Trading', 'AI', 'Research', 'Airdrop', 'Art', 'Native (Meme/Culture)', 'Drama-Forward', 'Skeptic', 'Educator', 'Bridge Builder', 'Visionary', 'Onboarder'],
      contentTypes: ['Meme', 'News', 'Trading', 'Deep Dive', 'Meme/Cultural Narrative', 'Drama Queen', 'Sceptics', 'Technical Educator', 'Bridge Builders', 'Visionaries']
    };
  }
} 