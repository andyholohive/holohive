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
      agent_action_history: {
        Row: {
          action_data: Json
          action_type: string
          created_at: string | null
          entity_id: string | null
          entity_type: string | null
          id: string
          is_reversed: boolean | null
          is_reversible: boolean | null
          message_id: string
          reversed_at: string | null
          reversed_by_action_id: string | null
          session_id: string
          tool_name: string
          user_id: string
        }
        Insert: {
          action_data?: Json
          action_type: string
          created_at?: string | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          is_reversed?: boolean | null
          is_reversible?: boolean | null
          message_id: string
          reversed_at?: string | null
          reversed_by_action_id?: string | null
          session_id: string
          tool_name: string
          user_id: string
        }
        Update: {
          action_data?: Json
          action_type?: string
          created_at?: string | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          is_reversed?: boolean | null
          is_reversible?: boolean | null
          message_id?: string
          reversed_at?: string | null
          reversed_by_action_id?: string | null
          session_id?: string
          tool_name?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_action_history_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "chat_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_action_history_reversed_by_action_id_fkey"
            columns: ["reversed_by_action_id"]
            isOneToOne: false
            referencedRelation: "agent_action_history"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_action_history_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "chat_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_action_history_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_execution_logs: {
        Row: {
          created_at: string | null
          execution_time_ms: number
          id: string
          parameters: Json
          result: Json
          session_id: string | null
          success: boolean
          tool_name: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          execution_time_ms?: number
          id?: string
          parameters?: Json
          result?: Json
          session_id?: string | null
          success?: boolean
          tool_name: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          execution_time_ms?: number
          id?: string
          parameters?: Json
          result?: Json
          session_id?: string | null
          success?: boolean
          tool_name?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_execution_logs_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "chat_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_execution_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_handoffs: {
        Row: {
          created_at: string | null
          created_by_run_id: string | null
          from_agent: string
          handoff_type: string
          id: string
          opportunity_id: string | null
          payload: Json
          priority: number | null
          processed_at: string | null
          processed_by_run_id: string | null
          status: string
          to_agent: string
        }
        Insert: {
          created_at?: string | null
          created_by_run_id?: string | null
          from_agent: string
          handoff_type: string
          id?: string
          opportunity_id?: string | null
          payload?: Json
          priority?: number | null
          processed_at?: string | null
          processed_by_run_id?: string | null
          status?: string
          to_agent: string
        }
        Update: {
          created_at?: string | null
          created_by_run_id?: string | null
          from_agent?: string
          handoff_type?: string
          id?: string
          opportunity_id?: string | null
          payload?: Json
          priority?: number | null
          processed_at?: string | null
          processed_by_run_id?: string | null
          status?: string
          to_agent?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_handoffs_created_by_run_id_fkey"
            columns: ["created_by_run_id"]
            isOneToOne: false
            referencedRelation: "agent_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_handoffs_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "crm_opportunities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_handoffs_processed_by_run_id_fkey"
            columns: ["processed_by_run_id"]
            isOneToOne: false
            referencedRelation: "agent_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_runs: {
        Row: {
          agent_name: string
          completed_at: string | null
          cost_usd: number | null
          created_at: string | null
          duration_ms: number | null
          error_message: string | null
          id: string
          input_params: Json | null
          output_summary: Json | null
          run_type: string
          started_at: string
          status: string
          tokens_used: number | null
          triggered_by: string | null
        }
        Insert: {
          agent_name: string
          completed_at?: string | null
          cost_usd?: number | null
          created_at?: string | null
          duration_ms?: number | null
          error_message?: string | null
          id?: string
          input_params?: Json | null
          output_summary?: Json | null
          run_type?: string
          started_at?: string
          status?: string
          tokens_used?: number | null
          triggered_by?: string | null
        }
        Update: {
          agent_name?: string
          completed_at?: string | null
          cost_usd?: number | null
          created_at?: string | null
          duration_ms?: number | null
          error_message?: string | null
          id?: string
          input_params?: Json | null
          output_summary?: Json | null
          run_type?: string
          started_at?: string
          status?: string
          tokens_used?: number | null
          triggered_by?: string | null
        }
        Relationships: []
      }
      ai_message_feedback: {
        Row: {
          after_content: string | null
          before_content: string | null
          created_at: string | null
          edit_summary: string | null
          feedback_type: string | null
          helpful_score: number | null
          id: string
          message_example_id: string | null
          user_comments: string | null
        }
        Insert: {
          after_content?: string | null
          before_content?: string | null
          created_at?: string | null
          edit_summary?: string | null
          feedback_type?: string | null
          helpful_score?: number | null
          id?: string
          message_example_id?: string | null
          user_comments?: string | null
        }
        Update: {
          after_content?: string | null
          before_content?: string | null
          created_at?: string | null
          edit_summary?: string | null
          feedback_type?: string | null
          helpful_score?: number | null
          id?: string
          message_example_id?: string | null
          user_comments?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_message_feedback_message_example_id_fkey"
            columns: ["message_example_id"]
            isOneToOne: false
            referencedRelation: "client_message_examples"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_pages: {
        Row: {
          available_slots: Json
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          slot_duration_minutes: number
          slug: string
          title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          available_slots?: Json
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          slot_duration_minutes?: number
          slug: string
          title?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          available_slots?: Json
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          slot_duration_minutes?: number
          slug?: string
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_pages_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      bookings: {
        Row: {
          booker_email: string
          booker_name: string
          booking_page_id: string
          confirmation_sent: boolean
          created_at: string
          end_time: string
          google_event_id: string | null
          id: string
          meet_link: string | null
          meeting_date: string
          notes: string | null
          opportunity_id: string | null
          start_time: string
          status: string
        }
        Insert: {
          booker_email: string
          booker_name: string
          booking_page_id: string
          confirmation_sent?: boolean
          created_at?: string
          end_time: string
          google_event_id?: string | null
          id?: string
          meet_link?: string | null
          meeting_date: string
          notes?: string | null
          opportunity_id?: string | null
          start_time: string
          status?: string
        }
        Update: {
          booker_email?: string
          booker_name?: string
          booking_page_id?: string
          confirmation_sent?: boolean
          created_at?: string
          end_time?: string
          google_event_id?: string | null
          id?: string
          meet_link?: string | null
          meeting_date?: string
          notes?: string | null
          opportunity_id?: string | null
          start_time?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "bookings_booking_page_id_fkey"
            columns: ["booking_page_id"]
            isOneToOne: false
            referencedRelation: "booking_pages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "crm_opportunities"
            referencedColumns: ["id"]
          },
        ]
      }
      call_briefs: {
        Row: {
          call_type: string
          created_at: string | null
          created_by: string | null
          five_for_five_status: Json | null
          gatekeeper_score: Json | null
          id: string
          intel_summary: Json | null
          objection_handlers: Json | null
          opportunity_id: string
          risk_flags: Json | null
          talking_points: Json | null
          updated_at: string | null
        }
        Insert: {
          call_type?: string
          created_at?: string | null
          created_by?: string | null
          five_for_five_status?: Json | null
          gatekeeper_score?: Json | null
          id?: string
          intel_summary?: Json | null
          objection_handlers?: Json | null
          opportunity_id: string
          risk_flags?: Json | null
          talking_points?: Json | null
          updated_at?: string | null
        }
        Update: {
          call_type?: string
          created_at?: string | null
          created_by?: string | null
          five_for_five_status?: Json | null
          gatekeeper_score?: Json | null
          id?: string
          intel_summary?: Json | null
          objection_handlers?: Json | null
          opportunity_id?: string
          risk_flags?: Json | null
          talking_points?: Json | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "call_briefs_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "crm_opportunities"
            referencedColumns: ["id"]
          },
        ]
      }
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
      campaign_email_views: {
        Row: {
          campaign_id: string
          created_at: string | null
          email: string
          id: string
          ip_address: string | null
          user_agent: string | null
          viewed_at: string | null
        }
        Insert: {
          campaign_id: string
          created_at?: string | null
          email: string
          id?: string
          ip_address?: string | null
          user_agent?: string | null
          viewed_at?: string | null
        }
        Update: {
          campaign_id?: string
          created_at?: string | null
          email?: string
          id?: string
          ip_address?: string | null
          user_agent?: string | null
          viewed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "campaign_email_views_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_embeddings: {
        Row: {
          campaign_id: string
          created_at: string | null
          embedding: string
          id: string
          metadata: Json | null
          updated_at: string | null
        }
        Insert: {
          campaign_id: string
          created_at?: string | null
          embedding: string
          id?: string
          metadata?: Json | null
          updated_at?: string | null
        }
        Update: {
          campaign_id?: string
          created_at?: string | null
          embedding?: string
          id?: string
          metadata?: Json | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "campaign_embeddings_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: true
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
          hidden: boolean | null
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
          hidden?: boolean | null
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
          hidden?: boolean | null
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
      campaign_report_files: {
        Row: {
          campaign_id: string
          created_at: string
          display_order: number
          file_name: string
          file_size: number
          file_type: string
          file_url: string
          id: string
          is_public: boolean
          uploaded_by: string | null
        }
        Insert: {
          campaign_id: string
          created_at?: string
          display_order?: number
          file_name: string
          file_size: number
          file_type: string
          file_url: string
          id?: string
          is_public?: boolean
          uploaded_by?: string | null
        }
        Update: {
          campaign_id?: string
          created_at?: string
          display_order?: number
          file_name?: string
          file_size?: number
          file_type?: string
          file_url?: string
          id?: string
          is_public?: boolean
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "campaign_report_files_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_reports: {
        Row: {
          campaign_id: string
          created_at: string
          custom_message: string | null
          id: string
          updated_at: string
        }
        Insert: {
          campaign_id: string
          created_at?: string
          custom_message?: string | null
          id?: string
          updated_at?: string
        }
        Update: {
          campaign_id?: string
          created_at?: string
          custom_message?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_reports_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
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
          approved_domains: string[] | null
          approved_emails: string[] | null
          archived_at: string | null
          budget_type: string[] | null
          call_support: boolean | null
          client_choosing_kols: boolean | null
          client_id: string
          created_at: string
          created_by: string | null
          description: string | null
          end_date: string | null
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
          report_share_link: string | null
          share_creator_type: boolean | null
          share_kol_notes: boolean | null
          share_report_publicly: boolean | null
          slug: string | null
          start_date: string
          status: string
          total_budget: number
          updated_at: string
        }
        Insert: {
          approved_domains?: string[] | null
          approved_emails?: string[] | null
          archived_at?: string | null
          budget_type?: string[] | null
          call_support?: boolean | null
          client_choosing_kols?: boolean | null
          client_id: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          end_date?: string | null
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
          report_share_link?: string | null
          share_creator_type?: boolean | null
          share_kol_notes?: boolean | null
          share_report_publicly?: boolean | null
          slug?: string | null
          start_date: string
          status?: string
          total_budget: number
          updated_at?: string
        }
        Update: {
          approved_domains?: string[] | null
          approved_emails?: string[] | null
          archived_at?: string | null
          budget_type?: string[] | null
          call_support?: boolean | null
          client_choosing_kols?: boolean | null
          client_id?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          end_date?: string | null
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
          report_share_link?: string | null
          share_creator_type?: boolean | null
          share_kol_notes?: boolean | null
          share_report_publicly?: boolean | null
          slug?: string | null
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
      changelog_views: {
        Row: {
          changelog_id: string
          id: string
          user_id: string
          viewed_at: string | null
        }
        Insert: {
          changelog_id: string
          id?: string
          user_id: string
          viewed_at?: string | null
        }
        Update: {
          changelog_id?: string
          id?: string
          user_id?: string
          viewed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "changelog_views_changelog_id_fkey"
            columns: ["changelog_id"]
            isOneToOne: false
            referencedRelation: "changelogs"
            referencedColumns: ["id"]
          },
        ]
      }
      changelogs: {
        Row: {
          content: string
          created_at: string | null
          created_by: string | null
          id: string
          is_published: boolean | null
          published_at: string | null
          title: string
          updated_at: string | null
          version: string
        }
        Insert: {
          content: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_published?: boolean | null
          published_at?: string | null
          title: string
          updated_at?: string | null
          version: string
        }
        Update: {
          content?: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_published?: boolean | null
          published_at?: string | null
          title?: string
          updated_at?: string | null
          version?: string
        }
        Relationships: []
      }
      chat_messages: {
        Row: {
          agent_actions: Json | null
          agent_status: string | null
          content: string
          created_at: string | null
          execution_time_ms: number | null
          id: string
          is_agent_response: boolean | null
          metadata: Json | null
          role: string | null
          session_id: string | null
        }
        Insert: {
          agent_actions?: Json | null
          agent_status?: string | null
          content: string
          created_at?: string | null
          execution_time_ms?: number | null
          id?: string
          is_agent_response?: boolean | null
          metadata?: Json | null
          role?: string | null
          session_id?: string | null
        }
        Update: {
          agent_actions?: Json | null
          agent_status?: string | null
          content?: string
          created_at?: string | null
          execution_time_ms?: number | null
          id?: string
          is_agent_response?: boolean | null
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
      client_action_items: {
        Row: {
          attachment_label: string | null
          attachment_url: string | null
          client_id: string
          court: string
          created_at: string
          display_order: number
          id: string
          is_done: boolean
          is_hidden: boolean
          milestone_id: string | null
          phase: string
          text: string
          updated_at: string
        }
        Insert: {
          attachment_label?: string | null
          attachment_url?: string | null
          client_id: string
          court: string
          created_at?: string
          display_order?: number
          id?: string
          is_done?: boolean
          is_hidden?: boolean
          milestone_id?: string | null
          phase: string
          text: string
          updated_at?: string
        }
        Update: {
          attachment_label?: string | null
          attachment_url?: string | null
          client_id?: string
          court?: string
          created_at?: string
          display_order?: number
          id?: string
          is_done?: boolean
          is_hidden?: boolean
          milestone_id?: string | null
          phase?: string
          text?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_action_items_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_action_items_milestone_id_fkey"
            columns: ["milestone_id"]
            isOneToOne: false
            referencedRelation: "client_milestones"
            referencedColumns: ["id"]
          },
        ]
      }
      client_activity_log: {
        Row: {
          activity_type: string
          client_id: string
          created_at: string | null
          created_by: string | null
          created_by_name: string | null
          description: string | null
          id: string
          is_read: boolean
          metadata: Json | null
          title: string
        }
        Insert: {
          activity_type: string
          client_id: string
          created_at?: string | null
          created_by?: string | null
          created_by_name?: string | null
          description?: string | null
          id?: string
          is_read?: boolean
          metadata?: Json | null
          title: string
        }
        Update: {
          activity_type?: string
          client_id?: string
          created_at?: string | null
          created_by?: string | null
          created_by_name?: string | null
          description?: string | null
          id?: string
          is_read?: boolean
          metadata?: Json | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_activity_log_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      client_context: {
        Row: {
          client_contacts: string | null
          client_id: string
          created_at: string | null
          engagement_type: string | null
          gtm_sync_url: string | null
          holohive_contacts: string | null
          id: string
          milestones: string | null
          onboarding_phase: string | null
          scope: string | null
          shared_drive_url: string | null
          start_date: string | null
          telegram_url: string | null
          updated_at: string | null
        }
        Insert: {
          client_contacts?: string | null
          client_id: string
          created_at?: string | null
          engagement_type?: string | null
          gtm_sync_url?: string | null
          holohive_contacts?: string | null
          id?: string
          milestones?: string | null
          onboarding_phase?: string | null
          scope?: string | null
          shared_drive_url?: string | null
          start_date?: string | null
          telegram_url?: string | null
          updated_at?: string | null
        }
        Update: {
          client_contacts?: string | null
          client_id?: string
          created_at?: string | null
          engagement_type?: string | null
          gtm_sync_url?: string | null
          holohive_contacts?: string | null
          id?: string
          milestones?: string | null
          onboarding_phase?: string | null
          scope?: string | null
          shared_drive_url?: string | null
          start_date?: string | null
          telegram_url?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_context_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      client_decision_log: {
        Row: {
          client_id: string
          created_at: string | null
          created_by: string | null
          decision_date: string
          id: string
          summary: string
        }
        Insert: {
          client_id: string
          created_at?: string | null
          created_by?: string | null
          decision_date: string
          id?: string
          summary: string
        }
        Update: {
          client_id?: string
          created_at?: string | null
          created_by?: string | null
          decision_date?: string
          id?: string
          summary?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_decision_log_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      client_delivery_log: {
        Row: {
          action: string
          client_id: string
          created_at: string | null
          created_by: string | null
          id: string
          location: string | null
          logged_at: string
          method: string | null
          notes: string | null
          sort_order: number
          trigger: string | null
          updated_at: string | null
          who: string | null
          work_type: string
        }
        Insert: {
          action: string
          client_id: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          location?: string | null
          logged_at?: string
          method?: string | null
          notes?: string | null
          sort_order?: number
          trigger?: string | null
          updated_at?: string | null
          who?: string | null
          work_type: string
        }
        Update: {
          action?: string
          client_id?: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          location?: string | null
          logged_at?: string
          method?: string | null
          notes?: string | null
          sort_order?: number
          trigger?: string | null
          updated_at?: string | null
          who?: string | null
          work_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_delivery_log_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      client_embeddings: {
        Row: {
          client_id: string
          created_at: string | null
          embedding: string
          id: string
          metadata: Json | null
          updated_at: string | null
        }
        Insert: {
          client_id: string
          created_at?: string | null
          embedding: string
          id?: string
          metadata?: Json | null
          updated_at?: string | null
        }
        Update: {
          client_id?: string
          created_at?: string | null
          embedding?: string
          id?: string
          metadata?: Json | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_embeddings_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      client_meeting_notes: {
        Row: {
          action_items: string | null
          attendees: string | null
          client_id: string
          content: string | null
          created_at: string | null
          created_by: string | null
          id: string
          meeting_date: string
          title: string
          updated_at: string | null
        }
        Insert: {
          action_items?: string | null
          attendees?: string | null
          client_id: string
          content?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          meeting_date: string
          title: string
          updated_at?: string | null
        }
        Update: {
          action_items?: string | null
          attendees?: string | null
          client_id?: string
          content?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          meeting_date?: string
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_meeting_notes_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      client_message_examples: {
        Row: {
          campaign_id: string | null
          client_id: string | null
          content: string
          context_data: Json | null
          created_at: string | null
          edit_count: number | null
          embedding: string | null
          generation_parameters: Json | null
          id: string
          message_type: string
          original_ai_content: string | null
          subject: string | null
          template_id: string | null
          updated_at: string | null
          user_id: string
          user_rating: number | null
          was_ai_generated: boolean | null
          was_edited: boolean | null
          was_sent: boolean | null
        }
        Insert: {
          campaign_id?: string | null
          client_id?: string | null
          content: string
          context_data?: Json | null
          created_at?: string | null
          edit_count?: number | null
          embedding?: string | null
          generation_parameters?: Json | null
          id?: string
          message_type: string
          original_ai_content?: string | null
          subject?: string | null
          template_id?: string | null
          updated_at?: string | null
          user_id: string
          user_rating?: number | null
          was_ai_generated?: boolean | null
          was_edited?: boolean | null
          was_sent?: boolean | null
        }
        Update: {
          campaign_id?: string | null
          client_id?: string | null
          content?: string
          context_data?: Json | null
          created_at?: string | null
          edit_count?: number | null
          embedding?: string | null
          generation_parameters?: Json | null
          id?: string
          message_type?: string
          original_ai_content?: string | null
          subject?: string | null
          template_id?: string | null
          updated_at?: string | null
          user_id?: string
          user_rating?: number | null
          was_ai_generated?: boolean | null
          was_edited?: boolean | null
          was_sent?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "client_message_examples_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_message_examples_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_message_examples_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "message_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_message_examples_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      client_milestones: {
        Row: {
          client_id: string
          created_at: string | null
          display_order: number
          id: string
          is_visible: boolean
          name: string
          status: string
          status_message: string | null
          subtitle: string | null
          updated_at: string | null
        }
        Insert: {
          client_id: string
          created_at?: string | null
          display_order?: number
          id?: string
          is_visible?: boolean
          name: string
          status?: string
          status_message?: string | null
          subtitle?: string | null
          updated_at?: string | null
        }
        Update: {
          client_id?: string
          created_at?: string | null
          display_order?: number
          id?: string
          is_visible?: boolean
          name?: string
          status?: string
          status_message?: string | null
          subtitle?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_milestones_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      client_mindshare_config: {
        Row: {
          benchmark_description: string | null
          benchmark_label: string | null
          campaign_start_date: string | null
          client_id: string
          created_at: string | null
          id: string
          is_enabled: boolean | null
          tracked_keywords: Json | null
          updated_at: string | null
        }
        Insert: {
          benchmark_description?: string | null
          benchmark_label?: string | null
          campaign_start_date?: string | null
          client_id: string
          created_at?: string | null
          id?: string
          is_enabled?: boolean | null
          tracked_keywords?: Json | null
          updated_at?: string | null
        }
        Update: {
          benchmark_description?: string | null
          benchmark_label?: string | null
          campaign_start_date?: string | null
          client_id?: string
          created_at?: string | null
          id?: string
          is_enabled?: boolean | null
          tracked_keywords?: Json | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_mindshare_config_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      client_mindshare_weekly: {
        Row: {
          client_id: string
          created_at: string | null
          id: string
          mention_count: number | null
          mindshare_pct: number | null
          notes: string | null
          week_number: number
          week_start: string
        }
        Insert: {
          client_id: string
          created_at?: string | null
          id?: string
          mention_count?: number | null
          mindshare_pct?: number | null
          notes?: string | null
          week_number: number
          week_start: string
        }
        Update: {
          client_id?: string
          created_at?: string | null
          id?: string
          mention_count?: number | null
          mindshare_pct?: number | null
          notes?: string | null
          week_number?: number
          week_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_mindshare_weekly_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      client_weekly_updates: {
        Row: {
          active_initiatives: string | null
          client_id: string
          created_at: string | null
          created_by: string | null
          current_focus: string
          id: string
          next_checkin: string | null
          open_questions: string | null
          updated_at: string | null
          week_of: string
        }
        Insert: {
          active_initiatives?: string | null
          client_id: string
          created_at?: string | null
          created_by?: string | null
          current_focus: string
          id?: string
          next_checkin?: string | null
          open_questions?: string | null
          updated_at?: string | null
          week_of: string
        }
        Update: {
          active_initiatives?: string | null
          client_id?: string
          created_at?: string | null
          created_by?: string | null
          current_focus?: string
          id?: string
          next_checkin?: string | null
          open_questions?: string | null
          updated_at?: string | null
          week_of?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_weekly_updates_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          approved_domains: string[] | null
          approved_emails: string[] | null
          archived_at: string | null
          created_at: string
          email: string
          id: string
          is_active: boolean
          is_whitelisted: boolean | null
          location: string | null
          logo_url: string | null
          name: string
          onboarding_call_date: string | null
          onboarding_call_held: boolean | null
          slug: string | null
          source: string | null
          updated_at: string
          whitelist_partner_id: string | null
        }
        Insert: {
          approved_domains?: string[] | null
          approved_emails?: string[] | null
          archived_at?: string | null
          created_at?: string
          email: string
          id?: string
          is_active?: boolean
          is_whitelisted?: boolean | null
          location?: string | null
          logo_url?: string | null
          name?: string
          onboarding_call_date?: string | null
          onboarding_call_held?: boolean | null
          slug?: string | null
          source?: string | null
          updated_at?: string
          whitelist_partner_id?: string | null
        }
        Update: {
          approved_domains?: string[] | null
          approved_emails?: string[] | null
          archived_at?: string | null
          created_at?: string
          email?: string
          id?: string
          is_active?: boolean
          is_whitelisted?: boolean | null
          location?: string | null
          logo_url?: string | null
          name?: string
          onboarding_call_date?: string | null
          onboarding_call_held?: boolean | null
          slug?: string | null
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
      contact_submissions: {
        Row: {
          created_at: string | null
          email: string | null
          funding: string | null
          goals: string | null
          id: number
          name: string | null
          project_name: string | null
          role: string | null
          telegram: string | null
          timeline: string | null
        }
        Insert: {
          created_at?: string | null
          email?: string | null
          funding?: string | null
          goals?: string | null
          id?: never
          name?: string | null
          project_name?: string | null
          role?: string | null
          telegram?: string | null
          timeline?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string | null
          funding?: string | null
          goals?: string | null
          id?: never
          name?: string | null
          project_name?: string | null
          role?: string | null
          telegram?: string | null
          timeline?: string | null
        }
        Relationships: []
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
          notes: string | null
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
          notes?: string | null
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
          notes?: string | null
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
      crm_activities: {
        Row: {
          attachment_name: string | null
          attachment_url: string | null
          created_at: string | null
          description: string | null
          id: string
          next_step: string | null
          next_step_date: string | null
          opportunity_id: string
          outcome: string | null
          owner_id: string | null
          title: string
          type: string
        }
        Insert: {
          attachment_name?: string | null
          attachment_url?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          next_step?: string | null
          next_step_date?: string | null
          opportunity_id: string
          outcome?: string | null
          owner_id?: string | null
          title: string
          type: string
        }
        Update: {
          attachment_name?: string | null
          attachment_url?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          next_step?: string | null
          next_step_date?: string | null
          opportunity_id?: string
          outcome?: string | null
          owner_id?: string | null
          title?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_activities_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "crm_opportunities"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_affiliates: {
        Row: {
          affiliation: string | null
          category: string | null
          commission_model: string | null
          commission_rate: number | null
          created_at: string | null
          id: string
          last_contacted_at: string | null
          name: string
          notes: string | null
          owner_id: string | null
          poc_email: string | null
          poc_name: string | null
          poc_telegram: string | null
          status: string
          terms_of_interest: string | null
          updated_at: string | null
        }
        Insert: {
          affiliation?: string | null
          category?: string | null
          commission_model?: string | null
          commission_rate?: number | null
          created_at?: string | null
          id?: string
          last_contacted_at?: string | null
          name: string
          notes?: string | null
          owner_id?: string | null
          poc_email?: string | null
          poc_name?: string | null
          poc_telegram?: string | null
          status?: string
          terms_of_interest?: string | null
          updated_at?: string | null
        }
        Update: {
          affiliation?: string | null
          category?: string | null
          commission_model?: string | null
          commission_rate?: number | null
          created_at?: string | null
          id?: string
          last_contacted_at?: string | null
          name?: string
          notes?: string | null
          owner_id?: string | null
          poc_email?: string | null
          poc_name?: string | null
          poc_telegram?: string | null
          status?: string
          terms_of_interest?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      crm_contact_links: {
        Row: {
          affiliate_id: string | null
          contact_id: string
          created_at: string | null
          id: string
          is_primary: boolean | null
          linked_type: string
          opportunity_id: string | null
          partner_id: string | null
          role: string | null
        }
        Insert: {
          affiliate_id?: string | null
          contact_id: string
          created_at?: string | null
          id?: string
          is_primary?: boolean | null
          linked_type: string
          opportunity_id?: string | null
          partner_id?: string | null
          role?: string | null
        }
        Update: {
          affiliate_id?: string | null
          contact_id?: string
          created_at?: string | null
          id?: string
          is_primary?: boolean | null
          linked_type?: string
          opportunity_id?: string | null
          partner_id?: string | null
          role?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "crm_contact_links_affiliate_id_fkey"
            columns: ["affiliate_id"]
            isOneToOne: false
            referencedRelation: "crm_affiliates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_contact_links_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "crm_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_contact_links_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "crm_opportunities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_contact_links_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "crm_partners"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_contacts: {
        Row: {
          category: string | null
          created_at: string | null
          email: string | null
          id: string
          influence_level: string | null
          is_decision_maker: boolean | null
          name: string
          notes: string | null
          owner_id: string | null
          role: string | null
          telegram_id: string | null
          updated_at: string | null
          x_id: string | null
        }
        Insert: {
          category?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          influence_level?: string | null
          is_decision_maker?: boolean | null
          name: string
          notes?: string | null
          owner_id?: string | null
          role?: string | null
          telegram_id?: string | null
          updated_at?: string | null
          x_id?: string | null
        }
        Update: {
          category?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          influence_level?: string | null
          is_decision_maker?: boolean | null
          name?: string
          notes?: string | null
          owner_id?: string | null
          role?: string | null
          telegram_id?: string | null
          updated_at?: string | null
          x_id?: string | null
        }
        Relationships: []
      }
      crm_opportunities: {
        Row: {
          account_type: string | null
          action_tier: string | null
          affiliate_id: string | null
          bucket: string | null
          bucket_changed_at: string | null
          bump_number: number | null
          calendly_booked_date: string | null
          calendly_sent_date: string | null
          calendly_sent_via: string | null
          category: string | null
          client_id: string | null
          closed_at: string | null
          closed_lost_reason: string | null
          co_owner_ids: Json | null
          composite_score: number | null
          created_at: string | null
          currency: string | null
          deal_value: number | null
          dedup_key: string | null
          discovery_call_at: string | null
          dm_account: string | null
          funding_amount: string | null
          funding_stage: string | null
          gc: string | null
          gc_opened: string | null
          icp_fit_score: number | null
          id: string
          korea_presence: string | null
          last_bump_date: string | null
          last_contacted_at: string | null
          last_message_at: string | null
          last_reply_at: string | null
          last_scored_at: string | null
          last_signal_at: string | null
          last_team_message_at: string | null
          lead_investors: string | null
          name: string
          narrative_fit: string | null
          next_meeting_at: string | null
          next_meeting_type: string | null
          notes: string | null
          orbit_followup_days: number | null
          orbit_reason: string | null
          owner_id: string | null
          personality_type: string | null
          poc_handle: string | null
          poc_platform: string | null
          position: number | null
          product_status: string | null
          proposal_sent_at: string | null
          qualified_at: string | null
          referrer: string | null
          scope: string | null
          signal_strength_score: number | null
          source: string | null
          stage: string
          team_doxxed: boolean | null
          temperature_score: number | null
          tg_handle: string | null
          tge_date: string | null
          timing_score: number | null
          token_status: string | null
          twitter_followers: number | null
          twitter_handle: string | null
          updated_at: string | null
          warm_sub_state: string | null
          website_url: string | null
        }
        Insert: {
          account_type?: string | null
          action_tier?: string | null
          affiliate_id?: string | null
          bucket?: string | null
          bucket_changed_at?: string | null
          bump_number?: number | null
          calendly_booked_date?: string | null
          calendly_sent_date?: string | null
          calendly_sent_via?: string | null
          category?: string | null
          client_id?: string | null
          closed_at?: string | null
          closed_lost_reason?: string | null
          co_owner_ids?: Json | null
          composite_score?: number | null
          created_at?: string | null
          currency?: string | null
          deal_value?: number | null
          dedup_key?: string | null
          discovery_call_at?: string | null
          dm_account?: string | null
          funding_amount?: string | null
          funding_stage?: string | null
          gc?: string | null
          gc_opened?: string | null
          icp_fit_score?: number | null
          id?: string
          korea_presence?: string | null
          last_bump_date?: string | null
          last_contacted_at?: string | null
          last_message_at?: string | null
          last_reply_at?: string | null
          last_scored_at?: string | null
          last_signal_at?: string | null
          last_team_message_at?: string | null
          lead_investors?: string | null
          name: string
          narrative_fit?: string | null
          next_meeting_at?: string | null
          next_meeting_type?: string | null
          notes?: string | null
          orbit_followup_days?: number | null
          orbit_reason?: string | null
          owner_id?: string | null
          personality_type?: string | null
          poc_handle?: string | null
          poc_platform?: string | null
          position?: number | null
          product_status?: string | null
          proposal_sent_at?: string | null
          qualified_at?: string | null
          referrer?: string | null
          scope?: string | null
          signal_strength_score?: number | null
          source?: string | null
          stage?: string
          team_doxxed?: boolean | null
          temperature_score?: number | null
          tg_handle?: string | null
          tge_date?: string | null
          timing_score?: number | null
          token_status?: string | null
          twitter_followers?: number | null
          twitter_handle?: string | null
          updated_at?: string | null
          warm_sub_state?: string | null
          website_url?: string | null
        }
        Update: {
          account_type?: string | null
          action_tier?: string | null
          affiliate_id?: string | null
          bucket?: string | null
          bucket_changed_at?: string | null
          bump_number?: number | null
          calendly_booked_date?: string | null
          calendly_sent_date?: string | null
          calendly_sent_via?: string | null
          category?: string | null
          client_id?: string | null
          closed_at?: string | null
          closed_lost_reason?: string | null
          co_owner_ids?: Json | null
          composite_score?: number | null
          created_at?: string | null
          currency?: string | null
          deal_value?: number | null
          dedup_key?: string | null
          discovery_call_at?: string | null
          dm_account?: string | null
          funding_amount?: string | null
          funding_stage?: string | null
          gc?: string | null
          gc_opened?: string | null
          icp_fit_score?: number | null
          id?: string
          korea_presence?: string | null
          last_bump_date?: string | null
          last_contacted_at?: string | null
          last_message_at?: string | null
          last_reply_at?: string | null
          last_scored_at?: string | null
          last_signal_at?: string | null
          last_team_message_at?: string | null
          lead_investors?: string | null
          name?: string
          narrative_fit?: string | null
          next_meeting_at?: string | null
          next_meeting_type?: string | null
          notes?: string | null
          orbit_followup_days?: number | null
          orbit_reason?: string | null
          owner_id?: string | null
          personality_type?: string | null
          poc_handle?: string | null
          poc_platform?: string | null
          position?: number | null
          product_status?: string | null
          proposal_sent_at?: string | null
          qualified_at?: string | null
          referrer?: string | null
          scope?: string | null
          signal_strength_score?: number | null
          source?: string | null
          stage?: string
          team_doxxed?: boolean | null
          temperature_score?: number | null
          tg_handle?: string | null
          tge_date?: string | null
          timing_score?: number | null
          token_status?: string | null
          twitter_followers?: number | null
          twitter_handle?: string | null
          updated_at?: string | null
          warm_sub_state?: string | null
          website_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "crm_opportunities_affiliate_id_fkey"
            columns: ["affiliate_id"]
            isOneToOne: false
            referencedRelation: "crm_affiliates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_opportunities_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_partners: {
        Row: {
          affiliate_id: string | null
          category: string | null
          created_at: string | null
          focus: string | null
          id: string
          is_affiliate: boolean | null
          last_contacted_at: string | null
          name: string
          notes: string | null
          owner_id: string | null
          poc_email: string | null
          poc_name: string | null
          poc_telegram: string | null
          status: string
          updated_at: string | null
        }
        Insert: {
          affiliate_id?: string | null
          category?: string | null
          created_at?: string | null
          focus?: string | null
          id?: string
          is_affiliate?: boolean | null
          last_contacted_at?: string | null
          name: string
          notes?: string | null
          owner_id?: string | null
          poc_email?: string | null
          poc_name?: string | null
          poc_telegram?: string | null
          status?: string
          updated_at?: string | null
        }
        Update: {
          affiliate_id?: string | null
          category?: string | null
          created_at?: string | null
          focus?: string | null
          id?: string
          is_affiliate?: boolean | null
          last_contacted_at?: string | null
          name?: string
          notes?: string | null
          owner_id?: string | null
          poc_email?: string | null
          poc_name?: string | null
          poc_telegram?: string | null
          status?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "crm_partners_affiliate_id_fkey"
            columns: ["affiliate_id"]
            isOneToOne: false
            referencedRelation: "crm_affiliates"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_stage_history: {
        Row: {
          changed_at: string | null
          changed_by: string | null
          from_stage: string | null
          id: string
          notes: string | null
          object_id: string
          object_type: string
          to_stage: string
        }
        Insert: {
          changed_at?: string | null
          changed_by?: string | null
          from_stage?: string | null
          id?: string
          notes?: string | null
          object_id: string
          object_type: string
          to_stage: string
        }
        Update: {
          changed_at?: string | null
          changed_by?: string | null
          from_stage?: string | null
          id?: string
          notes?: string | null
          object_id?: string
          object_type?: string
          to_stage?: string
        }
        Relationships: []
      }
      daily_standups: {
        Row: {
          blockers: string | null
          completed_yesterday: string
          created_at: string | null
          id: string
          output_goal: string
          priorities: string
          submission_date: string
          submitted_at: string
          user_id: string
          user_name: string
        }
        Insert: {
          blockers?: string | null
          completed_yesterday: string
          created_at?: string | null
          id?: string
          output_goal: string
          priorities: string
          submission_date?: string
          submitted_at?: string
          user_id: string
          user_name: string
        }
        Update: {
          blockers?: string | null
          completed_yesterday?: string
          created_at?: string | null
          id?: string
          output_goal?: string
          priorities?: string
          submission_date?: string
          submitted_at?: string
          user_id?: string
          user_name?: string
        }
        Relationships: []
      }
      deliverable_template_steps: {
        Row: {
          checklist_items: Json | null
          default_role: string
          description: string | null
          estimated_duration_days: number
          id: string
          is_blocking: boolean
          role_label: string
          step_name: string
          step_order: number
          task_type: string
          template_id: string
        }
        Insert: {
          checklist_items?: Json | null
          default_role: string
          description?: string | null
          estimated_duration_days?: number
          id?: string
          is_blocking?: boolean
          role_label: string
          step_name: string
          step_order: number
          task_type?: string
          template_id: string
        }
        Update: {
          checklist_items?: Json | null
          default_role?: string
          description?: string | null
          estimated_duration_days?: number
          id?: string
          is_blocking?: boolean
          role_label?: string
          step_name?: string
          step_order?: number
          task_type?: string
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "deliverable_template_steps_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "deliverable_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      deliverable_templates: {
        Row: {
          category: string
          color: string
          created_at: string
          created_by: string | null
          description: string | null
          icon: string
          id: string
          is_active: boolean
          name: string
          slug: string
          updated_at: string
          version: number
        }
        Insert: {
          category: string
          color?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          icon?: string
          id?: string
          is_active?: boolean
          name: string
          slug: string
          updated_at?: string
          version?: number
        }
        Update: {
          category?: string
          color?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          icon?: string
          id?: string
          is_active?: boolean
          name?: string
          slug?: string
          updated_at?: string
          version?: number
        }
        Relationships: []
      }
      deliverables: {
        Row: {
          actual_duration_days: number | null
          client_id: string | null
          created_at: string
          created_by: string | null
          id: string
          metadata: Json | null
          parent_task_id: string
          role_assignments: Json
          start_date: string | null
          status: string
          target_completion: string | null
          template_id: string
          title: string
          updated_at: string
        }
        Insert: {
          actual_duration_days?: number | null
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          metadata?: Json | null
          parent_task_id: string
          role_assignments?: Json
          start_date?: string | null
          status?: string
          target_completion?: string | null
          template_id: string
          title: string
          updated_at?: string
        }
        Update: {
          actual_duration_days?: number | null
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          metadata?: Json | null
          parent_task_id?: string
          role_assignments?: Json
          start_date?: string | null
          status?: string
          target_completion?: string | null
          template_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "deliverables_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deliverables_parent_task_id_fkey"
            columns: ["parent_task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deliverables_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "deliverable_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      field_options: {
        Row: {
          created_at: string | null
          display_order: number
          field_name: string
          id: string
          is_active: boolean
          option_value: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          display_order?: number
          field_name: string
          id?: string
          is_active?: boolean
          option_value: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          display_order?: number
          field_name?: string
          id?: string
          is_active?: boolean
          option_value?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      form_fields: {
        Row: {
          allow_attachments: boolean | null
          allow_multiple: boolean | null
          created_at: string | null
          display_order: number
          field_type: Database["public"]["Enums"]["field_type"]
          form_id: string
          id: string
          include_other: boolean | null
          is_yes_no_dropdown: boolean | null
          label: string
          options: Json | null
          page_number: number
          require_no_reason: boolean | null
          require_yes_reason: boolean | null
          required: boolean
        }
        Insert: {
          allow_attachments?: boolean | null
          allow_multiple?: boolean | null
          created_at?: string | null
          display_order?: number
          field_type: Database["public"]["Enums"]["field_type"]
          form_id: string
          id?: string
          include_other?: boolean | null
          is_yes_no_dropdown?: boolean | null
          label: string
          options?: Json | null
          page_number?: number
          require_no_reason?: boolean | null
          require_yes_reason?: boolean | null
          required?: boolean
        }
        Update: {
          allow_attachments?: boolean | null
          allow_multiple?: boolean | null
          created_at?: string | null
          display_order?: number
          field_type?: Database["public"]["Enums"]["field_type"]
          form_id?: string
          id?: string
          include_other?: boolean | null
          is_yes_no_dropdown?: boolean | null
          label?: string
          options?: Json | null
          page_number?: number
          require_no_reason?: boolean | null
          require_yes_reason?: boolean | null
          required?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "form_fields_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: false
            referencedRelation: "forms"
            referencedColumns: ["id"]
          },
        ]
      }
      form_responses: {
        Row: {
          client_id: string | null
          form_id: string
          id: string
          response_data: Json
          submitted_at: string | null
          submitted_by_email: string | null
          submitted_by_name: string | null
        }
        Insert: {
          client_id?: string | null
          form_id: string
          id?: string
          response_data: Json
          submitted_at?: string | null
          submitted_by_email?: string | null
          submitted_by_name?: string | null
        }
        Update: {
          client_id?: string | null
          form_id?: string
          id?: string
          response_data?: Json
          submitted_at?: string | null
          submitted_by_email?: string | null
          submitted_by_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "form_responses_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_responses_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: false
            referencedRelation: "forms"
            referencedColumns: ["id"]
          },
        ]
      }
      form_task_mappings: {
        Row: {
          created_at: string | null
          created_by: string | null
          field_mappings: Json | null
          form_id: string
          id: string
          is_active: boolean | null
          template_id: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          field_mappings?: Json | null
          form_id: string
          id?: string
          is_active?: boolean | null
          template_id?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          field_mappings?: Json | null
          form_id?: string
          id?: string
          is_active?: boolean | null
          template_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "form_task_mappings_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_task_mappings_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "task_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      forms: {
        Row: {
          archived_at: string | null
          created_at: string | null
          description: string | null
          enable_thank_you_page: boolean | null
          id: string
          name: string
          slug: string | null
          status: Database["public"]["Enums"]["form_status"]
          subdomain_enabled: boolean | null
          subdomain_url: string | null
          thank_you_message: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          archived_at?: string | null
          created_at?: string | null
          description?: string | null
          enable_thank_you_page?: boolean | null
          id?: string
          name: string
          slug?: string | null
          status?: Database["public"]["Enums"]["form_status"]
          subdomain_enabled?: boolean | null
          subdomain_url?: string | null
          thank_you_message?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          archived_at?: string | null
          created_at?: string | null
          description?: string | null
          enable_thank_you_page?: boolean | null
          id?: string
          name?: string
          slug?: string | null
          status?: Database["public"]["Enums"]["form_status"]
          subdomain_enabled?: boolean | null
          subdomain_url?: string | null
          thank_you_message?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "forms_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      guest_permissions: {
        Row: {
          can_delete: boolean | null
          can_edit: boolean | null
          can_view: boolean | null
          created_at: string | null
          id: string
          page_key: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          can_delete?: boolean | null
          can_edit?: boolean | null
          can_view?: boolean | null
          created_at?: string | null
          id?: string
          page_key: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          can_delete?: boolean | null
          can_edit?: boolean | null
          can_view?: boolean | null
          created_at?: string | null
          id?: string
          page_key?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "guest_permissions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      kol_embeddings: {
        Row: {
          created_at: string | null
          embedding: string
          id: string
          kol_id: string
          metadata: Json | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          embedding: string
          id?: string
          kol_id: string
          metadata?: Json | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          embedding?: string
          id?: string
          kol_id?: string
          metadata?: Json | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "kol_embeddings_kol_id_fkey"
            columns: ["kol_id"]
            isOneToOne: true
            referencedRelation: "master_kols"
            referencedColumns: ["id"]
          },
        ]
      }
      links: {
        Row: {
          access: string
          client: string | null
          client_id: string | null
          created_at: string | null
          created_by: string | null
          description: string | null
          id: string
          link_types: string[] | null
          name: string
          status: string
          updated_at: string | null
          url: string
        }
        Insert: {
          access?: string
          client?: string | null
          client_id?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          link_types?: string[] | null
          name: string
          status?: string
          updated_at?: string | null
          url: string
        }
        Update: {
          access?: string
          client?: string | null
          client_id?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          link_types?: string[] | null
          name?: string
          status?: string
          updated_at?: string | null
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "links_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      list_email_views: {
        Row: {
          created_at: string | null
          email: string
          id: string
          ip_address: string | null
          list_id: string
          user_agent: string | null
          viewed_at: string | null
        }
        Insert: {
          created_at?: string | null
          email: string
          id?: string
          ip_address?: string | null
          list_id: string
          user_agent?: string | null
          viewed_at?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string
          id?: string
          ip_address?: string | null
          list_id?: string
          user_agent?: string | null
          viewed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "list_email_views_list_id_fkey"
            columns: ["list_id"]
            isOneToOne: false
            referencedRelation: "lists"
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
          approved_emails: string[] | null
          archived_at: string | null
          created_at: string
          filters: Json | null
          id: string
          name: string
          notes: string | null
          slug: string | null
          sort_order: Json | null
          status: string | null
          updated_at: string
        }
        Insert: {
          approved_emails?: string[] | null
          archived_at?: string | null
          created_at?: string
          filters?: Json | null
          id?: string
          name: string
          notes?: string | null
          slug?: string | null
          sort_order?: Json | null
          status?: string | null
          updated_at?: string
        }
        Update: {
          approved_emails?: string[] | null
          archived_at?: string | null
          created_at?: string
          filters?: Json | null
          id?: string
          name?: string
          notes?: string | null
          slug?: string | null
          sort_order?: Json | null
          status?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      master_kols: {
        Row: {
          archived_at: string | null
          community: boolean | null
          content_type: string[] | null
          created_at: string | null
          creator_type: string[] | null
          deliverables: string[] | null
          description: string | null
          followers: number | null
          group_chat: boolean | null
          id: string
          in_house: string | null
          link: string | null
          name: string
          niche: string[] | null
          platform: string[] | null
          pricing: string | null
          rating: number | null
          region: string | null
          tier: string | null
          updated_at: string | null
          wallet: string | null
        }
        Insert: {
          archived_at?: string | null
          community?: boolean | null
          content_type?: string[] | null
          created_at?: string | null
          creator_type?: string[] | null
          deliverables?: string[] | null
          description?: string | null
          followers?: number | null
          group_chat?: boolean | null
          id?: string
          in_house?: string | null
          link?: string | null
          name: string
          niche?: string[] | null
          platform?: string[] | null
          pricing?: string | null
          rating?: number | null
          region?: string | null
          tier?: string | null
          updated_at?: string | null
          wallet?: string | null
        }
        Update: {
          archived_at?: string | null
          community?: boolean | null
          content_type?: string[] | null
          created_at?: string | null
          creator_type?: string[] | null
          deliverables?: string[] | null
          description?: string | null
          followers?: number | null
          group_chat?: boolean | null
          id?: string
          in_house?: string | null
          link?: string | null
          name?: string
          niche?: string[] | null
          platform?: string[] | null
          pricing?: string | null
          rating?: number | null
          region?: string | null
          tier?: string | null
          updated_at?: string | null
          wallet?: string | null
        }
        Relationships: []
      }
      message_templates: {
        Row: {
          content: string
          created_at: string | null
          created_by: string | null
          id: string
          is_active: boolean | null
          last_used_at: string | null
          message_type: string
          name: string
          subject: string | null
          updated_at: string | null
          usage_count: number | null
          variables: Json | null
        }
        Insert: {
          content: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_active?: boolean | null
          last_used_at?: string | null
          message_type: string
          name: string
          subject?: string | null
          updated_at?: string | null
          usage_count?: number | null
          variables?: Json | null
        }
        Update: {
          content?: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_active?: boolean | null
          last_used_at?: string | null
          message_type?: string
          name?: string
          subject?: string | null
          updated_at?: string | null
          usage_count?: number | null
          variables?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "message_templates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      milestone_templates: {
        Row: {
          created_at: string | null
          created_by: string | null
          description: string | null
          id: string
          is_default: boolean | null
          milestones: Json
          name: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          is_default?: boolean | null
          milestones?: Json
          name: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          is_default?: boolean | null
          milestones?: Json
          name?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      outreach_drafts: {
        Row: {
          approved_by: string | null
          channel: string | null
          created_at: string | null
          created_by: string | null
          framework_used: string | null
          id: string
          message_draft: string
          opportunity_id: string
          outcome: string | null
          outcome_framing: Json | null
          quality_gate_details: Json | null
          quality_gate_passed: boolean | null
          replied_at: string | null
          reply_sentiment: string | null
          sent_at: string | null
          status: string | null
          template_type: string | null
          touch_number: number | null
          tracking_id: string | null
          trigger_used: string | null
          updated_at: string | null
        }
        Insert: {
          approved_by?: string | null
          channel?: string | null
          created_at?: string | null
          created_by?: string | null
          framework_used?: string | null
          id?: string
          message_draft: string
          opportunity_id: string
          outcome?: string | null
          outcome_framing?: Json | null
          quality_gate_details?: Json | null
          quality_gate_passed?: boolean | null
          replied_at?: string | null
          reply_sentiment?: string | null
          sent_at?: string | null
          status?: string | null
          template_type?: string | null
          touch_number?: number | null
          tracking_id?: string | null
          trigger_used?: string | null
          updated_at?: string | null
        }
        Update: {
          approved_by?: string | null
          channel?: string | null
          created_at?: string | null
          created_by?: string | null
          framework_used?: string | null
          id?: string
          message_draft?: string
          opportunity_id?: string
          outcome?: string | null
          outcome_framing?: Json | null
          quality_gate_details?: Json | null
          quality_gate_passed?: boolean | null
          replied_at?: string | null
          reply_sentiment?: string | null
          sent_at?: string | null
          status?: string | null
          template_type?: string | null
          touch_number?: number | null
          tracking_id?: string | null
          trigger_used?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "outreach_drafts_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "crm_opportunities"
            referencedColumns: ["id"]
          },
        ]
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
          campaign_kol_id: string | null
          content_id: string[] | null
          created_at: string | null
          id: string
          notes: string | null
          payment_category: string | null
          payment_date: string | null
          payment_method: string
          recipient_name: string | null
          transaction_id: string | null
          updated_at: string | null
          wallet: string | null
        }
        Insert: {
          amount: number
          campaign_id: string
          campaign_kol_id?: string | null
          content_id?: string[] | null
          created_at?: string | null
          id?: string
          notes?: string | null
          payment_category?: string | null
          payment_date?: string | null
          payment_method: string
          recipient_name?: string | null
          transaction_id?: string | null
          updated_at?: string | null
          wallet?: string | null
        }
        Update: {
          amount?: number
          campaign_id?: string
          campaign_kol_id?: string | null
          content_id?: string[] | null
          created_at?: string | null
          id?: string
          notes?: string | null
          payment_category?: string | null
          payment_date?: string | null
          payment_method?: string
          recipient_name?: string | null
          transaction_id?: string | null
          updated_at?: string | null
          wallet?: string | null
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
        ]
      }
      prospect_intel: {
        Row: {
          confidence: number | null
          content: Json | null
          created_at: string | null
          id: string
          intel_type: string
          opportunity_id: string
          refreshed_at: string | null
          source_urls: string[] | null
          updated_at: string | null
        }
        Insert: {
          confidence?: number | null
          content?: Json | null
          created_at?: string | null
          id?: string
          intel_type: string
          opportunity_id: string
          refreshed_at?: string | null
          source_urls?: string[] | null
          updated_at?: string | null
        }
        Update: {
          confidence?: number | null
          content?: Json | null
          created_at?: string | null
          id?: string
          intel_type?: string
          opportunity_id?: string
          refreshed_at?: string | null
          source_urls?: string[] | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "prospect_intel_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "crm_opportunities"
            referencedColumns: ["id"]
          },
        ]
      }
      prospect_settings: {
        Row: {
          id: string
          key: string
          updated_at: string | null
          value: Json
        }
        Insert: {
          id?: string
          key: string
          updated_at?: string | null
          value?: Json
        }
        Update: {
          id?: string
          key?: string
          updated_at?: string | null
          value?: Json
        }
        Relationships: []
      }
      prospect_signals: {
        Row: {
          created_at: string | null
          detected_at: string | null
          expires_at: string | null
          headline: string
          id: string
          is_active: boolean | null
          project_name: string
          prospect_id: string | null
          relevancy_weight: number | null
          signal_type: string
          snippet: string | null
          source_name: string | null
          source_url: string | null
        }
        Insert: {
          created_at?: string | null
          detected_at?: string | null
          expires_at?: string | null
          headline: string
          id?: string
          is_active?: boolean | null
          project_name: string
          prospect_id?: string | null
          relevancy_weight?: number | null
          signal_type: string
          snippet?: string | null
          source_name?: string | null
          source_url?: string | null
        }
        Update: {
          created_at?: string | null
          detected_at?: string | null
          expires_at?: string | null
          headline?: string
          id?: string
          is_active?: boolean | null
          project_name?: string
          prospect_id?: string | null
          relevancy_weight?: number | null
          signal_type?: string
          snippet?: string | null
          source_name?: string | null
          source_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "prospect_signals_prospect_id_fkey"
            columns: ["prospect_id"]
            isOneToOne: false
            referencedRelation: "prospects"
            referencedColumns: ["id"]
          },
        ]
      }
      prospects: {
        Row: {
          category: string | null
          created_at: string | null
          discord_url: string | null
          icp_score: number | null
          id: string
          korea_relevancy_score: number | null
          korea_signal_count: number | null
          last_signal_scan: string | null
          logo_url: string | null
          market_cap: number | null
          name: string
          price: number | null
          promoted_opportunity_id: string | null
          scraped_at: string | null
          source: string | null
          source_url: string | null
          status: string | null
          symbol: string | null
          telegram_url: string | null
          twitter_url: string | null
          updated_at: string | null
          volume_24h: number | null
          website_url: string | null
        }
        Insert: {
          category?: string | null
          created_at?: string | null
          discord_url?: string | null
          icp_score?: number | null
          id?: string
          korea_relevancy_score?: number | null
          korea_signal_count?: number | null
          last_signal_scan?: string | null
          logo_url?: string | null
          market_cap?: number | null
          name: string
          price?: number | null
          promoted_opportunity_id?: string | null
          scraped_at?: string | null
          source?: string | null
          source_url?: string | null
          status?: string | null
          symbol?: string | null
          telegram_url?: string | null
          twitter_url?: string | null
          updated_at?: string | null
          volume_24h?: number | null
          website_url?: string | null
        }
        Update: {
          category?: string | null
          created_at?: string | null
          discord_url?: string | null
          icp_score?: number | null
          id?: string
          korea_relevancy_score?: number | null
          korea_signal_count?: number | null
          last_signal_scan?: string | null
          logo_url?: string | null
          market_cap?: number | null
          name?: string
          price?: number | null
          promoted_opportunity_id?: string | null
          scraped_at?: string | null
          source?: string | null
          source_url?: string | null
          status?: string | null
          symbol?: string | null
          telegram_url?: string | null
          twitter_url?: string | null
          updated_at?: string | null
          volume_24h?: number | null
          website_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "prospects_promoted_opportunity_id_fkey"
            columns: ["promoted_opportunity_id"]
            isOneToOne: false
            referencedRelation: "crm_opportunities"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_dm_templates: {
        Row: {
          attachments: Json | null
          content: string
          created_at: string | null
          created_by: string | null
          id: string
          is_active: boolean | null
          name: string
          stage: string
          sub_type: string | null
          tags: string[] | null
          updated_at: string | null
          variables: Json | null
        }
        Insert: {
          attachments?: Json | null
          content: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          stage: string
          sub_type?: string | null
          tags?: string[] | null
          updated_at?: string | null
          variables?: Json | null
        }
        Update: {
          attachments?: Json | null
          content?: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          stage?: string
          sub_type?: string | null
          tags?: string[] | null
          updated_at?: string | null
          variables?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "sales_dm_templates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      signals: {
        Row: {
          confidence: string | null
          created_at: string | null
          detected_by: string | null
          detected_date: string | null
          expires_at: string | null
          id: string
          is_active: boolean | null
          opportunity_id: string | null
          shelf_life_days: number | null
          signal_category: string | null
          signal_detail: string
          signal_type: string
          source_url: string | null
          tier: number | null
        }
        Insert: {
          confidence?: string | null
          created_at?: string | null
          detected_by?: string | null
          detected_date?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean | null
          opportunity_id?: string | null
          shelf_life_days?: number | null
          signal_category?: string | null
          signal_detail: string
          signal_type: string
          source_url?: string | null
          tier?: number | null
        }
        Update: {
          confidence?: string | null
          created_at?: string | null
          detected_by?: string | null
          detected_date?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean | null
          opportunity_id?: string | null
          shelf_life_days?: number | null
          signal_category?: string | null
          signal_detail?: string
          signal_type?: string
          source_url?: string | null
          tier?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "signals_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "crm_opportunities"
            referencedColumns: ["id"]
          },
        ]
      }
      sop_versions: {
        Row: {
          change_summary: string | null
          changed_at: string | null
          changed_by: string | null
          id: string
          snapshot: Json
          sop_id: string
          version_number: number
        }
        Insert: {
          change_summary?: string | null
          changed_at?: string | null
          changed_by?: string | null
          id?: string
          snapshot: Json
          sop_id: string
          version_number: number
        }
        Update: {
          change_summary?: string | null
          changed_at?: string | null
          changed_by?: string | null
          id?: string
          snapshot?: Json
          sop_id?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "sop_versions_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sop_versions_sop_id_fkey"
            columns: ["sop_id"]
            isOneToOne: false
            referencedRelation: "sops"
            referencedColumns: ["id"]
          },
        ]
      }
      sops: {
        Row: {
          automation_notes: string | null
          automation_review_completed: boolean | null
          automation_review_requested: boolean | null
          category: string | null
          clickup_link: string | null
          content: string | null
          created_at: string | null
          created_by: string | null
          documentation_link: string | null
          id: string
          name: string
          outcome: string | null
          owner_id: string | null
          status: string | null
          trigger: string | null
          updated_at: string | null
        }
        Insert: {
          automation_notes?: string | null
          automation_review_completed?: boolean | null
          automation_review_requested?: boolean | null
          category?: string | null
          clickup_link?: string | null
          content?: string | null
          created_at?: string | null
          created_by?: string | null
          documentation_link?: string | null
          id?: string
          name: string
          outcome?: string | null
          owner_id?: string | null
          status?: string | null
          trigger?: string | null
          updated_at?: string | null
        }
        Update: {
          automation_notes?: string | null
          automation_review_completed?: boolean | null
          automation_review_requested?: boolean | null
          category?: string | null
          clickup_link?: string | null
          content?: string | null
          created_at?: string | null
          created_by?: string | null
          documentation_link?: string | null
          id?: string
          name?: string
          outcome?: string | null
          owner_id?: string | null
          status?: string | null
          trigger?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sops_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sops_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      task_attachments: {
        Row: {
          created_at: string | null
          file_name: string
          file_size: number | null
          file_url: string
          id: string
          mime_type: string | null
          task_id: string
          uploaded_by: string | null
          uploaded_by_name: string | null
        }
        Insert: {
          created_at?: string | null
          file_name: string
          file_size?: number | null
          file_url: string
          id?: string
          mime_type?: string | null
          task_id: string
          uploaded_by?: string | null
          uploaded_by_name?: string | null
        }
        Update: {
          created_at?: string | null
          file_name?: string
          file_size?: number | null
          file_url?: string
          id?: string
          mime_type?: string | null
          task_id?: string
          uploaded_by?: string | null
          uploaded_by_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "task_attachments_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_attachments_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      task_automation_logs: {
        Row: {
          action_taken: string
          automation_id: string | null
          details: Json | null
          executed_at: string | null
          id: string
          task_id: string | null
        }
        Insert: {
          action_taken: string
          automation_id?: string | null
          details?: Json | null
          executed_at?: string | null
          id?: string
          task_id?: string | null
        }
        Update: {
          action_taken?: string
          automation_id?: string | null
          details?: Json | null
          executed_at?: string | null
          id?: string
          task_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "task_automation_logs_automation_id_fkey"
            columns: ["automation_id"]
            isOneToOne: false
            referencedRelation: "task_automations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_automation_logs_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_automations: {
        Row: {
          action_config: Json
          action_type: string
          created_at: string | null
          created_by: string | null
          id: string
          is_active: boolean
          name: string
          scope: string | null
          scope_value: string | null
          trigger_config: Json
          trigger_type: string
          updated_at: string | null
        }
        Insert: {
          action_config?: Json
          action_type: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_active?: boolean
          name: string
          scope?: string | null
          scope_value?: string | null
          trigger_config?: Json
          trigger_type: string
          updated_at?: string | null
        }
        Update: {
          action_config?: Json
          action_type?: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_active?: boolean
          name?: string
          scope?: string | null
          scope_value?: string | null
          trigger_config?: Json
          trigger_type?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "task_automations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      task_checklist_items: {
        Row: {
          created_at: string | null
          display_order: number
          id: string
          is_done: boolean
          task_id: string
          text: string
        }
        Insert: {
          created_at?: string | null
          display_order?: number
          id?: string
          is_done?: boolean
          task_id: string
          text: string
        }
        Update: {
          created_at?: string | null
          display_order?: number
          id?: string
          is_done?: boolean
          task_id?: string
          text?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_checklist_items_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_comments: {
        Row: {
          content: string
          created_at: string | null
          id: string
          parent_comment_id: string | null
          task_id: string
          updated_at: string | null
          user_id: string | null
          user_name: string | null
        }
        Insert: {
          content: string
          created_at?: string | null
          id?: string
          parent_comment_id?: string | null
          task_id: string
          updated_at?: string | null
          user_id?: string | null
          user_name?: string | null
        }
        Update: {
          content?: string
          created_at?: string | null
          id?: string
          parent_comment_id?: string | null
          task_id?: string
          updated_at?: string | null
          user_id?: string | null
          user_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "task_comments_parent_comment_id_fkey"
            columns: ["parent_comment_id"]
            isOneToOne: false
            referencedRelation: "task_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_comments_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_comments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      task_templates: {
        Row: {
          checklist_items: Json | null
          created_at: string | null
          created_by: string | null
          default_assigned_to: string | null
          default_client_id: string | null
          description: string | null
          frequency: string
          id: string
          name: string
          priority: string
          recurring_config: Json | null
          task_name_template: string
          task_type: string
          updated_at: string | null
        }
        Insert: {
          checklist_items?: Json | null
          created_at?: string | null
          created_by?: string | null
          default_assigned_to?: string | null
          default_client_id?: string | null
          description?: string | null
          frequency?: string
          id?: string
          name: string
          priority?: string
          recurring_config?: Json | null
          task_name_template: string
          task_type?: string
          updated_at?: string | null
        }
        Update: {
          checklist_items?: Json | null
          created_at?: string | null
          created_by?: string | null
          default_assigned_to?: string | null
          default_client_id?: string | null
          description?: string | null
          frequency?: string
          id?: string
          name?: string
          priority?: string
          recurring_config?: Json | null
          task_name_template?: string
          task_type?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "task_templates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_templates_default_assigned_to_fkey"
            columns: ["default_assigned_to"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_templates_default_client_id_fkey"
            columns: ["default_client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          assigned_to: string | null
          assigned_to_name: string | null
          client_id: string | null
          completed_at: string | null
          created_at: string | null
          created_by: string | null
          created_by_name: string | null
          description: string | null
          due_date: string | null
          frequency: string
          id: string
          latest_comment: string | null
          link: string | null
          parent_task_id: string | null
          priority: string
          recurring_config: Json | null
          sort_order: number
          status: string
          task_name: string
          task_type: string
          template_id: string | null
          updated_at: string | null
        }
        Insert: {
          assigned_to?: string | null
          assigned_to_name?: string | null
          client_id?: string | null
          completed_at?: string | null
          created_at?: string | null
          created_by?: string | null
          created_by_name?: string | null
          description?: string | null
          due_date?: string | null
          frequency: string
          id?: string
          latest_comment?: string | null
          link?: string | null
          parent_task_id?: string | null
          priority?: string
          recurring_config?: Json | null
          sort_order?: number
          status?: string
          task_name: string
          task_type: string
          template_id?: string | null
          updated_at?: string | null
        }
        Update: {
          assigned_to?: string | null
          assigned_to_name?: string | null
          client_id?: string | null
          completed_at?: string | null
          created_at?: string | null
          created_by?: string | null
          created_by_name?: string | null
          description?: string | null
          due_date?: string | null
          frequency?: string
          id?: string
          latest_comment?: string | null
          link?: string | null
          parent_task_id?: string | null
          priority?: string
          recurring_config?: Json | null
          sort_order?: number
          status?: string
          task_name?: string
          task_type?: string
          template_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tasks_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_parent_task_id_fkey"
            columns: ["parent_task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      telegram_chats: {
        Row: {
          chat_id: string
          chat_type: string | null
          created_at: string | null
          first_seen_at: string | null
          id: string
          last_message_at: string | null
          master_kol_id: string | null
          member_count: number | null
          message_count: number | null
          opportunity_id: string | null
          title: string | null
          updated_at: string | null
        }
        Insert: {
          chat_id: string
          chat_type?: string | null
          created_at?: string | null
          first_seen_at?: string | null
          id?: string
          last_message_at?: string | null
          master_kol_id?: string | null
          member_count?: number | null
          message_count?: number | null
          opportunity_id?: string | null
          title?: string | null
          updated_at?: string | null
        }
        Update: {
          chat_id?: string
          chat_type?: string | null
          created_at?: string | null
          first_seen_at?: string | null
          id?: string
          last_message_at?: string | null
          master_kol_id?: string | null
          member_count?: number | null
          message_count?: number | null
          opportunity_id?: string | null
          title?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "telegram_chats_master_kol_id_fkey"
            columns: ["master_kol_id"]
            isOneToOne: false
            referencedRelation: "master_kols"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "telegram_chats_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "crm_opportunities"
            referencedColumns: ["id"]
          },
        ]
      }
      telegram_commands: {
        Row: {
          command: string
          created_at: string | null
          description: string | null
          id: string
          image_url: string | null
          is_active: boolean | null
          response: string
          team_only: boolean | null
          updated_at: string | null
        }
        Insert: {
          command: string
          created_at?: string | null
          description?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          response: string
          team_only?: boolean | null
          updated_at?: string | null
        }
        Update: {
          command?: string
          created_at?: string | null
          description?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          response?: string
          team_only?: boolean | null
          updated_at?: string | null
        }
        Relationships: []
      }
      telegram_messages: {
        Row: {
          chat_id: string
          created_at: string | null
          from_user_id: string | null
          from_user_name: string | null
          from_username: string | null
          id: string
          message_date: string
          message_id: string
          text: string | null
        }
        Insert: {
          chat_id: string
          created_at?: string | null
          from_user_id?: string | null
          from_user_name?: string | null
          from_username?: string | null
          id?: string
          message_date: string
          message_id: string
          text?: string | null
        }
        Update: {
          chat_id?: string
          created_at?: string | null
          from_user_id?: string | null
          from_user_name?: string | null
          from_username?: string | null
          id?: string
          message_date?: string
          message_id?: string
          text?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "telegram_messages_chat_id_fkey"
            columns: ["chat_id"]
            isOneToOne: false
            referencedRelation: "telegram_chats"
            referencedColumns: ["chat_id"]
          },
        ]
      }
      template_usage_analytics: {
        Row: {
          average_rating: number | null
          created_at: string | null
          edited_count: number | null
          generated_count: number | null
          id: string
          period_end: string
          period_start: string
          sent_count: number | null
          template_id: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          average_rating?: number | null
          created_at?: string | null
          edited_count?: number | null
          generated_count?: number | null
          id?: string
          period_end: string
          period_start: string
          sent_count?: number | null
          template_id?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          average_rating?: number | null
          created_at?: string | null
          edited_count?: number | null
          generated_count?: number | null
          id?: string
          period_end?: string
          period_start?: string
          sent_count?: number | null
          template_id?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "template_usage_analytics_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "message_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "template_usage_analytics_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      tg_mentions: {
        Row: {
          channel_id: string | null
          client_id: string
          created_at: string | null
          id: string
          matched_keyword: string | null
          message_date: string
          message_text: string | null
          sentiment: string | null
          translated_text: string | null
        }
        Insert: {
          channel_id?: string | null
          client_id: string
          created_at?: string | null
          id?: string
          matched_keyword?: string | null
          message_date?: string
          message_text?: string | null
          sentiment?: string | null
          translated_text?: string | null
        }
        Update: {
          channel_id?: string | null
          client_id?: string
          created_at?: string | null
          id?: string
          matched_keyword?: string | null
          message_date?: string
          message_text?: string | null
          sentiment?: string | null
          translated_text?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tg_mentions_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "tg_monitored_channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tg_mentions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      tg_monitored_channels: {
        Row: {
          channel_name: string
          channel_tg_id: string | null
          channel_username: string | null
          created_at: string | null
          id: string
          is_active: boolean | null
          language: string | null
        }
        Insert: {
          channel_name: string
          channel_tg_id?: string | null
          channel_username?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          language?: string | null
        }
        Update: {
          channel_name?: string
          channel_tg_id?: string | null
          channel_username?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          language?: string | null
        }
        Relationships: []
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
      calculate_edit_similarity: {
        Args: { edited_text: string; original_text: string }
        Returns: number
      }
      calculate_temperature_score: { Args: { opp_id: string }; Returns: number }
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
      get_user_role: { Args: never; Returns: string }
      increment_template_usage: {
        Args: { template_uuid: string }
        Returns: undefined
      }
      increment_usage_count: { Args: never; Returns: number }
      is_admin_or_super_admin: { Args: never; Returns: boolean }
      match_campaigns: {
        Args: {
          match_count?: number
          match_threshold?: number
          query_embedding: string
        }
        Returns: {
          campaign_id: string
          metadata: Json
          similarity: number
        }[]
      }
      match_clients: {
        Args: {
          match_count?: number
          match_threshold?: number
          query_embedding: string
        }
        Returns: {
          client_id: string
          metadata: Json
          similarity: number
        }[]
      }
      match_kols: {
        Args: {
          match_count?: number
          match_threshold?: number
          query_embedding: string
        }
        Returns: {
          kol_id: string
          metadata: Json
          similarity: number
        }[]
      }
      recalculate_all_temperature_scores: { Args: never; Returns: number }
      search_similar_messages: {
        Args: {
          match_count?: number
          match_threshold?: number
          message_type_filter?: string
          query_embedding: string
        }
        Returns: {
          content: string
          id: string
          message_type: string
          similarity: number
          user_id: string
          user_rating: number
          was_sent: boolean
        }[]
      }
    }
    Enums: {
      field_type:
        | "text"
        | "textarea"
        | "email"
        | "number"
        | "select"
        | "radio"
        | "checkbox"
        | "date"
        | "section"
        | "description"
        | "link"
      form_status: "draft" | "published" | "closed"
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
    Enums: {
      field_type: [
        "text",
        "textarea",
        "email",
        "number",
        "select",
        "radio",
        "checkbox",
        "date",
        "section",
        "description",
        "link",
      ],
      form_status: ["draft", "published", "closed"],
    },
  },
} as const
