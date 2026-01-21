import { supabase } from './supabase';
import { Database } from './database.types';
import { generateUniqueSlug } from './slugUtils';

type Client = Database['public']['Tables']['clients']['Row'];
type ClientAccessMember = Database['public']['Tables']['client_access_members']['Row'];

export interface ClientWithAccess extends Client {
  member_count?: number;
  campaign_count?: number;
  whitelist_partner_name?: string;
}

export class ClientService {
  /**
   * Get clients based on user role
   * - Admins: See all clients
   * - Members: See only clients they have access to via client_access_members
   */
  static async getClientsForUser(userRole: 'super_admin' | 'admin' | 'member' | 'client', userId: string): Promise<ClientWithAccess[]> {
    try {
      if (userRole === 'admin' || userRole === 'super_admin') {
        // Admins and super admins can see all non-archived clients
        const { data: clients, error } = await supabase
          .from('clients')
          .select(`
            *,
            client_access_members(count),
            campaigns!campaigns_client_id_fkey(count),
            whitelist_partner:partners!clients_whitelist_partner_id_fkey(name)
          `)
          .is('archived_at', null)
          .order('created_at', { ascending: false });

        if (error) throw error;

        return clients?.map(client => ({
          ...client,
          member_count: client.client_access_members?.[0]?.count || 0,
          campaign_count: (client as any).campaigns?.[0]?.count || 0,
          whitelist_partner_name: (client.whitelist_partner as any)?.name
        })) || [];
      } else {
        // Members can only see non-archived clients they have access to
        const { data: clientAccess, error } = await supabase
          .from('client_access_members')
          .select(`
            clients!inner(
              id,
              name,
              email,
              location,
              is_active,
              archived_at,
              created_at,
              updated_at,
              logo_url,
              campaigns!campaigns_client_id_fkey(count),
              whitelist_partner:partners!clients_whitelist_partner_id_fkey(name)
            )
          `)
          .eq('user_id', userId);

        if (error) throw error;

        return clientAccess?.map(access => {
          const client = (access as any).clients;
          return {
            ...client,
            campaign_count: client.campaigns?.[0]?.count || 0,
            whitelist_partner_name: (client.whitelist_partner as any)?.name
          };
        }).filter(c => c && !c.archived_at) || [];
      }
    } catch (error) {
      console.error('Error fetching clients:', error);
      throw error;
    }
  }

  /**
   * Get all non-archived clients (admin only)
   */
  static async getAllClients(): Promise<Client[]> {
    try {
      const { data, error } = await supabase
        .from('clients')
        .select('*')
        .is('archived_at', null)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error fetching all clients:', error);
      throw error;
    }
  }

  /**
   * Create a new client
   */
  static async createClient(
    name: string,
    email: string,
    location?: string,
    source?: string,
    onboarding_call_held?: boolean,
    onboarding_call_date?: string | null,
    is_whitelisted?: boolean,
    whitelist_partner_id?: string | null
  ): Promise<Client> {
    try {
      // Generate a unique slug from the client name
      const slug = generateUniqueSlug(name);

      const { data, error } = await supabase
        .from('clients')
        .insert({ name, email, location, source, onboarding_call_held, onboarding_call_date, is_whitelisted, whitelist_partner_id, slug })
        .select()
        .single();
      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error creating client:', error);
      throw error;
    }
  }

  /**
   * Update client
   */
  static async updateClient(id: string, updates: Partial<Pick<Client, 'name' | 'email' | 'location' | 'is_active' | 'is_whitelisted' | 'whitelist_partner_id' | 'logo_url'>>): Promise<Client> {
    try {
      const { data, error } = await supabase
        .from('clients')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error updating client:', error);
      throw error;
    }
  }

  /**
   * Grant user access to a client
   */
  static async grantClientAccess(clientId: string, userId: string): Promise<ClientAccessMember> {
    try {
      const { data, error } = await supabase
        .from('client_access_members')
        .insert({ client_id: clientId, user_id: userId })
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error granting client access:', error);
      throw error;
    }
  }

  /**
   * Revoke user access from a client
   */
  static async revokeClientAccess(clientId: string, userId: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('client_access_members')
        .delete()
        .eq('client_id', clientId)
        .eq('user_id', userId);

      if (error) throw error;
    } catch (error) {
      console.error('Error revoking client access:', error);
      throw error;
    }
  }

  /**
   * Get users with access to a specific client
   */
  static async getClientMembers(clientId: string): Promise<any[]> {
    try {
      const { data, error } = await supabase
        .from('client_access_members')
        .select(`
          *,
          users!inner(id, name, email, role)
        `)
        .eq('client_id', clientId);

      if (error) throw error;
      return data?.map(access => access.users) || [];
    } catch (error) {
      console.error('Error fetching client members:', error);
      throw error;
    }
  }

  /**
   * Get client by ID or slug (for portal access)
   */
  static async getClientByIdOrSlug(identifier: string): Promise<Client | null> {
    try {
      // Check if identifier is a UUID
      const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(identifier);

      const query = supabase
        .from('clients')
        .select('*')
        .is('archived_at', null);

      if (isUUID) {
        query.eq('id', identifier);
      } else {
        query.eq('slug', identifier);
      }

      const { data, error } = await query.single();

      if (error) {
        if (error.code === 'PGRST116') return null; // Not found
        throw error;
      }
      return data;
    } catch (error) {
      console.error('Error fetching client by ID or slug:', error);
      throw error;
    }
  }

  /**
   * Get client with their campaigns for portal display
   */
  static async getClientWithCampaigns(clientId: string): Promise<{
    client: Client;
    campaigns: any[];
  } | null> {
    try {
      // Get client
      const { data: client, error: clientError } = await supabase
        .from('clients')
        .select('*')
        .eq('id', clientId)
        .is('archived_at', null)
        .single();

      if (clientError || !client) return null;

      // Get campaigns for this client with KOL and content counts
      const { data: campaigns, error: campaignsError } = await supabase
        .from('campaigns')
        .select(`
          id,
          name,
          slug,
          status,
          total_budget,
          start_date,
          end_date,
          region,
          description,
          share_report_publicly,
          created_at,
          campaign_kols(count),
          contents(
            impressions,
            likes,
            comments,
            retweets,
            bookmarks
          )
        `)
        .eq('client_id', clientId)
        .is('archived_at', null)
        .order('start_date', { ascending: false });

      if (campaignsError) throw campaignsError;

      // Process campaigns to add aggregated metrics
      const processedCampaigns = campaigns?.map(campaign => {
        const contents = (campaign as any).contents || [];
        const totalImpressions = contents.reduce((sum: number, c: any) => sum + (c.impressions || 0), 0);
        const totalEngagement = contents.reduce((sum: number, c: any) =>
          sum + (c.likes || 0) + (c.comments || 0) + (c.retweets || 0) + (c.bookmarks || 0), 0);

        return {
          ...campaign,
          kol_count: (campaign as any).campaign_kols?.[0]?.count || 0,
          content_count: contents.length,
          total_impressions: totalImpressions,
          total_engagement: totalEngagement,
        };
      }) || [];

      return { client, campaigns: processedCampaigns };
    } catch (error) {
      console.error('Error fetching client with campaigns:', error);
      throw error;
    }
  }
} 