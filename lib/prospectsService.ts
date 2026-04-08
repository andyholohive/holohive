import { supabase } from './supabase';
import { SalesPipelineService } from './salesPipelineService';
import { OpportunityStage } from './crmService';

// ============================================
// Types
// ============================================

export type ProspectStatus = 'new' | 'reviewed' | 'promoted' | 'dismissed';

export interface Prospect {
  id: string;
  name: string;
  symbol: string | null;
  category: string | null;
  market_cap: number | null;
  price: number | null;
  volume_24h: number | null;
  website_url: string | null;
  twitter_url: string | null;
  telegram_url: string | null;
  discord_url: string | null;
  logo_url: string | null;
  source_url: string | null;
  source: string;
  status: ProspectStatus;
  promoted_opportunity_id: string | null;
  scraped_at: string;
  created_at: string;
  updated_at: string;
}

export interface CreateProspectData {
  name: string;
  symbol?: string;
  category?: string;
  market_cap?: number;
  price?: number;
  volume_24h?: number;
  website_url?: string;
  twitter_url?: string;
  telegram_url?: string;
  discord_url?: string;
  logo_url?: string;
  source_url?: string;
  source?: string;
}

export interface ProspectFilters {
  searchTerm?: string;
  status?: ProspectStatus | 'all';
  category?: string;
  source?: string;
  sortBy?: string;
  sortAsc?: boolean;
}

// ============================================
// Prospects Service
// ============================================

export class ProspectsService {

  /**
   * Fetch prospects with pagination, search, and filters
   */
  static async getPaginated(
    page: number = 1,
    pageSize: number = 50,
    filters: ProspectFilters = {}
  ): Promise<{ data: Prospect[]; count: number }> {
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let query = supabase
      .from('prospects')
      .select('*', { count: 'exact' });

    // Filters
    if (filters.status && filters.status !== 'all') {
      query = query.eq('status', filters.status);
    }
    if (filters.category) {
      query = query.eq('category', filters.category);
    }
    if (filters.source) {
      query = query.eq('source', filters.source);
    }
    if (filters.searchTerm) {
      query = query.ilike('name', `%${filters.searchTerm}%`);
    }

    // Sort
    const sortField = filters.sortBy || 'scraped_at';
    query = query.order(sortField, { ascending: filters.sortAsc ?? false });

    // Paginate
    query = query.range(from, to);

    const { data, error, count } = await query;
    if (error) throw error;

    return { data: (data || []) as Prospect[], count: count || 0 };
  }

  /**
   * Get distinct categories for filter dropdown
   */
  static async getCategories(): Promise<string[]> {
    const { data, error } = await supabase
      .from('prospects')
      .select('category')
      .not('category', 'is', null)
      .order('category');

    if (error) throw error;
    const unique = [...new Set((data || []).map(d => d.category).filter(Boolean))];
    return unique as string[];
  }

  /**
   * Upsert a prospect (insert or update if name+source already exists)
   */
  static async upsert(data: CreateProspectData): Promise<Prospect> {
    const { data: result, error } = await supabase
      .from('prospects')
      .upsert(
        {
          ...data,
          source: data.source || 'dropstab',
          scraped_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'name,source' }
      )
      .select()
      .single();

    if (error) throw error;
    return result as Prospect;
  }

  /**
   * Bulk upsert prospects
   */
  static async bulkUpsert(prospects: CreateProspectData[]): Promise<{ inserted: number; updated: number; errors: number }> {
    let inserted = 0, updated = 0, errors = 0;

    // Process in batches of 50
    const batchSize = 50;
    for (let i = 0; i < prospects.length; i += batchSize) {
      const batch = prospects.slice(i, i + batchSize).map(p => ({
        ...p,
        source: p.source || 'dropstab',
        scraped_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }));

      const { data, error } = await supabase
        .from('prospects')
        .upsert(batch, { onConflict: 'name,source' })
        .select('id');

      if (error) {
        console.error('Bulk upsert error:', error);
        errors += batch.length;
      } else {
        inserted += data?.length || 0;
      }
    }

    return { inserted, updated, errors };
  }

  /**
   * Promote a prospect to a pipeline opportunity
   */
  static async promote(prospectId: string, ownerId?: string): Promise<string> {
    // Fetch the prospect
    const { data: prospect, error: fetchError } = await supabase
      .from('prospects')
      .select('*')
      .eq('id', prospectId)
      .single();

    if (fetchError || !prospect) throw new Error('Prospect not found');
    if (prospect.status === 'promoted') throw new Error('Already promoted');

    // Create opportunity
    const opp = await SalesPipelineService.create({
      name: prospect.name,
      stage: 'cold_dm' as OpportunityStage,
      source: `scraped_${prospect.source}`,
      website_url: prospect.website_url || undefined,
      owner_id: ownerId,
      notes: [
        prospect.category ? `Category: ${prospect.category}` : '',
        prospect.market_cap ? `Market Cap: $${Number(prospect.market_cap).toLocaleString()}` : '',
        prospect.symbol ? `Symbol: ${prospect.symbol}` : '',
        prospect.source_url ? `Source: ${prospect.source_url}` : '',
      ].filter(Boolean).join('\n'),
    } as any);

    // Mark prospect as promoted
    await supabase
      .from('prospects')
      .update({
        status: 'promoted',
        promoted_opportunity_id: opp.id,
        updated_at: new Date().toISOString(),
      })
      .eq('id', prospectId);

    return opp.id;
  }

  /**
   * Dismiss a prospect
   */
  static async dismiss(prospectId: string): Promise<void> {
    const { error } = await supabase
      .from('prospects')
      .update({ status: 'dismissed', updated_at: new Date().toISOString() })
      .eq('id', prospectId);

    if (error) throw error;
  }

  /**
   * Bulk dismiss prospects
   */
  static async bulkDismiss(ids: string[]): Promise<void> {
    const { error } = await supabase
      .from('prospects')
      .update({ status: 'dismissed', updated_at: new Date().toISOString() })
      .in('id', ids);

    if (error) throw error;
  }

  /**
   * Bulk promote prospects
   */
  static async bulkPromote(ids: string[], ownerId?: string): Promise<{ promoted: number; errors: number }> {
    let promoted = 0, errors = 0;
    for (const id of ids) {
      try {
        await this.promote(id, ownerId);
        promoted++;
      } catch {
        errors++;
      }
    }
    return { promoted, errors };
  }

  /**
   * Update prospect status
   */
  static async updateStatus(id: string, status: ProspectStatus): Promise<void> {
    const { error } = await supabase
      .from('prospects')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', id);

    if (error) throw error;
  }

  /**
   * Get stats for dashboard
   */
  static async getStats(): Promise<{ total: number; new: number; reviewed: number; promoted: number; dismissed: number }> {
    const { data, error } = await supabase
      .from('prospects')
      .select('status');

    if (error) throw error;

    const all = data || [];
    return {
      total: all.length,
      new: all.filter(p => p.status === 'new').length,
      reviewed: all.filter(p => p.status === 'reviewed').length,
      promoted: all.filter(p => p.status === 'promoted').length,
      dismissed: all.filter(p => p.status === 'dismissed').length,
    };
  }
}
