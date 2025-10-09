import { supabase } from './supabase';

// TypeScript types for Forms
export type FormStatus = 'draft' | 'published' | 'closed';
export type FieldType = 'text' | 'textarea' | 'email' | 'number' | 'select' | 'radio' | 'checkbox' | 'date' | 'section' | 'description';

export interface Form {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  status: FormStatus;
  created_at: string;
  updated_at: string;
}

export interface FormField {
  id: string;
  form_id: string;
  field_type: FieldType;
  label: string;
  required: boolean;
  options: string[] | null; // For select/radio/checkbox
  display_order: number;
  page_number: number;
  created_at: string;
}

export interface FormResponse {
  id: string;
  form_id: string;
  response_data: Record<string, any>; // { field_id: value }
  submitted_by_email: string | null;
  submitted_by_name: string | null;
  submitted_at: string;
}

export interface FormWithFields extends Form {
  fields: FormField[];
}

export interface FormWithStats extends Form {
  response_count: number;
}

export interface CreateFormData {
  name: string;
  description?: string;
  status?: FormStatus;
}

export interface UpdateFormData {
  id: string;
  name?: string;
  description?: string | null;
  status?: FormStatus;
}

export interface CreateFieldData {
  form_id: string;
  field_type: FieldType;
  label: string;
  required?: boolean;
  options?: string[];
  display_order?: number;
  page_number?: number;
}

export interface UpdateFieldData {
  id: string;
  field_type?: FieldType;
  label?: string;
  required?: boolean;
  options?: string[] | null;
  display_order?: number;
  page_number?: number;
}

export interface SubmitResponseData {
  form_id: string;
  response_data: Record<string, any>;
  submitted_by_email?: string;
  submitted_by_name?: string;
}

