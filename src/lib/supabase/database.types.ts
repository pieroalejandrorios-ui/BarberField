// Escrito a mano con el formato de `supabase gen types typescript` a partir de
// las migraciones en `supabase/migrations/`. Regenerar con el CLI cuando esté
// disponible y reemplazar este archivo.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "12"
  }
  public: {
    Tables: {
      barbershop_members: {
        Row: {
          barbershop_id: string
          created_at: string
          organization_id: string
          user_id: string
        }
        Insert: {
          barbershop_id: string
          created_at?: string
          organization_id: string
          user_id: string
        }
        Update: {
          barbershop_id?: string
          created_at?: string
          organization_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "barbershop_members_barbershop_fkey"
            columns: ["organization_id", "barbershop_id"]
            isOneToOne: false
            referencedRelation: "barbershops"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "barbershop_members_member_fkey"
            columns: ["organization_id", "user_id"]
            isOneToOne: false
            referencedRelation: "organization_members"
            referencedColumns: ["organization_id", "user_id"]
          },
        ]
      }
      barbershop_slug_history: {
        Row: {
          barbershop_id: string
          created_at: string
          organization_id: string
          slug: string
        }
        Insert: {
          barbershop_id: string
          created_at?: string
          organization_id: string
          slug: string
        }
        Update: {
          barbershop_id?: string
          created_at?: string
          organization_id?: string
          slug?: string
        }
        Relationships: []
      }
      barbershops: {
        Row: {
          address: string | null
          archived_at: string | null
          city: string | null
          cover_path: string | null
          created_at: string
          description: string | null
          district: string | null
          hours_note: string | null
          id: string
          is_published: boolean
          lat: number | null
          lng: number | null
          logo_path: string | null
          maps_url: string | null
          name: string
          organization_id: string
          phone: string | null
          slug: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          archived_at?: string | null
          city?: string | null
          cover_path?: string | null
          created_at?: string
          description?: string | null
          district?: string | null
          hours_note?: string | null
          id?: string
          is_published?: boolean
          lat?: number | null
          lng?: number | null
          logo_path?: string | null
          maps_url?: string | null
          name: string
          organization_id: string
          phone?: string | null
          slug?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          archived_at?: string | null
          city?: string | null
          cover_path?: string | null
          created_at?: string
          description?: string | null
          district?: string | null
          hours_note?: string | null
          id?: string
          is_published?: boolean
          lat?: number | null
          lng?: number | null
          logo_path?: string | null
          maps_url?: string | null
          name?: string
          organization_id?: string
          phone?: string | null
          slug?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "barbershops_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      business_hours: {
        Row: {
          barbershop_id: string
          closes_at: string
          opens_at: string
          organization_id: string
          slot: number
          weekday: number
        }
        Insert: {
          barbershop_id: string
          closes_at: string
          opens_at: string
          organization_id: string
          slot: number
          weekday: number
        }
        Update: {
          barbershop_id?: string
          closes_at?: string
          opens_at?: string
          organization_id?: string
          slot?: number
          weekday?: number
        }
        Relationships: [
          {
            foreignKeyName: "business_hours_barbershop_fkey"
            columns: ["organization_id", "barbershop_id"]
            isOneToOne: false
            referencedRelation: "barbershops"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      business_photos: {
        Row: {
          barbershop_id: string
          caption: string | null
          created_at: string
          id: string
          organization_id: string
          sort_order: number
          storage_path: string
        }
        Insert: {
          barbershop_id: string
          caption?: string | null
          created_at?: string
          id?: string
          organization_id: string
          sort_order?: number
          storage_path: string
        }
        Update: {
          barbershop_id?: string
          caption?: string | null
          created_at?: string
          id?: string
          organization_id?: string
          sort_order?: number
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_photos_barbershop_fkey"
            columns: ["organization_id", "barbershop_id"]
            isOneToOne: false
            referencedRelation: "barbershops"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      business_social_links: {
        Row: {
          barbershop_id: string
          id: string
          organization_id: string
          platform: Database["public"]["Enums"]["social_platform"]
          sort_order: number
          url: string
        }
        Insert: {
          barbershop_id: string
          id?: string
          organization_id: string
          platform: Database["public"]["Enums"]["social_platform"]
          sort_order?: number
          url: string
        }
        Update: {
          barbershop_id?: string
          id?: string
          organization_id?: string
          platform?: Database["public"]["Enums"]["social_platform"]
          sort_order?: number
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_social_links_barbershop_fkey"
            columns: ["organization_id", "barbershop_id"]
            isOneToOne: false
            referencedRelation: "barbershops"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      customers: {
        Row: {
          archived_at: string | null
          consent_at: string
          consent_by: string
          created_at: string
          created_by: string
          dni: string
          email: string | null
          full_name: string
          id: string
          organization_id: string
          phone: string
          updated_at: string
        }
        Insert: {
          email?: string | null
          archived_at?: string | null
          consent_at?: string
          consent_by: string
          created_at?: string
          created_by?: string
          dni: string
          full_name: string
          id?: string
          organization_id: string
          phone: string
          updated_at?: string
        }
        Update: {
          email?: string | null
          archived_at?: string | null
          consent_at?: string
          consent_by?: string
          created_at?: string
          created_by?: string
          dni?: string
          full_name?: string
          id?: string
          organization_id?: string
          phone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customers_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_members: {
        Row: {
          created_at: string
          is_active: boolean
          organization_id: string
          role: Database["public"]["Enums"]["member_role"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          is_active?: boolean
          organization_id: string
          role: Database["public"]["Enums"]["member_role"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          is_active?: boolean
          organization_id?: string
          role?: Database["public"]["Enums"]["member_role"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_members_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      service_locations: {
        Row: {
          barbershop_id: string
          is_available: boolean
          organization_id: string
          service_id: string
        }
        Insert: {
          barbershop_id: string
          is_available?: boolean
          organization_id: string
          service_id: string
        }
        Update: {
          barbershop_id?: string
          is_available?: boolean
          organization_id?: string
          service_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_locations_barbershop_fkey"
            columns: ["organization_id", "barbershop_id"]
            isOneToOne: false
            referencedRelation: "barbershops"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "service_locations_service_fkey"
            columns: ["organization_id", "service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      services: {
        Row: {
          archived_at: string | null
          created_at: string
          description: string | null
          duration_minutes: number | null
          id: string
          is_published: boolean
          name: string
          organization_id: string
          price: number
          sort_order: number
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          description?: string | null
          duration_minutes?: number | null
          id?: string
          is_published?: boolean
          name: string
          organization_id: string
          price: number
          sort_order?: number
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          description?: string | null
          duration_minutes?: number | null
          id?: string
          is_published?: boolean
          name?: string
          organization_id?: string
          price?: number
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "services_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          phone: string | null
          terms_accepted_at: string | null
          terms_version: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          phone?: string | null
          terms_accepted_at?: string | null
          terms_version?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          phone?: string | null
          terms_accepted_at?: string | null
          terms_version?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          created_at: string
          current_period_end: string | null
          id: string
          owner_terms_accepted_at: string | null
          owner_terms_version: string | null
          plan: string
          provider: string
          provider_ref: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          current_period_end?: string | null
          id?: string
          owner_terms_accepted_at?: string | null
          owner_terms_version?: string | null
          plan?: string
          provider?: string
          provider_ref?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          current_period_end?: string | null
          id?: string
          owner_terms_accepted_at?: string | null
          owner_terms_version?: string | null
          plan?: string
          provider?: string
          provider_ref?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      organizations: {
        Row: {
          archived_at: string | null
          created_at: string
          created_by: string | null
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      audit_events: {
        Row: {
          action: string
          actor_id: string
          changes: Json
          created_at: string
          entity: string
          entity_id: string | null
          id: string
          organization_id: string
          reason: string | null
        }
        Insert: {
          action: string
          actor_id: string
          changes?: Json
          created_at?: string
          entity: string
          entity_id?: string | null
          id?: string
          organization_id: string
          reason?: string | null
        }
        Update: {
          action?: string
          actor_id?: string
          changes?: Json
          created_at?: string
          entity?: string
          entity_id?: string | null
          id?: string
          organization_id?: string
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_events_actor_fkey"
            columns: ["organization_id", "actor_id"]
            isOneToOne: false
            referencedRelation: "organization_members"
            referencedColumns: ["organization_id", "user_id"]
          },
        ]
      }
      loyalty_cycles: {
        Row: {
          completed_at: string | null
          customer_id: string
          id: string
          organization_id: string
          program_id: string
          progress: number
          public_text: string | null
          reward_amount: number | null
          reward_description: string | null
          reward_percent: number | null
          reward_service_id: string | null
          reward_service_name: string | null
          reward_type: Database["public"]["Enums"]["reward_type"]
          started_at: string
          status: Database["public"]["Enums"]["loyalty_cycle_status"]
          updated_at: string
          visits_required: number
          voided_at: string | null
        }
        Insert: {
          completed_at?: string | null
          customer_id: string
          id?: string
          organization_id: string
          program_id: string
          progress?: number
          public_text?: string | null
          reward_amount?: number | null
          reward_description?: string | null
          reward_percent?: number | null
          reward_service_id?: string | null
          reward_service_name?: string | null
          reward_type: Database["public"]["Enums"]["reward_type"]
          started_at?: string
          status?: Database["public"]["Enums"]["loyalty_cycle_status"]
          updated_at?: string
          visits_required: number
          voided_at?: string | null
        }
        Update: {
          completed_at?: string | null
          customer_id?: string
          id?: string
          organization_id?: string
          program_id?: string
          progress?: number
          public_text?: string | null
          reward_amount?: number | null
          reward_description?: string | null
          reward_percent?: number | null
          reward_service_id?: string | null
          reward_service_name?: string | null
          reward_type?: Database["public"]["Enums"]["reward_type"]
          started_at?: string
          status?: Database["public"]["Enums"]["loyalty_cycle_status"]
          updated_at?: string
          visits_required?: number
          voided_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "loyalty_cycles_customer_fkey"
            columns: ["organization_id", "customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "loyalty_cycles_program_fkey"
            columns: ["organization_id", "program_id"]
            isOneToOne: false
            referencedRelation: "loyalty_programs"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      loyalty_events: {
        Row: {
          created_at: string
          created_by: string
          customer_id: string
          cycle_id: string | null
          delta: number
          id: string
          organization_id: string
          reverses_event_id: string | null
          reward_id: string | null
          type: Database["public"]["Enums"]["loyalty_event_type"]
          visit_id: string | null
        }
        Insert: {
          created_at?: string
          created_by: string
          customer_id: string
          cycle_id?: string | null
          delta?: number
          id?: string
          organization_id: string
          reverses_event_id?: string | null
          reward_id?: string | null
          type: Database["public"]["Enums"]["loyalty_event_type"]
          visit_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string
          customer_id?: string
          cycle_id?: string | null
          delta?: number
          id?: string
          organization_id?: string
          reverses_event_id?: string | null
          reward_id?: string | null
          type?: Database["public"]["Enums"]["loyalty_event_type"]
          visit_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "loyalty_events_customer_fkey"
            columns: ["organization_id", "customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "loyalty_events_visit_fkey"
            columns: ["organization_id", "visit_id"]
            isOneToOne: false
            referencedRelation: "visits"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "loyalty_events_reward_fkey"
            columns: ["organization_id", "reward_id"]
            isOneToOne: false
            referencedRelation: "rewards"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      loyalty_programs: {
        Row: {
          created_at: string
          id: string
          organization_id: string
          public_text: string | null
          reward_amount: number | null
          reward_description: string | null
          reward_percent: number | null
          reward_service_id: string | null
          reward_type: Database["public"]["Enums"]["reward_type"]
          status: Database["public"]["Enums"]["loyalty_program_status"]
          updated_at: string
          visits_required: number
        }
        Insert: {
          created_at?: string
          id?: string
          organization_id: string
          public_text?: string | null
          reward_amount?: number | null
          reward_description?: string | null
          reward_percent?: number | null
          reward_service_id?: string | null
          reward_type: Database["public"]["Enums"]["reward_type"]
          status?: Database["public"]["Enums"]["loyalty_program_status"]
          updated_at?: string
          visits_required?: number
        }
        Update: {
          created_at?: string
          id?: string
          organization_id?: string
          public_text?: string | null
          reward_amount?: number | null
          reward_description?: string | null
          reward_percent?: number | null
          reward_service_id?: string | null
          reward_type?: Database["public"]["Enums"]["reward_type"]
          status?: Database["public"]["Enums"]["loyalty_program_status"]
          updated_at?: string
          visits_required?: number
        }
        Relationships: [
          {
            foreignKeyName: "loyalty_programs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_programs_reward_service_fkey"
            columns: ["organization_id", "reward_service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      rewards: {
        Row: {
          customer_id: string
          cycle_id: string
          discount_applied: number | null
          id: string
          issued_at: string
          issued_visit_id: string
          organization_id: string
          public_text: string | null
          redeemed_at: string | null
          redeemed_by: string | null
          redeemed_visit_id: string | null
          reward_amount: number | null
          reward_description: string | null
          reward_percent: number | null
          reward_service_id: string | null
          reward_service_name: string | null
          reward_type: Database["public"]["Enums"]["reward_type"]
          status: Database["public"]["Enums"]["reward_status"]
          voided_at: string | null
        }
        Insert: {
          customer_id: string
          cycle_id: string
          discount_applied?: number | null
          id?: string
          issued_at?: string
          issued_visit_id: string
          organization_id: string
          public_text?: string | null
          redeemed_at?: string | null
          redeemed_by?: string | null
          redeemed_visit_id?: string | null
          reward_amount?: number | null
          reward_description?: string | null
          reward_percent?: number | null
          reward_service_id?: string | null
          reward_service_name?: string | null
          reward_type: Database["public"]["Enums"]["reward_type"]
          status?: Database["public"]["Enums"]["reward_status"]
          voided_at?: string | null
        }
        Update: {
          customer_id?: string
          cycle_id?: string
          discount_applied?: number | null
          id?: string
          issued_at?: string
          issued_visit_id?: string
          organization_id?: string
          public_text?: string | null
          redeemed_at?: string | null
          redeemed_by?: string | null
          redeemed_visit_id?: string | null
          reward_amount?: number | null
          reward_description?: string | null
          reward_percent?: number | null
          reward_service_id?: string | null
          reward_service_name?: string | null
          reward_type?: Database["public"]["Enums"]["reward_type"]
          status?: Database["public"]["Enums"]["reward_status"]
          voided_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rewards_customer_fkey"
            columns: ["organization_id", "customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "rewards_cycle_fkey"
            columns: ["organization_id", "cycle_id"]
            isOneToOne: false
            referencedRelation: "loyalty_cycles"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "rewards_issued_visit_fkey"
            columns: ["organization_id", "issued_visit_id"]
            isOneToOne: false
            referencedRelation: "visits"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "rewards_redeemed_visit_fkey"
            columns: ["organization_id", "redeemed_visit_id"]
            isOneToOne: false
            referencedRelation: "visits"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      visit_items: {
        Row: {
          discount: number
          gross: number
          id: string
          net: number
          organization_id: string
          position: number
          quantity: number
          service_id: string
          service_name: string
          unit_price: number
          visit_id: string
        }
        Insert: {
          discount?: number
          gross: number
          id?: string
          net: number
          organization_id: string
          position: number
          quantity: number
          service_id: string
          service_name: string
          unit_price: number
          visit_id: string
        }
        Update: {
          discount?: number
          gross?: number
          id?: string
          net?: number
          organization_id?: string
          position?: number
          quantity?: number
          service_id?: string
          service_name?: string
          unit_price?: number
          visit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "visit_items_visit_fkey"
            columns: ["organization_id", "visit_id"]
            isOneToOne: false
            referencedRelation: "visits"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "visit_items_service_fkey"
            columns: ["organization_id", "service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      visits: {
        Row: {
          attended_by: string
          barbershop_id: string
          corrected_at: string | null
          corrected_by: string | null
          created_at: string
          created_by: string
          customer_id: string
          customer_seq: number
          discount_total: number
          id: string
          idempotency_key: string
          organization_id: string
          request_hash: string
          status: Database["public"]["Enums"]["visit_status"]
          subtotal: number
          total: number
          updated_at: string
          visited_at: string
          void_reason: string | null
          voided_at: string | null
          voided_by: string | null
        }
        Insert: {
          attended_by: string
          barbershop_id: string
          corrected_at?: string | null
          corrected_by?: string | null
          created_at?: string
          created_by: string
          customer_id: string
          customer_seq: number
          discount_total?: number
          id?: string
          idempotency_key: string
          organization_id: string
          request_hash: string
          status?: Database["public"]["Enums"]["visit_status"]
          subtotal: number
          total: number
          updated_at?: string
          visited_at?: string
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Update: {
          attended_by?: string
          barbershop_id?: string
          corrected_at?: string | null
          corrected_by?: string | null
          created_at?: string
          created_by?: string
          customer_id?: string
          customer_seq?: number
          discount_total?: number
          id?: string
          idempotency_key?: string
          organization_id?: string
          request_hash?: string
          status?: Database["public"]["Enums"]["visit_status"]
          subtotal?: number
          total?: number
          updated_at?: string
          visited_at?: string
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "visits_barbershop_fkey"
            columns: ["organization_id", "barbershop_id"]
            isOneToOne: false
            referencedRelation: "barbershops"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "visits_customer_fkey"
            columns: ["organization_id", "customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      correct_visit: {
        Args: { p_visit_id: string; p_items: Json; p_attended_by: string; p_reason: string }
        Returns: string
      }
      void_last_visit: {
        Args: { p_customer_id: string; p_reason: string; p_visit_id: string }
        Returns: string
      }
      add_worker_by_email: {
        Args: { p_email: string; p_organization_id: string }
        Returns: {
          email: string
          user_id: string
        }[]
      }
      accept_terms: {
        Args: { p_owner_terms_version?: string | null; p_terms_version: string }
        Returns: undefined
      }
      create_business: {
        Args: { p_address: string; p_name: string; p_owner_terms_version: string; p_slug: string }
        Returns: string
      }
      get_my_visits: {
        Args: never
        Returns: Json
      }
      list_network_barbershops: {
        Args: {
          p_district?: string | null
          p_limit?: number
          p_offset?: number
          p_query?: string
          p_seed?: string
          p_sort?: string
        }
        Returns: {
          city: string | null
          created_at: string
          description: string | null
          district: string | null
          hours: Json
          logo_path: string | null
          name: string
          slug: string
          total_count: number
        }[]
      }
      list_network_districts: {
        Args: { p_limit?: number }
        Returns: {
          barbershop_count: number
          district: string
        }[]
      }
      resolve_barbershop_slug: {
        Args: { p_slug: string }
        Returns: string | null
      }
      save_my_profile: {
        Args: { p_phone: string | null }
        Returns: undefined
      }
      get_my_account: {
        Args: never
        Returns: {
          is_pro: boolean
          owner_terms_pending: boolean
          terms_accepted: boolean
        }[]
      }
      get_customer_loyalty: {
        Args: { p_customer_id: string }
        Returns: Json
      }
      get_public_barbershop: {
        Args: { p_slug: string }
        Returns: Json
      }
      get_business_report: {
        Args: { p_attended_by?: string | null; p_from: string; p_organization_id: string; p_to: string }
        Returns: Json
      }
      list_report_visits: {
        Args: {
          p_attended_by?: string | null
          p_from: string
          p_limit?: number
          p_offset?: number
          p_organization_id: string
          p_to: string
        }
        Returns: {
          attended_by: string
          attended_by_email: string | null
          corrected_at: string | null
          customer_id: string
          customer_name: string
          discount_total: string
          items: Json
          service_units: number
          subtotal: string
          total: string
          total_count: number
          visit_id: string
          visited_at: string
        }[]
      }
      list_team: {
        Args: { p_organization_id: string }
        Returns: {
          created_at: string
          email: string
          is_active: boolean
          role: Database["public"]["Enums"]["member_role"]
          user_id: string
        }[]
      }
      register_visit: {
        Args: {
          p_apply_earned_reward: boolean
          p_attended_by: string | null
          p_barbershop_id: string
          p_customer_id: string
          p_idempotency_key?: string
          p_items: Json
          p_pending_reward_id?: string | null
        }
        Returns: {
          counted: boolean
          customer_seq: number
          discount_total: number
          issued_reward_id: string | null
          issued_reward_status: Database["public"]["Enums"]["reward_status"] | null
          progress: number | null
          redeemed_reward_id: string | null
          replayed: boolean
          subtotal: number
          total: number
          visit_id: string
          visits_required: number | null
        }[]
      }
      reorder_services: {
        Args: { p_organization_id: string; p_service_ids: string[] }
        Returns: undefined
      }
      save_business_hours: {
        Args: { p_barbershop_id: string; p_hours: Json }
        Returns: undefined
      }
      save_social_links: {
        Args: { p_barbershop_id: string; p_links: Json }
        Returns: undefined
      }
      save_loyalty_program: {
        Args: {
          p_organization_id: string
          p_public_text?: string | null
          p_reward_amount?: number | null
          p_reward_description?: string | null
          p_reward_percent?: number | null
          p_reward_service_id?: string | null
          p_reward_type: Database["public"]["Enums"]["reward_type"]
          p_status?: Database["public"]["Enums"]["loyalty_program_status"]
          p_visits_required?: number
        }
        Returns: string
      }
      search_customers: {
        Args: {
          p_include_archived?: boolean
          p_limit?: number
          p_offset?: number
          p_organization_id: string
          p_query?: string
        }
        Returns: {
          archived_at: string | null
          created_at: string
          dni: string
          full_name: string
          id: string
          phone: string
          total_count: number
        }[]
      }
      set_worker_active: {
        Args: { p_active: boolean; p_organization_id: string; p_user_id: string }
        Returns: undefined
      }
    }
    Enums: {
      loyalty_cycle_status: "open" | "completed" | "voided"
      loyalty_event_type: "progress" | "reward_issued" | "reward_redeemed" | "reversal"
      loyalty_program_status: "active" | "paused"
      member_role: "owner" | "barber"
      reward_status: "available" | "redeemed" | "voided"
      reward_type: "free_service" | "percent_discount" | "fixed_discount" | "custom_benefit"
      social_platform:
        | "instagram"
        | "facebook"
        | "tiktok"
        | "youtube"
        | "x"
        | "website"
      visit_status: "completed" | "voided"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type PublicSchema = Database["public"]

export type Tables<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Row"]
export type Enums<T extends keyof PublicSchema["Enums"]> = PublicSchema["Enums"][T]
