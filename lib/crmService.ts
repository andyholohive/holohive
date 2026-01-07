import { supabase } from './supabase';

// ============================================
// TypeScript Types for CRM Entities
// ============================================

// Opportunity Stages
export type OpportunityStage =
  | 'new' | 'contacted' | 'qualified' | 'unqualified' | 'nurture' | 'dead'  // Lead stages
  | 'deal_qualified' | 'proposal' | 'negotiation' | 'contract' | 'closed_won' | 'closed_lost'  // Deal stages
  | 'account_active' | 'account_at_risk' | 'account_churned';  // Account stages

export type AccountType = 'general' | 'channel' | 'campaign' | 'lite' | 'ad_hoc';
export type OpportunitySource = 'referral' | 'inbound' | 'event' | 'cold_outreach';

export type AffiliateStatus = 'new' | 'active' | 'inactive';
export type PartnerStatus = 'active' | 'inactive';
export type PartnerCategory = 'service_provider' | 'investor_vc' | 'project' | 'individual';

export type LinkedType = 'opportunity' | 'partner' | 'affiliate';

// ============================================
// Interfaces
// ============================================

export interface CRMAffiliate {
  id: string;
  name: string;
  affiliation: string | null;
  category: string | null;
  status: AffiliateStatus;
  commission_model: string | null;
  commission_rate: number | null;
  terms_of_interest: string | null;
  last_contacted_at: string | null;
  owner_id: string | null;
  poc_name: string | null;
  poc_email: string | null;
  poc_telegram: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface CRMOpportunity {
  id: string;
  name: string;
  stage: OpportunityStage;
  account_type: AccountType | null;
  deal_value: number | null;
  currency: string;
  last_contacted_at: string | null;
  last_message_at: string | null;  // When they last messaged in TG group
  last_reply_at: string | null;    // When we last messaged in TG group
  owner_id: string | null;
  source: OpportunitySource | null;
  referrer: string | null;
  gc: string | null;               // Telegram group chat ID
  affiliate_id: string | null;
  client_id: string | null;        // Links account-stage opportunities to clients
  scope: string | null;            // Scope for accounts: fundraising, advisory, kol_activation, gtm, bd_partnerships, apac
  notes: string | null;
  position: number;
  created_at: string;
  updated_at: string;
  qualified_at: string | null;
  closed_at: string | null;
  // Joined data
  affiliate?: CRMAffiliate | null;
  contacts?: CRMContact[];
  client?: { id: string; name: string } | null;
}

export interface CRMPartner {
  id: string;
  name: string;
  category: PartnerCategory | null;
  focus: string | null;
  status: PartnerStatus;
  last_contacted_at: string | null;
  owner_id: string | null;
  poc_name: string | null;
  poc_email: string | null;
  poc_telegram: string | null;
  is_affiliate: boolean;
  affiliate_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  // Joined data
  affiliate?: CRMAffiliate | null;
  contacts?: CRMContact[];
}

export interface CRMContact {
  id: string;
  name: string;
  email: string | null;
  telegram_id: string | null;
  x_id: string | null;
  role: string | null;
  category: string | null;
  owner_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface CRMContactLink {
  id: string;
  contact_id: string;
  linked_type: LinkedType;
  opportunity_id: string | null;
  partner_id: string | null;
  affiliate_id: string | null;
  role: string | null;
  is_primary: boolean;
  created_at: string;
  // Joined data
  contact?: CRMContact;
}

export interface CRMStageHistory {
  id: string;
  object_type: 'opportunity' | 'partner' | 'affiliate';
  object_id: string;
  from_stage: string | null;
  to_stage: string;
  changed_by: string | null;
  changed_at: string;
  notes: string | null;
}

// ============================================
// Create/Update Data Types
// ============================================

export interface CreateAffiliateData {
  name: string;
  affiliation?: string;
  category?: string;
  status?: AffiliateStatus;
  commission_model?: string;
  commission_rate?: number;
  terms_of_interest?: string;
  owner_id?: string;
  poc_name?: string;
  poc_email?: string;
  poc_telegram?: string;
  notes?: string;
}

export interface CreateOpportunityData {
  name: string;
  stage?: OpportunityStage;
  account_type?: AccountType;
  deal_value?: number;
  currency?: string;
  owner_id?: string;
  source?: OpportunitySource;
  referrer?: string;
  gc?: string;
  affiliate_id?: string;
  client_id?: string;
  scope?: string;
  notes?: string;
  position?: number;
}

export interface CreatePartnerData {
  name: string;
  category?: PartnerCategory;
  focus?: string;
  status?: PartnerStatus;
  owner_id?: string;
  poc_name?: string;
  poc_email?: string;
  poc_telegram?: string;
  is_affiliate?: boolean;
  affiliate_id?: string;
  notes?: string;
}

export interface CreateContactData {
  name: string;
  email?: string;
  telegram_id?: string;
  x_id?: string;
  role?: string;
  category?: string;
  owner_id?: string;
  notes?: string;
}

// ============================================
// CRM Service Class
// ============================================

export class CRMService {
  // ----------------------------------------
  // AFFILIATES
  // ----------------------------------------

