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
      asset_deletion_queue: {
        Row: {
          asset_id: string
          attempts: number
          bucket: string
          created_at: string
          last_error: string | null
          next_attempt_at: string
          object_key: string
          owner_id: string
          thumbnail_object_key: string | null
          updated_at: string
        }
        Insert: {
          asset_id: string
          attempts?: number
          bucket: string
          created_at?: string
          last_error?: string | null
          next_attempt_at?: string
          object_key: string
          owner_id: string
          thumbnail_object_key?: string | null
          updated_at?: string
        }
        Update: {
          asset_id?: string
          attempts?: number
          bucket?: string
          created_at?: string
          last_error?: string | null
          next_attempt_at?: string
          object_key?: string
          owner_id?: string
          thumbnail_object_key?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      asset_links: {
        Row: {
          applied_from_research_application_id: string | null
          asset_id: string
          created_at: string
          display_filename: string
          draft_expires_at: string | null
          draft_session_id: string | null
          id: string
          include_in_share: boolean
          itinerary_item_id: string | null
          owner_id: string
          public_ref: string
          research_application_id: string | null
          research_item_id: string | null
          sort_order: number
          trip_id: string
          updated_at: string
        }
        Insert: {
          applied_from_research_application_id?: string | null
          asset_id: string
          created_at?: string
          display_filename: string
          draft_expires_at?: string | null
          draft_session_id?: string | null
          id?: string
          include_in_share?: boolean
          itinerary_item_id?: string | null
          owner_id: string
          public_ref?: string
          research_application_id?: string | null
          research_item_id?: string | null
          sort_order?: number
          trip_id: string
          updated_at?: string
        }
        Update: {
          applied_from_research_application_id?: string | null
          asset_id?: string
          created_at?: string
          display_filename?: string
          draft_expires_at?: string | null
          draft_session_id?: string | null
          id?: string
          include_in_share?: boolean
          itinerary_item_id?: string | null
          owner_id?: string
          public_ref?: string
          research_application_id?: string | null
          research_item_id?: string | null
          sort_order?: number
          trip_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "asset_links_applied_research_application_fkey"
            columns: ["applied_from_research_application_id", "trip_id"]
            isOneToOne: false
            referencedRelation: "research_plan_applications"
            referencedColumns: ["id", "trip_id"]
          },
          {
            foreignKeyName: "asset_links_asset_owner_fkey"
            columns: ["asset_id", "owner_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id", "owner_id"]
          },
          {
            foreignKeyName: "asset_links_item_trip_fkey"
            columns: ["itinerary_item_id", "trip_id"]
            isOneToOne: false
            referencedRelation: "itinerary_items"
            referencedColumns: ["id", "trip_id"]
          },
          {
            foreignKeyName: "asset_links_research_application_trip_fkey"
            columns: ["research_application_id", "trip_id"]
            isOneToOne: false
            referencedRelation: "research_plan_applications"
            referencedColumns: ["id", "trip_id"]
          },
          {
            foreignKeyName: "asset_links_research_trip_fkey"
            columns: ["research_item_id", "trip_id"]
            isOneToOne: false
            referencedRelation: "research_items"
            referencedColumns: ["id", "trip_id"]
          },
          {
            foreignKeyName: "asset_links_trip_owner_fkey"
            columns: ["trip_id", "owner_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id", "owner_id"]
          },
        ]
      }
      assets: {
        Row: {
          bucket: string
          byte_size: number
          created_at: string
          duration_seconds: number | null
          failure_reason: string | null
          finalized_at: string | null
          height: number | null
          id: string
          media_kind: Database["public"]["Enums"]["asset_media_kind"]
          mime_type: string
          object_key: string
          owner_id: string
          pending_expires_at: string | null
          sha256: string
          status: Database["public"]["Enums"]["asset_status"]
          storage_provider: string
          thumbnail_object_key: string | null
          updated_at: string
          width: number | null
        }
        Insert: {
          bucket?: string
          byte_size: number
          created_at?: string
          duration_seconds?: number | null
          failure_reason?: string | null
          finalized_at?: string | null
          height?: number | null
          id?: string
          media_kind: Database["public"]["Enums"]["asset_media_kind"]
          mime_type: string
          object_key: string
          owner_id: string
          pending_expires_at?: string | null
          sha256: string
          status?: Database["public"]["Enums"]["asset_status"]
          storage_provider?: string
          thumbnail_object_key?: string | null
          updated_at?: string
          width?: number | null
        }
        Update: {
          bucket?: string
          byte_size?: number
          created_at?: string
          duration_seconds?: number | null
          failure_reason?: string | null
          finalized_at?: string | null
          height?: number | null
          id?: string
          media_kind?: Database["public"]["Enums"]["asset_media_kind"]
          mime_type?: string
          object_key?: string
          owner_id?: string
          pending_expires_at?: string | null
          sha256?: string
          status?: Database["public"]["Enums"]["asset_status"]
          storage_provider?: string
          thumbnail_object_key?: string | null
          updated_at?: string
          width?: number | null
        }
        Relationships: []
      }
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
          coordinate_system: string
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
          provider_place_id: string | null
          source: Database["public"]["Enums"]["place_source"]
          trip_id: string
        }
        Insert: {
          administrative_area_name?: string | null
          coordinate_system?: string
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
          provider_place_id?: string | null
          source: Database["public"]["Enums"]["place_source"]
          trip_id: string
        }
        Update: {
          administrative_area_name?: string | null
          coordinate_system?: string
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
          provider_place_id?: string | null
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
          home_city: string | null
          id: string
          preferred_locale: string
          username: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          default_currency?: string
          default_timezone?: string | null
          display_name?: string | null
          home_city?: string | null
          id: string
          preferred_locale?: string
          username?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          default_currency?: string
          default_timezone?: string | null
          display_name?: string | null
          home_city?: string | null
          id?: string
          preferred_locale?: string
          username?: string | null
        }
        Relationships: []
      }
      public_itinerary_links: {
        Row: {
          allow_long_image_download: boolean
          allow_route_explore: boolean
          created_at: string
          created_by: string
          default_view: Database["public"]["Enums"]["public_itinerary_view"]
          id: string
          long_image_end_day_number: number | null
          long_image_qr_destination: string
          long_image_qr_share_page_id: string | null
          long_image_start_day_number: number | null
          public_token: string
          published_at: string | null
          published_snapshot: Json | null
          revoked_at: string | null
          share_description: string | null
          share_title: string | null
          show_addresses: boolean
          show_attachments: boolean
          show_map_routes: boolean
          show_notes: boolean
          show_place_photos: boolean
          show_quick_action_links: boolean
          show_times: boolean
          snapshot_hash: string | null
          template_id: string
          template_version: number
          trip_id: string | null
          updated_at: string
          variant_id: string | null
        }
        Insert: {
          allow_long_image_download?: boolean
          allow_route_explore?: boolean
          created_at?: string
          created_by: string
          default_view?: Database["public"]["Enums"]["public_itinerary_view"]
          id?: string
          long_image_end_day_number?: number | null
          long_image_qr_destination?: string
          long_image_qr_share_page_id?: string | null
          long_image_start_day_number?: number | null
          public_token?: string
          published_at?: string | null
          published_snapshot?: Json | null
          revoked_at?: string | null
          share_description?: string | null
          share_title?: string | null
          show_addresses?: boolean
          show_attachments?: boolean
          show_map_routes?: boolean
          show_notes?: boolean
          show_place_photos?: boolean
          show_quick_action_links?: boolean
          show_times?: boolean
          snapshot_hash?: string | null
          template_id?: string
          template_version?: number
          trip_id?: string | null
          updated_at?: string
          variant_id?: string | null
        }
        Update: {
          allow_long_image_download?: boolean
          allow_route_explore?: boolean
          created_at?: string
          created_by?: string
          default_view?: Database["public"]["Enums"]["public_itinerary_view"]
          id?: string
          long_image_end_day_number?: number | null
          long_image_qr_destination?: string
          long_image_qr_share_page_id?: string | null
          long_image_start_day_number?: number | null
          public_token?: string
          published_at?: string | null
          published_snapshot?: Json | null
          revoked_at?: string | null
          share_description?: string | null
          share_title?: string | null
          show_addresses?: boolean
          show_attachments?: boolean
          show_map_routes?: boolean
          show_notes?: boolean
          show_place_photos?: boolean
          show_quick_action_links?: boolean
          show_times?: boolean
          snapshot_hash?: string | null
          template_id?: string
          template_version?: number
          trip_id?: string | null
          updated_at?: string
          variant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "public_itinerary_links_long_image_qr_share_page_fkey"
            columns: ["long_image_qr_share_page_id"]
            isOneToOne: false
            referencedRelation: "public_itinerary_links"
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
          adult_count: number | null
          category: string
          child_count: number | null
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
          room_count: number | null
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
          adult_count?: number | null
          category: string
          child_count?: number | null
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
          room_count?: number | null
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
          adult_count?: number | null
          category?: string
          child_count?: number | null
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
          room_count?: number | null
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
      share_image_exports: {
        Row: {
          created_at: string
          current_version_id: string | null
          expires_at: string
          id: string
          owner_id: string
          permanent_slug: string
          qr_destination_type: string
          qr_destination_url: string
          render_config: Json
          revoked_at: string | null
          share_page_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          current_version_id?: string | null
          expires_at?: string
          id?: string
          owner_id: string
          permanent_slug?: string
          qr_destination_type: string
          qr_destination_url: string
          render_config: Json
          revoked_at?: string | null
          share_page_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          current_version_id?: string | null
          expires_at?: string
          id?: string
          owner_id?: string
          permanent_slug?: string
          qr_destination_type?: string
          qr_destination_url?: string
          render_config?: Json
          revoked_at?: string | null
          share_page_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "share_image_exports_current_version_fkey"
            columns: ["current_version_id"]
            isOneToOne: false
            referencedRelation: "share_image_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "share_image_exports_share_page_id_fkey"
            columns: ["share_page_id"]
            isOneToOne: false
            referencedRelation: "public_itinerary_links"
            referencedColumns: ["id"]
          },
        ]
      }
      share_image_parts: {
        Row: {
          byte_size: number
          checksum: string
          content_type: string
          height: number
          part_number: number
          storage_path: string
          version_id: string
          width: number
        }
        Insert: {
          byte_size: number
          checksum: string
          content_type?: string
          height: number
          part_number: number
          storage_path: string
          version_id: string
          width: number
        }
        Update: {
          byte_size?: number
          checksum?: string
          content_type?: string
          height?: number
          part_number?: number
          storage_path?: string
          version_id?: string
          width?: number
        }
        Relationships: [
          {
            foreignKeyName: "share_image_parts_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "share_image_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      share_image_versions: {
        Row: {
          created_at: string
          error_message: string | null
          export_id: string
          id: string
          ready_at: string | null
          render_config: Json
          source_snapshot: Json
          source_snapshot_hash: string
          status: string
          version_number: number
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          export_id: string
          id?: string
          ready_at?: string | null
          render_config: Json
          source_snapshot: Json
          source_snapshot_hash: string
          status?: string
          version_number: number
        }
        Update: {
          created_at?: string
          error_message?: string | null
          export_id?: string
          id?: string
          ready_at?: string | null
          render_config?: Json
          source_snapshot?: Json
          source_snapshot_hash?: string
          status?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "share_image_versions_export_id_fkey"
            columns: ["export_id"]
            isOneToOne: false
            referencedRelation: "share_image_exports"
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
          status: string
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
          status?: string
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
          status?: string
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
      asset_cleanup_batch_v1: {
        Args: { requested_limit?: number }
        Returns: Json
      }
      asset_cleanup_batch_v2: {
        Args: { requested_limit?: number }
        Returns: Json
      }
      asset_link_owner_json_v1: {
        Args: { target_link_id: string }
        Returns: Json
      }
      asset_link_owner_json_v2: {
        Args: { target_link_id: string }
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
      commit_item_asset_session_v1: {
        Args: {
          requested_draft_session_id: string
          target_item_id: string
          target_trip_id: string
        }
        Returns: Json
      }
      commit_research_asset_session_v1: {
        Args: {
          requested_draft_session_id: string
          target_research_item_id: string
          target_trip_id: string
        }
        Returns: Json
      }
      copy_research_assets_to_items_v1: {
        Args: {
          target_application_id: string
          target_item_ids: string[]
          target_research_item_id: string
          target_trip_id: string
        }
        Returns: undefined
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
      create_public_itinerary_link_v2: {
        Args: {
          requested_allow_route_explore?: boolean
          requested_default_view?: Database["public"]["Enums"]["public_itinerary_view"]
          requested_share_description?: string
          requested_share_title?: string
          requested_show_addresses?: boolean
          requested_show_map_routes?: boolean
          requested_show_notes?: boolean
          requested_show_place_photos?: boolean
          requested_show_quick_action_links?: boolean
          requested_show_times?: boolean
          target_variant_id: string
        }
        Returns: Json
      }
      create_public_itinerary_link_v3: {
        Args: {
          requested_allow_route_explore?: boolean
          requested_default_view?: Database["public"]["Enums"]["public_itinerary_view"]
          requested_share_description?: string
          requested_share_title?: string
          requested_show_addresses?: boolean
          requested_show_map_routes?: boolean
          requested_show_notes?: boolean
          requested_show_place_photos?: boolean
          requested_show_quick_action_links?: boolean
          requested_show_times?: boolean
          requested_template_id?: string
          requested_template_version?: number
          target_variant_id: string
        }
        Returns: Json
      }
      create_public_itinerary_link_v4: {
        Args: {
          requested_allow_route_explore?: boolean
          requested_default_view?: Database["public"]["Enums"]["public_itinerary_view"]
          requested_share_description?: string
          requested_share_title?: string
          requested_show_addresses?: boolean
          requested_show_map_routes?: boolean
          requested_show_notes?: boolean
          requested_show_place_photos?: boolean
          requested_show_quick_action_links?: boolean
          requested_show_times?: boolean
          requested_template_id?: string
          requested_template_version?: number
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
      create_share_page_v1: {
        Args: {
          requested_allow_long_image_download?: boolean
          requested_allow_route_explore?: boolean
          requested_default_view?: Database["public"]["Enums"]["public_itinerary_view"]
          requested_long_image_qr_destination?: string
          requested_long_image_qr_share_page_id?: string
          requested_share_description?: string
          requested_share_title?: string
          requested_show_addresses?: boolean
          requested_show_map_routes?: boolean
          requested_show_notes?: boolean
          requested_show_place_photos?: boolean
          requested_show_quick_action_links?: boolean
          requested_show_times?: boolean
          requested_template_id?: string
          requested_template_version?: number
          target_variant_id: string
        }
        Returns: Json
      }
      create_share_page_v2: {
        Args: {
          requested_allow_long_image_download?: boolean
          requested_allow_route_explore?: boolean
          requested_default_view?: Database["public"]["Enums"]["public_itinerary_view"]
          requested_long_image_end_day_number?: number
          requested_long_image_qr_destination?: string
          requested_long_image_qr_share_page_id?: string
          requested_long_image_start_day_number?: number
          requested_share_description?: string
          requested_share_title?: string
          requested_show_addresses?: boolean
          requested_show_map_routes?: boolean
          requested_show_notes?: boolean
          requested_show_place_photos?: boolean
          requested_show_quick_action_links?: boolean
          requested_show_times?: boolean
          requested_template_id?: string
          requested_template_version?: number
          target_variant_id: string
        }
        Returns: Json
      }
      create_share_page_v3: {
        Args: {
          requested_allow_long_image_download?: boolean
          requested_allow_route_explore?: boolean
          requested_default_view?: Database["public"]["Enums"]["public_itinerary_view"]
          requested_long_image_end_day_number?: number
          requested_long_image_qr_destination?: string
          requested_long_image_qr_share_page_id?: string
          requested_long_image_start_day_number?: number
          requested_share_description?: string
          requested_share_title?: string
          requested_show_addresses?: boolean
          requested_show_attachments?: boolean
          requested_show_map_routes?: boolean
          requested_show_notes?: boolean
          requested_show_place_photos?: boolean
          requested_show_quick_action_links?: boolean
          requested_show_times?: boolean
          requested_template_id?: string
          requested_template_version?: number
          target_variant_id: string
        }
        Returns: Json
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
      create_trip_v2: {
        Args: {
          trip_currency?: string
          trip_day_count?: number
          trip_end_date?: string
          trip_locale?: string
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
      detach_item_asset_v1: {
        Args: {
          requested_public_ref: string
          target_item_id: string
          target_trip_id: string
        }
        Returns: string
      }
      detach_research_asset_v1: {
        Args: {
          requested_public_ref: string
          target_research_item_id: string
          target_trip_id: string
        }
        Returns: string
      }
      discard_item_asset_session_v1: {
        Args: {
          requested_draft_session_id: string
          target_item_id: string
          target_trip_id: string
        }
        Returns: number
      }
      discard_research_asset_session_v1: {
        Args: {
          requested_draft_session_id: string
          target_research_item_id: string
          target_trip_id: string
        }
        Returns: number
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
      expired_share_image_cleanup_batch_v1: {
        Args: { requested_limit?: number }
        Returns: Json
      }
      fail_asset_cleanup_v1: {
        Args: { requested_error: string; target_asset_id: string }
        Returns: undefined
      }
      fail_item_asset_v1: {
        Args: { requested_reason: string; target_asset_id: string }
        Returns: undefined
      }
      fail_share_image_version_v1: {
        Args: { requested_error_message: string; target_version_id: string }
        Returns: undefined
      }
      finalize_asset_cleanup_v1: {
        Args: { target_asset_ids: string[] }
        Returns: number
      }
      finalize_expired_share_image_cleanup_v1: {
        Args: { target_export_ids: string[] }
        Returns: number
      }
      finalize_item_asset_v1: {
        Args: {
          target_asset_id: string
          thumbnail_ready?: boolean
          verified_byte_size: number
          verified_duration_seconds?: number
          verified_height?: number
          verified_media_kind: Database["public"]["Enums"]["asset_media_kind"]
          verified_mime_type: string
          verified_sha256: string
          verified_width?: number
        }
        Returns: Json
      }
      finalize_item_asset_v2: {
        Args: {
          target_asset_id: string
          thumbnail_ready?: boolean
          verified_byte_size: number
          verified_duration_seconds?: number
          verified_height?: number
          verified_media_kind: Database["public"]["Enums"]["asset_media_kind"]
          verified_mime_type: string
          verified_sha256: string
          verified_width?: number
        }
        Returns: Json
      }
      finalize_research_asset_v1: {
        Args: {
          target_asset_id: string
          thumbnail_ready?: boolean
          verified_byte_size: number
          verified_duration_seconds?: number
          verified_height?: number
          verified_media_kind: Database["public"]["Enums"]["asset_media_kind"]
          verified_mime_type: string
          verified_sha256: string
          verified_width?: number
        }
        Returns: Json
      }
      finalize_share_image_version_v1: {
        Args: { requested_parts: Json; target_version_id: string }
        Returns: Json
      }
      get_public_itinerary: { Args: { shared_token: string }; Returns: Json }
      get_public_itinerary_v2: { Args: { shared_token: string }; Returns: Json }
      get_public_itinerary_v3: { Args: { shared_token: string }; Returns: Json }
      get_public_itinerary_v4: { Args: { shared_token: string }; Returns: Json }
      get_public_share_page_v1: {
        Args: { shared_token: string }
        Returns: Json
      }
      get_public_share_page_v2: {
        Args: { shared_token: string }
        Returns: Json
      }
      get_public_share_page_v3: {
        Args: { shared_token: string }
        Returns: Json
      }
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
      list_public_itinerary_links_v2: {
        Args: { target_trip_id: string }
        Returns: Json
      }
      list_public_itinerary_links_v3: {
        Args: { target_trip_id: string }
        Returns: Json
      }
      list_share_pages_v1: { Args: { target_trip_id: string }; Returns: Json }
      list_share_pages_v2: { Args: { target_trip_id: string }; Returns: Json }
      owner_asset_access_v1: {
        Args: { requested_public_ref: string; target_trip_id: string }
        Returns: Json
      }
      owner_share_image_export_paths_v1: {
        Args: { target_export_id: string }
        Returns: Json
      }
      owner_share_page_by_token_v1: {
        Args: { shared_token: string }
        Returns: Json
      }
      owner_share_page_by_token_v2: {
        Args: { shared_token: string }
        Returns: Json
      }
      owner_share_page_image_state_v1: {
        Args: { target_share_page_id: string }
        Returns: Json
      }
      owner_share_page_v1: {
        Args: { target_share_page_id: string }
        Returns: Json
      }
      owner_share_page_v2: {
        Args: { target_share_page_id: string }
        Returns: Json
      }
      owns_pending_share_image_object_v1: {
        Args: { requested_name: string }
        Returns: boolean
      }
      owns_share_image_object_v1: {
        Args: { requested_name: string }
        Returns: boolean
      }
      prepare_item_asset_v1: {
        Args: {
          requested_byte_size: number
          requested_filename: string
          requested_media_kind: Database["public"]["Enums"]["asset_media_kind"]
          requested_mime_type: string
          requested_sha256: string
          target_item_id: string
          target_trip_id: string
        }
        Returns: Json
      }
      prepare_item_asset_v2: {
        Args: {
          requested_byte_size: number
          requested_filename: string
          requested_media_kind: Database["public"]["Enums"]["asset_media_kind"]
          requested_mime_type: string
          requested_sha256: string
          target_item_id: string
          target_trip_id: string
        }
        Returns: Json
      }
      prepare_item_asset_v3: {
        Args: {
          requested_byte_size: number
          requested_draft_session_id: string
          requested_filename: string
          requested_media_kind: Database["public"]["Enums"]["asset_media_kind"]
          requested_mime_type: string
          requested_sha256: string
          target_item_id: string
          target_trip_id: string
        }
        Returns: Json
      }
      prepare_research_asset_v1: {
        Args: {
          requested_byte_size: number
          requested_draft_session_id: string
          requested_filename: string
          requested_media_kind: Database["public"]["Enums"]["asset_media_kind"]
          requested_mime_type: string
          requested_sha256: string
          target_research_item_id: string
          target_trip_id: string
        }
        Returns: Json
      }
      prepare_share_image_version_v1: {
        Args: {
          requested_mode: string
          requested_qr_destination_type: string
          requested_qr_destination_url: string
          requested_render_config: Json
          target_export_id: string
          target_share_page_id: string
        }
        Returns: Json
      }
      prepare_share_image_version_v2: {
        Args: {
          requested_mode: string
          requested_qr_destination_type: string
          requested_qr_destination_url: string
          requested_render_config: Json
          target_export_id: string
          target_share_page_id: string
        }
        Returns: Json
      }
      public_share_image_manifest_v1: {
        Args: { requested_slug: string }
        Returns: Json
      }
      public_share_page_image_v1: {
        Args: { shared_token: string }
        Returns: Json
      }
      public_share_page_owner_json: {
        Args: {
          managed_link: Database["public"]["Tables"]["public_itinerary_links"]["Row"]
        }
        Returns: Json
      }
      public_share_page_owner_json_v2: {
        Args: {
          managed_link: Database["public"]["Tables"]["public_itinerary_links"]["Row"]
        }
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
      revoke_share_image_export_v1: {
        Args: { target_export_id: string }
        Returns: undefined
      }
      revoke_share_page_v1: {
        Args: { target_share_page_id: string }
        Returns: undefined
      }
      rotate_public_itinerary_link: {
        Args: { target_link_id: string }
        Returns: Json
      }
      rotate_public_itinerary_link_v2: {
        Args: { target_link_id: string }
        Returns: Json
      }
      rotate_public_itinerary_link_v3: {
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
      service_public_asset_access_v1: {
        Args: { requested_public_ref: string; shared_token: string }
        Returns: Json
      }
      service_public_asset_access_v2: {
        Args: { requested_public_ref: string; shared_token: string }
        Returns: Json
      }
      set_item_asset_share_v1: {
        Args: {
          requested_include_in_share: boolean
          requested_public_ref: string
          target_item_id: string
          target_trip_id: string
        }
        Returns: Json
      }
      set_item_asset_share_v2: {
        Args: {
          requested_include_in_share: boolean
          requested_public_ref: string
          target_item_id: string
          target_trip_id: string
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
      untracked_asset_storage_batch_v1: {
        Args: { requested_limit?: number }
        Returns: Json
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
      update_public_itinerary_link_v2: {
        Args: {
          requested_allow_route_explore: boolean
          requested_default_view: Database["public"]["Enums"]["public_itinerary_view"]
          requested_share_description: string
          requested_share_title: string
          requested_show_addresses: boolean
          requested_show_map_routes: boolean
          requested_show_notes: boolean
          requested_show_place_photos: boolean
          requested_show_quick_action_links: boolean
          requested_show_times: boolean
          target_link_id: string
        }
        Returns: Json
      }
      update_public_itinerary_link_v3: {
        Args: {
          requested_allow_route_explore: boolean
          requested_default_view: Database["public"]["Enums"]["public_itinerary_view"]
          requested_share_description: string
          requested_share_title: string
          requested_show_addresses: boolean
          requested_show_map_routes: boolean
          requested_show_notes: boolean
          requested_show_place_photos: boolean
          requested_show_quick_action_links: boolean
          requested_show_times: boolean
          requested_template_id: string
          requested_template_version: number
          target_link_id: string
        }
        Returns: Json
      }
      update_public_itinerary_link_v4: {
        Args: {
          requested_allow_route_explore: boolean
          requested_default_view: Database["public"]["Enums"]["public_itinerary_view"]
          requested_share_description: string
          requested_share_title: string
          requested_show_addresses: boolean
          requested_show_map_routes: boolean
          requested_show_notes: boolean
          requested_show_place_photos: boolean
          requested_show_quick_action_links: boolean
          requested_show_times: boolean
          requested_template_id: string
          requested_template_version: number
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
      update_share_page_v1: {
        Args: {
          requested_allow_long_image_download: boolean
          requested_allow_route_explore: boolean
          requested_default_view: Database["public"]["Enums"]["public_itinerary_view"]
          requested_long_image_qr_destination: string
          requested_long_image_qr_share_page_id?: string
          requested_share_description: string
          requested_share_title: string
          requested_show_addresses: boolean
          requested_show_map_routes: boolean
          requested_show_notes: boolean
          requested_show_place_photos: boolean
          requested_show_quick_action_links: boolean
          requested_show_times: boolean
          requested_template_id: string
          requested_template_version: number
          target_share_page_id: string
        }
        Returns: Json
      }
      update_share_page_v2: {
        Args: {
          requested_allow_long_image_download: boolean
          requested_allow_route_explore: boolean
          requested_default_view: Database["public"]["Enums"]["public_itinerary_view"]
          requested_long_image_end_day_number?: number
          requested_long_image_qr_destination: string
          requested_long_image_qr_share_page_id?: string
          requested_long_image_start_day_number?: number
          requested_share_description: string
          requested_share_title: string
          requested_show_addresses: boolean
          requested_show_map_routes: boolean
          requested_show_notes: boolean
          requested_show_place_photos: boolean
          requested_show_quick_action_links: boolean
          requested_show_times: boolean
          requested_template_id: string
          requested_template_version: number
          target_share_page_id: string
        }
        Returns: Json
      }
      update_share_page_v3: {
        Args: {
          requested_allow_long_image_download: boolean
          requested_allow_route_explore: boolean
          requested_default_view: Database["public"]["Enums"]["public_itinerary_view"]
          requested_long_image_end_day_number?: number
          requested_long_image_qr_destination: string
          requested_long_image_qr_share_page_id?: string
          requested_long_image_start_day_number?: number
          requested_share_description: string
          requested_share_title: string
          requested_show_addresses: boolean
          requested_show_attachments?: boolean
          requested_show_map_routes: boolean
          requested_show_notes: boolean
          requested_show_place_photos: boolean
          requested_show_quick_action_links: boolean
          requested_show_times: boolean
          requested_template_id: string
          requested_template_version: number
          target_share_page_id: string
        }
        Returns: Json
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
      upsert_place_snapshot_v3: {
        Args: {
          place_administrative_area_name?: string
          place_coordinate_system: string
          place_country_code?: string
          place_display_name: string
          place_formatted_address: string
          place_latitude: number
          place_locality_kind?: string
          place_locality_name?: string
          place_locality_source?: string
          place_longitude: number
          place_provider: string
          provider_place_id: string
          target_trip_id: string
        }
        Returns: string
      }
      variant_trip_id: { Args: { target_variant_id: string }; Returns: string }
    }
    Enums: {
      asset_media_kind: "image" | "pdf" | "video"
      asset_status: "pending" | "ready" | "failed" | "deleting"
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
      place_source: "google" | "amap" | "custom"
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
      asset_media_kind: ["image", "pdf", "video"],
      asset_status: ["pending", "ready", "failed", "deleting"],
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
      place_source: ["google", "amap", "custom"],
      public_itinerary_view: ["overview", "table", "timeline"],
      trip_member_role: ["owner", "editor", "viewer"],
    },
  },
} as const
