-- Per-property auto-pricing settings.
-- When auto_accept_pricing=true, the daily auto-pricing cron pushes PriceLabs'
-- suggested prices as overrides — but only within auto_accept_max_deviation_pct
-- of the property's base_price (safety net so a runaway suggestion can't 10x
-- or zero out the listing).
--
-- horizon_days = how many days ahead to push. Default 30.

alter table properties
  add column if not exists auto_accept_pricing boolean not null default false,
  add column if not exists auto_accept_max_deviation_pct int not null default 25,
  add column if not exists auto_accept_horizon_days int not null default 30,
  add column if not exists auto_accept_min_price numeric(10,2),
  add column if not exists auto_accept_max_price numeric(10,2);

-- Audit log: every override pushed by the cron or the manual button.
create table if not exists pricing_override_log (
  id uuid primary key default uuid_generate_v4(),
  property_id uuid not null references properties(id) on delete cascade,
  date date not null,
  old_price numeric(10,2),
  new_price numeric(10,2) not null,
  source text not null check (source in ('manual','auto_cron')),
  pushed_by uuid references auth.users(id),
  pushed_at timestamptz not null default now(),
  pricelabs_response text
);
create index on pricing_override_log (property_id, date);
create index on pricing_override_log (pushed_at desc);

alter table pricing_override_log enable row level security;
create policy "members read pricing log" on pricing_override_log
  for select using (is_member());
create policy "admins write pricing log" on pricing_override_log
  for all using (is_admin()) with check (is_admin());
