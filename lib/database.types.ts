export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      campaign_budget_allocations: {
        Row: {
          allocated_budget: number
          campaign_id: string
          created_at: string
          id: string
          region: string
          updated_at: string
        }
        Insert: {
          allocated_budget: number
          campaign_id: string
          created_at?: string
          id?: string
          region: string
          updated_at?: string
        }
        Update: {
          allocated_budget?: number
          campaign_id?: string
          created_at?: string
          id?: string
          region?: string
          updated_at?: string
        }
      }
      campaign_kols: {
        Row: {
          campaign_id: string
          client_status: string | null
          created_at: string | null
          hh_status: string | null
          id: string
          master_kol_id: string
          notes: string | null
          updated_at: string | null
        }
        Insert: {
          campaign_id: string
          client_status?: string | null
          created_at?: string | null
          hh_status?: string | null
          id?: string
          master_kol_id: string
          notes?: string | null
          updated_at?: string | null
        }
        Update: {
          campaign_id?: string
          client_status?: string | null
          created_at?: string | null
          hh_status?: string | null
          id?: string
          master_kol_id?: string
          notes?: string | null
          updated_at?: string | null
        }
      }
      campaigns: {
        Row: {
          budget_type: string[] | null
          call_support: boolean | null
          client_choosing_kols: boolean | null
          client_id: string
          created_at: string
          description: string | null
          end_date: string
          id: string
          intro_call: boolean | null
          intro_call_date: string | null
          manager: string | null
          multi_activation: boolean | null
          name: string
          nda_signed: boolean | null
          proposal_sent: boolean | null
          region: string | null
          start_date: string
          status: string
          total_budget: number
          updated_at: string
        }
        Insert: {
          budget_type?: string[] | null
          call_support?: boolean | null
          client_choosing_kols?: boolean | null
          client_id: string
          created_at?: string
          description?: string | null
          end_date: string
          id?: string
          intro_call?: boolean | null
          intro_call_date?: string | null
          manager?: string | null
          multi_activation?: boolean | null
          name: string
          nda_signed?: boolean | null
          proposal_sent?: boolean | null
          region?: string | null
          start_date: string
          status?: string
          total_budget: number
          updated_at?: string
        }
        Update: {
          budget_type?: string[] | null
          call_support?: boolean | null
          client_choosing_kols?: boolean | null
          client_id?: string
          created_at?: string
          description?: string | null
          end_date?: string
          id?: string
          intro_call?: boolean | null
          intro_call_date?: string | null
          manager?: string | null
          multi_activation?: boolean | null
          name?: string
          nda_signed?: boolean | null
          proposal_sent?: boolean | null
          region?: string | null
          start_date?: string
          status?: string
          total_budget?: number
          updated_at?: string
        }
      }
      client_access_members: {
        Row: {
          client_id: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          client_id: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          client_id?: string
          created_at?: string
          id?: string
          user_id?: string
        }
      }
      clients: {
        Row: {
          created_at: string
          email: string
          id: string
          is_active: boolean
          location: string | null
          name: string
          onboarding_call_date: string | null
          onboarding_call_held: boolean | null
          source: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          is_active?: boolean
          location?: string | null
          name?: string
          onboarding_call_date?: string | null
          onboarding_call_held?: boolean | null
          source?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          is_active?: boolean
          location?: string | null
          name?: string
          onboarding_call_date?: string | null
          onboarding_call_held?: boolean | null
          source?: string | null
          updated_at?: string
        }
      }
      contents: {
        Row: {
          activation_date: string | null
          campaign_kols_id: string
          comments: number | null
          content_link: string | null
          created_at: string | null
          id: string
          impressions: number | null
          likes: number | null
          platform: string | null
          retweets: number | null
          status: string | null
          type: string | null
          updated_at: string | null
        }
        Insert: {
          activation_date?: string | null
          campaign_kols_id: string
          comments?: number | null
          content_link?: string | null
          created_at?: string | null
          id?: string
          impressions?: number | null
          likes?: number | null
          platform?: string | null
          retweets?: number | null
          status?: string | null
          type?: string | null
          updated_at?: string | null
        }
        Update: {
          activation_date?: string | null
          campaign_kols_id?: string
          comments?: number | null
          content_link?: string | null
          created_at?: string | null
          id?: string
          impressions?: number | null
          likes?: number | null
          platform?: string | null
          retweets?: number | null
          status?: string | null
          type?: string | null
          updated_at?: string | null
        }
      }
      master_kols: {
        Row: {
          community: boolean | null
          content_type: string[] | null
          created_at: string | null
          description: string | null
          followers: number | null
          group_chat: boolean | null
          id: string
          link: string | null
          name: string
          niche: string[] | null
          platform: string[] | null
          pricing: string | null
          rating: number | null
          region: string | null
          tier: string | null
          updated_at: string | null
        }
        Insert: {
          community?: boolean | null
          content_type?: string[] | null
          created_at?: string | null
          description?: string | null
          followers?: number | null
          group_chat?: boolean | null
          id?: string
          link?: string | null
          name: string
          niche?: string[] | null
          platform?: string[] | null
          pricing?: string | null
          rating?: number | null
          region?: string | null
          tier?: string | null
          updated_at?: string | null
        }
        Update: {
          community?: boolean | null
          content_type?: string[] | null
          created_at?: string | null
          description?: string | null
          followers?: number | null
          group_chat?: boolean | null
          id?: string
          link?: string | null
          name?: string
          niche?: string[] | null
          platform?: string[] | null
          pricing?: string | null
          rating?: number | null
          region?: string | null
          tier?: string | null
          updated_at?: string | null
        }
      }
      users: {
        Row: {
          created_at: string | null
          email: string
          id: string
          is_active: boolean
          name: string
          role: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          email: string
          id: string
          is_active?: boolean
          name: string
          role: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string
          id?: string
          is_active?: boolean
          name?: string
          role?: string
          updated_at?: string | null
        }
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}
