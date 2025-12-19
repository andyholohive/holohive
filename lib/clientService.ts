import { supabase } from './supabase';
import { Database } from './database.types';

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
      const { data, error } = await supabase
        .from('clients')
        .insert({ name, email, location, source, onboarding_call_held, onboarding_call_date, is_whitelisted, whitelist_partner_id })
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
  static async updateClient(id: string, updates: Partial<Pick<Client, 'name' | 'email' | 'location' | 'is_active' | 'is_whitelisted' | 'whitelist_partner_id'>>): Promise<Client> {
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
} 