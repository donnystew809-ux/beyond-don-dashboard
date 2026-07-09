-- 0007_messaging_automation.sql
-- ─────────────────────────────────────────────────────────────────────────
-- Phase 1 of the automation roadmap: real-time guest-messaging pipeline
-- plus the two knowledge stores the drafter needs to answer safely on its
-- own — per-property operational profiles (right wifi/lockbox facts to the
-- right guest) and the self-updating Airbnb policy brain (policy-correct
-- answers, e.g. no pet fee for service animals).
--
-- NOTE: 0006_organizations.sql is intentionally SKIPPED (see README.md in
-- this folder). This migration continues the single-tenant user_roles
-- model and numbering resumes here at 0007.
-- ─────────────────────────────────────────────────────────────────────────

-- ── 1. Auto-send controls ────────────────────────────────────────────────

alter table properties
  add column if not exists auto_send_messages boolean not null default false;

alter table messages
  add column if not exists sent_via text
    check (sent_via in ('human', 'auto'))
    default 'human',
  add column if not exists confidence numeric;

-- Global app settings (kill-switch lives here; generic key/value so later
-- phases can add flags without new migrations).
create table if not exists app_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_by uuid references auth.users (id),
  updated_at timestamptz not null default now()
);

insert into app_settings (key, value)
values ('messaging_kill_switch', '{"enabled": false}'::jsonb)
on conflict (key) do nothing;

alter table app_settings enable row level security;
create policy "members read settings" on app_settings
  for select using (is_member());
create policy "admins write settings" on app_settings
  for all using (is_admin()) with check (is_admin());

-- ── 2. Pipeline audit trail ──────────────────────────────────────────────
-- Every step the intake pipeline takes is recorded here: email received,
-- parse result, thread match (or ambiguity), draft created, auto-send or
-- escalation, kill-switch blocks. `payload` carries step-specific detail
-- including the raw email for replay when Airbnb changes their format.

create table if not exists message_audit (
  id uuid primary key default uuid_generate_v4(),
  thread_id uuid references message_threads (id) on delete set null,
  action text not null,                 -- email_received | parsed | thread_matched
                                        -- | ambiguous_escalated | draft_created
                                        -- | auto_sent | escalated | killswitch_blocked
                                        -- | send_failed
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index on message_audit (thread_id, created_at desc);
create index on message_audit (action, created_at desc);

alter table message_audit enable row level security;
create policy "members read audit" on message_audit
  for select using (is_member());
-- writes come from the service role (intake route); no member write policy.

-- ── 3. Property profiles ────────────────────────────────────────────────
-- One per property. Structured access facts + freeform markdown sections.
-- Read by: the drafter (guest answers), cleaners (Phase 3 UI), admins.

create table if not exists property_profiles (
  id uuid primary key default uuid_generate_v4(),
  property_id uuid not null unique references properties (id) on delete cascade,
  access_info jsonb not null default '{}'::jsonb,
    -- expected keys: lockbox_code, gate_code, wifi_network, wifi_password,
    -- alarm_notes, parking_notes, trash_day — free-form jsonb so new facts
    -- never need a migration.
  house_rules_md text,
  quirks_md text,
  host_preferences_md text,
  cleaning_notes_md text,
  updated_by uuid references auth.users (id),
  updated_at timestamptz not null default now()
);

alter table property_profiles enable row level security;
create policy "members read profiles" on property_profiles
  for select using (is_member());
create policy "admins write profiles" on property_profiles
  for all using (is_admin()) with check (is_admin());

-- ── 4. Airbnb policy brain ───────────────────────────────────────────────
-- Curated official Airbnb Help Center policy pages, refreshed weekly by
-- api/cron/policy-sync. content_hash powers change detection; on change
-- the cron writes change_summary_md and fires a notification_event.

create table if not exists policy_brain (
  id uuid primary key default uuid_generate_v4(),
  category text not null unique
    check (category in (
      'service_animals', 'pets', 'cancellations', 'refunds', 'fees',
      'parties_events', 'safety', 'discrimination', 'extenuating',
      'guest_standards', 'house_rules'
    )),
  source_url text not null,
  title text,
  content_md text,
  content_hash text,
  fetched_at timestamptz,
  last_changed_at timestamptz,
  change_summary_md text,
  created_at timestamptz not null default now()
);

alter table policy_brain enable row level security;
create policy "members read policy brain" on policy_brain
  for select using (is_member());
-- writes come from the service role (policy-sync cron).

-- ── 5. Notification events ──────────────────────────────────────────────
-- Generic in-app/push notification queue. Used by the messaging pipeline
-- ("Draft needs review"), policy sync ("Airbnb policy changed"), and later
-- phases (low stock, overdue maintenance).

create table if not exists notification_events (
  id uuid primary key default uuid_generate_v4(),
  type text not null,                   -- draft_needs_review | policy_changed
                                        -- | low_stock | maintenance_due | ...
  property_id uuid references properties (id) on delete cascade,
  ref_id uuid,                          -- id of the related row (draft, policy, task)
  title text not null,
  body text,
  severity text not null default 'info'
    check (severity in ('info', 'warning', 'critical')),
  status text not null default 'pending'
    check (status in ('pending', 'sent', 'dismissed')),
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create index on notification_events (status, created_at desc);

alter table notification_events enable row level security;
create policy "members read notifications" on notification_events
  for select using (is_member());
create policy "members dismiss notifications" on notification_events
  for update using (is_member()) with check (is_member());
