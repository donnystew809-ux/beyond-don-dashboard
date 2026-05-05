-- BEYOND DON LLC dashboard — initial schema
-- Run via: supabase db push (or paste into the Supabase SQL editor)

create extension if not exists "uuid-ossp";

-- enums ---------------------------------------------------------------------

create type property_status as enum ('active', 'paused', 'archived');
create type reservation_source as enum ('airbnb', 'vrbo', 'direct', 'blocked');
create type cleaning_status as enum (
  'scheduled', 'in_progress', 'completed', 'issue', 'cancelled'
);
create type user_role as enum ('admin', 'operator');
create type sync_status as enum ('running', 'ok', 'error');

-- properties ----------------------------------------------------------------

create table properties (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  nickname text,
  address text,
  airbnb_listing_id text,
  ical_url text,
  pricelabs_listing_id text,
  turno_property_id text,
  owner_name text,
  owner_email text,
  status property_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index properties_status_idx on properties (status);

-- reservations --------------------------------------------------------------

create table reservations (
  id uuid primary key default uuid_generate_v4(),
  property_id uuid not null references properties(id) on delete cascade,
  source reservation_source not null,
  guest_name text,
  check_in date not null,
  check_out date not null,
  nights int generated always as (greatest(check_out - check_in, 0)) stored,
  gross_revenue numeric(12,2),
  net_to_owner numeric(12,2),
  reservation_code text,
  ical_uid text,
  status text,
  raw jsonb,
  synced_at timestamptz not null default now(),
  unique (property_id, ical_uid)
);

create index reservations_property_dates_idx
  on reservations (property_id, check_in, check_out);
create index reservations_check_in_idx on reservations (check_in);

-- prices --------------------------------------------------------------------

create table prices (
  id uuid primary key default uuid_generate_v4(),
  property_id uuid not null references properties(id) on delete cascade,
  date date not null,
  base_price numeric(10,2),
  suggested_price numeric(10,2),
  override_price numeric(10,2),
  currency text not null default 'USD',
  source text not null default 'pricelabs',
  synced_at timestamptz not null default now(),
  unique (property_id, date)
);

create index prices_property_date_idx on prices (property_id, date);

-- cleanings -----------------------------------------------------------------

create table cleanings (
  id uuid primary key default uuid_generate_v4(),
  property_id uuid not null references properties(id) on delete cascade,
  scheduled_for timestamptz not null,
  cleaner_name text,
  status cleaning_status not null default 'scheduled',
  turno_project_id text unique,
  notes text,
  synced_at timestamptz not null default now()
);

create index cleanings_property_idx on cleanings (property_id, scheduled_for);
create index cleanings_scheduled_for_idx on cleanings (scheduled_for);

-- sync_log ------------------------------------------------------------------

create table sync_log (
  id uuid primary key default uuid_generate_v4(),
  source text not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status sync_status not null default 'running',
  error text,
  records_processed int not null default 0
);

create index sync_log_source_started_idx on sync_log (source, started_at desc);

-- user_roles ----------------------------------------------------------------

create table user_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role user_role not null default 'operator',
  created_at timestamptz not null default now()
);

-- updated_at trigger --------------------------------------------------------

create or replace function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger properties_set_updated_at
  before update on properties
  for each row execute function set_updated_at();

-- RLS -----------------------------------------------------------------------
-- v1: any authenticated user with a row in user_roles can read all data;
-- only admins can write. Service role (server-side syncs) bypasses RLS.

alter table properties      enable row level security;
alter table reservations    enable row level security;
alter table prices          enable row level security;
alter table cleanings       enable row level security;
alter table sync_log        enable row level security;
alter table user_roles      enable row level security;

create or replace function is_admin() returns boolean as $$
  select exists (
    select 1 from user_roles
    where user_id = auth.uid() and role = 'admin'
  );
$$ language sql stable security definer;

create or replace function is_member() returns boolean as $$
  select exists (
    select 1 from user_roles where user_id = auth.uid()
  );
$$ language sql stable security definer;

-- read policies (all members)
create policy properties_read    on properties     for select using (is_member());
create policy reservations_read  on reservations   for select using (is_member());
create policy prices_read        on prices         for select using (is_member());
create policy cleanings_read     on cleanings      for select using (is_member());
create policy sync_log_read      on sync_log       for select using (is_admin());
create policy user_roles_read_self on user_roles   for select using (auth.uid() = user_id or is_admin());

-- write policies (admins only via UI; cron uses service role)
create policy properties_write   on properties     for all using (is_admin())     with check (is_admin());
create policy prices_override    on prices         for update using (is_admin())  with check (is_admin());
create policy cleanings_update   on cleanings      for update using (is_admin())  with check (is_admin());
create policy user_roles_write   on user_roles     for all using (is_admin())     with check (is_admin());