  static async getAllAffiliates(): Promise<CRMAffiliate[]> {
    const { data, error } = await supabase
      .from('crm_affiliates')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  }

  static async getAffiliateById(id: string): Promise<CRMAffiliate | null> {
    const { data, error } = await supabase
      .from('crm_affiliates')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;
    return data;
  }

  static async createAffiliate(affiliateData: CreateAffiliateData): Promise<CRMAffiliate> {
    const { data, error } = await supabase
      .from('crm_affiliates')
      .insert([affiliateData])
      .select()
      .single();

    if (error) throw error;

    // Record stage history
    await this.recordStageHistory('affiliate', data.id, null, affiliateData.status || 'new');

    return data;
  }

  static async updateAffiliate(id: string, updates: Partial<CreateAffiliateData>): Promise<CRMAffiliate> {
    // Get current state for stage history
    const current = await this.getAffiliateById(id);

    const { data, error } = await supabase
      .from('crm_affiliates')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    // Record stage change if status changed
    if (updates.status && current && current.status !== updates.status) {
      await this.recordStageHistory('affiliate', id, current.status, updates.status);
    }

    return data;
  }

  static async deleteAffiliate(id: string): Promise<void> {
    const { error } = await supabase
      .from('crm_affiliates')
      .delete()
      .eq('id', id);

    if (error) throw error;
  }

  // ----------------------------------------
  // OPPORTUNITIES
  // ----------------------------------------

  static async getAllOpportunities(): Promise<CRMOpportunity[]> {
    const { data, error } = await supabase
      .from('crm_opportunities')
      .select(`
        *,
        affiliate:crm_affiliates(*),
        client:clients!crm_opportunities_client_id_fkey(id, name)
      `)
      .order('position', { ascending: true })
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching opportunities:', error);
      throw error;
    }
    return data || [];
  }

  static async getOpportunitiesByStage(stages: OpportunityStage[]): Promise<CRMOpportunity[]> {
    const { data, error } = await supabase
      .from('crm_opportunities')
      .select(`
        *,
        affiliate:crm_affiliates(*),
        client:clients!crm_opportunities_client_id_fkey(id, name)
      `)
      .in('stage', stages)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  }

  static async getOpportunityById(id: string): Promise<CRMOpportunity | null> {
    const { data, error } = await supabase
      .from('crm_opportunities')
      .select(`
        *,
        affiliate:crm_affiliates(*),
        client:clients!crm_opportunities_client_id_fkey(id, name)
      `)
      .eq('id', id)
      .single();

    if (error) throw error;
    return data;
  }

  static async createOpportunity(opportunityData: CreateOpportunityData): Promise<CRMOpportunity> {
    const { data, error } = await supabase
      .from('crm_opportunities')
      .insert([opportunityData])
      .select()
      .single();

    if (error) throw error;

    // Record stage history
    await this.recordStageHistory('opportunity', data.id, null, opportunityData.stage || 'new');

    return data;
  }

  static async updateOpportunity(id: string, updates: Partial<CreateOpportunityData>): Promise<CRMOpportunity> {
    // Get current state for stage history
    const current = await this.getOpportunityById(id);

    const updateData: any = { ...updates, updated_at: new Date().toISOString() };

    // Set qualified_at when moving to deal stages
    if (updates.stage && ['proposal', 'contract', 'closed_won', 'closed_lost'].includes(updates.stage)) {
      if (current && !current.qualified_at && ['new', 'contacted', 'qualified', 'unqualified', 'nurture'].includes(current.stage)) {
        updateData.qualified_at = new Date().toISOString();
      }
    }

    // Set closed_at when closing
    if (updates.stage && ['closed_won', 'closed_lost'].includes(updates.stage)) {
      if (current && !current.closed_at) {
        updateData.closed_at = new Date().toISOString();
      }
    }

    const { data, error } = await supabase
      .from('crm_opportunities')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    // Record stage change if stage changed
    if (updates.stage && current && current.stage !== updates.stage) {
      await this.recordStageHistory('opportunity', id, current.stage, updates.stage);
    }

    return data;
  }

