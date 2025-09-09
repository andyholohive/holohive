export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "12.2.3 (519615d)"
  }
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
        Relationships: [
          {
            foreignKeyName: "campaign_budget_allocations_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_kols: {
        Row: {
          allocated_budget: number | null
          budget_type: string | null
          campaign_id: string
          client_status: string | null
          created_at: string | null
          hh_status: string | null
          id: string
          master_kol_id: string
          notes: string | null
          paid: number | null
          updated_at: string | null
          wallet: string | null
        }
        Insert: {
          allocated_budget?: number | null
          budget_type?: string | null
          campaign_id: string
          client_status?: string | null
          created_at?: string | null
          hh_status?: string | null
          id?: string
          master_kol_id: string
          notes?: string | null
          paid?: number | null
          updated_at?: string | null
          wallet?: string | null
        }
        Update: {
          allocated_budget?: number | null
          budget_type?: string | null
          campaign_id?: string
          client_status?: string | null
          created_at?: string | null
          hh_status?: string | null
          id?: string
          master_kol_id?: string
          notes?: string | null
          paid?: number | null
          updated_at?: string | null
          wallet?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "campaign_kols_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_kols_master_kol_id_fkey"
            columns: ["master_kol_id"]
            isOneToOne: false
            referencedRelation: "master_kols"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_template_budget_allocations: {
        Row: {
          allocated_budget: number
          created_at: string | null
          id: string
          region: string
          template_id: string | null
          updated_at: string | null
        }
        Insert: {
          allocated_budget: number
          created_at?: string | null
          id?: string
          region: string
          template_id?: string | null
          updated_at?: string | null
        }
        Update: {
          allocated_budget?: number
          created_at?: string | null
          id?: string
          region?: string
          template_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "campaign_template_budget_allocations_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "campaign_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_templates: {
        Row: {
          budget_type: string[] | null
          call_support: boolean | null
          client_choosing_kols: boolean | null
          created_at: string | null
          created_by: string | null
          description: string | null
          end_date: string | null
          id: string
          intro_call: boolean | null
          intro_call_date: string | null
          is_public: boolean | null
          manager: string | null
          multi_activation: boolean | null
          name: string
          nda_signed: boolean | null
          proposal_sent: boolean | null
          region: string | null
          start_date: string | null
          status: string | null
          total_budget: number
          updated_at: string | null
          usage_count: number | null
        }
        Insert: {
          budget_type?: string[] | null
          call_support?: boolean | null
          client_choosing_kols?: boolean | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          end_date?: string | null
          id?: string
          intro_call?: boolean | null
          intro_call_date?: string | null
          is_public?: boolean | null
          manager?: string | null
          multi_activation?: boolean | null
          name: string
          nda_signed?: boolean | null
          proposal_sent?: boolean | null
          region?: string | null
          start_date?: string | null
          status?: string | null
          total_budget: number
          updated_at?: string | null
          usage_count?: number | null
        }
        Update: {
          budget_type?: string[] | null
          call_support?: boolean | null
          client_choosing_kols?: boolean | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          end_date?: string | null
          id?: string
          intro_call?: boolean | null
          intro_call_date?: string | null
          is_public?: boolean | null
          manager?: string | null
          multi_activation?: boolean | null
          name?: string
          nda_signed?: boolean | null
          proposal_sent?: boolean | null
          region?: string | null
          start_date?: string | null
          status?: string | null
          total_budget?: number
          updated_at?: string | null
          usage_count?: number | null
        }
        Relationships: []
      }
      campaign_updates: {
        Row: {
          campaign_id: string
          created_at: string | null
          id: string
          update_text: string
          updated_at: string | null
        }
        Insert: {
          campaign_id: string
          created_at?: string | null
          id?: string
          update_text: string
          updated_at?: string | null
        }
        Update: {
          campaign_id?: string
          created_at?: string | null
          id?: string
          update_text?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "campaign_updates_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
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
          outline: string | null
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
          outline?: string | null
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
          outline?: string | null
          proposal_sent?: boolean | null
          region?: string | null
          start_date?: string
          status?: string
          total_budget?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaigns_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_messages: {
        Row: {
          content: string
          created_at: string | null
          id: string
          metadata: Json | null
          role: string | null
          session_id: string | null
        }
        Insert: {
          content: string
          created_at?: string | null
          id?: string
          metadata?: Json | null
          role?: string | null
          session_id?: string | null
        }
        Update: {
          content?: string
          created_at?: string | null
          id?: string
          metadata?: Json | null
          role?: string | null
          session_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "chat_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_sessions: {
        Row: {
          created_at: string | null
          id: string
          title: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          title?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          title?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
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
        Relationships: [
          {
            foreignKeyName: "client_access_members_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_access_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          created_at: string
          email: string
          id: string
          is_active: boolean
          is_whitelisted: boolean | null
          location: string | null
          name: string
          onboarding_call_date: string | null
          onboarding_call_held: boolean | null
          source: string | null
          updated_at: string
          whitelist_partner_id: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          is_active?: boolean
          is_whitelisted?: boolean | null
          location?: string | null
          name?: string
          onboarding_call_date?: string | null
          onboarding_call_held?: boolean | null
          source?: string | null
          updated_at?: string
          whitelist_partner_id?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          is_active?: boolean
          is_whitelisted?: boolean | null
          location?: string | null
          name?: string
          onboarding_call_date?: string | null
          onboarding_call_held?: boolean | null
          source?: string | null
          updated_at?: string
          whitelist_partner_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clients_whitelist_partner_id_fkey"
            columns: ["whitelist_partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
        ]
      }
      contents: {
        Row: {
          activation_date: string | null
          bookmarks: number | null
          campaign_id: string
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
          bookmarks?: number | null
          campaign_id: string
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
          bookmarks?: number | null
          campaign_id?: string
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
        Relationships: [
          {
            foreignKeyName: "contents_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contents_campaign_kols_id_fkey"
            columns: ["campaign_kols_id"]
            isOneToOne: false
            referencedRelation: "campaign_kols"
            referencedColumns: ["id"]
          },
        ]
      }
      list_kols: {
        Row: {
          created_at: string
          id: string
          list_id: string
          master_kol_id: string
          notes: string | null
          status: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          list_id: string
          master_kol_id: string
          notes?: string | null
          status?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          list_id?: string
          master_kol_id?: string
          notes?: string | null
          status?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "list_kols_list_id_fkey"
            columns: ["list_id"]
            isOneToOne: false
            referencedRelation: "lists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "list_kols_master_kol_id_fkey"
            columns: ["master_kol_id"]
            isOneToOne: false
            referencedRelation: "master_kols"
            referencedColumns: ["id"]
          },
        ]
      }
      lists: {
        Row: {
          created_at: string
          id: string
          name: string
          notes: string | null
          status: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          notes?: string | null
          status?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          notes?: string | null
          status?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      master_kols: {
        Row: {
          community: boolean | null
          content_type: string[] | null
          created_at: string | null
          creator_type: string[] | null
          deliverables: string[] | null
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
          creator_type?: string[] | null
          deliverables?: string[] | null
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
          creator_type?: string[] | null
          deliverables?: string[] | null
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
        Relationships: []
      }
      message_templates: {
        Row: {
          category: string
          content: string
          created_at: string | null
          id: string
          name: string
          tags: string[] | null
          target_audience: string
          tone: string
          updated_at: string | null
          usage_count: number | null
        }
        Insert: {
          category: string
          content: string
          created_at?: string | null
          id?: string
          name: string
          tags?: string[] | null
          target_audience: string
          tone: string
          updated_at?: string | null
          usage_count?: number | null
        }
        Update: {
          category?: string
          content?: string
          created_at?: string | null
          id?: string
          name?: string
          tags?: string[] | null
          target_audience?: string
          tone?: string
          updated_at?: string | null
          usage_count?: number | null
        }
        Relationships: []
      }
      partners: {
        Row: {
          created_at: string | null
          description: string | null
          email: string | null
          id: string
          is_active: boolean | null
          name: string
          updated_at: string | null
          website: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          email?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          updated_at?: string | null
          website?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          email?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          updated_at?: string | null
          website?: string | null
        }
        Relationships: []
      }
      payments: {
        Row: {
          amount: number
          campaign_id: string
          campaign_kol_id: string
          content_id: string | null
          created_at: string | null
          id: string
          notes: string | null
          payment_date: string
          payment_method: string
          transaction_id: string | null
          updated_at: string | null
        }
        Insert: {
          amount: number
          campaign_id: string
          campaign_kol_id: string
          content_id?: string | null
          created_at?: string | null
          id?: string
          notes?: string | null
          payment_date: string
          payment_method: string
          transaction_id?: string | null
          updated_at?: string | null
        }
        Update: {
          amount?: number
          campaign_id?: string
          campaign_kol_id?: string
          content_id?: string | null
          created_at?: string | null
          id?: string
          notes?: string | null
          payment_date?: string
          payment_method?: string
          transaction_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_campaign_kol_id_fkey"
            columns: ["campaign_kol_id"]
            isOneToOne: false
            referencedRelation: "campaign_kols"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_content_id_fkey"
            columns: ["content_id"]
            isOneToOne: false
            referencedRelation: "contents"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          created_at: string | null
          email: string
          id: string
          is_active: boolean
          name: string
          profile_photo_url: string | null
          role: string
          telegram_id: string | null
          updated_at: string | null
          x_id: string | null
        }
        Insert: {
          created_at?: string | null
          email: string
          id: string
          is_active?: boolean
          name: string
          profile_photo_url?: string | null
          role: string
          telegram_id?: string | null
          updated_at?: string | null
          x_id?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string
          id?: string
          is_active?: boolean
          name?: string
          profile_photo_url?: string | null
          role?: string
          telegram_id?: string | null
          updated_at?: string | null
          x_id?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      create_campaign_from_template: {
        Args: {
          campaign_name: string
          client_id: string
          end_date: string
          start_date: string
          template_id: string
        }
        Returns: string
      }
      increment_template_usage: {
        Args: { template_id: string }
        Returns: undefined
      }
      increment_usage_count: {
        Args: Record<PropertyKey, never>
        Returns: number
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
