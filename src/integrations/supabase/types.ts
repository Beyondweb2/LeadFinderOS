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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      affiliate_conversions: {
        Row: {
          affiliate_id: string
          commission_amount: number
          created_at: string
          currency: string
          first_payment_amount: number
          id: string
          paid_at: string
          status: string
          stripe_payment_intent_id: string | null
          user_id: string
        }
        Insert: {
          affiliate_id: string
          commission_amount: number
          created_at?: string
          currency?: string
          first_payment_amount: number
          id?: string
          paid_at?: string
          status?: string
          stripe_payment_intent_id?: string | null
          user_id: string
        }
        Update: {
          affiliate_id?: string
          commission_amount?: number
          created_at?: string
          currency?: string
          first_payment_amount?: number
          id?: string
          paid_at?: string
          status?: string
          stripe_payment_intent_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "affiliate_conversions_affiliate_id_fkey"
            columns: ["affiliate_id"]
            isOneToOne: false
            referencedRelation: "affiliates"
            referencedColumns: ["id"]
          },
        ]
      }
      affiliates: {
        Row: {
          click_count: number
          code: string
          commission_rate: number
          created_at: string
          email: string
          id: string
          is_active: boolean
          name: string
        }
        Insert: {
          click_count?: number
          code: string
          commission_rate?: number
          created_at?: string
          email: string
          id?: string
          is_active?: boolean
          name: string
        }
        Update: {
          click_count?: number
          code?: string
          commission_rate?: number
          created_at?: string
          email?: string
          id?: string
          is_active?: boolean
          name?: string
        }
        Relationships: []
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
      checkout_attempts: {
        Row: {
          affiliate_code: string | null
          checkout_completed: boolean
          converted: boolean
          created_at: string
          email: string
          fbclid: string | null
          id: string
          ref_source: string | null
          reminder_sent_at: string | null
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          traffic_source: string | null
          user_id: string | null
          utm_ad: string | null
          utm_adset: string | null
          utm_campaign: string | null
          utm_source: string | null
        }
        Insert: {
          affiliate_code?: string | null
          checkout_completed?: boolean
          converted?: boolean
          created_at?: string
          email: string
          fbclid?: string | null
          id?: string
          ref_source?: string | null
          reminder_sent_at?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          traffic_source?: string | null
          user_id?: string | null
          utm_ad?: string | null
          utm_adset?: string | null
          utm_campaign?: string | null
          utm_source?: string | null
        }
        Update: {
          affiliate_code?: string | null
          checkout_completed?: boolean
          converted?: boolean
          created_at?: string
          email?: string
          fbclid?: string | null
          id?: string
          ref_source?: string | null
          reminder_sent_at?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          traffic_source?: string | null
          user_id?: string | null
          utm_ad?: string | null
          utm_adset?: string | null
          utm_campaign?: string | null
          utm_source?: string | null
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
      email_job_runs: {
        Row: {
          checked_count: number
          eligible_count: number
          errors: string | null
          id: string
          ran_at: string
          sample_user_ids: Json | null
          sent_count: number
        }
        Insert: {
          checked_count?: number
          eligible_count?: number
          errors?: string | null
          id?: string
          ran_at?: string
          sample_user_ids?: Json | null
          sent_count?: number
        }
        Update: {
          checked_count?: number
          eligible_count?: number
          errors?: string | null
          id?: string
          ran_at?: string
          sample_user_ids?: Json | null
          sent_count?: number
        }
        Relationships: []
      }
      funnel_analytics: {
        Row: {
          created_at: string
          event_type: string
          id: string
          is_guest_user: boolean
          session_id: string | null
        }
        Insert: {
          created_at?: string
          event_type: string
          id?: string
          is_guest_user?: boolean
          session_id?: string | null
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: string
          is_guest_user?: boolean
          session_id?: string | null
        }
        Relationships: []
      }
      funnel_events: {
        Row: {
          created_at: string
          event_type: string
          id: string
          meta: Json | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          event_type: string
          id?: string
          meta?: Json | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: string
          meta?: Json | null
          user_id?: string | null
        }
        Relationships: []
      }
      generated_sites: {
        Row: {
          content: Json
          created_at: string
          id: string
          is_paid: boolean
          lead_id: string | null
          owner_id: string | null
          site_name: string
          status: Database["public"]["Enums"]["site_status"]
          updated_at: string
        }
        Insert: {
          content?: Json
          created_at?: string
          id?: string
          is_paid?: boolean
          lead_id?: string | null
          owner_id?: string | null
          site_name: string
          status?: Database["public"]["Enums"]["site_status"]
          updated_at?: string
        }
        Update: {
          content?: Json
          created_at?: string
          id?: string
          is_paid?: boolean
          lead_id?: string | null
          owner_id?: string | null
          site_name?: string
          status?: Database["public"]["Enums"]["site_status"]
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
        }
        Insert: {
          created_at?: string
          lat: number
          lng: number
          location_key: string
          raw_location: string
        }
        Update: {
          created_at?: string
          lat?: number
          lng?: number
          location_key?: string
          raw_location?: string
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
          category: string | null
          checkin_notes: string | null
          contact_method: string | null
          contact_name: string | null
          country: string | null
          created_at: string
          delivery_notes: string | null
          email: string | null
          facebook_confidence: number | null
          facebook_last_checked_at: string | null
          facebook_method: string | null
          facebook_url: string | null
          google_maps_url: string | null
          id: string
          image_url: string | null
          is_archived: boolean
          is_potential_work: boolean
          last_outreach_attempt_at: string | null
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
          project_duration: string | null
          project_overview: string | null
          project_status: string | null
          project_value: number | null
          services_included: string[] | null
          status: string
          updated_at: string
          user_id: string
          website: string | null
          whatsapp_checked_at: string | null
          whatsapp_status: string | null
        }
        Insert: {
          address?: string | null
          amount_paid?: number | null
          business_name: string
          category?: string | null
          checkin_notes?: string | null
          contact_method?: string | null
          contact_name?: string | null
          country?: string | null
          created_at?: string
          delivery_notes?: string | null
          email?: string | null
          facebook_confidence?: number | null
          facebook_last_checked_at?: string | null
          facebook_method?: string | null
          facebook_url?: string | null
          google_maps_url?: string | null
          id?: string
          image_url?: string | null
          is_archived?: boolean
          is_potential_work?: boolean
          last_outreach_attempt_at?: string | null
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
          project_duration?: string | null
          project_overview?: string | null
          project_status?: string | null
          project_value?: number | null
          services_included?: string[] | null
          status?: string
          updated_at?: string
          user_id: string
          website?: string | null
          whatsapp_checked_at?: string | null
          whatsapp_status?: string | null
        }
        Update: {
          address?: string | null
          amount_paid?: number | null
          business_name?: string
          category?: string | null
          checkin_notes?: string | null
          contact_method?: string | null
          contact_name?: string | null
          country?: string | null
          created_at?: string
          delivery_notes?: string | null
          email?: string | null
          facebook_confidence?: number | null
          facebook_last_checked_at?: string | null
          facebook_method?: string | null
          facebook_url?: string | null
          google_maps_url?: string | null
          id?: string
          image_url?: string | null
          is_archived?: boolean
          is_potential_work?: boolean
          last_outreach_attempt_at?: string | null
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
          project_duration?: string | null
          project_overview?: string | null
          project_status?: string | null
          project_value?: number | null
          services_included?: string[] | null
          status?: string
          updated_at?: string
          user_id?: string
          website?: string | null
          whatsapp_checked_at?: string | null
          whatsapp_status?: string | null
        }
        Relationships: []
      }
      outreach_logs: {
        Row: {
          contacted_at: string
          created_at: string
          id: string
          lead_id: string | null
          outreach_type: string
          user_id: string
        }
        Insert: {
          contacted_at?: string
          created_at?: string
          id?: string
          lead_id?: string | null
          outreach_type: string
          user_id: string
        }
        Update: {
          contacted_at?: string
          created_at?: string
          id?: string
          lead_id?: string | null
          outreach_type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "outreach_logs_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "outreach_leads"
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
      subscriptions: {
        Row: {
          created_at: string
          current_period_end: string | null
          first_payment_failed_at: string | null
          id: string
          last_payment_failed_at: string | null
          payment_failure_count: number
          status: string
          stripe_customer_id: string
          stripe_subscription_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          current_period_end?: string | null
          first_payment_failed_at?: string | null
          id?: string
          last_payment_failed_at?: string | null
          payment_failure_count?: number
          status?: string
          stripe_customer_id: string
          stripe_subscription_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          current_period_end?: string | null
          first_payment_failed_at?: string | null
          id?: string
          last_payment_failed_at?: string | null
          payment_failure_count?: number
          status?: string
          stripe_customer_id?: string
          stripe_subscription_id?: string
          updated_at?: string
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
      user_challenge_10_outreach_contacts: {
        Row: {
          first_contacted_at: string
          lead_id: string
          user_id: string
        }
        Insert: {
          first_contacted_at?: string
          lead_id: string
          user_id: string
        }
        Update: {
          first_contacted_at?: string
          lead_id?: string
          user_id?: string
        }
        Relationships: []
      }
      user_challenges_10_outreach: {
        Row: {
          completed: boolean
          completed_at: string | null
          count: number
          enabled: boolean
          modal_shown: boolean
          skipped: boolean
          started_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          completed?: boolean
          completed_at?: string | null
          count?: number
          enabled?: boolean
          modal_shown?: boolean
          skipped?: boolean
          started_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          completed?: boolean
          completed_at?: string | null
          count?: number
          enabled?: boolean
          modal_shown?: boolean
          skipped?: boolean
          started_at?: string | null
          updated_at?: string
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
          walkthrough_completed: boolean
          walkthrough_completed_at: string | null
          walkthrough_last_seen_at: string | null
          walkthrough_last_step: number | null
          walkthrough_max_step: number
          walkthrough_skipped_at: string | null
          walkthrough_started_at: string | null
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
          walkthrough_completed?: boolean
          walkthrough_completed_at?: string | null
          walkthrough_last_seen_at?: string | null
          walkthrough_last_step?: number | null
          walkthrough_max_step?: number
          walkthrough_skipped_at?: string | null
          walkthrough_started_at?: string | null
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
          walkthrough_completed?: boolean
          walkthrough_completed_at?: string | null
          walkthrough_last_seen_at?: string | null
          walkthrough_last_step?: number | null
          walkthrough_max_step?: number
          walkthrough_skipped_at?: string | null
          walkthrough_started_at?: string | null
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
      user_trials: {
        Row: {
          affiliate_attributed_at: string | null
          affiliate_code: string | null
          avatar_url: string | null
          checkout_abandoned: boolean
          checkout_started_at: string | null
          created_at: string
          demo_search_used: boolean
          fbclid: string | null
          free_search_count: number
          has_seen_walkthrough_prompt: boolean
          id: string
          last_lifecycle_email_sent_at: string | null
          last_search_date: string | null
          lifecycle_stage: number
          paid_at: string | null
          plan_status: string
          post_abandon_search_used: boolean
          preferred_language: string | null
          ref_source: string | null
          searches_today: number
          searches_used: number
          setup_completed: boolean
          traffic_source: string | null
          trial_days: number
          trial_end_date: string
          trial_started_at: string
          trial_used: boolean
          user_id: string
          utm_ad: string | null
          utm_adset: string | null
          utm_campaign: string | null
          utm_source: string | null
          walkthrough_completed: boolean
        }
        Insert: {
          affiliate_attributed_at?: string | null
          affiliate_code?: string | null
          avatar_url?: string | null
          checkout_abandoned?: boolean
          checkout_started_at?: string | null
          created_at?: string
          demo_search_used?: boolean
          fbclid?: string | null
          free_search_count?: number
          has_seen_walkthrough_prompt?: boolean
          id?: string
          last_lifecycle_email_sent_at?: string | null
          last_search_date?: string | null
          lifecycle_stage?: number
          paid_at?: string | null
          plan_status?: string
          post_abandon_search_used?: boolean
          preferred_language?: string | null
          ref_source?: string | null
          searches_today?: number
          searches_used?: number
          setup_completed?: boolean
          traffic_source?: string | null
          trial_days?: number
          trial_end_date: string
          trial_started_at?: string
          trial_used?: boolean
          user_id: string
          utm_ad?: string | null
          utm_adset?: string | null
          utm_campaign?: string | null
          utm_source?: string | null
          walkthrough_completed?: boolean
        }
        Update: {
          affiliate_attributed_at?: string | null
          affiliate_code?: string | null
          avatar_url?: string | null
          checkout_abandoned?: boolean
          checkout_started_at?: string | null
          created_at?: string
          demo_search_used?: boolean
          fbclid?: string | null
          free_search_count?: number
          has_seen_walkthrough_prompt?: boolean
          id?: string
          last_lifecycle_email_sent_at?: string | null
          last_search_date?: string | null
          lifecycle_stage?: number
          paid_at?: string | null
          plan_status?: string
          post_abandon_search_used?: boolean
          preferred_language?: string | null
          ref_source?: string | null
          searches_today?: number
          searches_used?: number
          setup_completed?: boolean
          traffic_source?: string | null
          trial_days?: number
          trial_end_date?: string
          trial_started_at?: string
          trial_used?: boolean
          user_id?: string
          utm_ad?: string | null
          utm_adset?: string | null
          utm_campaign?: string | null
          utm_source?: string | null
          walkthrough_completed?: boolean
        }
        Relationships: []
      }
    }
    Views: {
      user_subscription_status: {
        Row: {
          created_at: string | null
          current_period_end: string | null
          id: string | null
          status: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          current_period_end?: string | null
          id?: string | null
          status?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          current_period_end?: string | null
          id?: string | null
          status?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      bookable_staff: {
        Args: { _site_id: string; _staff_id: string }
        Returns: boolean
      }
      challenge_10_record_contact: {
        Args: { p_lead_id: string }
        Returns: Json
      }
      claim_generated_site: {
        Args: { p_token_hash: string; p_user_id: string }
        Returns: string
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      invoke_cron_run: { Args: never; Returns: undefined }
      log_usage_event: {
        Args: { p_event_type: string; p_meta?: Json }
        Returns: undefined
      }
      log_walkthrough_event: {
        Args: { p_event_type: string; p_meta?: Json }
        Returns: undefined
      }
      owns_site: { Args: { _site_id: string }; Returns: boolean }
      owns_staff: { Args: { _staff_id: string }; Returns: boolean }
      reset_my_metrics: { Args: never; Returns: undefined }
      site_is_published: { Args: { _site_id: string }; Returns: boolean }
      staff_site_published: { Args: { _staff_id: string }; Returns: boolean }
      validate_affiliate_code: {
        Args: { code_to_check: string }
        Returns: boolean
      }
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