  static async deleteOpportunity(id: string): Promise<void> {
    const { error } = await supabase
      .from('crm_opportunities')
      .delete()
      .eq('id', id);

    if (error) throw error;
  }

  static async updateOpportunityPositions(positions: { id: string; position: number }[]): Promise<void> {
    // Update each opportunity's position
    const updates = positions.map(({ id, position }) =>
      supabase
        .from('crm_opportunities')
        .update({ position, updated_at: new Date().toISOString() })
        .eq('id', id)
    );

    const results = await Promise.all(updates);
    const errors = results.filter(r => r.error);
    if (errors.length > 0) {
      console.error('Errors updating positions:', errors);
      throw errors[0].error;
    }
  }

  // ----------------------------------------
  // PARTNERS
  // ----------------------------------------

  static async getAllPartners(): Promise<CRMPartner[]> {
    const { data, error } = await supabase
      .from('crm_partners')
      .select(`
        *,
        affiliate:crm_affiliates(*)
      `)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  }

  static async getPartnerById(id: string): Promise<CRMPartner | null> {
    const { data, error } = await supabase
      .from('crm_partners')
      .select(`
        *,
        affiliate:crm_affiliates(*)
      `)
      .eq('id', id)
      .single();

    if (error) throw error;
    return data;
  }

  static async createPartner(partnerData: CreatePartnerData): Promise<CRMPartner> {
    const { data, error } = await supabase
      .from('crm_partners')
      .insert([partnerData])
      .select()
      .single();

    if (error) throw error;

    // Record stage history (for status)
    await this.recordStageHistory('partner', data.id, null, partnerData.status || 'active');

    return data;
  }

  static async updatePartner(id: string, updates: Partial<CreatePartnerData>): Promise<CRMPartner> {
    // Get current state for stage history
    const current = await this.getPartnerById(id);

    const { data, error } = await supabase
      .from('crm_partners')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    // Record status change if changed
    if (updates.status && current && current.status !== updates.status) {
      await this.recordStageHistory('partner', id, current.status, updates.status);
    }

    return data;
  }

  static async deletePartner(id: string): Promise<void> {
    const { error } = await supabase
      .from('crm_partners')
      .delete()
      .eq('id', id);

    if (error) throw error;
  }

  // ----------------------------------------
  // CONTACTS
  // ----------------------------------------

  static async getAllContacts(): Promise<CRMContact[]> {
    const { data, error } = await supabase
      .from('crm_contacts')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  }

  static async getContactById(id: string): Promise<CRMContact | null> {
    const { data, error } = await supabase
      .from('crm_contacts')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;
    return data;
  }

