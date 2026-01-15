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
          user_id: string
        }
        Insert: {
          added_at?: string
          business_name: string
          country?: string | null
          google_maps_url?: string | null
          id?: string
          user_id: string
        }
        Update: {
          added_at?: string
          business_name?: string
          country?: string | null
          google_maps_url?: string | null
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      outreach_leads: {
        Row: {
          address: string | null
          business_name: string
          category: string | null
          country: string | null
          created_at: string
          email: string | null
          google_maps_url: string | null
          id: string
          next_action: Database["public"]["Enums"]["next_action_type"] | null
          next_action_date: string | null
          notes: string | null
          phone: string | null
          status: Database["public"]["Enums"]["lead_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          address?: string | null
          business_name: string
          category?: string | null
          country?: string | null
          created_at?: string
          email?: string | null
          google_maps_url?: string | null
          id?: string
          next_action?: Database["public"]["Enums"]["next_action_type"] | null
          next_action_date?: string | null
          notes?: string | null
          phone?: string | null
          status?: Database["public"]["Enums"]["lead_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          address?: string | null
          business_name?: string
          category?: string | null
          country?: string | null
          created_at?: string
          email?: string | null
          google_maps_url?: string | null
          id?: string
          next_action?: Database["public"]["Enums"]["next_action_type"] | null
          next_action_date?: string | null
          notes?: string | null
          phone?: string | null
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
          radius: number
          results_count: number
          searched_at: string
          user_id: string
        }
        Insert: {
          id?: string
          keyword: string
          location: string
          radius: number
          results_count?: number
          searched_at?: string
          user_id: string
        }
        Update: {
          id?: string
          keyword?: string
          location?: string
          radius?: number
          results_count?: number
          searched_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
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
      next_action_type:
        | "call"
        | "follow_up"
        | "send_draft"
        | "remove_if_no_reply"
        | "none"
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
      ],
      next_action_type: [
        "call",
        "follow_up",
        "send_draft",
        "remove_if_no_reply",
        "none",
      ],
    },
  },
} as const
