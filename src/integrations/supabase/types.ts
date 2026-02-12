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
          code: string
          commission_rate: number
          created_at: string
          email: string
          id: string
          is_active: boolean
          name: string
        }
        Insert: {
          code: string
          commission_rate?: number
          created_at?: string
          email: string
          id?: string
          is_active?: boolean
          name: string
        }
        Update: {
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
          country: string | null
          created_at: string
          email: string | null
          google_maps_url: string | null
          id: string
          is_archived: boolean
          is_potential_work: boolean
          list_type: string
          next_action: Database["public"]["Enums"]["next_action_type"] | null
          next_action_date: string | null
          next_checkin_date: string | null
          notes: string | null
          paid_for: string | null
          payment_date: string | null
          phone: string | null
          project_duration: string | null
          status: Database["public"]["Enums"]["lead_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          address?: string | null
          amount_paid?: number | null
          business_name: string
          category?: string | null
          checkin_notes?: string | null
          country?: string | null
          created_at?: string
          email?: string | null
          google_maps_url?: string | null
          id?: string
          is_archived?: boolean
          is_potential_work?: boolean
          list_type?: string
          next_action?: Database["public"]["Enums"]["next_action_type"] | null
          next_action_date?: string | null
          next_checkin_date?: string | null
          notes?: string | null
          paid_for?: string | null
          payment_date?: string | null
          phone?: string | null
          project_duration?: string | null
          status?: Database["public"]["Enums"]["lead_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          address?: string | null
          amount_paid?: number | null
          business_name?: string
          category?: string | null
          checkin_notes?: string | null
          country?: string | null
          created_at?: string
          email?: string | null
          google_maps_url?: string | null
          id?: string
          is_archived?: boolean
          is_potential_work?: boolean
          list_type?: string
          next_action?: Database["public"]["Enums"]["next_action_type"] | null
          next_action_date?: string | null
          next_checkin_date?: string | null
          notes?: string | null
          paid_for?: string | null
          payment_date?: string | null
          phone?: string | null
          project_duration?: string | null
          status?: Database["public"]["Enums"]["lead_status"]
          updated_at?: string
          user_id?: string
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
      subscriptions: {
        Row: {
          created_at: string
          current_period_end: string | null
          id: string
          status: string
          stripe_customer_id: string
          stripe_subscription_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          current_period_end?: string | null
          id?: string
          status?: string
          stripe_customer_id: string
          stripe_subscription_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          current_period_end?: string | null
          id?: string
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
      user_trials: {
        Row: {
          affiliate_attributed_at: string | null
          affiliate_code: string | null
          avatar_url: string | null
          checkout_abandoned: boolean
          created_at: string
          id: string
          last_search_date: string | null
          paid_at: string | null
          plan_status: string
          post_abandon_search_used: boolean
          ref_source: string | null
          searches_today: number
          searches_used: number
          trial_days: number
          trial_end_date: string
          trial_started_at: string
          trial_used: boolean
          user_id: string
        }
        Insert: {
          affiliate_attributed_at?: string | null
          affiliate_code?: string | null
          avatar_url?: string | null
          checkout_abandoned?: boolean
          created_at?: string
          id?: string
          last_search_date?: string | null
          paid_at?: string | null
          plan_status?: string
          post_abandon_search_used?: boolean
          ref_source?: string | null
          searches_today?: number
          searches_used?: number
          trial_days?: number
          trial_end_date: string
          trial_started_at?: string
          trial_used?: boolean
          user_id: string
        }
        Update: {
          affiliate_attributed_at?: string | null
          affiliate_code?: string | null
          avatar_url?: string | null
          checkout_abandoned?: boolean
          created_at?: string
          id?: string
          last_search_date?: string | null
          paid_at?: string | null
          plan_status?: string
          post_abandon_search_used?: boolean
          ref_source?: string | null
          searches_today?: number
          searches_used?: number
          trial_days?: number
          trial_end_date?: string
          trial_started_at?: string
          trial_used?: boolean
          user_id?: string
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
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      log_usage_event: {
        Args: { p_event_type: string; p_meta?: Json }
        Returns: undefined
      }
      reset_my_metrics: { Args: never; Returns: undefined }
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
    },
  },
} as const
