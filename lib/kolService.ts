import { supabase } from './supabase';
import { VectorStore } from './vectorStore';

// TypeScript types for KOL data.
// `tier` and `rating` were removed in migration 071 — replaced by the
// composite Score + tier badge per the May 2026 KOL overhaul spec.
// `community_link` and `projects_worked_together` were added in the
// same migration.
export interface MasterKOL {
  id: string;
  name: string;
  link: string | null;
  platform: string[] | null;
  followers: number | null;
  region: string | null;
  /** Spec-canonical name (HHP KOL DB Overhaul May '26). */
  community_founder: boolean | null;
  /** @deprecated Use `community_founder`. Kept while sync trigger mirrors both ways. */
  community?: boolean | null;
  community_link: string | null;
  deliverables: string[] | null;
  /** Spec-canonical name (HHP Creator Taxonomy May '26). Max 2. */
  creator_types: string[] | null;
  /** @deprecated Use `creator_types`. Kept while sync trigger mirrors both ways. */
  creator_type?: string[] | null;
  content_type: string[] | null;
  /** Spec-canonical name (HHP Creator Taxonomy May '26). 13 tags. */
  niche_tags: string[] | null;
  /** @deprecated Use `niche_tags`. Kept while sync trigger mirrors both ways. */
  niche?: string[] | null;
  pricing: string | null;
  group_chat: boolean | null;
  in_house: string | null;
  /** Spec-canonical name (HHP KOL DB Overhaul May '26). */
  notes: string | null;
  /** @deprecated Use `notes`. Kept while sync trigger mirrors both ways. */
  description?: string | null;
  wallet: string | null;
  projects_worked_together: string[] | null;
  /** Profile picture URL — Telegram avatar in our storage, or unavatar.io for X. Per KOL-AVATAR.* (2026-06-17). */
  profile_picture_url?: string | null;
  profile_picture_synced_at?: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface CreateKOLData {
  name: string;
  link?: string;
  platform?: string[];
  followers?: number;
  region?: MasterKOL['region'];
  community_founder?: boolean;
  /** @deprecated alias of community_founder */
  community?: boolean;
  community_link?: string | null;
  deliverables?: string[];
  creator_types?: MasterKOL['creator_types'];
  /** @deprecated alias of creator_types */
  creator_type?: MasterKOL['creator_type'];
  content_type?: MasterKOL['content_type'];
  niche_tags?: string[];
  /** @deprecated alias of niche_tags */
  niche?: string[];
  pricing?: MasterKOL['pricing'];
  group_chat?: boolean;
  in_house?: string | null;
  notes?: string;
  /** @deprecated alias of notes */
  description?: string;
  wallet?: string;
  projects_worked_together?: string[];
}

export interface UpdateKOLData {
  id: string;
  name?: string;
  link?: string | null;
  platform?: string[] | null;
  followers?: number | null;
  region?: string | null;
  community_founder?: boolean | null;
  /** @deprecated alias of community_founder */
  community?: boolean | null;
  community_link?: string | null;
  deliverables?: string[] | null;
  creator_types?: string[] | null;
  /** @deprecated alias of creator_types */
  creator_type?: string[] | null;
  content_type?: string[] | null;
  niche_tags?: string[] | null;
  /** @deprecated alias of niche_tags */
  niche?: string[] | null;
  pricing?: string | null;
  group_chat?: boolean | null;
  in_house?: string | null;
  notes?: string | null;
  /** @deprecated alias of notes */
  description?: string | null;
  wallet?: string | null;
  projects_worked_together?: string[] | null;
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
      // Cast via unknown — the generated Database types still carry the
      // dropped `tier`/`rating` columns and lack the new ones until
      // migration 071 is applied (then `npm run db:types` regenerates).
      // Once the migration lands, the cast can drop back to `as MasterKOL[]`.
      return ((kols || []) as unknown) as MasterKOL[];
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
          community_founder: kolData.community_founder || false,
          community_link: kolData.community_link || null,
          deliverables: kolData.deliverables || [],
          niche_tags: kolData.niche_tags || [],
          pricing: kolData.pricing || null,
          group_chat: kolData.group_chat || false,
          notes: kolData.notes || null,
          creator_types: kolData.creator_types || null,
          content_type: kolData.content_type || null,
          in_house: kolData.in_house || null,
          projects_worked_together: kolData.projects_worked_together || []
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

      return (kol as unknown) as MasterKOL;
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
        updateData.notes !== undefined ||
        updateData.region !== undefined ||
        updateData.platform !== undefined ||
        updateData.creator_types !== undefined ||
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

      return (kol as unknown) as MasterKOL;
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
      // [2026-06-10] HHP Creator Taxonomy Spec — fully migrated. All
      // legacy values cleared from data via SQL passes (Research →
      // Analyst, Crypto → niche Trading, 6 topic words → niche moves,
      // Native (Meme/Culture) → Native + niche Meme/Degen, General +
      // 12 unmappable values cleared from creator_type entirely).
      //
      // Now options expose ONLY the 13 spec niche tags. Old-data chips
      // that survived migration (none, after the cleanup) would still
      // render via the color-map fallback to gray.
      niches: [
        'AI', 'DeFi', 'L1/L2', 'Trading', 'Airdrop', 'NFT/Gaming',
        'RWA', 'Regulation', 'Macro', 'Meme/Degen',
        'Base', 'Solana', 'Ethereum',
      ],
      pricingTiers: ['<$200', '$200-500', '$500-1K', '$1K-2K', '$2K-3K', '>$3K'],
      // `tiers` was removed alongside the `tier` column (migration 071).
      // The new tier badge is auto-derived from the composite Score in
      // Phase 3 — no manual tier picker anymore.
      //
      // [2026-06-10] Spec-clean: only the 8 HHP Creator Types remain.
      // Max-2 enforced in the UI (see app/kols/page.tsx).
      creatorTypes: [
        'Native', 'Scout', 'Tracker', 'Analyst',
        'Educator', 'Visionary', 'Onboarder', 'Curator',
      ],
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