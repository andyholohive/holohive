import { supabase } from './supabase';

// TypeScript types for Changelog
export interface Changelog {
  id: string;
  version: string;
  title: string;
  content: string;
  published_at: string | null;
  is_published: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateChangelogData {
  version: string;
  title: string;
  content: string;
  published_at?: string | null;
  is_published?: boolean;
}

export interface UpdateChangelogData {
  version?: string;
  title?: string;
  content?: string;
  published_at?: string | null;
  is_published?: boolean;
}

export class ChangelogService {
  /**
   * Get all changelogs (admin only - includes drafts)
   */
  static async getAllChangelogs(): Promise<Changelog[]> {
    const { data, error } = await supabase
      .from('changelogs')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching changelogs:', error);
      throw error;
    }

    return data || [];
  }

  /**
   * Get all published changelogs (visible to all users)
   */
  static async getPublishedChangelogs(): Promise<Changelog[]> {
    const { data, error } = await supabase
      .from('changelogs')
      .select('*')
      .eq('is_published', true)
      .or('published_at.is.null,published_at.lte.now()')
      .order('published_at', { ascending: false, nullsFirst: false });

    if (error) {
      console.error('Error fetching published changelogs:', error);
      throw error;
    }

    return data || [];
  }

  /**
   * Get unread changelogs for the current user
   */
  static async getUnreadChangelogs(): Promise<Changelog[]> {
    // Get current user
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    // First, get all changelog IDs that the user has viewed
    const { data: viewedData, error: viewedError } = await supabase
      .from('changelog_views')
      .select('changelog_id')
      .eq('user_id', user.id);

    if (viewedError) {
      console.error('Error fetching viewed changelogs:', viewedError);
      throw viewedError;
    }

    const viewedIds = (viewedData || []).map(v => v.changelog_id);

    // Get all published changelogs
    let query = supabase
      .from('changelogs')
      .select('*')
      .eq('is_published', true)
      .or('published_at.is.null,published_at.lte.now()')
      .order('published_at', { ascending: false, nullsFirst: false });

    // Exclude viewed changelogs if any
    if (viewedIds.length > 0) {
      query = query.not('id', 'in', `(${viewedIds.join(',')})`);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching unread changelogs:', error);
      throw error;
    }

    return data || [];
  }

  /**
   * Get a single changelog by ID
   */
  static async getChangelogById(id: string): Promise<Changelog | null> {
    const { data, error } = await supabase
      .from('changelogs')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null; // Not found
      console.error('Error fetching changelog:', error);
      throw error;
    }

    return data;
  }

  /**
   * Create a new changelog (admin only)
   */
  static async createChangelog(data: CreateChangelogData): Promise<Changelog> {
    const { data: { user } } = await supabase.auth.getUser();

    const { data: changelog, error } = await supabase
      .from('changelogs')
      .insert({
        ...data,
        created_by: user?.id,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating changelog:', error);
      throw error;
    }

    return changelog;
  }

  /**
   * Update an existing changelog (admin only)
   */
  static async updateChangelog(id: string, data: UpdateChangelogData): Promise<Changelog> {
    const { data: changelog, error } = await supabase
      .from('changelogs')
      .update({
        ...data,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating changelog:', error);
      throw error;
    }

    return changelog;
  }

  /**
   * Delete a changelog (admin only)
   */
  static async deleteChangelog(id: string): Promise<void> {
    const { error } = await supabase
      .from('changelogs')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting changelog:', error);
      throw error;
    }
  }

  /**
   * Publish a changelog (admin only)
   */
  static async publishChangelog(id: string): Promise<Changelog> {
    return this.updateChangelog(id, {
      is_published: true,
      published_at: new Date().toISOString()
    });
  }

  /**
   * Unpublish a changelog (admin only)
   */
  static async unpublishChangelog(id: string): Promise<Changelog> {
    return this.updateChangelog(id, {
      is_published: false
    });
  }

  /**
   * Mark a changelog as viewed by the current user
   */
  static async markAsViewed(changelogId: string): Promise<void> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { error } = await supabase
      .from('changelog_views')
      .upsert({
        user_id: user.id,
        changelog_id: changelogId,
        viewed_at: new Date().toISOString()
      }, {
        onConflict: 'user_id,changelog_id'
      });

    if (error) {
      console.error('Error marking changelog as viewed:', error);
      throw error;
    }
  }

  /**
   * Mark multiple changelogs as viewed by the current user
   */
  static async markMultipleAsViewed(changelogIds: string[]): Promise<void> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || changelogIds.length === 0) return;

    const records = changelogIds.map(changelogId => ({
      user_id: user.id,
      changelog_id: changelogId,
      viewed_at: new Date().toISOString()
    }));

    const { error } = await supabase
      .from('changelog_views')
      .upsert(records, {
        onConflict: 'user_id,changelog_id'
      });

    if (error) {
      console.error('Error marking changelogs as viewed:', error);
      throw error;
    }
  }
}
