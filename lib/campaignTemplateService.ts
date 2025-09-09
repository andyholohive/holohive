import { supabase } from './supabase';
import { Database } from './database.types';

type CampaignTemplate = Database['public']['Tables']['campaign_templates']['Row'];
type TemplateBudgetAllocation = Database['public']['Tables']['campaign_template_budget_allocations']['Row'];

export interface CampaignTemplateWithDetails extends CampaignTemplate {
  budget_allocations?: TemplateBudgetAllocation[];
  created_by_name?: string;
}

export interface CreateTemplateData {
  name: string;
  description?: string;
  total_budget: number;
  status?: string;
  start_date?: string;
  end_date?: string;
  region?: string;
  manager?: string;
  intro_call?: boolean;
  intro_call_date?: string;
  client_choosing_kols?: boolean;
  multi_activation?: boolean;
  call_support?: boolean;
  proposal_sent?: boolean;
  nda_signed?: boolean;
  budget_type?: string[];
  is_public?: boolean;
  budget_allocations?: Array<{
    region: string;
    allocated_budget: number;
  }>;
}

export interface UpdateTemplateData extends Partial<CreateTemplateData> {
  id: string;
}

export class CampaignTemplateService {
  /**
   * Get templates based on user role and permissions
   */
  static async getTemplatesForUser(userRole: 'admin' | 'member' | 'client', userId: string): Promise<CampaignTemplateWithDetails[]> {
    try {
      if (userRole === 'admin') {
        // Admins can see all templates
        const { data: templates, error } = await supabase
          .from('campaign_templates')
          .select(`
            *,
            campaign_template_budget_allocations(*)
          `)
          .order('created_at', { ascending: false });

        if (error) throw error;

        return templates?.map(template => ({
          ...template,
          budget_allocations: template.campaign_template_budget_allocations || [],
          created_by_name: undefined // We'll handle this separately if needed
        })) || [];
      } else {
        // Members and clients can see public templates and their own
        const { data: templates, error } = await supabase
          .from('campaign_templates')
          .select(`
            *,
            campaign_template_budget_allocations(*)
          `)
          .or(`is_public.eq.true,created_by.eq.${userId}`)
          .order('created_at', { ascending: false });

        if (error) throw error;

        return templates?.map(template => ({
          ...template,
          budget_allocations: template.campaign_template_budget_allocations || [],
          created_by_name: undefined // We'll handle this separately if needed
        })) || [];
      }
    } catch (error) {
      console.error('Error fetching templates:', error);
      throw error;
    }
  }

  /**
   * Get a single template by ID
   */
  static async getTemplateById(templateId: string): Promise<CampaignTemplateWithDetails | null> {
    try {
      const { data: template, error } = await supabase
        .from('campaign_templates')
        .select(`
          *,
          campaign_template_budget_allocations(*)
        `)
        .eq('id', templateId)
        .single();

      if (error) throw error;

      if (!template) return null;

      return {
        ...template,
        budget_allocations: template.campaign_template_budget_allocations || [],
        created_by_name: undefined // We'll handle this separately if needed
      };
    } catch (error) {
      console.error('Error fetching template:', error);
      throw error;
    }
  }

  /**
   * Create a new template
   */
  static async createTemplate(templateData: CreateTemplateData, userId: string): Promise<CampaignTemplate> {
    try {
      const { budget_allocations, ...templateFields } = templateData;

      // Create the template
      const { data: template, error: templateError } = await supabase
        .from('campaign_templates')
        .insert({
          ...templateFields,
          created_by: userId
        })
        .select()
        .single();

      if (templateError) throw templateError;

      // Create budget allocations if provided
      if (budget_allocations && budget_allocations.length > 0) {
        const budgetAllocationData = budget_allocations.map(allocation => ({
          template_id: template.id,
          region: allocation.region,
          allocated_budget: allocation.allocated_budget
        }));

        const { error: budgetError } = await supabase
          .from('campaign_template_budget_allocations')
          .insert(budgetAllocationData);

        if (budgetError) throw budgetError;
      }

      return template;
    } catch (error) {
      console.error('Error creating template:', error);
      throw error;
    }
  }

