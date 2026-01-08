import { supabase } from './supabase';
import { VectorStore } from './vectorStore';

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
  in_house: string | null;
  description: string | null;
  wallet: string | null;
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
  in_house?: string | null;
  description?: string;
  wallet?: string;
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
  in_house?: string | null;
  description?: string | null;
  wallet?: string | null;
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
        .is('archived_at', null)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (kols || []) as MasterKOL[];
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
          content_type: kolData.content_type || null,
          in_house: kolData.in_house || null
        }])
        .select()
        .single();

      if (error) throw error;

      // Auto-index the new KOL for semantic search
      // Call server-side API to index (don't block the creation)
      fetch('/api/kols/index', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kolId: kol.id }),
      }).catch(indexError => {
        // Don't fail the creation if indexing fails
        console.error('Failed to auto-index KOL:', indexError);
        console.log('⚠️  KOL created but not indexed. Run indexing script later.');
      });

      return kol as MasterKOL;
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

      // Auto-reindex the updated KOL for semantic search
      // Only reindex if meaningful fields changed
      const shouldReindex =
        updateData.name !== undefined ||
        updateData.description !== undefined ||
        updateData.region !== undefined ||
        updateData.platform !== undefined ||
        updateData.creator_type !== undefined ||
        updateData.content_type !== undefined ||
        updateData.deliverables !== undefined ||
        updateData.followers !== undefined ||
        updateData.in_house !== undefined;

      if (shouldReindex) {
        // Call server-side API to index (don't block the update)
        fetch('/api/kols/index', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ kolId: kol.id }),
        }).catch(indexError => {
          // Don't fail the update if indexing fails
          console.error('Failed to auto-reindex KOL:', indexError);
          console.log('⚠️  KOL updated but not reindexed. Run indexing script later.');
        });
      }

      return kol as MasterKOL;
    } catch (error) {
      console.error('Error updating KOL:', error);
      throw error;
    }
  }

  /**
   * Archive a KOL (soft delete)
   */
  static async archiveKOL(kolId: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('master_kols')
        .update({ archived_at: new Date().toISOString() })
        .eq('id', kolId);

      if (error) throw error;
    } catch (error) {
      console.error('Error archiving KOL:', error);
      throw error;
    }
  }

  /**
   * Permanently delete a KOL
   */
  static async deleteKOL(kolId: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('master_kols')
        .delete()
        .eq('id', kolId);

      if (error) throw error;

      // Auto-delete the embedding (CASCADE should handle this, but being explicit)
      try {
        await VectorStore.deleteKOLEmbedding(kolId);
        console.log(`✅ Auto-deleted KOL embedding: ${kolId}`);
      } catch (indexError) {
        // Don't fail the deletion if embedding cleanup fails
        console.error('Failed to delete KOL embedding:', indexError);
        console.log('⚠️  KOL deleted but embedding may remain (will be cleaned up automatically).');
      }
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
      platforms: ['X', 'Telegram', 'YouTube', 'Facebook', 'TikTok'],
      regions: ['Vietnam', 'Turkey', 'SEA', 'Philippines', 'Korea', 'Global', 'China', 'Brazil'],
      deliverables: ['Post', 'Video', 'Article', 'AMA', 'Ambassadorship', 'Alpha', 'QRT', 'Thread', 'Spaces', 'Newsletter'],
      niches: ['General', 'Gaming', 'Crypto', 'Memecoin', 'NFT', 'Trading', 'AI', 'Research', 'Airdrop', 'Art'],
      pricingTiers: ['<$200', '$200-500', '$500-1K', '$1K-2K', '$2K-3K', '>$3K'],
      tiers: ['Tier S', 'Tier 1', 'Tier 2', 'Tier 3', 'Tier 4'],
      creatorTypes: ['General', 'Gaming', 'Crypto', 'Memecoin', 'NFT', 'Trading', 'AI', 'Research', 'Airdrop', 'Art', 'Native (Meme/Culture)', 'Drama-Forward', 'Skeptic', 'Educator', 'Bridge Builder', 'Visionary', 'Onboarder'],
      contentTypes: ['Meme', 'News', 'Trading', 'Deep Dive', 'Meme/Cultural Narrative', 'Drama Queen', 'Sceptics', 'Technical Educator', 'Bridge Builders', 'Visionaries']
    };
  }

  /**
   * Get dynamic field options (like in_house)
   */
  static async getDynamicFieldOptions(fieldName: string): Promise<string[]> {
    try {
      const { data, error } = await (supabase as any)
        .from('field_options')
        .select('option_value')
        .eq('field_name', fieldName)
        .eq('is_active', true)
        .order('display_order', { ascending: true });

      if (error) {
        console.error('Error fetching dynamic field options:', error);
        return [];
      }

      return data?.map((item: any) => item.option_value) || [];
    } catch (error) {
      console.error('Error in getDynamicFieldOptions:', error);
      return [];
    }
  }
} 