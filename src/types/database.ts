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
  public: {
    Tables: {
      itinerary_item_links: {
        Row: {
          created_at: string
          id: string
          item_id: string
          label: string
          sort_order: number
          url: string
        }
        Insert: {
          created_at?: string
          id?: string
          item_id: string
          label?: string
          sort_order?: number
          url: string
        }
        Update: {
          created_at?: string
          id?: string
          item_id?: string
          label?: string
          sort_order?: number
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "itinerary_item_links_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "itinerary_items"
            referencedColumns: ["id"]
          },
        ]
      }
      itinerary_items: {
        Row: {
          booking_url: string | null
          created_at: string
          day_id: string
          details: Json
          end_time: string | null
          id: string
          notes: string | null
          place_id: string | null
          schedule_kind: Database["public"]["Enums"]["itinerary_schedule_kind"]
          schedule_text: string | null
          sort_order: number
          start_time: string | null
          title: string
          trip_id: string
          type: Database["public"]["Enums"]["itinerary_item_type"]
          updated_at: string
          variant_id: string
        }
        Insert: {
          booking_url?: string | null
          created_at?: string
          day_id: string
          details?: Json
          end_time?: string | null
          id?: string
          notes?: string | null
          place_id?: string | null
          schedule_kind?: Database["public"]["Enums"]["itinerary_schedule_kind"]
          schedule_text?: string | null
          sort_order?: number
          start_time?: string | null
          title: string
          trip_id: string
          type: Database["public"]["Enums"]["itinerary_item_type"]
          updated_at?: string
          variant_id: string
        }
        Update: {
          booking_url?: string | null
          created_at?: string
          day_id?: string
          details?: Json
          end_time?: string | null
          id?: string
          notes?: string | null
          place_id?: string | null
          schedule_kind?: Database["public"]["Enums"]["itinerary_schedule_kind"]
          schedule_text?: string | null
          sort_order?: number
          start_time?: string | null
          title?: string
          trip_id?: string
          type?: Database["public"]["Enums"]["itinerary_item_type"]
          updated_at?: string
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "itinerary_items_day_id_fkey"
            columns: ["day_id"]
            isOneToOne: false
            referencedRelation: "trip_days"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "itinerary_items_place_id_fkey"
            columns: ["place_id"]
            isOneToOne: false
            referencedRelation: "places"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "itinerary_items_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "itinerary_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "route_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      places: {
        Row: {
          custom_lat: number | null
          custom_lng: number | null
          custom_name: string | null
          google_place_id: string | null
          id: string
          source: Database["public"]["Enums"]["place_source"]
          trip_id: string
        }
        Insert: {
          custom_lat?: number | null
          custom_lng?: number | null
          custom_name?: string | null
          google_place_id?: string | null
          id?: string
          source: Database["public"]["Enums"]["place_source"]
          trip_id: string
        }
        Update: {
          custom_lat?: number | null
          custom_lng?: number | null
          custom_name?: string | null
          google_place_id?: string | null
          id?: string
          source?: Database["public"]["Enums"]["place_source"]
          trip_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "places_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          default_currency: string
          default_timezone: string | null
          display_name: string | null
          id: string
          username: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          default_currency?: string
          default_timezone?: string | null
          display_name?: string | null
          id: string
          username?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          default_currency?: string
          default_timezone?: string | null
          display_name?: string | null
          id?: string
          username?: string | null
        }
        Relationships: []
      }
      route_variants: {
        Row: {
          color: string
          created_at: string
          id: string
          is_primary: boolean
          name: string
          trip_id: string
        }
        Insert: {
          color?: string
          created_at?: string
          id?: string
          is_primary?: boolean
          name: string
          trip_id: string
        }
        Update: {
          color?: string
          created_at?: string
          id?: string
          is_primary?: boolean
          name?: string
          trip_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "route_variants_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      trip_days: {
        Row: {
          date: string | null
          day_number: number
          id: string
          notes: string | null
          title: string | null
          variant_id: string
        }
        Insert: {
          date?: string | null
          day_number: number
          id?: string
          notes?: string | null
          title?: string | null
          variant_id: string
        }
        Update: {
          date?: string | null
          day_number?: number
          id?: string
          notes?: string | null
          title?: string | null
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trip_days_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "route_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      trip_members: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["trip_member_role"]
          trip_id: string
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["trip_member_role"]
          trip_id: string
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["trip_member_role"]
          trip_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trip_members_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      trips: {
        Row: {
          created_at: string
          currency: string
          day_count: number
          end_date: string | null
          id: string
          owner_id: string
          start_date: string | null
          timezone: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          currency?: string
          day_count?: number
          end_date?: string | null
          id?: string
          owner_id: string
          start_date?: string | null
          timezone: string
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          currency?: string
          day_count?: number
          end_date?: string | null
          id?: string
          owner_id?: string
          start_date?: string | null
          timezone?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      copy_itinerary_items_to_days: {
        Args: { source_item_ids: string[]; target_day_ids: string[] }
        Returns: number
      }
      create_trip: {
        Args: {
          trip_currency?: string
          trip_day_count?: number
          trip_end_date?: string
          trip_start_date?: string
          trip_timezone?: string
          trip_title: string
        }
        Returns: string
      }
      insert_trip_day: {
        Args: { before_day_number: number; target_trip_id: string }
        Returns: string
      }
      is_trip_member: { Args: { target_trip_id: string }; Returns: boolean }
      is_trip_owner: { Args: { target_trip_id: string }; Returns: boolean }
      itinerary_item_trip_id: {
        Args: { target_item_id: string }
        Returns: string
      }
      remove_trip_day: {
        Args: { target_day_id: string; target_trip_id: string }
        Returns: string
      }
      reorder_itinerary_items: {
        Args: { ordered_item_ids: string[]; target_day_id: string }
        Returns: undefined
      }
      update_trip_plan: {
        Args: {
          target_trip_id: string
          trip_currency: string
          trip_day_count: number
          trip_end_date: string
          trip_start_date: string
          trip_timezone: string
          trip_title: string
        }
        Returns: string
      }
      variant_trip_id: { Args: { target_variant_id: string }; Returns: string }
    }
    Enums: {
      itinerary_item_type:
        | "hotel"
        | "activity"
        | "meal"
        | "transport"
        | "location"
        | "car_rental"
        | "flight"
        | "train"
        | "note"
      itinerary_schedule_kind:
        | "none"
        | "all_day"
        | "period"
        | "approximate"
        | "exact"
        | "range"
      place_source: "google" | "custom"
      trip_member_role: "owner" | "editor" | "viewer"
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
      itinerary_item_type: [
        "hotel",
        "activity",
        "meal",
        "transport",
        "location",
        "car_rental",
        "flight",
        "train",
        "note",
      ],
      itinerary_schedule_kind: [
        "none",
        "all_day",
        "period",
        "approximate",
        "exact",
        "range",
      ],
      place_source: ["google", "custom"],
      trip_member_role: ["owner", "editor", "viewer"],
    },
  },
} as const
