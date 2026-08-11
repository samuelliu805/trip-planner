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
      day_route_calculations: {
        Row: {
          calculated_legs: Json
          computed_at: string
          config_signature: string
          plan_id: string
          provider_schema_version: string
          total_distance_meters: number
          total_duration_seconds: number | null
        }
        Insert: {
          calculated_legs: Json
          computed_at?: string
          config_signature: string
          plan_id: string
          provider_schema_version?: string
          total_distance_meters: number
          total_duration_seconds?: number | null
        }
        Update: {
          calculated_legs?: Json
          computed_at?: string
          config_signature?: string
          plan_id?: string
          provider_schema_version?: string
          total_distance_meters?: number
          total_duration_seconds?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "day_route_calculations_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: true
            referencedRelation: "day_route_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      day_route_legs: {
        Row: {
          created_at: string
          from_stop_id: string
          id: string
          mode: string
          plan_id: string
          position: number
          to_stop_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          from_stop_id: string
          id?: string
          mode: string
          plan_id: string
          position: number
          to_stop_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          from_stop_id?: string
          id?: string
          mode?: string
          plan_id?: string
          position?: number
          to_stop_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "day_route_legs_from_stop_fkey"
            columns: ["from_stop_id", "plan_id"]
            isOneToOne: false
            referencedRelation: "day_route_stops"
            referencedColumns: ["id", "plan_id"]
          },
          {
            foreignKeyName: "day_route_legs_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "day_route_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "day_route_legs_to_stop_fkey"
            columns: ["to_stop_id", "plan_id"]
            isOneToOne: false
            referencedRelation: "day_route_stops"
            referencedColumns: ["id", "plan_id"]
          },
        ]
      }
      day_route_plans: {
        Row: {
          created_at: string
          day_id: string
          id: string
          trip_id: string
          updated_at: string
          variant_id: string
        }
        Insert: {
          created_at?: string
          day_id: string
          id?: string
          trip_id: string
          updated_at?: string
          variant_id: string
        }
        Update: {
          created_at?: string
          day_id?: string
          id?: string
          trip_id?: string
          updated_at?: string
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "day_route_plans_day_variant_fkey"
            columns: ["day_id", "variant_id"]
            isOneToOne: false
            referencedRelation: "trip_days"
            referencedColumns: ["id", "variant_id"]
          },
          {
            foreignKeyName: "day_route_plans_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "day_route_plans_variant_trip_fkey"
            columns: ["variant_id", "trip_id"]
            isOneToOne: false
            referencedRelation: "route_variants"
            referencedColumns: ["id", "trip_id"]
          },
        ]
      }
      day_route_stops: {
        Row: {
          created_at: string
          id: string
          item_id: string
          plan_id: string
          position: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          item_id: string
          plan_id: string
          position: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          item_id?: string
          plan_id?: string
          position?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "day_route_stops_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "itinerary_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "day_route_stops_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "day_route_plans"
            referencedColumns: ["id"]
          },
        ]
      }
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
          price_amount: number | null
          price_currency: string | null
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
          price_amount?: number | null
          price_currency?: string | null
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
          price_amount?: number | null
          price_currency?: string | null
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
          administrative_area_name: string | null
          country_code: string | null
          custom_lat: number | null
          custom_lng: number | null
          custom_name: string | null
          display_name: string | null
          formatted_address: string | null
          google_place_id: string | null
          id: string
          latitude: number | null
          locality_kind: string | null
          locality_name: string | null
          locality_source: string | null
          longitude: number | null
          source: Database["public"]["Enums"]["place_source"]
          trip_id: string
        }
        Insert: {
          administrative_area_name?: string | null
          country_code?: string | null
          custom_lat?: number | null
          custom_lng?: number | null
          custom_name?: string | null
          display_name?: string | null
          formatted_address?: string | null
          google_place_id?: string | null
          id?: string
          latitude?: number | null
          locality_kind?: string | null
          locality_name?: string | null
          locality_source?: string | null
          longitude?: number | null
          source: Database["public"]["Enums"]["place_source"]
          trip_id: string
        }
        Update: {
          administrative_area_name?: string | null
          country_code?: string | null
          custom_lat?: number | null
          custom_lng?: number | null
          custom_name?: string | null
          display_name?: string | null
          formatted_address?: string | null
          google_place_id?: string | null
          id?: string
          latitude?: number | null
          locality_kind?: string | null
          locality_name?: string | null
          locality_source?: string | null
          longitude?: number | null
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
      public_itinerary_links: {
        Row: {
          allow_route_explore: boolean
          created_at: string
          created_by: string
          default_view: Database["public"]["Enums"]["public_itinerary_view"]
          id: string
          public_token: string
          revoked_at: string | null
          share_description: string | null
          share_title: string | null
          show_addresses: boolean
          show_map_routes: boolean
          show_notes: boolean
          show_quick_action_links: boolean
          show_times: boolean
          trip_id: string
          updated_at: string
          variant_id: string
        }
        Insert: {
          allow_route_explore?: boolean
          created_at?: string
          created_by: string
          default_view?: Database["public"]["Enums"]["public_itinerary_view"]
          id?: string
          public_token?: string
          revoked_at?: string | null
          share_description?: string | null
          share_title?: string | null
          show_addresses?: boolean
          show_map_routes?: boolean
          show_notes?: boolean
          show_quick_action_links?: boolean
          show_times?: boolean
          trip_id: string
          updated_at?: string
          variant_id: string
        }
        Update: {
          allow_route_explore?: boolean
          created_at?: string
          created_by?: string
          default_view?: Database["public"]["Enums"]["public_itinerary_view"]
          id?: string
          public_token?: string
          revoked_at?: string | null
          share_description?: string | null
          share_title?: string | null
          show_addresses?: boolean
          show_map_routes?: boolean
          show_notes?: boolean
          show_quick_action_links?: boolean
          show_times?: boolean
          trip_id?: string
          updated_at?: string
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "public_itinerary_links_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "public_itinerary_links_variant_trip_fkey"
            columns: ["variant_id", "trip_id"]
            isOneToOne: false
            referencedRelation: "route_variants"
            referencedColumns: ["id", "trip_id"]
          },
        ]
      }
      research_entries: {
        Row: {
          attachment_refs: Json
          capture_type: string
          category: string | null
          created_at: string
          day_id: string | null
          end_day_id: string | null
          extraction_status: string
          id: string
          itinerary_item_id: string | null
          raw_text: string
          scope_kind: string
          scope_label: string | null
          source_metadata: Json
          source_url: string | null
          topic_id: string | null
          trip_id: string
          updated_at: string
          variant_id: string | null
        }
        Insert: {
          attachment_refs?: Json
          capture_type?: string
          category?: string | null
          created_at?: string
          day_id?: string | null
          end_day_id?: string | null
          extraction_status?: string
          id?: string
          itinerary_item_id?: string | null
          raw_text: string
          scope_kind?: string
          scope_label?: string | null
          source_metadata?: Json
          source_url?: string | null
          topic_id?: string | null
          trip_id: string
          updated_at?: string
          variant_id?: string | null
        }
        Update: {
          attachment_refs?: Json
          capture_type?: string
          category?: string | null
          created_at?: string
          day_id?: string | null
          end_day_id?: string | null
          extraction_status?: string
          id?: string
          itinerary_item_id?: string | null
          raw_text?: string
          scope_kind?: string
          scope_label?: string | null
          source_metadata?: Json
          source_url?: string | null
          topic_id?: string | null
          trip_id?: string
          updated_at?: string
          variant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "research_entries_day_id_fkey"
            columns: ["day_id"]
            isOneToOne: false
            referencedRelation: "trip_days"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "research_entries_end_day_id_fkey"
            columns: ["end_day_id"]
            isOneToOne: false
            referencedRelation: "trip_days"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "research_entries_itinerary_item_id_fkey"
            columns: ["itinerary_item_id"]
            isOneToOne: false
            referencedRelation: "itinerary_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "research_entries_topic_trip_fkey"
            columns: ["topic_id", "trip_id"]
            isOneToOne: false
            referencedRelation: "research_topics"
            referencedColumns: ["id", "trip_id"]
          },
          {
            foreignKeyName: "research_entries_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "research_entries_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "route_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      research_items: {
        Row: {
          category: string
          created_at: string
          currency: string | null
          day_id: string | null
          destination_place_id: string | null
          destination_text: string | null
          end_date: string | null
          end_time: string | null
          id: string
          itinerary_item_id: string | null
          journey_type: string | null
          links: Json
          location_place_id: string | null
          location_text: string | null
          note: string | null
          observed_at: string
          origin_place_id: string | null
          origin_text: string | null
          segments: Json
          source_url: string | null
          start_date: string | null
          start_time: string | null
          title: string | null
          total_price_amount: number | null
          trip_id: string
          updated_at: string
        }
        Insert: {
          category: string
          created_at?: string
          currency?: string | null
          day_id?: string | null
          destination_place_id?: string | null
          destination_text?: string | null
          end_date?: string | null
          end_time?: string | null
          id?: string
          itinerary_item_id?: string | null
          journey_type?: string | null
          links?: Json
          location_place_id?: string | null
          location_text?: string | null
          note?: string | null
          observed_at?: string
          origin_place_id?: string | null
          origin_text?: string | null
          segments?: Json
          source_url?: string | null
          start_date?: string | null
          start_time?: string | null
          title?: string | null
          total_price_amount?: number | null
          trip_id: string
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          currency?: string | null
          day_id?: string | null
          destination_place_id?: string | null
          destination_text?: string | null
          end_date?: string | null
          end_time?: string | null
          id?: string
          itinerary_item_id?: string | null
          journey_type?: string | null
          links?: Json
          location_place_id?: string | null
          location_text?: string | null
          note?: string | null
          observed_at?: string
          origin_place_id?: string | null
          origin_text?: string | null
          segments?: Json
          source_url?: string | null
          start_date?: string | null
          start_time?: string | null
          title?: string | null
          total_price_amount?: number | null
          trip_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "research_items_day_id_fkey"
            columns: ["day_id"]
            isOneToOne: false
            referencedRelation: "trip_days"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "research_items_destination_place_trip_fkey"
            columns: ["destination_place_id", "trip_id"]
            isOneToOne: false
            referencedRelation: "places"
            referencedColumns: ["id", "trip_id"]
          },
          {
            foreignKeyName: "research_items_itinerary_item_id_fkey"
            columns: ["itinerary_item_id"]
            isOneToOne: false
            referencedRelation: "itinerary_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "research_items_location_place_trip_fkey"
            columns: ["location_place_id", "trip_id"]
            isOneToOne: false
            referencedRelation: "places"
            referencedColumns: ["id", "trip_id"]
          },
          {
            foreignKeyName: "research_items_origin_place_trip_fkey"
            columns: ["origin_place_id", "trip_id"]
            isOneToOne: false
            referencedRelation: "places"
            referencedColumns: ["id", "trip_id"]
          },
          {
            foreignKeyName: "research_items_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      research_option_entries: {
        Row: {
          created_at: string
          entry_id: string
          option_id: string
          trip_id: string
        }
        Insert: {
          created_at?: string
          entry_id: string
          option_id: string
          trip_id: string
        }
        Update: {
          created_at?: string
          entry_id?: string
          option_id?: string
          trip_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "research_option_entries_entry_trip_fkey"
            columns: ["entry_id", "trip_id"]
            isOneToOne: false
            referencedRelation: "research_entries"
            referencedColumns: ["id", "trip_id"]
          },
          {
            foreignKeyName: "research_option_entries_option_trip_fkey"
            columns: ["option_id", "trip_id"]
            isOneToOne: false
            referencedRelation: "research_options"
            referencedColumns: ["id", "trip_id"]
          },
          {
            foreignKeyName: "research_option_entries_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      research_options: {
        Row: {
          category: string
          created_at: string
          currency: string | null
          id: string
          notes: string | null
          observed_at: string
          price_basis: string
          provider_label: string | null
          relevant_end_date: string | null
          relevant_start_date: string | null
          search_context: string | null
          source_url: string | null
          structured_details: Json
          taxes_included: boolean | null
          title: string
          topic_id: string
          total_price: number | null
          trip_id: string
          updated_at: string
        }
        Insert: {
          category: string
          created_at?: string
          currency?: string | null
          id?: string
          notes?: string | null
          observed_at?: string
          price_basis?: string
          provider_label?: string | null
          relevant_end_date?: string | null
          relevant_start_date?: string | null
          search_context?: string | null
          source_url?: string | null
          structured_details?: Json
          taxes_included?: boolean | null
          title: string
          topic_id: string
          total_price?: number | null
          trip_id: string
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          currency?: string | null
          id?: string
          notes?: string | null
          observed_at?: string
          price_basis?: string
          provider_label?: string | null
          relevant_end_date?: string | null
          relevant_start_date?: string | null
          search_context?: string | null
          source_url?: string | null
          structured_details?: Json
          taxes_included?: boolean | null
          title?: string
          topic_id?: string
          total_price?: number | null
          trip_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "research_options_topic_trip_fkey"
            columns: ["topic_id", "trip_id"]
            isOneToOne: false
            referencedRelation: "research_topics"
            referencedColumns: ["id", "trip_id"]
          },
          {
            foreignKeyName: "research_options_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      research_plan_applications: {
        Row: {
          affected_entity_ids: string[]
          after_snapshot: Json
          applied_at: string
          applied_by: string | null
          before_snapshot: Json
          created_at: string
          decision_slot_key: string
          id: string
          operation_type: string
          operations: Json
          reverted_at: string | null
          route_variant_id: string
          source_research_item_id: string | null
          status: string
          superseded_at: string | null
          superseded_by: string | null
          trip_id: string
        }
        Insert: {
          affected_entity_ids: string[]
          after_snapshot: Json
          applied_at?: string
          applied_by?: string | null
          before_snapshot: Json
          created_at?: string
          decision_slot_key: string
          id?: string
          operation_type: string
          operations: Json
          reverted_at?: string | null
          route_variant_id: string
          source_research_item_id?: string | null
          status?: string
          superseded_at?: string | null
          superseded_by?: string | null
          trip_id: string
        }
        Update: {
          affected_entity_ids?: string[]
          after_snapshot?: Json
          applied_at?: string
          applied_by?: string | null
          before_snapshot?: Json
          created_at?: string
          decision_slot_key?: string
          id?: string
          operation_type?: string
          operations?: Json
          reverted_at?: string | null
          route_variant_id?: string
          source_research_item_id?: string | null
          status?: string
          superseded_at?: string | null
          superseded_by?: string | null
          trip_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "research_plan_applications_research_trip_fkey"
            columns: ["source_research_item_id", "trip_id"]
            isOneToOne: false
            referencedRelation: "research_items"
            referencedColumns: ["id", "trip_id"]
          },
          {
            foreignKeyName: "research_plan_applications_superseded_by_fkey"
            columns: ["superseded_by"]
            isOneToOne: false
            referencedRelation: "research_plan_applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "research_plan_applications_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "research_plan_applications_variant_trip_fkey"
            columns: ["route_variant_id", "trip_id"]
            isOneToOne: false
            referencedRelation: "route_variants"
            referencedColumns: ["id", "trip_id"]
          },
        ]
      }
      research_topics: {
        Row: {
          category: string
          created_at: string
          day_id: string | null
          details: Json
          end_day_id: string | null
          id: string
          itinerary_item_id: string | null
          label: string
          label_key: string | null
          scope_kind: string
          scope_label: string | null
          scope_label_key: string | null
          trip_id: string
          updated_at: string
          variant_id: string | null
        }
        Insert: {
          category?: string
          created_at?: string
          day_id?: string | null
          details?: Json
          end_day_id?: string | null
          id?: string
          itinerary_item_id?: string | null
          label: string
          label_key?: string | null
          scope_kind?: string
          scope_label?: string | null
          scope_label_key?: string | null
          trip_id: string
          updated_at?: string
          variant_id?: string | null
        }
        Update: {
          category?: string
          created_at?: string
          day_id?: string | null
          details?: Json
          end_day_id?: string | null
          id?: string
          itinerary_item_id?: string | null
          label?: string
          label_key?: string | null
          scope_kind?: string
          scope_label?: string | null
          scope_label_key?: string | null
          trip_id?: string
          updated_at?: string
          variant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "research_topics_day_id_fkey"
            columns: ["day_id"]
            isOneToOne: false
            referencedRelation: "trip_days"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "research_topics_end_day_id_fkey"
            columns: ["end_day_id"]
            isOneToOne: false
            referencedRelation: "trip_days"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "research_topics_itinerary_item_id_fkey"
            columns: ["itinerary_item_id"]
            isOneToOne: false
            referencedRelation: "itinerary_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "research_topics_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "research_topics_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "route_variants"
            referencedColumns: ["id"]
          },
        ]
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
      variant_research_selections: {
        Row: {
          category: string
          created_at: string
          decision_slot_key: string
          id: string
          research_item_id: string
          route_variant_id: string
          trip_id: string
          updated_at: string
        }
        Insert: {
          category: string
          created_at?: string
          decision_slot_key: string
          id?: string
          research_item_id: string
          route_variant_id: string
          trip_id: string
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          decision_slot_key?: string
          id?: string
          research_item_id?: string
          route_variant_id?: string
          trip_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "variant_research_selections_research_trip_fkey"
            columns: ["research_item_id", "trip_id"]
            isOneToOne: false
            referencedRelation: "research_items"
            referencedColumns: ["id", "trip_id"]
          },
          {
            foreignKeyName: "variant_research_selections_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "variant_research_selections_variant_trip_fkey"
            columns: ["route_variant_id", "trip_id"]
            isOneToOne: false
            referencedRelation: "route_variants"
            referencedColumns: ["id", "trip_id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      apply_research_item_to_variant: {
        Args: {
          target_research_item_id: string
          target_trip_id: string
          target_variant_id: string
        }
        Returns: Json
      }
      apply_research_item_to_variant_phase_6b_p0: {
        Args: {
          target_research_item_id: string
          target_trip_id: string
          target_variant_id: string
        }
        Returns: Json
      }
      apply_research_item_to_variant_v2: {
        Args: {
          schedule_choice?: string
          target_item_id?: string
          target_research_item_id: string
          target_trip_id: string
          target_variant_id: string
        }
        Returns: Json
      }
      apply_research_item_to_variant_v2_phase_6b_canonical_price: {
        Args: {
          schedule_choice?: string
          target_item_id?: string
          target_research_item_id: string
          target_trip_id: string
          target_variant_id: string
        }
        Returns: Json
      }
      apply_research_item_to_variant_v2_phase_6b_complete_fields: {
        Args: {
          schedule_choice?: string
          target_item_id?: string
          target_research_item_id: string
          target_trip_id: string
          target_variant_id: string
        }
        Returns: Json
      }
      apply_research_item_to_variant_v2_phase_6b_legacy_journey: {
        Args: {
          schedule_choice?: string
          target_item_id?: string
          target_research_item_id: string
          target_trip_id: string
          target_variant_id: string
        }
        Returns: Json
      }
      apply_research_item_to_variant_v2_phase_6b_nightly_costs: {
        Args: {
          schedule_choice?: string
          target_item_id?: string
          target_research_item_id: string
          target_trip_id: string
          target_variant_id: string
        }
        Returns: Json
      }
      apply_research_item_to_variant_v2_phase_6b_p05: {
        Args: {
          schedule_choice?: string
          target_item_id?: string
          target_research_item_id: string
          target_trip_id: string
          target_variant_id: string
        }
        Returns: Json
      }
      apply_research_item_to_variant_v2_phase_6b_schedule: {
        Args: {
          schedule_choice?: string
          target_item_id?: string
          target_research_item_id: string
          target_trip_id: string
          target_variant_id: string
        }
        Returns: Json
      }
      apply_selected_research_item: {
        Args: {
          target_research_item_id: string
          target_trip_id: string
          target_variant_id: string
        }
        Returns: Json
      }
      clear_day_route_plan: {
        Args: { target_day_id: string; target_variant_id: string }
        Returns: undefined
      }
      clear_research_item_selection: {
        Args: {
          target_research_item_id: string
          target_trip_id: string
          target_variant_id: string
        }
        Returns: string
      }
      clear_route_variant_items: {
        Args: {
          target_item_ids: string[]
          target_trip_id: string
          target_variant_id: string
        }
        Returns: number
      }
      copy_itinerary_items_to_days: {
        Args: { source_item_ids: string[]; target_day_ids: string[] }
        Returns: number
      }
      create_public_itinerary_link: {
        Args: {
          requested_allow_route_explore?: boolean
          requested_default_view?: Database["public"]["Enums"]["public_itinerary_view"]
          requested_share_description?: string
          requested_share_title?: string
          requested_show_addresses?: boolean
          requested_show_map_routes?: boolean
          requested_show_notes?: boolean
          requested_show_quick_action_links?: boolean
          requested_show_times?: boolean
          target_variant_id: string
        }
        Returns: Json
      }
      create_research_option: {
        Args: {
          option_category: string
          option_currency: string
          option_notes: string
          option_observed_at: string
          option_price_basis: string
          option_provider_label: string
          option_relevant_end_date: string
          option_relevant_start_date: string
          option_search_context: string
          option_source_url: string
          option_structured_details: Json
          option_taxes_included: boolean
          option_title: string
          option_total_price: number
          source_entry_ids: string[]
          target_topic_id: string
          target_trip_id: string
          topic_category: string
          topic_day_id: string
          topic_itinerary_item_id: string
          topic_label: string
          topic_scope_kind: string
          topic_scope_label: string
          topic_variant_id: string
        }
        Returns: string
      }
      create_route_variant: {
        Args: {
          source_variant_id: string
          target_trip_id: string
          variant_color: string
          variant_name: string
        }
        Returns: string
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
      current_research_plan_application_ids: {
        Args: { target_trip_id: string; target_variant_id: string }
        Returns: string[]
      }
      delete_route_variant: {
        Args: { target_trip_id: string; target_variant_id: string }
        Returns: string
      }
      duplicate_route_variant: {
        Args: {
          source_variant_id: string
          target_trip_id: string
          variant_color: string
          variant_name: string
        }
        Returns: string
      }
      get_public_itinerary: { Args: { shared_token: string }; Returns: Json }
      get_public_itinerary_v2: { Args: { shared_token: string }; Returns: Json }
      insert_trip_day: {
        Args: { before_day_number: number; target_trip_id: string }
        Returns: string
      }
      insert_variant_day: {
        Args: {
          before_day_number: number
          target_trip_id: string
          target_variant_id: string
        }
        Returns: string
      }
      is_trip_member: { Args: { target_trip_id: string }; Returns: boolean }
      is_trip_owner: { Args: { target_trip_id: string }; Returns: boolean }
      itinerary_item_trip_id: {
        Args: { target_item_id: string }
        Returns: string
      }
      list_public_itinerary_links: {
        Args: { target_trip_id: string }
        Returns: Json
      }
      remove_trip_day: {
        Args: { target_day_id: string; target_trip_id: string }
        Returns: string
      }
      remove_variant_day: {
        Args: {
          target_day_id: string
          target_trip_id: string
          target_variant_id: string
        }
        Returns: string
      }
      reorder_itinerary_items: {
        Args: { ordered_item_ids: string[]; target_day_id: string }
        Returns: undefined
      }
      reorder_variant_days: {
        Args: {
          ordered_day_ids: string[]
          target_trip_id: string
          target_variant_id: string
        }
        Returns: undefined
      }
      research_application_matches_current: {
        Args: { target_application_id: string }
        Returns: boolean
      }
      research_context_matches_trip: {
        Args: {
          target_day_id: string
          target_end_day_id: string
          target_itinerary_item_id: string
          target_trip_id: string
          target_variant_id: string
        }
        Returns: boolean
      }
      research_created_item_snapshot: {
        Args: {
          target_item: Database["public"]["Tables"]["itinerary_items"]["Row"]
        }
        Returns: Json
      }
      research_decision_slot_key: {
        Args: {
          target_category: string
          target_day_id: string
          target_destination: string
          target_end_date: string
          target_itinerary_item_id: string
          target_location: string
          target_origin: string
          target_start_date: string
        }
        Returns: string
      }
      research_decision_slot_key_v2: {
        Args: {
          target_category: string
          target_day_id: string
          target_destination: string
          target_end_date: string
          target_itinerary_item_id: string
          target_location: string
          target_origin: string
          target_segments: Json
          target_start_date: string
        }
        Returns: string
      }
      research_item_is_comparison_ready: {
        Args: {
          target_category: string
          target_currency: string
          target_destination: string
          target_end_date: string
          target_location: string
          target_origin: string
          target_start_date: string
          target_total_price: number
        }
        Returns: boolean
      }
      research_item_is_comparison_ready_v2: {
        Args: {
          target_category: string
          target_currency: string
          target_destination: string
          target_end_date: string
          target_journey_type: string
          target_location: string
          target_origin: string
          target_segments: Json
          target_start_date: string
          target_total_price: number
        }
        Returns: boolean
      }
      research_owned_item_snapshot: {
        Args: {
          target_item: Database["public"]["Tables"]["itinerary_items"]["Row"]
        }
        Returns: Json
      }
      revert_research_plan_application: {
        Args: { target_application_id: string; target_trip_id: string }
        Returns: Json
      }
      revert_research_plan_application_phase_6b_complete_price: {
        Args: { target_application_id: string; target_trip_id: string }
        Returns: Json
      }
      revert_research_plan_application_phase_6b_p0: {
        Args: { target_application_id: string; target_trip_id: string }
        Returns: Json
      }
      revert_research_plan_application_phase_6b_p05: {
        Args: { target_application_id: string; target_trip_id: string }
        Returns: Json
      }
      revert_research_plan_application_phase_6b_schedule: {
        Args: { target_application_id: string; target_trip_id: string }
        Returns: Json
      }
      revoke_public_itinerary_link: {
        Args: { target_link_id: string }
        Returns: undefined
      }
      rotate_public_itinerary_link: {
        Args: { target_link_id: string }
        Returns: Json
      }
      save_day_route_calculation: {
        Args: {
          calculated_config_signature: string
          calculated_provider_schema_version?: string
          calculated_total_distance_meters: number
          calculated_total_duration_seconds: number
          normalized_calculated_legs: Json
          target_plan_id: string
        }
        Returns: undefined
      }
      save_day_route_plan: {
        Args: {
          ordered_item_ids: string[]
          requested_leg_modes: string[]
          target_day_id: string
          target_variant_id: string
        }
        Returns: string
      }
      select_research_item_for_variant: {
        Args: {
          target_research_item_id: string
          target_trip_id: string
          target_variant_id: string
        }
        Returns: Json
      }
      select_research_item_for_variant_phase_6b_p05: {
        Args: {
          target_research_item_id: string
          target_trip_id: string
          target_variant_id: string
        }
        Returns: Json
      }
      set_primary_route_variant: {
        Args: { target_trip_id: string; target_variant_id: string }
        Returns: string
      }
      sync_trip_schedule_from_primary_days: {
        Args: { target_trip_id: string }
        Returns: undefined
      }
      update_public_itinerary_link: {
        Args: {
          requested_allow_route_explore: boolean
          requested_default_view: Database["public"]["Enums"]["public_itinerary_view"]
          requested_share_description: string
          requested_share_title: string
          requested_show_addresses: boolean
          requested_show_map_routes: boolean
          requested_show_notes: boolean
          requested_show_quick_action_links: boolean
          requested_show_times: boolean
          target_link_id: string
        }
        Returns: Json
      }
      update_route_variant_metadata: {
        Args: {
          target_trip_id: string
          target_variant_id: string
          variant_color: string
          variant_name: string
        }
        Returns: string
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
      upsert_google_place_snapshot: {
        Args: {
          place_display_name: string
          place_formatted_address: string
          place_latitude: number
          place_longitude: number
          provider_place_id: string
          target_trip_id: string
        }
        Returns: string
      }
      upsert_google_place_snapshot_v2: {
        Args: {
          place_administrative_area_name?: string
          place_country_code?: string
          place_display_name: string
          place_formatted_address: string
          place_latitude: number
          place_locality_kind?: string
          place_locality_name?: string
          place_longitude: number
          provider_place_id: string
          target_trip_id: string
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
      public_itinerary_view: "overview" | "table" | "timeline"
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
      public_itinerary_view: ["overview", "table", "timeline"],
      trip_member_role: ["owner", "editor", "viewer"],
    },
  },
} as const
