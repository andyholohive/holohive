import { supabase } from './supabase';
import { generateUniqueSlug } from './slugUtils';

export interface SavedSortOrder {
  field: string;
  direction: 'asc' | 'desc';
}

export interface ListFilters {
  platforms?: string[];
  regions?: string[];
  creatorTypes?: string[];
  followers?: { operator: string; value: number };
  rating?: { operator: string; value: number };
}

export interface List {
  id: string;
  name: string;
  slug: string | null;
  notes: string | null;
  status: string | null;
  approved_emails: string[] | null;
  filters: ListFilters | null;
  sort_order: SavedSortOrder | null;
  created_at: string;
  updated_at: string;
}

export interface ListWithKOLs extends List {
  kols?: {
    id: string;
    name: string;
    platform: string[] | null;
    followers: number | null;
    region: string | null;
    link: string | null;
    creator_type: string[] | null;
    rating?: number | null;
    status?: string | null;
    notes?: string | null;
  }[];
}

export interface CreateListData {
  name: string;
  slug?: string;
  notes?: string;
  status?: string;
  approved_emails?: string[];
  filters?: ListFilters;
  sort_order?: SavedSortOrder;
}

export interface UpdateListData {
  id: string;
  name?: string;
  slug?: string | null;
  notes?: string | null;
  status?: string | null;
  approved_emails?: string[] | null;
  filters?: ListFilters | null;
  sort_order?: SavedSortOrder | null;
}

export class ListService {
  /**
   * Get all lists
   */
  static async getAllLists(): Promise<List[]> {
    try {
      const { data: lists, error } = await supabase
        .from('lists')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return lists || [];
    } catch (error) {
      console.error('Error fetching lists:', error);
      throw error;
    }
  }

  /**
   * Get a single list by ID
   */
  static async getListById(listId: string): Promise<List | null> {
    try {
      const { data: list, error } = await supabase
        .from('lists')
        .select('*')
        .eq('id', listId)
        .single();

      if (error) throw error;
      return list;
    } catch (error) {
      console.error('Error fetching list:', error);
      throw error;
    }
  }

  /**
   * Get a single list by slug
   */
  static async getListBySlug(slug: string): Promise<List | null> {
    try {
      const { data: list, error } = await supabase
        .from('lists')
        .select('*')
        .eq('slug', slug)
        .single();

      if (error) throw error;
      return list;
    } catch (error) {
      console.error('Error fetching list by slug:', error);
      throw error;
    }
  }

  /**
   * Get a list by ID or slug
   */
  static async getListByIdOrSlug(idOrSlug: string): Promise<List | null> {
    // Check if it's a UUID format
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idOrSlug);

    if (isUUID) {
      return this.getListById(idOrSlug);
    } else {
      return this.getListBySlug(idOrSlug);
    }
  }

  /**
   * Create a new list
   */
  static async createList(listData: CreateListData): Promise<List> {
    try {
      // Generate slug if not provided
      const slug = listData.slug || generateUniqueSlug(listData.name);

      const { data: list, error } = await supabase
        .from('lists')
        .insert([{
          name: listData.name,
          slug: slug,
          notes: listData.notes || null,
          status: listData.status || 'curated',
          approved_emails: listData.approved_emails || null,
          filters: listData.filters || null,
          sort_order: listData.sort_order || null
        }])
        .select()
        .single();

      if (error) throw error;
      return list;
    } catch (error) {
      console.error('Error creating list:', error);
      throw error;
    }
  }

  /**
   * Update a list
   */
  static async updateList(listData: UpdateListData): Promise<List> {
    try {
      const updateData: any = { ...listData };
      delete updateData.id;

      const { data: list, error } = await supabase
        .from('lists')
        .update(updateData)
        .eq('id', listData.id)
        .select()
        .single();

      if (error) throw error;
      return list;
    } catch (error) {
      console.error('Error updating list:', error);
      throw error;
    }
  }

  /**
   * Delete a list
   */
  static async deleteList(listId: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('lists')
        .delete()
        .eq('id', listId);

      if (error) throw error;
    } catch (error) {
      console.error('Error deleting list:', error);
      throw error;
    }
  }

  /**
   * Generate a unique slug for a list
   */
  static generateSlug(name: string): string {
    return generateUniqueSlug(name);
  }
}