  static async createContact(contactData: CreateContactData): Promise<CRMContact> {
    const { data, error } = await supabase
      .from('crm_contacts')
      .insert([contactData])
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  static async updateContact(id: string, updates: Partial<CreateContactData>): Promise<CRMContact> {
    const { data, error } = await supabase
      .from('crm_contacts')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  static async deleteContact(id: string): Promise<void> {
    const { error } = await supabase
      .from('crm_contacts')
      .delete()
      .eq('id', id);

    if (error) throw error;
  }

  // ----------------------------------------
  // CONTACT LINKS
  // ----------------------------------------

  static async linkContactToOpportunity(contactId: string, opportunityId: string, role?: string, isPrimary?: boolean): Promise<CRMContactLink> {
    const { data, error } = await supabase
      .from('crm_contact_links')
      .insert([{
        contact_id: contactId,
        linked_type: 'opportunity',
        opportunity_id: opportunityId,
        role,
        is_primary: isPrimary || false
      }])
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  static async linkContactToPartner(contactId: string, partnerId: string, role?: string, isPrimary?: boolean): Promise<CRMContactLink> {
    const { data, error } = await supabase
      .from('crm_contact_links')
      .insert([{
        contact_id: contactId,
        linked_type: 'partner',
        partner_id: partnerId,
        role,
        is_primary: isPrimary || false
      }])
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  static async linkContactToAffiliate(contactId: string, affiliateId: string, role?: string, isPrimary?: boolean): Promise<CRMContactLink> {
    const { data, error } = await supabase
      .from('crm_contact_links')
      .insert([{
        contact_id: contactId,
        linked_type: 'affiliate',
        affiliate_id: affiliateId,
        role,
        is_primary: isPrimary || false
      }])
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  static async getContactsForOpportunity(opportunityId: string): Promise<CRMContactLink[]> {
    const { data, error } = await supabase
      .from('crm_contact_links')
      .select(`
        *,
        contact:crm_contacts(*)
      `)
      .eq('opportunity_id', opportunityId)
      .order('is_primary', { ascending: false });

    if (error) throw error;
    return data || [];
  }

  static async getContactsForPartner(partnerId: string): Promise<CRMContactLink[]> {
    const { data, error } = await supabase
      .from('crm_contact_links')
      .select(`
        *,
        contact:crm_contacts(*)
      `)
      .eq('partner_id', partnerId)
      .order('is_primary', { ascending: false });

    if (error) throw error;
    return data || [];
  }

  static async getContactsForAffiliate(affiliateId: string): Promise<CRMContactLink[]> {
    const { data, error } = await supabase
      .from('crm_contact_links')
      .select(`
        *,
        contact:crm_contacts(*)
      `)
      .eq('affiliate_id', affiliateId)
      .order('is_primary', { ascending: false });

    if (error) throw error;
    return data || [];
  }

  static async unlinkContact(linkId: string): Promise<void> {
    const { error } = await supabase
      .from('crm_contact_links')
      .delete()
      .eq('id', linkId);

    if (error) throw error;
  }

  static async getAllContactLinks(): Promise<CRMContactLink[]> {
    const { data, error } = await supabase
      .from('crm_contact_links')
      .select(`
        *,
        contact:crm_contacts(*)
      `)
      .order('is_primary', { ascending: false });

    if (error) throw error;
    return data || [];
  }

  // ----------------------------------------
  // STAGE HISTORY
  // ----------------------------------------

  static async recordStageHistory(
    objectType: 'opportunity' | 'partner' | 'affiliate',
    objectId: string,
    fromStage: string | null,
    toStage: string,
    notes?: string
  ): Promise<void> {
    const { data: { user } } = await supabase.auth.getUser();

    const { error } = await supabase
      .from('crm_stage_history')
      .insert([{
        object_type: objectType,
        object_id: objectId,
        from_stage: fromStage,
        to_stage: toStage,
        changed_by: user?.id || null,
        notes
      }]);

    if (error) {
      console.error('Error recording stage history:', error);
      // Don't throw - stage history is non-critical
    }
  }

  static async getStageHistory(objectType: string, objectId: string): Promise<CRMStageHistory[]> {
    const { data, error } = await supabase
      .from('crm_stage_history')
      .select('*')
      .eq('object_type', objectType)
      .eq('object_id', objectId)
      .order('changed_at', { ascending: false });

    if (error) throw error;
    return data || [];
  }

  // ----------------------------------------
  // UTILITY METHODS
  // ----------------------------------------

  static async updateLastContacted(
    type: 'opportunity' | 'partner' | 'affiliate',
    id: string
  ): Promise<void> {
    const tableName = type === 'opportunity' ? 'crm_opportunities' :
                      type === 'partner' ? 'crm_partners' : 'crm_affiliates';

    const { error } = await supabase
      .from(tableName)
      .update({
        last_contacted_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', id);

    if (error) throw error;
  }

  // ----------------------------------------
  // STATIC OPTIONS
  // ----------------------------------------

  static getOpportunityStages() {
    return {
      lead: [
        { value: 'new', label: 'New' },
        { value: 'contacted', label: 'Contacted' },
        { value: 'qualified', label: 'Qualified' },
        { value: 'unqualified', label: 'Unqualified' },
        { value: 'nurture', label: 'Nurture' },
        { value: 'dead', label: 'Dead' }
      ],
      deal: [
        { value: 'deal_qualified', label: 'Qualified' },
        { value: 'proposal', label: 'Proposal' },
        { value: 'negotiation', label: 'Negotiation' },
        { value: 'contract', label: 'Contract' },
        { value: 'closed_won', label: 'Closed Won' },
        { value: 'closed_lost', label: 'Closed Lost' }
      ],
      account: [
        { value: 'account_active', label: 'Active' },
        { value: 'account_at_risk', label: 'At Risk' },
        { value: 'account_churned', label: 'Churned' }
      ]
    };
  }

  static getAccountTypes() {
    return [
      { value: 'general', label: 'General' },
      { value: 'channel', label: 'Channel' },
      { value: 'campaign', label: 'Campaign' },
      { value: 'lite', label: 'Lite' },
      { value: 'ad_hoc', label: 'Ad Hoc' }
    ];
  }

  static getOpportunitySources() {
    return [
      { value: 'referral', label: 'Referral' },
      { value: 'inbound', label: 'Inbound' },
      { value: 'event', label: 'Event' },
      { value: 'cold_outreach', label: 'Cold Outreach' }
    ];
  }

  static getPartnerCategories() {
    return [
      { value: 'service_provider', label: 'Service Provider' },
      { value: 'investor_vc', label: 'Investor / VC' },
      { value: 'project', label: 'Project' },
      { value: 'individual', label: 'Individual' }
    ];
  }

  static getAffiliateStatuses() {
    return [
      { value: 'new', label: 'New' },
      { value: 'active', label: 'Active' },
      { value: 'inactive', label: 'Inactive' }
    ];
  }

  static getPartnerStatuses() {
    return [
      { value: 'active', label: 'Active' },
      { value: 'inactive', label: 'Inactive' }
    ];
  }

  // ----------------------------------------
  // ANALYTICS HELPERS
  // ----------------------------------------

  static async getOpportunityMetrics(): Promise<{
    totalLeads: number;
    totalDeals: number;
    totalValue: number;
    wonValue: number;
    conversionRate: number;
  }> {
    const leadStages: OpportunityStage[] = ['new', 'contacted', 'qualified', 'unqualified', 'nurture', 'dead'];
    const dealStages: OpportunityStage[] = ['deal_qualified', 'proposal', 'negotiation', 'contract', 'closed_won', 'closed_lost'];

    const { data: opportunities, error } = await supabase
      .from('crm_opportunities')
      .select('stage, deal_value');

    if (error) throw error;

    const leads = opportunities?.filter(o => leadStages.includes(o.stage as OpportunityStage)) || [];
    const deals = opportunities?.filter(o => dealStages.includes(o.stage as OpportunityStage)) || [];
    const closedWon = opportunities?.filter(o => o.stage === 'closed_won') || [];
    const closed = opportunities?.filter(o => o.stage === 'closed_won' || o.stage === 'closed_lost') || [];

    const totalValue = deals.reduce((sum, d) => sum + (d.deal_value || 0), 0);
    const wonValue = closedWon.reduce((sum, d) => sum + (d.deal_value || 0), 0);
    const conversionRate = closed.length > 0 ? (closedWon.length / closed.length) * 100 : 0;

    return {
      totalLeads: leads.length,
      totalDeals: deals.length,
      totalValue,
      wonValue,
      conversionRate
    };
  }

  // ----------------------------------------
  // TELEGRAM INTEGRATION
  // ----------------------------------------

  /**
   * Send a message to an opportunity's Telegram group chat
   * and update the last_reply_at timestamp
   */
  static async sendTelegramMessage(
    opportunityId: string,
    message: string
  ): Promise<{ success: boolean; error?: string }> {
    // Get the opportunity to find the gc (chat ID)
    const opportunity = await this.getOpportunityById(opportunityId);
    if (!opportunity) {
      return { success: false, error: 'Opportunity not found' };
    }

    if (!opportunity.gc) {
      return { success: false, error: 'No Telegram group chat ID configured for this opportunity' };
    }

    // Send message via Telegram API
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) {
      return { success: false, error: 'Telegram bot not configured' };
    }

    try {
      const response = await fetch(
        `https://api.telegram.org/bot${botToken}/sendMessage`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: opportunity.gc,
            text: message,
            parse_mode: 'HTML'
          })
        }
      );

      if (!response.ok) {
        const error = await response.json();
        console.error('[CRM] Telegram send error:', error);
        return { success: false, error: error.description || 'Failed to send message' };
      }

      // Update last_reply_at
      await supabase
        .from('crm_opportunities')
        .update({
          last_reply_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', opportunityId);

      return { success: true };
    } catch (error) {
      console.error('[CRM] Error sending Telegram message:', error);
      return { success: false, error: 'Failed to send message' };
    }
  }

  /**
   * Get opportunities that haven't been contacted recently
   */
  static async getStaleOpportunities(daysThreshold: number = 7): Promise<CRMOpportunity[]> {
    const thresholdDate = new Date();
    thresholdDate.setDate(thresholdDate.getDate() - daysThreshold);

    const { data, error } = await supabase
      .from('crm_opportunities')
      .select(`
        *,
        affiliate:crm_affiliates(*)
      `)
      .not('gc', 'is', null)
      .or(`last_message_at.is.null,last_message_at.lt.${thresholdDate.toISOString()}`)
      .not('stage', 'in', '(closed_won,closed_lost,dead,account_churned)')
      .order('last_message_at', { ascending: true, nullsFirst: true });

    if (error) throw error;
    return data || [];
  }
}
