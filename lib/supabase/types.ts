// Type definitions for the Supabase schema.
// Regenerate with `npx supabase gen types typescript --project-id <ref>` once the project exists.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type PropertyStatus = "active" | "paused" | "archived";
export type ReservationSource = "airbnb" | "vrbo" | "direct" | "blocked";
export type CleaningStatus =
  | "scheduled"
  | "in_progress"
  | "completed"
  | "issue"
  | "cancelled";
export type UserRole = "admin" | "operator";
export type SyncStatus = "running" | "ok" | "error";

type PropertyRow = {
  id: string;
  name: string;
  nickname: string | null;
  address: string | null;
  airbnb_listing_id: string | null;
  ical_url: string | null;
  pricelabs_listing_id: string | null;
  turno_property_id: string | null;
  owner_name: string | null;
  owner_email: string | null;
  status: PropertyStatus;
  created_at: string;
  updated_at: string;
};

type PropertyInsert = {
  id?: string;
  name: string;
  nickname?: string | null;
  address?: string | null;
  airbnb_listing_id?: string | null;
  ical_url?: string | null;
  pricelabs_listing_id?: string | null;
  turno_property_id?: string | null;
  owner_name?: string | null;
  owner_email?: string | null;
  status?: PropertyStatus;
  created_at?: string;
  updated_at?: string;
};

type PropertyUpdate = Partial<PropertyInsert>;

type ReservationRow = {
  id: string;
  property_id: string;
  source: ReservationSource;
  guest_name: string | null;
  check_in: string;
  check_out: string;
  nights: number;
  gross_revenue: number | null;
  net_to_owner: number | null;
  reservation_code: string | null;
  ical_uid: string | null;
  status: string | null;
  raw: Json | null;
  synced_at: string;
};

type ReservationInsert = {
  id?: string;
  property_id: string;
  source: ReservationSource;
  guest_name?: string | null;
  check_in: string;
  check_out: string;
  gross_revenue?: number | null;
  net_to_owner?: number | null;
  reservation_code?: string | null;
  ical_uid?: string | null;
  status?: string | null;
  raw?: Json | null;
  synced_at?: string;
};

type ReservationUpdate = Partial<ReservationInsert>;

type PriceRow = {
  id: string;
  property_id: string;
  date: string;
  base_price: number | null;
  suggested_price: number | null;
  override_price: number | null;
  currency: string;
  source: string;
  synced_at: string;
};

type PriceInsert = {
  id?: string;
  property_id: string;
  date: string;
  base_price?: number | null;
  suggested_price?: number | null;
  override_price?: number | null;
  currency?: string;
  source?: string;
  synced_at?: string;
};

type PriceUpdate = Partial<PriceInsert>;

type CleaningRow = {
  id: string;
  property_id: string;
  scheduled_for: string;
  cleaner_name: string | null;
  status: CleaningStatus;
  turno_project_id: string | null;
  notes: string | null;
  synced_at: string;
};

type CleaningInsert = {
  id?: string;
  property_id: string;
  scheduled_for: string;
  cleaner_name?: string | null;
  status?: CleaningStatus;
  turno_project_id?: string | null;
  notes?: string | null;
  synced_at?: string;
};

type CleaningUpdate = Partial<CleaningInsert>;

type SyncLogRow = {
  id: string;
  source: string;
  started_at: string;
  finished_at: string | null;
  status: SyncStatus;
  error: string | null;
  records_processed: number;
};

type SyncLogInsert = {
  id?: string;
  source: string;
  started_at?: string;
  finished_at?: string | null;
  status?: SyncStatus;
  error?: string | null;
  records_processed?: number;
};

type SyncLogUpdate = Partial<SyncLogInsert>;

type UserRoleRow = {
  user_id: string;
  role: UserRole;
  created_at: string;
};

type UserRoleInsert = {
  user_id: string;
  role: UserRole;
  created_at?: string;
};

type UserRoleUpdate = Partial<UserRoleInsert>;

export type Database = {
  public: {
    Tables: {
      properties: {
        Row: PropertyRow;
        Insert: PropertyInsert;
        Update: PropertyUpdate;
        Relationships: [];
      };
      reservations: {
        Row: ReservationRow;
        Insert: ReservationInsert;
        Update: ReservationUpdate;
        Relationships: [];
      };
      prices: {
        Row: PriceRow;
        Insert: PriceInsert;
        Update: PriceUpdate;
        Relationships: [];
      };
      cleanings: {
        Row: CleaningRow;
        Insert: CleaningInsert;
        Update: CleaningUpdate;
        Relationships: [];
      };
      sync_log: {
        Row: SyncLogRow;
        Insert: SyncLogInsert;
        Update: SyncLogUpdate;
        Relationships: [];
      };
      user_roles: {
        Row: UserRoleRow;
        Insert: UserRoleInsert;
        Update: UserRoleUpdate;
        Relationships: [];
      };
    };
    Views: { [key: string]: never };
    Functions: { [key: string]: never };
    Enums: {
      property_status: PropertyStatus;
      reservation_source: ReservationSource;
      cleaning_status: CleaningStatus;
      user_role: UserRole;
      sync_status: SyncStatus;
    };
    CompositeTypes: { [key: string]: never };
  };
};
