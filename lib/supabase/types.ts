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
export type UserRole =
  | "admin"
  | "operator"
  | "owner"
  | "cleaner"
  | "partner";
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
  auto_accept_pricing: boolean;
  auto_accept_max_deviation_pct: number;
  auto_accept_horizon_days: number;
  auto_accept_min_price: number | null;
  auto_accept_max_price: number | null;
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
  auto_accept_pricing?: boolean;
  auto_accept_max_deviation_pct?: number;
  auto_accept_horizon_days?: number;
  auto_accept_min_price?: number | null;
  auto_accept_max_price?: number | null;
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

type OptimizationRow = {
  id: string;
  property_id: string;
  generated_at: string;
  generated_by: string | null;
  model: string;
  positioning: string | null;
  titles: Json;
  description: Json | null;
  amenity_gaps: Json;
  pricing_notes: Json | null;
  raw: Json | null;
  input_tokens: number | null;
  output_tokens: number | null;
  cost_usd: number | null;
};

type OptimizationInsert = {
  id?: string;
  property_id: string;
  generated_at?: string;
  generated_by?: string | null;
  model?: string;
  positioning?: string | null;
  titles?: Json;
  description?: Json | null;
  amenity_gaps?: Json;
  pricing_notes?: Json | null;
  raw?: Json | null;
  input_tokens?: number | null;
  output_tokens?: number | null;
  cost_usd?: number | null;
};

type OptimizationUpdate = Partial<OptimizationInsert>;

export type ThreadStatus = "active" | "archived" | "flagged";
export type MessageDirection = "inbound" | "outbound";
export type DraftStatus =
  | "pending"
  | "approved"
  | "edited"
  | "rejected"
  | "sent";

type MessageThreadRow = {
  id: string;
  property_id: string | null;
  airbnb_thread_id: string | null;
  guest_name: string | null;
  guest_first_name: string | null;
  reservation_code: string | null;
  check_in: string | null;
  check_out: string | null;
  city: string | null;
  status: ThreadStatus;
  last_message_at: string | null;
  last_message_preview: string | null;
  unread_count: number;
  created_at: string;
  updated_at: string;
};

type MessageThreadInsert = {
  id?: string;
  property_id?: string | null;
  airbnb_thread_id?: string | null;
  guest_name?: string | null;
  guest_first_name?: string | null;
  reservation_code?: string | null;
  check_in?: string | null;
  check_out?: string | null;
  city?: string | null;
  status?: ThreadStatus;
  last_message_at?: string | null;
  last_message_preview?: string | null;
  unread_count?: number;
  created_at?: string;
  updated_at?: string;
};

type MessageThreadUpdate = Partial<MessageThreadInsert>;

type MessageRow = {
  id: string;
  thread_id: string;
  direction: MessageDirection;
  sender: string | null;
  body: string | null;
  sent_at: string;
  airbnb_message_id: string | null;
  raw: Json | null;
  created_at: string;
};

type MessageInsert = {
  id?: string;
  thread_id: string;
  direction: MessageDirection;
  sender?: string | null;
  body?: string | null;
  sent_at: string;
  airbnb_message_id?: string | null;
  raw?: Json | null;
  created_at?: string;
};

type MessageUpdate = Partial<MessageInsert>;

type MessageDraftRow = {
  id: string;
  thread_id: string;
  in_reply_to_message_id: string | null;
  draft_body: string;
  reasoning: string | null;
  model: string;
  status: DraftStatus;
  approved_by: string | null;
  approved_at: string | null;
  edited_body: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  cost_usd: number | null;
  created_at: string;
};

type MessageDraftInsert = {
  id?: string;
  thread_id: string;
  in_reply_to_message_id?: string | null;
  draft_body: string;
  reasoning?: string | null;
  model?: string;
  status?: DraftStatus;
  approved_by?: string | null;
  approved_at?: string | null;
  edited_body?: string | null;
  input_tokens?: number | null;
  output_tokens?: number | null;
  cost_usd?: number | null;
  created_at?: string;
};

type MessageDraftUpdate = Partial<MessageDraftInsert>;

type ToneBrainRow = {
  id: number;
  body_md: string;
  source: string | null;
  updated_at: string;
};

type ToneBrainInsert = {
  id?: number;
  body_md: string;
  source?: string | null;
  updated_at?: string;
};

type ToneBrainUpdate = Partial<ToneBrainInsert>;

type PricingOverrideLogRow = {
  id: string;
  property_id: string;
  date: string;
  old_price: number | null;
  new_price: number;
  source: "manual" | "auto_cron";
  pushed_by: string | null;
  pushed_at: string;
  pricelabs_response: string | null;
};

type PricingOverrideLogInsert = {
  id?: string;
  property_id: string;
  date: string;
  old_price?: number | null;
  new_price: number;
  source: "manual" | "auto_cron";
  pushed_by?: string | null;
  pushed_at?: string;
  pricelabs_response?: string | null;
};

type PricingOverrideLogUpdate = Partial<PricingOverrideLogInsert>;

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
      optimizations: {
        Row: OptimizationRow;
        Insert: OptimizationInsert;
        Update: OptimizationUpdate;
        Relationships: [];
      };
      message_threads: {
        Row: MessageThreadRow;
        Insert: MessageThreadInsert;
        Update: MessageThreadUpdate;
        Relationships: [];
      };
      messages: {
        Row: MessageRow;
        Insert: MessageInsert;
        Update: MessageUpdate;
        Relationships: [];
      };
      message_drafts: {
        Row: MessageDraftRow;
        Insert: MessageDraftInsert;
        Update: MessageDraftUpdate;
        Relationships: [];
      };
      tone_brain: {
        Row: ToneBrainRow;
        Insert: ToneBrainInsert;
        Update: ToneBrainUpdate;
        Relationships: [];
      };
      pricing_override_log: {
        Row: PricingOverrideLogRow;
        Insert: PricingOverrideLogInsert;
        Update: PricingOverrideLogUpdate;
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
