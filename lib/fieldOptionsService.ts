import { supabase } from './supabase';

export interface FieldOption {
  id: string;
  field_name: string;
  option_value: string;
  display_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateFieldOptionData {
  field_name: string;
  option_value: string;
  display_order?: number;
  is_active?: boolean;
}

export interface UpdateFieldOptionData {
  option_value?: string;
  display_order?: number;
  is_active?: boolean;
}

export class FieldOptionsService {
  /**
   * Get all field options for a specific field
   */
  static async getFieldOptions(fieldName: string): Promise<FieldOption[]> {
    try {
      const { data, error } = await (supabase as any)
        .from('field_options')
        .select('*')
        .eq('field_name', fieldName)
        .eq('is_active', true)
        .order('display_order', { ascending: true });

      if (error) {
        console.error('Error fetching field options:', error);
        throw error;
      }

      return data || [];
    } catch (error) {
      console.error('Error in getFieldOptions:', error);
      throw error;
    }
  }

  /**
   * Get all field options (for admin management)
   */
  static async getAllFieldOptions(): Promise<FieldOption[]> {
    try {
      const { data, error } = await (supabase as any)
        .from('field_options')
        .select('*')
        .order('field_name', { ascending: true })
        .order('display_order', { ascending: true });

      if (error) {
        console.error('Error fetching all field options:', error);
        throw error;
      }

      return data || [];
    } catch (error) {
      console.error('Error in getAllFieldOptions:', error);
      throw error;
    }
  }

  /**
   * Create a new field option
   */
  static async createFieldOption(optionData: CreateFieldOptionData): Promise<FieldOption> {
    try {
      const { data, error } = await (supabase as any)
        .from('field_options')
        .insert([{
          field_name: optionData.field_name,
          option_value: optionData.option_value,
          display_order: optionData.display_order || 0,
          is_active: optionData.is_active !== undefined ? optionData.is_active : true
        }])
        .select()
        .single();

      if (error) {
        console.error('Error creating field option:', error);
        throw error;
      }

      return data;
    } catch (error) {
      console.error('Error in createFieldOption:', error);
      throw error;
    }
  }

  /**
   * Update a field option
   */
  static async updateFieldOption(id: string, updateData: UpdateFieldOptionData): Promise<FieldOption> {
    try {
      const { data, error } = await (supabase as any)
        .from('field_options')
        .update({
          ...updateData,
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .select()
        .single();

      if (error) {
        console.error('Error updating field option:', error);
        throw error;
      }

      return data;
    } catch (error) {
      console.error('Error in updateFieldOption:', error);
      throw error;
    }
  }

  /**
   * Delete a field option
   */
  static async deleteFieldOption(id: string): Promise<void> {
    try {
      const { error } = await (supabase as any)
        .from('field_options')
        .delete()
        .eq('id', id);

      if (error) {
        console.error('Error deleting field option:', error);
        throw error;
      }
    } catch (error) {
      console.error('Error in deleteFieldOption:', error);
      throw error;
    }
  }

  /**
   * Reorder field options
   */
  static async reorderFieldOptions(fieldName: string, optionIds: string[]): Promise<void> {
    try {
      const updates = optionIds.map((id, index) => ({
        id,
        display_order: index + 1
      }));

      for (const update of updates) {
        await (supabase as any)
          .from('field_options')
          .update({ display_order: update.display_order })
          .eq('id', update.id);
      }
    } catch (error) {
      console.error('Error in reorderFieldOptions:', error);
      throw error;
    }
  }

  /**
   * Get field options as a simple array of strings (for dropdowns)
   */
  static async getFieldOptionsAsArray(fieldName: string): Promise<string[]> {
    try {
      const options = await this.getFieldOptions(fieldName);
      return options.map(option => option.option_value);
    } catch (error) {
      console.error('Error in getFieldOptionsAsArray:', error);
      return [];
    }
  }
}