export class FormService {
  /**
   * Get all forms for the current user with response counts
   */
  static async getAllForms(): Promise<FormWithStats[]> {
    try {
      const { data: forms, error } = await (supabase as any)
        .from('forms')
        .select(`
          *,
          response_count:form_responses(count)
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Transform the response count
      return (forms || []).map((form: any) => ({
        ...form,
        response_count: form.response_count?.[0]?.count || 0
      }));
    } catch (error) {
      console.error('Error fetching forms:', error);
      throw error;
    }
  }

  /**
   * Get a single form by ID with fields
   */
  static async getFormById(formId: string): Promise<FormWithFields | null> {
    try {
      const { data: form, error: formError } = await (supabase as any)
        .from('forms')
        .select('*')
        .eq('id', formId)
        .single();

      if (formError) throw formError;
      if (!form) return null;

      const { data: fields, error: fieldsError } = await (supabase as any)
        .from('form_fields')
        .select('*')
        .eq('form_id', formId)
        .order('page_number', { ascending: true })
        .order('display_order', { ascending: true });

      if (fieldsError) throw fieldsError;

      return {
        ...form,
        fields: fields || []
      };
    } catch (error) {
      console.error('Error fetching form:', error);
      throw error;
    }
  }

  /**
   * Get a published form by ID (public access, no auth required)
   * Use the public supabase client for this
   */
  static async getPublicForm(formId: string, publicSupabase: any): Promise<FormWithFields | null> {
    try {
      const { data: form, error: formError } = await publicSupabase
        .from('forms')
        .select('*')
        .eq('id', formId)
        .eq('status', 'published')
        .single();

      if (formError) throw formError;
      if (!form) return null;

      const { data: fields, error: fieldsError } = await publicSupabase
        .from('form_fields')
        .select('*')
        .eq('form_id', formId)
        .order('page_number', { ascending: true })
        .order('display_order', { ascending: true });

      if (fieldsError) throw fieldsError;

      return {
        ...form,
        fields: fields || []
      };
    } catch (error) {
      console.error('Error fetching public form:', error);
      return null;
    }
  }

  /**
   * Create a new form
   */
  static async createForm(formData: CreateFormData): Promise<Form> {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data: form, error } = await (supabase as any)
        .from('forms')
        .insert([{
          user_id: user.id,
          name: formData.name,
          description: formData.description || null,
          status: formData.status || 'draft'
        }])
        .select()
        .single();

      if (error) throw error;
      return form;
    } catch (error) {
      console.error('Error creating form:', error);
      throw error;
    }
  }

  /**
   * Update a form
   */
  static async updateForm(formData: UpdateFormData): Promise<Form> {
    try {
      const updateData: any = { ...formData };
      delete updateData.id;

      const { data: form, error } = await (supabase as any)
        .from('forms')
        .update(updateData)
        .eq('id', formData.id)
        .select()
        .single();

      if (error) throw error;
      return form;
    } catch (error) {
      console.error('Error updating form:', error);
      throw error;
    }
  }

  /**
   * Delete a form
   */
  static async deleteForm(formId: string): Promise<void> {
    try {
      const { error } = await (supabase as any)
        .from('forms')
        .delete()
        .eq('id', formId);

      if (error) throw error;
    } catch (error) {
      console.error('Error deleting form:', error);
      throw error;
    }
  }

  /**
   * Create a new field for a form
   */
  static async createField(fieldData: CreateFieldData): Promise<FormField> {
    try {
      // Get the next display order
      const { data: existingFields } = await (supabase as any)
        .from('form_fields')
        .select('display_order')
        .eq('form_id', fieldData.form_id)
        .order('display_order', { ascending: false })
        .limit(1);

      const nextOrder = existingFields?.[0]?.display_order + 1 || 0;

      const { data: field, error } = await (supabase as any)
        .from('form_fields')
        .insert([{
          form_id: fieldData.form_id,
          field_type: fieldData.field_type,
          label: fieldData.label,
          required: fieldData.required || false,
          options: fieldData.options || null,
          display_order: fieldData.display_order ?? nextOrder,
          page_number: fieldData.page_number ?? 1
        }])
        .select()
        .single();

      if (error) throw error;
      return field;
    } catch (error) {
      console.error('Error creating field:', error);
      throw error;
    }
  }

  /**
   * Update a field
   */
  static async updateField(fieldData: UpdateFieldData): Promise<FormField> {
    try {
      const updateData: any = { ...fieldData };
      delete updateData.id;

      const { data: field, error } = await (supabase as any)
        .from('form_fields')
        .update(updateData)
        .eq('id', fieldData.id)
        .select()
        .single();

      if (error) throw error;
      return field;
    } catch (error) {
      console.error('Error updating field:', error);
      throw error;
    }
  }

  /**
   * Delete a field
   */
  static async deleteField(fieldId: string): Promise<void> {
    try {
      const { error } = await (supabase as any)
        .from('form_fields')
        .delete()
        .eq('id', fieldId);

      if (error) throw error;
    } catch (error) {
      console.error('Error deleting field:', error);
      throw error;
    }
  }

  /**
   * Reorder fields for a form
   */
  static async reorderFields(formId: string, fieldIds: string[]): Promise<void> {
    try {
      // Update each field's display_order
      const updates = fieldIds.map((fieldId, index) =>
        (supabase as any)
          .from('form_fields')
          .update({ display_order: index })
          .eq('id', fieldId)
          .eq('form_id', formId)
      );

      await Promise.all(updates);
    } catch (error) {
      console.error('Error reordering fields:', error);
      throw error;
    }
  }

  /**
   * Submit a response to a form (public access)
   */
  static async submitResponse(responseData: SubmitResponseData, publicSupabase: any): Promise<FormResponse> {
    try {
      const { data: response, error } = await publicSupabase
        .from('form_responses')
        .insert([{
          form_id: responseData.form_id,
          response_data: responseData.response_data,
          submitted_by_email: responseData.submitted_by_email || null,
          submitted_by_name: responseData.submitted_by_name || null
        }])
        .select()
        .single();

      if (error) throw error;
      return response;
    } catch (error) {
      console.error('Error submitting response:', error);
      throw error;
    }
  }

  /**
   * Get all responses for a form
   */
  static async getResponses(formId: string): Promise<FormResponse[]> {
    try {
      const { data: responses, error } = await (supabase as any)
        .from('form_responses')
        .select('*')
        .eq('form_id', formId)
        .order('submitted_at', { ascending: false });

      if (error) throw error;
      return responses || [];
    } catch (error) {
      console.error('Error fetching responses:', error);
      throw error;
    }
  }

  /**
   * Delete a response
   */
  static async deleteResponse(responseId: string): Promise<void> {
    try {
      const { error } = await (supabase as any)
        .from('form_responses')
        .delete()
        .eq('id', responseId);

      if (error) throw error;
    } catch (error) {
      console.error('Error deleting response:', error);
      throw error;
    }
  }

  /**
   * Export responses to CSV format
   */
  static async exportResponsesToCSV(formId: string): Promise<string> {
    try {
      // Get form with fields
      const form = await this.getFormById(formId);
      if (!form) throw new Error('Form not found');

      // Get responses
      const responses = await this.getResponses(formId);

      // Build CSV header
      const headers = [
        'Submission Date',
        'Submitted By Name',
        'Submitted By Email',
        ...form.fields.map(f => f.label)
      ];

      // Build CSV rows
      const rows = responses.map(response => {
        const row = [
          new Date(response.submitted_at).toLocaleString(),
          response.submitted_by_name || '',
          response.submitted_by_email || '',
          ...form.fields.map(field => {
            const value = response.response_data[field.id];
            if (Array.isArray(value)) {
              return value.join(', ');
            }
            return value || '';
          })
        ];
        return row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',');
      });

      // Combine header and rows
      const csv = [
        headers.map(h => `"${h}"`).join(','),
        ...rows
      ].join('\n');

      return csv;
    } catch (error) {
      console.error('Error exporting responses:', error);
      throw error;
    }
  }

  /**
   * Get field type icon
   */
  static getFieldTypeIcon(fieldType: FieldType): string {
    const icons: Record<FieldType, string> = {
      text: '📝',
      textarea: '📄',
      email: '📧',
      number: '🔢',
      select: '📋',
      radio: '🔘',
      checkbox: '☑️',
      date: '📅',
      section: '📑',
      description: '💬'
    };
    return icons[fieldType] || '❓';
  }

  /**
   * Get field type label
   */
  static getFieldTypeLabel(fieldType: FieldType): string {
    const labels: Record<FieldType, string> = {
      text: 'Short Text',
      textarea: 'Long Text',
      email: 'Email',
      number: 'Number',
      select: 'Dropdown',
      radio: 'Multiple Choice',
      checkbox: 'Checkboxes',
      date: 'Date',
      section: 'Section Header',
      description: 'Description Text'
    };
    return labels[fieldType] || fieldType;
  }

  /**
   * Get status badge color
   */
  static getStatusColor(status: FormStatus): string {
    const colors: Record<FormStatus, string> = {
      draft: 'bg-gray-100 text-gray-700',
      published: 'bg-green-100 text-green-700',
      closed: 'bg-red-100 text-red-700'
    };
    return colors[status] || 'bg-gray-100 text-gray-700';
  }

  /**
   * Bulk update field positions (for drag and drop reordering)
   */
  static async updateFieldPositions(updates: Array<{ id: string; display_order: number; page_number: number }>): Promise<void> {
    try {
      // Update each field
      const promises = updates.map(({ id, display_order, page_number }) =>
        (supabase as any)
          .from('form_fields')
          .update({ display_order, page_number })
          .eq('id', id)
      );

      await Promise.all(promises);
    } catch (error) {
      console.error('Error updating field positions:', error);
      throw error;
    }
  }
}
