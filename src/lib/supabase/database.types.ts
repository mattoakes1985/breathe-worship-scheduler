// GENERATED FILE — Phase 0 contract artifact (PRD §18.2).
// Regenerated 2026-10-10 with generate_typescript_types against mlwkyhlzggqkkioxucxj
// after migrations 00014-00016 (contact privacy, service date fix, team list planner).
// Regenerate + broadcast on any schema change (PRD §18.5.2).
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
      admin_access_requests: {
        Row: {
          id: string
          profile_id: string
          reason: string | null
          requested_at: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
        }
        Insert: {
          id?: string
          profile_id: string
          reason?: string | null
          requested_at?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
        }
        Update: {
          id?: string
          profile_id?: string
          reason?: string | null
          requested_at?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_access_requests_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "member_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_access_requests_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_access_requests_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "member_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_access_requests_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      assignments: {
        Row: {
          assigned_at: string
          assigned_by: string | null
          decline_reason: string | null
          id: string
          profile_id: string
          responded_at: string | null
          role_id: string
          service_id: string
          status: string
          substitute_for_assignment_id: string | null
        }
        Insert: {
          assigned_at?: string
          assigned_by?: string | null
          decline_reason?: string | null
          id?: string
          profile_id: string
          responded_at?: string | null
          role_id: string
          service_id: string
          status?: string
          substitute_for_assignment_id?: string | null
        }
        Update: {
          assigned_at?: string
          assigned_by?: string | null
          decline_reason?: string | null
          id?: string
          profile_id?: string
          responded_at?: string | null
          role_id?: string
          service_id?: string
          status?: string
          substitute_for_assignment_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "assignments_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "member_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignments_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignments_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "member_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignments_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignments_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignments_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignments_substitute_for_assignment_id_fkey"
            columns: ["substitute_for_assignment_id"]
            isOneToOne: false
            referencedRelation: "assignments"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          actor_profile_id: string | null
          after: Json | null
          before: Json | null
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
        }
        Insert: {
          action: string
          actor_profile_id?: string | null
          after?: Json | null
          before?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
        }
        Update: {
          action?: string
          actor_profile_id?: string | null
          after?: Json | null
          before?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_actor_profile_id_fkey"
            columns: ["actor_profile_id"]
            isOneToOne: false
            referencedRelation: "member_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_log_actor_profile_id_fkey"
            columns: ["actor_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      availability_import_rows: {
        Row: {
          answers: Json
          id: string
          import_id: string
          person_id: string | null
          raw_name: string
          request_note: string | null
          submitted_at: string | null
        }
        Insert: {
          answers?: Json
          id?: string
          import_id: string
          person_id?: string | null
          raw_name: string
          request_note?: string | null
          submitted_at?: string | null
        }
        Update: {
          answers?: Json
          id?: string
          import_id?: string
          person_id?: string | null
          raw_name?: string
          request_note?: string | null
          submitted_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "availability_import_rows_import_id_fkey"
            columns: ["import_id"]
            isOneToOne: false
            referencedRelation: "availability_imports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "availability_import_rows_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "team_people"
            referencedColumns: ["id"]
          },
        ]
      }
      availability_imports: {
        Row: {
          file_name: string
          id: string
          imported_at: string
          imported_by: string | null
          month: string
          row_count: number
          summary: Json
          team_id: string
        }
        Insert: {
          file_name: string
          id?: string
          imported_at?: string
          imported_by?: string | null
          month: string
          row_count?: number
          summary?: Json
          team_id: string
        }
        Update: {
          file_name?: string
          id?: string
          imported_at?: string
          imported_by?: string | null
          month?: string
          row_count?: number
          summary?: Json
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "availability_imports_imported_by_fkey"
            columns: ["imported_by"]
            isOneToOne: false
            referencedRelation: "member_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "availability_imports_imported_by_fkey"
            columns: ["imported_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "availability_imports_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      availability_responses: {
        Row: {
          id: string
          note: string | null
          profile_id: string
          responded_at: string
          response: string
          service_id: string
        }
        Insert: {
          id?: string
          note?: string | null
          profile_id: string
          responded_at?: string
          response: string
          service_id: string
        }
        Update: {
          id?: string
          note?: string | null
          profile_id?: string
          responded_at?: string
          response?: string
          service_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "availability_responses_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "member_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "availability_responses_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "availability_responses_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      blockout_dates: {
        Row: {
          created_at: string
          end_date: string | null
          id: string
          profile_id: string
          reason: string | null
          recurring_day_of_week: number | null
          start_date: string | null
        }
        Insert: {
          created_at?: string
          end_date?: string | null
          id?: string
          profile_id: string
          reason?: string | null
          recurring_day_of_week?: number | null
          start_date?: string | null
        }
        Update: {
          created_at?: string
          end_date?: string | null
          id?: string
          profile_id?: string
          reason?: string | null
          recurring_day_of_week?: number | null
          start_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "blockout_dates_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "member_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blockout_dates_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_tokens: {
        Row: {
          profile_id: string
          rotated_at: string
          token: string
        }
        Insert: {
          profile_id: string
          rotated_at?: string
          token?: string
        }
        Update: {
          profile_id?: string
          rotated_at?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendar_tokens_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "member_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_tokens_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      encouragement_messages: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          message_template: string
          threshold: number | null
          trigger_type: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          message_template: string
          threshold?: number | null
          trigger_type: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          message_template?: string
          threshold?: number | null
          trigger_type?: string
        }
        Relationships: []
      }
      households: {
        Row: {
          created_at: string
          id: string
          name: string
          preference: string
          team_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          preference?: string
          team_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          preference?: string
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "households_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      legacy_assignments: {
        Row: {
          claimed_profile_id: string | null
          created_at: string
          id: string
          person_name: string
          role_id: string | null
          service_id: string
        }
        Insert: {
          claimed_profile_id?: string | null
          created_at?: string
          id?: string
          person_name: string
          role_id?: string | null
          service_id: string
        }
        Update: {
          claimed_profile_id?: string | null
          created_at?: string
          id?: string
          person_name?: string
          role_id?: string | null
          service_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "legacy_assignments_claimed_profile_id_fkey"
            columns: ["claimed_profile_id"]
            isOneToOne: false
            referencedRelation: "member_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "legacy_assignments_claimed_profile_id_fkey"
            columns: ["claimed_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "legacy_assignments_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "legacy_assignments_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      name_aliases: {
        Row: {
          alias: string
          alias_key: string | null
          created_at: string
          id: string
          person_id: string
          source: string
        }
        Insert: {
          alias: string
          alias_key?: string | null
          created_at?: string
          id?: string
          person_id: string
          source?: string
        }
        Update: {
          alias?: string
          alias_key?: string | null
          created_at?: string
          id?: string
          person_id?: string
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "name_aliases_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "team_people"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_preferences: {
        Row: {
          email_enabled: boolean
          profile_id: string
          push_enabled: boolean
          reminder_days_before: number
        }
        Insert: {
          email_enabled?: boolean
          profile_id: string
          push_enabled?: boolean
          reminder_days_before?: number
        }
        Update: {
          email_enabled?: boolean
          profile_id?: string
          push_enabled?: boolean
          reminder_days_before?: number
        }
        Relationships: [
          {
            foreignKeyName: "notification_preferences_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "member_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_preferences_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          id: string
          is_read: boolean
          profile_id: string
          related_service_id: string | null
          sent_via: string
          title: string
          type: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          is_read?: boolean
          profile_id: string
          related_service_id?: string | null
          sent_via?: string
          title: string
          type: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          is_read?: boolean
          profile_id?: string
          related_service_id?: string | null
          sent_via?: string
          title?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "member_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_related_service_id_fkey"
            columns: ["related_service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      person_availability: {
        Row: {
          id: string
          import_id: string | null
          person_id: string
          response: string
          service_id: string
          submitted_at: string
        }
        Insert: {
          id?: string
          import_id?: string | null
          person_id: string
          response: string
          service_id: string
          submitted_at?: string
        }
        Update: {
          id?: string
          import_id?: string | null
          person_id?: string
          response?: string
          service_id?: string
          submitted_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "person_availability_import_id_fkey"
            columns: ["import_id"]
            isOneToOne: false
            referencedRelation: "availability_imports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "person_availability_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "team_people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "person_availability_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      person_roles: {
        Row: {
          person_id: string
          rank: number
          role_id: string
        }
        Insert: {
          person_id: string
          rank?: number
          role_id: string
        }
        Update: {
          person_id?: string
          rank?: number
          role_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "person_roles_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "team_people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "person_roles_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_contact: {
        Row: {
          email: string
          notes: string | null
          phone: string | null
          profile_id: string
          updated_at: string
        }
        Insert: {
          email?: string
          notes?: string | null
          phone?: string | null
          profile_id: string
          updated_at?: string
        }
        Update: {
          email?: string
          notes?: string | null
          phone?: string | null
          profile_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profile_contact_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "member_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_contact_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          calendar_token: string
          created_at: string
          email: string
          full_name: string
          id: string
          is_active: boolean
          is_admin: boolean
          notes: string | null
          phone: string | null
          preferred_name: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          calendar_token?: string
          created_at?: string
          email?: string
          full_name: string
          id: string
          is_active?: boolean
          is_admin?: boolean
          notes?: string | null
          phone?: string | null
          preferred_name?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          calendar_token?: string
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          is_active?: boolean
          is_admin?: boolean
          notes?: string | null
          phone?: string | null
          preferred_name?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      role_eligibility: {
        Row: {
          id: string
          is_active: boolean
          preference_rank: number
          proficiency: string
          profile_id: string
          role_id: string
        }
        Insert: {
          id?: string
          is_active?: boolean
          preference_rank?: number
          proficiency?: string
          profile_id: string
          role_id: string
        }
        Update: {
          id?: string
          is_active?: boolean
          preference_rank?: number
          proficiency?: string
          profile_id?: string
          role_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_eligibility_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "member_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "role_eligibility_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "role_eligibility_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      roles: {
        Row: {
          description: string | null
          id: string
          is_active: boolean
          name: string
          sort_order: number
          team_id: string
        }
        Insert: {
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number
          team_id: string
        }
        Update: {
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "roles_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      rota_plan_slots: {
        Row: {
          id: string
          locked: boolean
          person_id: string | null
          reasons: string[]
          relaxed: string[]
          role_id: string
          service_id: string
          slot_index: number
          source: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          id?: string
          locked?: boolean
          person_id?: string | null
          reasons?: string[]
          relaxed?: string[]
          role_id: string
          service_id: string
          slot_index?: number
          source?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          id?: string
          locked?: boolean
          person_id?: string | null
          reasons?: string[]
          relaxed?: string[]
          role_id?: string
          service_id?: string
          slot_index?: number
          source?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rota_plan_slots_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "team_people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rota_plan_slots_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rota_plan_slots_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rota_plan_slots_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "member_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rota_plan_slots_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      scheduling_rules: {
        Row: {
          enabled: boolean
          id: string
          kind: string
          label: string
          params: Json
          priority: number
          team_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          enabled?: boolean
          id?: string
          kind: string
          label: string
          params?: Json
          priority?: number
          team_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          enabled?: boolean
          id?: string
          kind?: string
          label?: string
          params?: Json
          priority?: number
          team_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "scheduling_rules_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduling_rules_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "member_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduling_rules_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      service_order_items: {
        Row: {
          duration_minutes: number | null
          id: string
          item_type: string
          linked_song_id: string | null
          notes: string | null
          order_index: number
          service_id: string
          title: string
        }
        Insert: {
          duration_minutes?: number | null
          id?: string
          item_type: string
          linked_song_id?: string | null
          notes?: string | null
          order_index?: number
          service_id: string
          title: string
        }
        Update: {
          duration_minutes?: number | null
          id?: string
          item_type?: string
          linked_song_id?: string | null
          notes?: string | null
          order_index?: number
          service_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_order_items_linked_song_id_fkey"
            columns: ["linked_song_id"]
            isOneToOne: false
            referencedRelation: "song_stats"
            referencedColumns: ["song_id"]
          },
          {
            foreignKeyName: "service_order_items_linked_song_id_fkey"
            columns: ["linked_song_id"]
            isOneToOne: false
            referencedRelation: "songs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_order_items_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      service_role_requirements: {
        Row: {
          id: string
          is_required: boolean
          notes: string | null
          quantity_required: number
          role_id: string
          service_id: string
        }
        Insert: {
          id?: string
          is_required?: boolean
          notes?: string | null
          quantity_required?: number
          role_id: string
          service_id: string
        }
        Update: {
          id?: string
          is_required?: boolean
          notes?: string | null
          quantity_required?: number
          role_id?: string
          service_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_role_requirements_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_role_requirements_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      service_songs: {
        Row: {
          id: string
          key_override: string | null
          notes: string | null
          order_index: number
          service_id: string
          song_id: string
        }
        Insert: {
          id?: string
          key_override?: string | null
          notes?: string | null
          order_index?: number
          service_id: string
          song_id: string
        }
        Update: {
          id?: string
          key_override?: string | null
          notes?: string | null
          order_index?: number
          service_id?: string
          song_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_songs_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_songs_song_id_fkey"
            columns: ["song_id"]
            isOneToOne: false
            referencedRelation: "song_stats"
            referencedColumns: ["song_id"]
          },
          {
            foreignKeyName: "service_songs_song_id_fkey"
            columns: ["song_id"]
            isOneToOne: false
            referencedRelation: "songs"
            referencedColumns: ["id"]
          },
        ]
      }
      service_templates: {
        Row: {
          default_duration_minutes: number | null
          default_start_time: string | null
          id: string
          is_active: boolean
          name: string
          recurrence_rule: string | null
          team_id: string
        }
        Insert: {
          default_duration_minutes?: number | null
          default_start_time?: string | null
          id?: string
          is_active?: boolean
          name: string
          recurrence_rule?: string | null
          team_id: string
        }
        Update: {
          default_duration_minutes?: number | null
          default_start_time?: string | null
          id?: string
          is_active?: boolean
          name?: string
          recurrence_rule?: string | null
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_templates_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      services: {
        Row: {
          archived_at: string | null
          availability_locked: boolean
          created_at: string
          created_by: string | null
          end_time: string | null
          id: string
          is_all_in: boolean
          linked_service_id: string | null
          location: string | null
          notes: string | null
          scheduling_locked: boolean
          service_date: string
          start_time: string
          status: string
          team_id: string
          template_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          availability_locked?: boolean
          created_at?: string
          created_by?: string | null
          end_time?: string | null
          id?: string
          is_all_in?: boolean
          linked_service_id?: string | null
          location?: string | null
          notes?: string | null
          scheduling_locked?: boolean
          service_date: string
          start_time: string
          status?: string
          team_id: string
          template_id?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          availability_locked?: boolean
          created_at?: string
          created_by?: string | null
          end_time?: string | null
          id?: string
          is_all_in?: boolean
          linked_service_id?: string | null
          location?: string | null
          notes?: string | null
          scheduling_locked?: boolean
          service_date?: string
          start_time?: string
          status?: string
          team_id?: string
          template_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "services_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "member_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "services_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "services_linked_service_id_fkey"
            columns: ["linked_service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "services_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "services_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "service_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      serving_preferences: {
        Row: {
          id: string
          max_services_per_period: number | null
          note: string | null
          period_type: string
          profile_id: string
          team_id: string | null
          updated_at: string
        }
        Insert: {
          id?: string
          max_services_per_period?: number | null
          note?: string | null
          period_type?: string
          profile_id: string
          team_id?: string | null
          updated_at?: string
        }
        Update: {
          id?: string
          max_services_per_period?: number | null
          note?: string | null
          period_type?: string
          profile_id?: string
          team_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "serving_preferences_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "member_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "serving_preferences_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "serving_preferences_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      song_duplicate_dismissals: {
        Row: {
          dismissed_at: string
          dismissed_by: string | null
          song_a: string
          song_b: string
        }
        Insert: {
          dismissed_at?: string
          dismissed_by?: string | null
          song_a: string
          song_b: string
        }
        Update: {
          dismissed_at?: string
          dismissed_by?: string | null
          song_a?: string
          song_b?: string
        }
        Relationships: [
          {
            foreignKeyName: "song_duplicate_dismissals_dismissed_by_fkey"
            columns: ["dismissed_by"]
            isOneToOne: false
            referencedRelation: "member_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "song_duplicate_dismissals_dismissed_by_fkey"
            columns: ["dismissed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "song_duplicate_dismissals_song_a_fkey"
            columns: ["song_a"]
            isOneToOne: false
            referencedRelation: "song_stats"
            referencedColumns: ["song_id"]
          },
          {
            foreignKeyName: "song_duplicate_dismissals_song_a_fkey"
            columns: ["song_a"]
            isOneToOne: false
            referencedRelation: "songs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "song_duplicate_dismissals_song_b_fkey"
            columns: ["song_b"]
            isOneToOne: false
            referencedRelation: "song_stats"
            referencedColumns: ["song_id"]
          },
          {
            foreignKeyName: "song_duplicate_dismissals_song_b_fkey"
            columns: ["song_b"]
            isOneToOne: false
            referencedRelation: "songs"
            referencedColumns: ["id"]
          },
        ]
      }
      song_review_items: {
        Row: {
          created_at: string
          current_value: string | null
          evidence: string | null
          field: string | null
          id: string
          kind: string
          resolution_note: string | null
          resolved_at: string | null
          resolved_by: string | null
          song_id: string
          source: string
          status: string
          suggested_value: string | null
        }
        Insert: {
          created_at?: string
          current_value?: string | null
          evidence?: string | null
          field?: string | null
          id?: string
          kind: string
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          song_id: string
          source?: string
          status?: string
          suggested_value?: string | null
        }
        Update: {
          created_at?: string
          current_value?: string | null
          evidence?: string | null
          field?: string | null
          id?: string
          kind?: string
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          song_id?: string
          source?: string
          status?: string
          suggested_value?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "song_review_items_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "member_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "song_review_items_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "song_review_items_song_id_fkey"
            columns: ["song_id"]
            isOneToOne: false
            referencedRelation: "song_stats"
            referencedColumns: ["song_id"]
          },
          {
            foreignKeyName: "song_review_items_song_id_fkey"
            columns: ["song_id"]
            isOneToOne: false
            referencedRelation: "songs"
            referencedColumns: ["id"]
          },
        ]
      }
      song_saved_views: {
        Row: {
          created_at: string
          filters: Json
          id: string
          is_shared: boolean
          name: string
          owner_id: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          filters?: Json
          id?: string
          is_shared?: boolean
          name: string
          owner_id?: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          filters?: Json
          id?: string
          is_shared?: boolean
          name?: string
          owner_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "song_saved_views_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "member_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "song_saved_views_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      song_tags: {
        Row: {
          archived_at: string | null
          color: string | null
          created_at: string
          description: string | null
          id: string
          name: string
          sort_order: number
        }
        Insert: {
          archived_at?: string | null
          color?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name: string
          sort_order?: number
        }
        Update: {
          archived_at?: string | null
          color?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          sort_order?: number
        }
        Relationships: []
      }
      songs: {
        Row: {
          artist: string | null
          audio_url: string | null
          bpm_feel: string | null
          ccli_number: string | null
          chord_chart_url: string | null
          click_signature: string | null
          created_at: string
          default_key: string | null
          duration_seconds: number | null
          id: string
          is_active: boolean
          is_swung: boolean
          legacy_played_keys: string[]
          male_key: string | null
          merged_into_id: string | null
          notes: string | null
          tags: string[] | null
          tempo_bpm: number | null
          time_signature: string | null
          title: string
          updated_at: string
          updated_by: string | null
          version: number
        }
        Insert: {
          artist?: string | null
          audio_url?: string | null
          bpm_feel?: string | null
          ccli_number?: string | null
          chord_chart_url?: string | null
          click_signature?: string | null
          created_at?: string
          default_key?: string | null
          duration_seconds?: number | null
          id?: string
          is_active?: boolean
          is_swung?: boolean
          legacy_played_keys?: string[]
          male_key?: string | null
          merged_into_id?: string | null
          notes?: string | null
          tags?: string[] | null
          tempo_bpm?: number | null
          time_signature?: string | null
          title: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Update: {
          artist?: string | null
          audio_url?: string | null
          bpm_feel?: string | null
          ccli_number?: string | null
          chord_chart_url?: string | null
          click_signature?: string | null
          created_at?: string
          default_key?: string | null
          duration_seconds?: number | null
          id?: string
          is_active?: boolean
          is_swung?: boolean
          legacy_played_keys?: string[]
          male_key?: string | null
          merged_into_id?: string | null
          notes?: string | null
          tags?: string[] | null
          tempo_bpm?: number | null
          time_signature?: string | null
          title?: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "songs_merged_into_id_fkey"
            columns: ["merged_into_id"]
            isOneToOne: false
            referencedRelation: "song_stats"
            referencedColumns: ["song_id"]
          },
          {
            foreignKeyName: "songs_merged_into_id_fkey"
            columns: ["merged_into_id"]
            isOneToOne: false
            referencedRelation: "songs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "songs_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "member_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "songs_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      songs_history: {
        Row: {
          changed_at: string
          changed_by: string | null
          changed_fields: string[]
          id: number
          op: string
          snapshot: Json
          song_id: string
          version: number
        }
        Insert: {
          changed_at?: string
          changed_by?: string | null
          changed_fields?: string[]
          id?: never
          op: string
          snapshot: Json
          song_id: string
          version: number
        }
        Update: {
          changed_at?: string
          changed_by?: string | null
          changed_fields?: string[]
          id?: never
          op?: string
          snapshot?: Json
          song_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "songs_history_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "member_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "songs_history_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "songs_history_song_id_fkey"
            columns: ["song_id"]
            isOneToOne: false
            referencedRelation: "song_stats"
            referencedColumns: ["song_id"]
          },
          {
            foreignKeyName: "songs_history_song_id_fkey"
            columns: ["song_id"]
            isOneToOne: false
            referencedRelation: "songs"
            referencedColumns: ["id"]
          },
        ]
      }
      swap_requests: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          claimed_at: string | null
          claimed_by_profile_id: string | null
          created_at: string
          id: string
          original_assignment_id: string
          requested_by: string
          status: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          claimed_at?: string | null
          claimed_by_profile_id?: string | null
          created_at?: string
          id?: string
          original_assignment_id: string
          requested_by: string
          status?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          claimed_at?: string | null
          claimed_by_profile_id?: string | null
          created_at?: string
          id?: string
          original_assignment_id?: string
          requested_by?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "swap_requests_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "member_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "swap_requests_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "swap_requests_claimed_by_profile_id_fkey"
            columns: ["claimed_by_profile_id"]
            isOneToOne: false
            referencedRelation: "member_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "swap_requests_claimed_by_profile_id_fkey"
            columns: ["claimed_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "swap_requests_original_assignment_id_fkey"
            columns: ["original_assignment_id"]
            isOneToOne: false
            referencedRelation: "assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "swap_requests_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "member_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "swap_requests_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      team_memberships: {
        Row: {
          id: string
          is_active: boolean
          is_team_lead: boolean
          joined_at: string
          profile_id: string
          team_id: string
        }
        Insert: {
          id?: string
          is_active?: boolean
          is_team_lead?: boolean
          joined_at?: string
          profile_id: string
          team_id: string
        }
        Update: {
          id?: string
          is_active?: boolean
          is_team_lead?: boolean
          joined_at?: string
          profile_id?: string
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_memberships_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "member_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_memberships_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_memberships_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      team_people: {
        Row: {
          created_at: string
          display_name: string
          full_name: string | null
          household_id: string | null
          id: string
          is_active: boolean
          max_per_month: number | null
          merged_into_id: string | null
          profile_id: string | null
          team_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          display_name: string
          full_name?: string | null
          household_id?: string | null
          id?: string
          is_active?: boolean
          max_per_month?: number | null
          merged_into_id?: string | null
          profile_id?: string | null
          team_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          display_name?: string
          full_name?: string | null
          household_id?: string | null
          id?: string
          is_active?: boolean
          max_per_month?: number | null
          merged_into_id?: string | null
          profile_id?: string | null
          team_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "team_people_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_people_merged_into_id_fkey"
            columns: ["merged_into_id"]
            isOneToOne: false
            referencedRelation: "team_people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_people_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "member_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_people_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_people_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_people_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "member_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_people_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      teams: {
        Row: {
          color: string | null
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
        }
        Update: {
          color?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
        }
        Relationships: []
      }
      template_role_requirements: {
        Row: {
          id: string
          is_required: boolean
          quantity_required: number
          role_id: string
          template_id: string
        }
        Insert: {
          id?: string
          is_required?: boolean
          quantity_required?: number
          role_id: string
          template_id: string
        }
        Update: {
          id?: string
          is_required?: boolean
          quantity_required?: number
          role_id?: string
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "template_role_requirements_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "template_role_requirements_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "service_templates"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      member_directory: {
        Row: {
          avatar_url: string | null
          full_name: string | null
          id: string | null
          is_active: boolean | null
          preferred_name: string | null
        }
        Insert: {
          avatar_url?: string | null
          full_name?: string | null
          id?: string | null
          is_active?: boolean | null
          preferred_name?: string | null
        }
        Update: {
          avatar_url?: string | null
          full_name?: string | null
          id?: string | null
          is_active?: boolean | null
          preferred_name?: string | null
        }
        Relationships: []
      }
      song_stats: {
        Row: {
          last_sung: string | null
          next_planned: string | null
          played_keys: string[] | null
          song_id: string | null
          times_sung: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      archive_song_tag: { Args: { p_name: string }; Returns: number }
      array_replace_ci: {
        Args: { p_arr: string[]; p_new: string; p_old: string }
        Returns: string[]
      }
      bulk_tag_songs: {
        Args: { p_add: string[]; p_remove: string[]; p_song_ids: string[] }
        Returns: number
      }
      claim_legacy_history: {
        Args: { p_person_name: string; p_profile_id: string }
        Returns: number
      }
      claim_swap: { Args: { p_swap_id: string }; Returns: undefined }
      create_song_tag: {
        Args: { p_color?: string; p_name: string }
        Returns: string
      }
      erase_profile_personal_data: {
        Args: { p_profile_id: string }
        Returns: undefined
      }
      export_profile_data: { Args: { p_profile_id: string }; Returns: Json }
      generate_services_from_template: {
        Args: { p_dates: string[]; p_template_id: string }
        Returns: {
          archived_at: string | null
          availability_locked: boolean
          created_at: string
          created_by: string | null
          end_time: string | null
          id: string
          is_all_in: boolean
          linked_service_id: string | null
          location: string | null
          notes: string | null
          scheduling_locked: boolean
          service_date: string
          start_time: string
          status: string
          team_id: string
          template_id: string | null
          title: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "services"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_my_stats: { Args: never; Returns: Json }
      is_active_profile: { Args: { uid: string }; Returns: boolean }
      is_admin: { Args: { uid: string }; Returns: boolean }
      is_any_team_lead: { Args: { uid: string }; Returns: boolean }
      is_assigned_to_service: {
        Args: { p_service_id: string; uid: string }
        Returns: boolean
      }
      is_planner: { Args: { uid: string }; Returns: boolean }
      is_team_lead: {
        Args: { p_team_id: string; uid: string }
        Returns: boolean
      }
      merge_songs: { Args: { p_keep: string; p_merge: string }; Returns: Json }
      notify: {
        Args: {
          p_body: string
          p_profile_id: string
          p_service_id?: string
          p_title: string
          p_type: string
        }
        Returns: undefined
      }
      rename_song_tag: {
        Args: { p_new: string; p_old: string }
        Returns: number
      }
      resolve_song_review: {
        Args: {
          p_accept: boolean
          p_item_id: string
          p_note?: string
          p_value?: string
        }
        Returns: undefined
      }
      resolve_swap: {
        Args: { p_approve: boolean; p_swap_id: string }
        Returns: undefined
      }
      respond_to_assignment: {
        Args: {
          p_assignment_id: string
          p_decline_reason?: string
          p_response: string
        }
        Returns: undefined
      }
      restore_song_version: {
        Args: { p_song_id: string; p_version: number }
        Returns: number
      }
      rotate_my_calendar_token: { Args: never; Returns: string }
      send_service_reminders: { Args: never; Returns: number }
      set_my_role_preference: {
        Args: { p_rank: number; p_role_id: string }
        Returns: undefined
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
