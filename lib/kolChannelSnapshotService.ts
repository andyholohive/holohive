import { supabase } from './supabase';

/**
 * Service for kol_channel_snapshots (table created in migration 073).
 *
 * Monthly snapshots of channel health per KOL. Two of the five
 * composite-Score dimensions read from these rows:
 *   - Channel Health (engagement_rate + posting_frequency)
 *   - Growth Trajectory (month-over-month follower change)
 *
 * Currently only fed by manual entry from the KOL profile modal.
 * The "auto-pulled for public channels" path from the spec waits on
 * the data-source decision (Telegram Bot API vs scraping).
 *
 * Read patterns:
 *   - getForKol(kolId): full history for the profile UI + scoring engine
 *   - getLatestForAllKols(): one-row-per-kol bulk fetch for /kols Score column
 */

export interface KolChannelSnapshot {
  id: string;
  kol_id: string;
  snapshot_date: string;        // YYYY-MM-DD (always first of month per spec)
  follower_count: number;
  avg_views_per_post: number | null;
  avg_forwards_per_post: number | null;
  avg_reactions_per_post: number | null;
  posting_frequency: number | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateKolChannelSnapshotInput {
  kol_id: string;
  snapshot_date: string;
  follower_count: number;
  avg_views_per_post?: number | null;
  avg_forwards_per_post?: number | null;
  avg_reactions_per_post?: number | null;
  posting_frequency?: number | null;
  notes?: string | null;
}

export type UpdateKolChannelSnapshotInput = Partial<Omit<CreateKolChannelSnapshotInput, 'kol_id'>>;

export class KolChannelSnapshotService {
  /**
   * Full snapshot history for a KOL — newest first. Used by both the
   * profile modal display and the scoring engine (which needs at least
   * the latest two rows to compute Growth Trajectory).
   */
  static async getForKol(kolId: string): Promise<KolChannelSnapshot[]> {
    const { data, error } = await (supabase as any)
      .from('kol_channel_snapshots')
      .select('*')
      .eq('kol_id', kolId)
      .order('snapshot_date', { ascending: false });
    if (error) {
      console.error('[KolChannelSnapshotService.getForKol]', error);
      throw error;
    }
    return (data || []) as KolChannelSnapshot[];
  }

  /**
   * Bulk fetch — all snapshots across all KOLs, newest first. Used by
   * the /kols Score column so we can compute scores client-side without
   * N+1 queries. Filter to last 12 months to bound the payload (older
   * data isn't used by the scoring formula anyway).
   */
  static async getRecentForAllKols(monthsBack: number = 12): Promise<KolChannelSnapshot[]> {
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - monthsBack);
    const { data, error } = await (supabase as any)
      .from('kol_channel_snapshots')
      .select('*')
      .gte('snapshot_date', cutoff.toISOString().slice(0, 10))
      .order('snapshot_date', { ascending: false });
    if (error) {
      console.error('[KolChannelSnapshotService.getRecentForAllKols]', error);
      throw error;
    }
    return (data || []) as KolChannelSnapshot[];
  }

  /**
   * Insert OR update on (kol_id, snapshot_date). Lets the future
   * auto-pull job re-run safely without dupes — same shape as the
   * uniqueness constraint in migration 073.
   */
  static async upsert(input: CreateKolChannelSnapshotInput): Promise<KolChannelSnapshot> {
    const { data, error } = await (supabase as any)
      .from('kol_channel_snapshots')
      .upsert(input, { onConflict: 'kol_id,snapshot_date' })
      .select('*')
      .single();
    if (error) {
      console.error('[KolChannelSnapshotService.upsert]', error);
      throw error;
    }
    return data as KolChannelSnapshot;
  }

  static async update(id: string, input: UpdateKolChannelSnapshotInput): Promise<KolChannelSnapshot> {
    const payload: Record<string, any> = { ...input, updated_at: new Date().toISOString() };
    const { data, error } = await (supabase as any)
      .from('kol_channel_snapshots')
      .update(payload)
      .eq('id', id)
      .select('*')
      .single();
    if (error) {
      console.error('[KolChannelSnapshotService.update]', error);
      throw error;
    }
    return data as KolChannelSnapshot;
  }

  static async delete(id: string): Promise<void> {
    const { error } = await (supabase as any)
      .from('kol_channel_snapshots')
      .delete()
      .eq('id', id);
    if (error) {
      console.error('[KolChannelSnapshotService.delete]', error);
      throw error;
    }
  }
}
