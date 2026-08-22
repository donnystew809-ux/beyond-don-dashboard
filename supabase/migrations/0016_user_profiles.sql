-- Contact details captured during invite onboarding.
--
-- Kept out of auth.users deliberately: that table belongs to Supabase Auth and
-- writing app data into it couples us to their schema. A separate table also
-- lets the Team page show a cleaner's phone without handing the client any
-- auth internals.
--
-- Phone is a contact record only — it is NOT a login factor and is NOT
-- verified. If SMS codes are ever added, that will need a verification step
-- and a normalised E.164 column; storing the raw entry now keeps that door
-- open without pretending the number is trustworthy.

create table if not exists user_profiles (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  phone       text,
  full_name   text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table user_profiles enable row level security;

-- A user may see and edit their own contact details. Staff read everyone's via
-- the service role in server routes, so no broad select policy is needed here.
drop policy if exists "users read own profile" on user_profiles;
create policy "users read own profile" on user_profiles
  for select using (auth.uid() = user_id);

drop policy if exists "users update own profile" on user_profiles;
create policy "users update own profile" on user_profiles
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
