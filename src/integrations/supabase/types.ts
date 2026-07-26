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
    PostgrestVersion: "14.5"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      ai_audit_queue: {
        Row: {
          attempts: number
          audit_id: string
          created_at: string
          engines: string[]
          id: string
          question: string
          result: Json | null
          run_id: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          attempts?: number
          audit_id: string
          created_at?: string
          engines?: string[]
          id?: string
          question: string
          result?: Json | null
          run_id: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          attempts?: number
          audit_id?: string
          created_at?: string
          engines?: string[]
          id?: string
          question?: string
          result?: Json | null
          run_id?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_audit_queue_audit_id_fkey"
            columns: ["audit_id"]
            isOneToOne: false
            referencedRelation: "ai_audits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_audit_queue_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "ai_audit_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_audit_runs: {
        Row: {
          actor_cost_usd: number | null
          audit_id: string
          created_at: string
          id: string
          mention_rate: number | null
          results: Json
          run_number: number
          status: string
          user_id: string
        }
        Insert: {
          actor_cost_usd?: number | null
          audit_id: string
          created_at?: string
          id?: string
          mention_rate?: number | null
          results?: Json
          run_number?: number
          status?: string
          user_id: string
        }
        Update: {
          actor_cost_usd?: number | null
          audit_id?: string
          created_at?: string
          id?: string
          mention_rate?: number | null
          results?: Json
          run_number?: number
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_audit_runs_audit_id_fkey"
            columns: ["audit_id"]
            isOneToOne: false
            referencedRelation: "ai_audits"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_audits: {
        Row: {
          baseline: Json | null
          baseline_completed_at: string | null
          baseline_error: string | null
          baseline_last_attempt_at: string | null
          baseline_target_runs: number | null
          business_address: string | null
          business_email: string | null
          business_name: string
          business_phone: string | null
          business_scope: string | null
          business_type: string | null
          client_links: Json
          country: string | null
          created_at: string
          credentials: string | null
          first_opened_at: string | null
          has_website: boolean
          id: string
          lead_id: string | null
          location_text: string | null
          open_count: number
          specialism: string | null
          updated_at: string
          user_id: string
          website: string | null
        }
        Insert: {
          baseline?: Json | null
          baseline_completed_at?: string | null
          baseline_error?: string | null
          baseline_last_attempt_at?: string | null
          baseline_target_runs?: number | null
          business_address?: string | null
          business_email?: string | null
          business_name: string
          business_phone?: string | null
          business_scope?: string | null
          business_type?: string | null
          client_links?: Json
          country?: string | null
          created_at?: string
          credentials?: string | null
          first_opened_at?: string | null
          has_website?: boolean
          id?: string
          lead_id?: string | null
          location_text?: string | null
          open_count?: number
          specialism?: string | null
          updated_at?: string
          user_id: string
          website?: string | null
        }
        Update: {
          baseline?: Json | null
          baseline_completed_at?: string | null
          baseline_error?: string | null
          baseline_last_attempt_at?: string | null
          baseline_target_runs?: number | null
          business_address?: string | null
          business_email?: string | null
          business_name?: string
          business_phone?: string | null
          business_scope?: string | null
          business_type?: string | null
          client_links?: Json
          country?: string | null
          created_at?: string
          credentials?: string | null
          first_opened_at?: string | null
          has_website?: boolean
          id?: string
          lead_id?: string | null
          location_text?: string | null
          open_count?: number
          specialism?: string | null
          updated_at?: string
          user_id?: string
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_audits_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "outreach_leads"
            referencedColumns: ["id"]
          },
        ]
      }
      api_usage_log: {
        Row: {
          api_type: string
          cache_hit: boolean
          calls_made: number
          created_at: string
          estimated_cost_usd: number | null
          function_name: string
          id: string
          search_session_id: string | null
          trigger_source: string | null
          user_id: string | null
        }
        Insert: {
          api_type: string
          cache_hit?: boolean
          calls_made?: number
          created_at?: string
          estimated_cost_usd?: number | null
          function_name: string
          id?: string
          search_session_id?: string | null
          trigger_source?: string | null
          user_id?: string | null
        }
        Update: {
          api_type?: string
          cache_hit?: boolean
          calls_made?: number
          created_at?: string
          estimated_cost_usd?: number | null
          function_name?: string
          id?: string
          search_session_id?: string | null
          trigger_source?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      booking_staff: {
        Row: {
          avatar_url: string | null
          created_at: string
          id: string
          is_active: boolean
          name: string
          site_id: string
          sort_order: number
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          site_id: string
          sort_order?: number
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          site_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "booking_staff_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "generated_sites"
            referencedColumns: ["id"]
          },
        ]
      }
      bookings: {
        Row: {
          created_at: string
          customer_name: string
          customer_phone: string
          ends_at: string
          id: string
          notes: string | null
          reminder_opt_in: boolean
          reminder_sent_at: string | null
          service_name: string
          site_id: string
          staff_id: string
          starts_at: string
          status: string
        }
        Insert: {
          created_at?: string
          customer_name: string
          customer_phone: string
          ends_at: string
          id?: string
          notes?: string | null
          reminder_opt_in?: boolean
          reminder_sent_at?: string | null
          service_name: string
          site_id: string
          staff_id: string
          starts_at: string
          status?: string
        }
        Update: {
          created_at?: string
          customer_name?: string
          customer_phone?: string
          ends_at?: string
          id?: string
          notes?: string | null
          reminder_opt_in?: boolean
          reminder_sent_at?: string | null
          service_name?: string
          site_id?: string
          staff_id?: string
          starts_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "bookings_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "generated_sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "booking_staff"
            referencedColumns: ["id"]
          },
        ]
      }
      bulk_jobs: {
        Row: {
          created_at: string
          done_count: number
          error: string | null
          failed_count: number
          id: string
          items: Json
          job_type: string
          locked_until: string | null
          params: Json | null
          skipped_count: number
          status: string
          total: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          done_count?: number
          error?: string | null
          failed_count?: number
          id?: string
          items: Json
          job_type: string
          locked_until?: string | null
          params?: Json | null
          skipped_count?: number
          status?: string
          total: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          done_count?: number
          error?: string | null
          failed_count?: number
          id?: string
          items?: Json
          job_type?: string
          locked_until?: string | null
          params?: Json | null
          skipped_count?: number
          status?: string
          total?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      business_reports: {
        Row: {
          audit_id: string | null
          business_name: string
          created_at: string
          html_content: string | null
          id: string
          json_ld: string | null
          lead_id: string | null
          meta_description: string | null
          report_type: string
          slug: string
          status: string
          title: string | null
          updated_at: string
        }
        Insert: {
          audit_id?: string | null
          business_name: string
          created_at?: string
          html_content?: string | null
          id?: string
          json_ld?: string | null
          lead_id?: string | null
          meta_description?: string | null
          report_type?: string
          slug: string
          status?: string
          title?: string | null
          updated_at?: string
        }
        Update: {
          audit_id?: string | null
          business_name?: string
          created_at?: string
          html_content?: string | null
          id?: string
          json_ld?: string | null
          lead_id?: string | null
          meta_description?: string | null
          report_type?: string
          slug?: string
          status?: string
          title?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      campaigns: {
        Row: {
          campaign_type: string
          created_at: string
          created_by: string
          default_sale_type: string | null
          default_template: string | null
          description: string | null
          id: string
          method: string | null
          name: string
        }
        Insert: {
          campaign_type?: string
          created_at?: string
          created_by: string
          default_sale_type?: string | null
          default_template?: string | null
          description?: string | null
          id?: string
          method?: string | null
          name: string
        }
        Update: {
          campaign_type?: string
          created_at?: string
          created_by?: string
          default_sale_type?: string | null
          default_template?: string | null
          description?: string | null
          id?: string
          method?: string | null
          name?: string
        }
        Relationships: []
      }
      checked_businesses: {
        Row: {
          business_name: string
          checked_at: string
          google_maps_url: string | null
          id: string
          user_id: string
        }
        Insert: {
          business_name: string
          checked_at?: string
          google_maps_url?: string | null
          id?: string
          user_id: string
        }
        Update: {
          business_name?: string
          checked_at?: string
          google_maps_url?: string | null
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      claim_tokens: {
        Row: {
          created_at: string
          created_by: string | null
          expires_at: string
          id: string
          site_id: string
          token_hash: string
          used_at: string | null
          used_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          expires_at: string
          id?: string
          site_id: string
          token_hash: string
          used_at?: string | null
          used_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          expires_at?: string
          id?: string
          site_id?: string
          token_hash?: string
          used_at?: string | null
          used_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "claim_tokens_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "generated_sites"
            referencedColumns: ["id"]
          },
        ]
      }
      client_error_reports: {
        Row: {
          context: Json
          created_at: string
          error_id: string
          id: string
          user_id: string | null
        }
        Insert: {
          context?: Json
          created_at?: string
          error_id: string
          id?: string
          user_id?: string | null
        }
        Update: {
          context?: Json
          created_at?: string
          error_id?: string
          id?: string
          user_id?: string | null
        }
        Relationships: []
      }
      contact_suppressions: {
        Row: {
          created_at: string
          id: string
          phone_e164: string
          reason: string | null
          source: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          phone_e164: string
          reason?: string | null
          source?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          phone_e164?: string
          reason?: string | null
          source?: string | null
        }
        Relationships: []
      }
      copied_phones: {
        Row: {
          copied_at: string
          id: string
          lead_id: string
          user_id: string
        }
        Insert: {
          copied_at?: string
          id?: string
          lead_id: string
          user_id: string
        }
        Update: {
          copied_at?: string
          id?: string
          lead_id?: string
          user_id?: string
        }
        Relationships: []
      }
      directory_businesses: {
        Row: {
          address: string | null
          area: string
          category: string | null
          city: string | null
          created_at: string
          description: string | null
          description_generated_at: string | null
          id: string
          is_client: boolean
          lead_id: string | null
          name: string
          niche: string
          phone: string | null
          place_id: string | null
          postal_code: string | null
          rating: number | null
          review_count: number | null
          scraped_at: string
          source: string | null
          website: string | null
        }
        Insert: {
          address?: string | null
          area: string
          category?: string | null
          city?: string | null
          created_at?: string
          description?: string | null
          description_generated_at?: string | null
          id?: string
          is_client?: boolean
          lead_id?: string | null
          name: string
          niche: string
          phone?: string | null
          place_id?: string | null
          postal_code?: string | null
          rating?: number | null
          review_count?: number | null
          scraped_at?: string
          source?: string | null
          website?: string | null
        }
        Update: {
          address?: string | null
          area?: string
          category?: string | null
          city?: string | null
          created_at?: string
          description?: string | null
          description_generated_at?: string | null
          id?: string
          is_client?: boolean
          lead_id?: string | null
          name?: string
          niche?: string
          phone?: string | null
          place_id?: string | null
          postal_code?: string | null
          rating?: number | null
          review_count?: number | null
          scraped_at?: string
          source?: string | null
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "directory_businesses_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "outreach_leads"
            referencedColumns: ["id"]
          },
        ]
      }
      enrichment_cache: {
        Row: {
          cache_key: string
          created_at: string
          enrichment_type: string
          expires_at: string | null
          id: string
          result: Json | null
        }
        Insert: {
          cache_key: string
          created_at?: string
          enrichment_type: string
          expires_at?: string | null
          id?: string
          result?: Json | null
        }
        Update: {
          cache_key?: string
          created_at?: string
          enrichment_type?: string
          expires_at?: string | null
          id?: string
          result?: Json | null
        }
        Relationships: []
      }
      enrichment_usage: {
        Row: {
          cost_usd: number
          created_at: string
          enrichment_type: string | null
          id: string
          user_id: string | null
        }
        Insert: {
          cost_usd?: number
          created_at?: string
          enrichment_type?: string | null
          id?: string
          user_id?: string | null
        }
        Update: {
          cost_usd?: number
          created_at?: string
          enrichment_type?: string | null
          id?: string
          user_id?: string | null
        }
        Relationships: []
      }
      generated_sites: {
        Row: {
          addon_interest_at: string | null
          booking_only: boolean
          claimed_at: string | null
          content: Json
          created_at: string
          first_opened_at: string | null
          id: string
          is_paid: boolean
          lead_id: string | null
          open_count: number
          owner_id: string | null
          replied_at: string | null
          segment: string | null
          sent_at: string | null
          sent_message: string | null
          sent_template: string | null
          share_token: string | null
          site_name: string
          status: Database["public"]["Enums"]["site_status"]
          subdomain: string | null
          template: string
          updated_at: string
        }
        Insert: {
          addon_interest_at?: string | null
          booking_only?: boolean
          claimed_at?: string | null
          content?: Json
          created_at?: string
          first_opened_at?: string | null
          id?: string
          is_paid?: boolean
          lead_id?: string | null
          open_count?: number
          owner_id?: string | null
          replied_at?: string | null
          segment?: string | null
          sent_at?: string | null
          sent_message?: string | null
          sent_template?: string | null
          share_token?: string | null
          site_name: string
          status?: Database["public"]["Enums"]["site_status"]
          subdomain?: string | null
          template?: string
          updated_at?: string
        }
        Update: {
          addon_interest_at?: string | null
          booking_only?: boolean
          claimed_at?: string | null
          content?: Json
          created_at?: string
          first_opened_at?: string | null
          id?: string
          is_paid?: boolean
          lead_id?: string | null
          open_count?: number
          owner_id?: string | null
          replied_at?: string | null
          segment?: string | null
          sent_at?: string | null
          sent_message?: string | null
          sent_template?: string | null
          share_token?: string | null
          site_name?: string
          status?: Database["public"]["Enums"]["site_status"]
          subdomain?: string | null
          template?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "generated_sites_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "outreach_leads"
            referencedColumns: ["id"]
          },
        ]
      }
      geocode_cache: {
        Row: {
          created_at: string
          lat: number
          lng: number
          location_key: string
          raw_location: string
          viewport: Json | null
        }
        Insert: {
          created_at?: string
          lat: number
          lng: number
          location_key: string
          raw_location: string
          viewport?: Json | null
        }
        Update: {
          created_at?: string
          lat?: number
          lng?: number
          location_key?: string
          raw_location?: string
          viewport?: Json | null
        }
        Relationships: []
      }
      hosting_clients: {
        Row: {
          created_at: string
          domain: string
          hosting_status: Database["public"]["Enums"]["hosting_status"]
          id: string
          lead_id: string | null
          notes: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          domain: string
          hosting_status?: Database["public"]["Enums"]["hosting_status"]
          id?: string
          lead_id?: string | null
          notes?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          domain?: string
          hosting_status?: Database["public"]["Enums"]["hosting_status"]
          id?: string
          lead_id?: string | null
          notes?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "hosting_clients_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "outreach_leads"
            referencedColumns: ["id"]
          },
        ]
      }
      instantly_poll_state: {
        Row: {
          id: number
          last_polled_at: string
        }
        Insert: {
          id?: number
          last_polled_at?: string
        }
        Update: {
          id?: number
          last_polled_at?: string
        }
        Relationships: []
      }
      lead_claims: {
        Row: {
          business_name: string
          campaign_id: string | null
          claimed_at: string
          contacted: boolean
          google_maps_url: string | null
          id: string
          place_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          business_name: string
          campaign_id?: string | null
          claimed_at?: string
          contacted?: boolean
          google_maps_url?: string | null
          id?: string
          place_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          business_name?: string
          campaign_id?: string | null
          claimed_at?: string
          contacted?: boolean
          google_maps_url?: string | null
          id?: string
          place_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_claims_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_contacts: {
        Row: {
          contacted_at: string
          created_at: string
          id: string
          lead_id: string
          lead_name: string
          notes: string | null
          outcome: Database["public"]["Enums"]["call_outcome"]
          user_id: string
        }
        Insert: {
          contacted_at?: string
          created_at?: string
          id?: string
          lead_id: string
          lead_name: string
          notes?: string | null
          outcome: Database["public"]["Enums"]["call_outcome"]
          user_id: string
        }
        Update: {
          contacted_at?: string
          created_at?: string
          id?: string
          lead_id?: string
          lead_name?: string
          notes?: string | null
          outcome?: Database["public"]["Enums"]["call_outcome"]
          user_id?: string
        }
        Relationships: []
      }
      lead_notes: {
        Row: {
          body: string
          business_name: string
          created_at: string
          google_maps_url: string | null
          id: string
          place_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          body: string
          business_name: string
          created_at?: string
          google_maps_url?: string | null
          id?: string
          place_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          body?: string
          business_name?: string
          created_at?: string
          google_maps_url?: string | null
          id?: string
          place_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      onboarding_responses: {
        Row: {
          accreditations: string | null
          areas_wanted: string | null
          audit_id: string | null
          business_name: string | null
          confirmed_location: string | null
          created_at: string
          gbp_consent: string | null
          gbp_manager_email: string | null
          id: string
          incomplete: boolean
          lead_id: string | null
          services: string | null
          standout: string | null
          status: string
          updated_at: string
        }
        Insert: {
          accreditations?: string | null
          areas_wanted?: string | null
          audit_id?: string | null
          business_name?: string | null
          confirmed_location?: string | null
          created_at?: string
          gbp_consent?: string | null
          gbp_manager_email?: string | null
          id?: string
          incomplete?: boolean
          lead_id?: string | null
          services?: string | null
          standout?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          accreditations?: string | null
          areas_wanted?: string | null
          audit_id?: string | null
          business_name?: string | null
          confirmed_location?: string | null
          created_at?: string
          gbp_consent?: string | null
          gbp_manager_email?: string | null
          id?: string
          incomplete?: boolean
          lead_id?: string | null
          services?: string | null
          standout?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "onboarding_responses_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "outreach_leads"
            referencedColumns: ["id"]
          },
        ]
      }
      outreach_activities: {
        Row: {
          activity_type: string
          created_at: string
          description: string
          id: string
          lead_id: string
          user_id: string
        }
        Insert: {
          activity_type: string
          created_at?: string
          description: string
          id?: string
          lead_id: string
          user_id: string
        }
        Update: {
          activity_type?: string
          created_at?: string
          description?: string
          id?: string
          lead_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "outreach_activities_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "outreach_leads"
            referencedColumns: ["id"]
          },
        ]
      }
      outreach_events: {
        Row: {
          channel: string
          created_at: string
          event_type: string
          id: string
          lead_id: string
          user_id: string
        }
        Insert: {
          channel: string
          created_at?: string
          event_type: string
          id?: string
          lead_id: string
          user_id: string
        }
        Update: {
          channel?: string
          created_at?: string
          event_type?: string
          id?: string
          lead_id?: string
          user_id?: string
        }
        Relationships: []
      }
      outreach_history: {
        Row: {
          added_at: string
          business_name: string
          country: string | null
          google_maps_url: string | null
          id: string
          phone: string | null
          user_id: string
        }
        Insert: {
          added_at?: string
          business_name: string
          country?: string | null
          google_maps_url?: string | null
          id?: string
          phone?: string | null
          user_id: string
        }
        Update: {
          added_at?: string
          business_name?: string
          country?: string | null
          google_maps_url?: string | null
          id?: string
          phone?: string | null
          user_id?: string
        }
        Relationships: []
      }
      outreach_leads: {
        Row: {
          address: string | null
          amount_paid: number | null
          business_name: string
          call_booked_at: string | null
          campaign_id: string | null
          category: string | null
          checkin_notes: string | null
          confirmed_services: Json | null
          contact_method: string | null
          contact_name: string | null
          country: string | null
          created_at: string
          delivery_notes: string | null
          email: string | null
          email_last_checked_at: string | null
          email_method: string | null
          email_status: string | null
          enrichment_source: string | null
          facebook_confidence: number | null
          facebook_last_checked_at: string | null
          facebook_method: string | null
          facebook_status: string | null
          facebook_url: string | null
          google_maps_url: string | null
          id: string
          image_url: string | null
          instagram_last_checked_at: string | null
          instagram_method: string | null
          instagram_status: string | null
          instagram_url: string | null
          instantly_campaign_id: string | null
          instantly_lead_id: string | null
          instantly_pushed_at: string | null
          is_archived: boolean
          is_potential_work: boolean
          last_outreach_attempt_at: string | null
          line_type: string | null
          line_type_checked_at: string | null
          list_type: string
          next_action: Database["public"]["Enums"]["next_action_type"] | null
          next_action_date: string | null
          next_checkin_date: string | null
          notes: string | null
          outreach_attempts: number
          paid_for: string | null
          payment_date: string | null
          phone: string | null
          place_id: string | null
          potential_revenue: number | null
          previous_status: string | null
          project_duration: string | null
          project_overview: string | null
          project_status: string | null
          project_value: number | null
          queued_at: string | null
          sale_type: string | null
          search_keyword: string | null
          search_location: string | null
          services_included: string[] | null
          site_sent_at: string | null
          sms_attempts: number
          sms_delivery_status: string | null
          sms_message_sid: string | null
          sms_queued_at: string | null
          sms_sent_at: string | null
          status: string
          updated_at: string
          user_id: string
          website: string | null
          whatsapp_attempts: number
          whatsapp_checked_at: string | null
          whatsapp_delivery_status: string | null
          whatsapp_ever_delivered: boolean
          whatsapp_message_id: string | null
          whatsapp_sent_at: string | null
          whatsapp_status: string | null
          whatsapp_template: string | null
        }
        Insert: {
          address?: string | null
          amount_paid?: number | null
          business_name: string
          call_booked_at?: string | null
          campaign_id?: string | null
          category?: string | null
          checkin_notes?: string | null
          confirmed_services?: Json | null
          contact_method?: string | null
          contact_name?: string | null
          country?: string | null
          created_at?: string
          delivery_notes?: string | null
          email?: string | null
          email_last_checked_at?: string | null
          email_method?: string | null
          email_status?: string | null
          enrichment_source?: string | null
          facebook_confidence?: number | null
          facebook_last_checked_at?: string | null
          facebook_method?: string | null
          facebook_status?: string | null
          facebook_url?: string | null
          google_maps_url?: string | null
          id?: string
          image_url?: string | null
          instagram_last_checked_at?: string | null
          instagram_method?: string | null
          instagram_status?: string | null
          instagram_url?: string | null
          instantly_campaign_id?: string | null
          instantly_lead_id?: string | null
          instantly_pushed_at?: string | null
          is_archived?: boolean
          is_potential_work?: boolean
          last_outreach_attempt_at?: string | null
          line_type?: string | null
          line_type_checked_at?: string | null
          list_type?: string
          next_action?: Database["public"]["Enums"]["next_action_type"] | null
          next_action_date?: string | null
          next_checkin_date?: string | null
          notes?: string | null
          outreach_attempts?: number
          paid_for?: string | null
          payment_date?: string | null
          phone?: string | null
          place_id?: string | null
          potential_revenue?: number | null
          previous_status?: string | null
          project_duration?: string | null
          project_overview?: string | null
          project_status?: string | null
          project_value?: number | null
          queued_at?: string | null
          sale_type?: string | null
          search_keyword?: string | null
          search_location?: string | null
          services_included?: string[] | null
          site_sent_at?: string | null
          sms_attempts?: number
          sms_delivery_status?: string | null
          sms_message_sid?: string | null
          sms_queued_at?: string | null
          sms_sent_at?: string | null
          status?: string
          updated_at?: string
          user_id: string
          website?: string | null
          whatsapp_attempts?: number
          whatsapp_checked_at?: string | null
          whatsapp_delivery_status?: string | null
          whatsapp_ever_delivered?: boolean
          whatsapp_message_id?: string | null
          whatsapp_sent_at?: string | null
          whatsapp_status?: string | null
          whatsapp_template?: string | null
        }
        Update: {
          address?: string | null
          amount_paid?: number | null
          business_name?: string
          call_booked_at?: string | null
          campaign_id?: string | null
          category?: string | null
          checkin_notes?: string | null
          confirmed_services?: Json | null
          contact_method?: string | null
          contact_name?: string | null
          country?: string | null
          created_at?: string
          delivery_notes?: string | null
          email?: string | null
          email_last_checked_at?: string | null
          email_method?: string | null
          email_status?: string | null
          enrichment_source?: string | null
          facebook_confidence?: number | null
          facebook_last_checked_at?: string | null
          facebook_method?: string | null
          facebook_status?: string | null
          facebook_url?: string | null
          google_maps_url?: string | null
          id?: string
          image_url?: string | null
          instagram_last_checked_at?: string | null
          instagram_method?: string | null
          instagram_status?: string | null
          instagram_url?: string | null
          instantly_campaign_id?: string | null
          instantly_lead_id?: string | null
          instantly_pushed_at?: string | null
          is_archived?: boolean
          is_potential_work?: boolean
          last_outreach_attempt_at?: string | null
          line_type?: string | null
          line_type_checked_at?: string | null
          list_type?: string
          next_action?: Database["public"]["Enums"]["next_action_type"] | null
          next_action_date?: string | null
          next_checkin_date?: string | null
          notes?: string | null
          outreach_attempts?: number
          paid_for?: string | null
          payment_date?: string | null
          phone?: string | null
          place_id?: string | null
          potential_revenue?: number | null
          previous_status?: string | null
          project_duration?: string | null
          project_overview?: string | null
          project_status?: string | null
          project_value?: number | null
          queued_at?: string | null
          sale_type?: string | null
          search_keyword?: string | null
          search_location?: string | null
          services_included?: string[] | null
          site_sent_at?: string | null
          sms_attempts?: number
          sms_delivery_status?: string | null
          sms_message_sid?: string | null
          sms_queued_at?: string | null
          sms_sent_at?: string | null
          status?: string
          updated_at?: string
          user_id?: string
          website?: string | null
          whatsapp_attempts?: number
          whatsapp_checked_at?: string | null
          whatsapp_delivery_status?: string | null
          whatsapp_ever_delivered?: boolean
          whatsapp_message_id?: string | null
          whatsapp_sent_at?: string | null
          whatsapp_status?: string | null
          whatsapp_template?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "outreach_leads_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      personal_actions: {
        Row: {
          completed: boolean
          created_at: string
          due_date: string | null
          id: string
          text: string
          user_id: string
        }
        Insert: {
          completed?: boolean
          created_at?: string
          due_date?: string | null
          id?: string
          text: string
          user_id: string
        }
        Update: {
          completed?: boolean
          created_at?: string
          due_date?: string | null
          id?: string
          text?: string
          user_id?: string
        }
        Relationships: []
      }
      phone_cache: {
        Row: {
          address: string | null
          category: string | null
          created_at: string
          google_maps_uri: string | null
          phone: string | null
          place_id: string
        }
        Insert: {
          address?: string | null
          category?: string | null
          created_at?: string
          google_maps_uri?: string | null
          phone?: string | null
          place_id: string
        }
        Update: {
          address?: string | null
          category?: string | null
          created_at?: string
          google_maps_uri?: string | null
          phone?: string | null
          place_id?: string
        }
        Relationships: []
      }
      preview_links: {
        Row: {
          created_at: string
          expires_at: string | null
          id: string
          is_active: boolean
          lead_id: string | null
          updated_at: string
          url: string
        }
        Insert: {
          created_at?: string
          expires_at?: string | null
          id?: string
          is_active?: boolean
          lead_id?: string | null
          updated_at?: string
          url: string
        }
        Update: {
          created_at?: string
          expires_at?: string | null
          id?: string
          is_active?: boolean
          lead_id?: string | null
          updated_at?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "preview_links_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "outreach_leads"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      search_cache: {
        Row: {
          cache_key: string
          created_at: string
          id: string
          results: Json
        }
        Insert: {
          cache_key: string
          created_at?: string
          id?: string
          results: Json
        }
        Update: {
          cache_key?: string
          created_at?: string
          id?: string
          results?: Json
        }
        Relationships: []
      }
      search_history: {
        Row: {
          id: string
          keyword: string
          location: string
          no_website_count: number
          radius: number
          results_count: number
          searched_at: string
          user_id: string
        }
        Insert: {
          id?: string
          keyword: string
          location: string
          no_website_count?: number
          radius: number
          results_count?: number
          searched_at?: string
          user_id: string
        }
        Update: {
          id?: string
          keyword?: string
          location?: string
          no_website_count?: number
          radius?: number
          results_count?: number
          searched_at?: string
          user_id?: string
        }
        Relationships: []
      }
      site_events: {
        Row: {
          created_at: string
          event_type: string
          id: string
          meta: Json | null
          site_id: string
        }
        Insert: {
          created_at?: string
          event_type: string
          id?: string
          meta?: Json | null
          site_id: string
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: string
          meta?: Json | null
          site_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "site_events_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "generated_sites"
            referencedColumns: ["id"]
          },
        ]
      }
      sms_outreach_state: {
        Row: {
          id: number
          next_send_at: string | null
          paused: boolean
          updated_at: string
        }
        Insert: {
          id?: number
          next_send_at?: string | null
          paused?: boolean
          updated_at?: string
        }
        Update: {
          id?: number
          next_send_at?: string | null
          paused?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      sms_sends: {
        Row: {
          body: string | null
          business_name: string | null
          claim_url: string | null
          created_at: string
          delivery_status: string | null
          error: string | null
          error_code: string | null
          id: string
          lead_id: string | null
          message_sid: string | null
          phone: string | null
          segments: number | null
          template: string | null
          test_mode: boolean
          user_id: string | null
        }
        Insert: {
          body?: string | null
          business_name?: string | null
          claim_url?: string | null
          created_at?: string
          delivery_status?: string | null
          error?: string | null
          error_code?: string | null
          id?: string
          lead_id?: string | null
          message_sid?: string | null
          phone?: string | null
          segments?: number | null
          template?: string | null
          test_mode?: boolean
          user_id?: string | null
        }
        Update: {
          body?: string | null
          business_name?: string | null
          claim_url?: string | null
          created_at?: string
          delivery_status?: string | null
          error?: string | null
          error_code?: string | null
          id?: string
          lead_id?: string | null
          message_sid?: string | null
          phone?: string | null
          segments?: number | null
          template?: string | null
          test_mode?: boolean
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sms_sends_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "outreach_leads"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_working_hours: {
        Row: {
          created_at: string
          end_time: string
          id: string
          staff_id: string
          start_time: string
          weekday: number
        }
        Insert: {
          created_at?: string
          end_time: string
          id?: string
          staff_id: string
          start_time: string
          weekday: number
        }
        Update: {
          created_at?: string
          end_time?: string
          id?: string
          staff_id?: string
          start_time?: string
          weekday?: number
        }
        Relationships: [
          {
            foreignKeyName: "staff_working_hours_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "booking_staff"
            referencedColumns: ["id"]
          },
        ]
      }
      team_feedback: {
        Row: {
          author_email: string | null
          author_name: string | null
          created_at: string
          id: string
          message: string
          user_id: string
        }
        Insert: {
          author_email?: string | null
          author_name?: string | null
          created_at?: string
          id?: string
          message: string
          user_id: string
        }
        Update: {
          author_email?: string | null
          author_name?: string | null
          created_at?: string
          id?: string
          message?: string
          user_id?: string
        }
        Relationships: []
      }
      templates: {
        Row: {
          category: string
          content: string
          created_at: string
          id: string
          is_default: boolean | null
          template_type: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          category: string
          content: string
          created_at?: string
          id?: string
          is_default?: boolean | null
          template_type: string
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          category?: string
          content?: string
          created_at?: string
          id?: string
          is_default?: boolean | null
          template_type?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      usage_events: {
        Row: {
          created_at: string
          event_type: string
          id: string
          meta: Json | null
          user_id: string
        }
        Insert: {
          created_at?: string
          event_type: string
          id?: string
          meta?: Json | null
          user_id: string
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: string
          meta?: Json | null
          user_id?: string
        }
        Relationships: []
      }
      user_metrics: {
        Row: {
          businesses_added_count: number
          last_active_at: string | null
          last_search_at: string | null
          messages_sent_count: number
          replies_count: number
          search_count: number
          updated_at: string
          user_id: string
        }
        Insert: {
          businesses_added_count?: number
          last_active_at?: string | null
          last_search_at?: string | null
          messages_sent_count?: number
          replies_count?: number
          search_count?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          businesses_added_count?: number
          last_active_at?: string | null
          last_search_at?: string | null
          messages_sent_count?: number
          replies_count?: number
          search_count?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      website_status_overrides: {
        Row: {
          business_name: string | null
          created_at: string
          google_maps_url: string
          id: string
          updated_at: string
          user_id: string
          website_status: string
        }
        Insert: {
          business_name?: string | null
          created_at?: string
          google_maps_url: string
          id?: string
          updated_at?: string
          user_id: string
          website_status: string
        }
        Update: {
          business_name?: string | null
          created_at?: string
          google_maps_url?: string
          id?: string
          updated_at?: string
          user_id?: string
          website_status?: string
        }
        Relationships: []
      }
      whatsapp_auto_replies: {
        Row: {
          created_at: string
          fire_after: string
          id: string
          lead_id: string
          phone: string
          reason: string | null
          status: string
          template_name: string | null
          trigger: string
          trigger_wa_message_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          fire_after: string
          id?: string
          lead_id: string
          phone: string
          reason?: string | null
          status?: string
          template_name?: string | null
          trigger?: string
          trigger_wa_message_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          fire_after?: string
          id?: string
          lead_id?: string
          phone?: string
          reason?: string | null
          status?: string
          template_name?: string | null
          trigger?: string
          trigger_wa_message_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_auto_replies_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "outreach_leads"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_messages: {
        Row: {
          body: string | null
          created_at: string
          direction: string
          error: string | null
          id: string
          lead_id: string | null
          message_type: string
          phone: string
          status: string
          template_name: string | null
          test_mode: boolean
          user_id: string | null
          wa_message_id: string | null
        }
        Insert: {
          body?: string | null
          created_at?: string
          direction: string
          error?: string | null
          id?: string
          lead_id?: string | null
          message_type?: string
          phone: string
          status?: string
          template_name?: string | null
          test_mode?: boolean
          user_id?: string | null
          wa_message_id?: string | null
        }
        Update: {
          body?: string | null
          created_at?: string
          direction?: string
          error?: string | null
          id?: string
          lead_id?: string | null
          message_type?: string
          phone?: string
          status?: string
          template_name?: string | null
          test_mode?: boolean
          user_id?: string | null
          wa_message_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_messages_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "outreach_leads"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_outreach_state: {
        Row: {
          audit_complete_template: string | null
          auto_reply_enabled: boolean
          first_reply_template: string | null
          id: number
          next_send_at: string | null
          paused: boolean
          updated_at: string
        }
        Insert: {
          audit_complete_template?: string | null
          auto_reply_enabled?: boolean
          first_reply_template?: string | null
          id?: number
          next_send_at?: string | null
          paused?: boolean
          updated_at?: string
        }
        Update: {
          audit_complete_template?: string | null
          auto_reply_enabled?: boolean
          first_reply_template?: string | null
          id?: number
          next_send_at?: string | null
          paused?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      whatsapp_sends: {
        Row: {
          business_name: string | null
          claim_url: string | null
          created_at: string
          delivery_status: string | null
          error: string | null
          id: string
          lead_id: string | null
          message_id: string | null
          phone: string | null
          template: string | null
          test_mode: boolean
          user_id: string | null
        }
        Insert: {
          business_name?: string | null
          claim_url?: string | null
          created_at?: string
          delivery_status?: string | null
          error?: string | null
          id?: string
          lead_id?: string | null
          message_id?: string | null
          phone?: string | null
          template?: string | null
          test_mode?: boolean
          user_id?: string | null
        }
        Update: {
          business_name?: string | null
          claim_url?: string | null
          created_at?: string
          delivery_status?: string | null
          error?: string | null
          id?: string
          lead_id?: string | null
          message_id?: string | null
          phone?: string | null
          template?: string | null
          test_mode?: boolean
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_sends_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "outreach_leads"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      _reset_account_for: { Args: { v_uid: string }; Returns: undefined }
      bookable_staff: {
        Args: { _site_id: string; _staff_id: string }
        Returns: boolean
      }
      bump_audit_open: { Args: { p_audit_id: string }; Returns: undefined }
      claim_generated_site: {
        Args: { p_token_hash: string; p_user_id: string }
        Returns: string
      }
      edge_internal_keys: {
        Args: never
        Returns: {
          anon_key: string
          service_key: string
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      invoke_ai_audit_queue: { Args: never; Returns: undefined }
      invoke_bulk_jobs_sweep: { Args: never; Returns: undefined }
      invoke_cron_run: { Args: never; Returns: undefined }
      invoke_instantly_poll: { Args: never; Returns: undefined }
      invoke_sms_queue: { Args: never; Returns: undefined }
      invoke_whatsapp_auto_replies: { Args: never; Returns: undefined }
      invoke_whatsapp_queue: { Args: never; Returns: undefined }
      is_operator: { Args: { uid: string }; Returns: boolean }
      log_usage_event: {
        Args: { p_event_type: string; p_meta?: Json }
        Returns: undefined
      }
      owns_site: { Args: { _site_id: string }; Returns: boolean }
      owns_staff: { Args: { _staff_id: string }; Returns: boolean }
      reset_my_account: { Args: never; Returns: undefined }
      reset_my_metrics: { Args: never; Returns: undefined }
      site_is_published: { Args: { _site_id: string }; Returns: boolean }
      staff_site_published: { Args: { _staff_id: string }; Returns: boolean }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user"
      call_outcome:
        | "interested"
        | "not_interested"
        | "no_answer"
        | "callback_scheduled"
        | "wrong_number"
        | "left_voicemail"
      hosting_status: "pending" | "active" | "suspended" | "cancelled"
      lead_status:
        | "not_contacted"
        | "contacted"
        | "call_back"
        | "not_answered"
        | "on_hold"
        | "wants_draft"
        | "interested"
        | "not_interested"
        | "sent_initial_text"
        | "replied"
        | "sent_voice_note"
        | "awaiting_decision"
        | "waiting"
        | "reviewing_draft"
        | "paid_for_draft"
        | "completed"
        | "no_whatsapp"
        | "sms"
        | "whatsapp"
        | "facebook_msg"
        | "email_sent"
        | "bounced"
      next_action_type:
        | "call"
        | "follow_up"
        | "send_draft"
        | "remove_if_no_reply"
        | "none"
        | "send_initial_text"
        | "send_voice_note"
        | "send_follow_up"
        | "check_3_day_removal"
        | "2nd_follow_up"
      site_status: "draft" | "published" | "archived"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      app_role: ["admin", "moderator", "user"],
      call_outcome: [
        "interested",
        "not_interested",
        "no_answer",
        "callback_scheduled",
        "wrong_number",
        "left_voicemail",
      ],
      hosting_status: ["pending", "active", "suspended", "cancelled"],
      lead_status: [
        "not_contacted",
        "contacted",
        "call_back",
        "not_answered",
        "on_hold",
        "wants_draft",
        "interested",
        "not_interested",
        "sent_initial_text",
        "replied",
        "sent_voice_note",
        "awaiting_decision",
        "waiting",
        "reviewing_draft",
        "paid_for_draft",
        "completed",
        "no_whatsapp",
        "sms",
        "whatsapp",
        "facebook_msg",
        "email_sent",
        "bounced",
      ],
      next_action_type: [
        "call",
        "follow_up",
        "send_draft",
        "remove_if_no_reply",
        "none",
        "send_initial_text",
        "send_voice_note",
        "send_follow_up",
        "check_3_day_removal",
        "2nd_follow_up",
      ],
      site_status: ["draft", "published", "archived"],
    },
  },
} as const