  /**
   * Update a template
   */
  static async updateTemplate(templateData: UpdateTemplateData): Promise<CampaignTemplate> {
    try {
      const { id, budget_allocations, ...updateFields } = templateData;

      // Update the template
      const { data: template, error: templateError } = await supabase
        .from('campaign_templates')
        .update(updateFields)
        .eq('id', id)
        .select()
        .single();

      if (templateError) throw templateError;

      // Update budget allocations if provided
      if (budget_allocations) {
        // Delete existing allocations
        const { error: deleteError } = await supabase
          .from('campaign_template_budget_allocations')
          .delete()
          .eq('template_id', id);

        if (deleteError) throw deleteError;

        // Insert new allocations
        if (budget_allocations.length > 0) {
          const budgetAllocationData = budget_allocations.map(allocation => ({
            template_id: id,
            region: allocation.region,
            allocated_budget: allocation.allocated_budget
          }));

          const { error: insertError } = await supabase
            .from('campaign_template_budget_allocations')
            .insert(budgetAllocationData);

          if (insertError) throw insertError;
        }
      }

      return template;
    } catch (error) {
      console.error('Error updating template:', error);
      throw error;
    }
  }

  /**
   * Delete a template
   */
  static async deleteTemplate(templateId: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('campaign_templates')
        .delete()
        .eq('id', templateId);

      if (error) throw error;
    } catch (error) {
      console.error('Error deleting template:', error);
      throw error;
    }
  }

  /**
   * Create a campaign from a template
   */
  static async createCampaignFromTemplate(
    templateId: string,
    clientId: string,
    campaignName: string,
    startDate: string,
    endDate: string
  ): Promise<string> {
    try {
      const { data: campaignId, error } = await supabase
        .rpc('create_campaign_from_template', {
          template_id: templateId,
          client_id: clientId,
          campaign_name: campaignName,
          start_date: startDate,
          end_date: endDate
        });

      if (error) throw error;

      return campaignId;
    } catch (error) {
      console.error('Error creating campaign from template:', error);
      throw error;
    }
  }

  /**
   * Get popular templates (most used)
   */
  static async getPopularTemplates(limit: number = 5): Promise<CampaignTemplateWithDetails[]> {
    try {
      const { data: templates, error } = await supabase
        .from('campaign_templates')
        .select(`
          *,
          campaign_template_budget_allocations(*)
        `)
        .order('usage_count', { ascending: false })
        .limit(limit);

      if (error) throw error;

      return templates?.map(template => ({
        ...template,
        budget_allocations: template.campaign_template_budget_allocations || [],
        created_by_name: undefined // We'll handle this separately if needed
      })) || [];
    } catch (error) {
      console.error('Error fetching popular templates:', error);
      throw error;
    }
  }

  /**
   * Search templates by name or description
   */
  static async searchTemplates(query: string, userRole: 'admin' | 'member' | 'client', userId: string): Promise<CampaignTemplateWithDetails[]> {
    try {
      let queryBuilder = supabase
        .from('campaign_templates')
        .select(`
          *,
          campaign_template_budget_allocations(*)
        `)
        .or(`name.ilike.%${query}%,description.ilike.%${query}%`);

      if (userRole !== 'admin') {
        queryBuilder = queryBuilder.or(`is_public.eq.true,created_by.eq.${userId}`);
      }

      const { data: templates, error } = await queryBuilder.order('created_at', { ascending: false });

      if (error) throw error;

      return templates?.map(template => ({
        ...template,
        budget_allocations: template.campaign_template_budget_allocations || [],
        created_by_name: undefined // We'll handle this separately if needed
      })) || [];
    } catch (error) {
      console.error('Error searching templates:', error);
      throw error;
    }
  }

  /**
   * Get templates by region
   */
  static async getTemplatesByRegion(region: string, userRole: 'admin' | 'member' | 'client', userId: string): Promise<CampaignTemplateWithDetails[]> {
    try {
      let queryBuilder = supabase
        .from('campaign_templates')
        .select(`
          *,
          campaign_template_budget_allocations(*)
        `)
        .eq('region', region);

      if (userRole !== 'admin') {
        queryBuilder = queryBuilder.or(`is_public.eq.true,created_by.eq.${userId}`);
      }

      const { data: templates, error } = await queryBuilder.order('created_at', { ascending: false });

      if (error) throw error;

      return templates?.map(template => ({
        ...template,
        budget_allocations: template.campaign_template_budget_allocations || [],
        created_by_name: undefined // We'll handle this separately if needed
      })) || [];
    } catch (error) {
      console.error('Error fetching templates by region:', error);
      throw error;
    }
  }
} 