-- ─── Migration 0005: Expenses + Discount Rules ───────────────────────────────
-- Run this in the Supabase SQL editor (Project → SQL Editor → New query).

-- ── expenses ──────────────────────────────────────────────────────────────────
create table if not exists expenses (
  id              uuid primary key default gen_random_uuid(),
  property_id     uuid references properties(id) on delete cascade,
  date            date not null,
  category        text not null,          -- 'cleaning' | 'maintenance' | 'supplies' | 'platform_fee' | 'other'
  amount          numeric(10, 2) not null,
  currency        text not null default 'USD',
  vendor          text,                   -- cleaner name, contractor, etc.
  description     text,
  receipt_url     text,                   -- optional link to uploaded receipt
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

alter table expenses enable row level security;
create policy "Authenticated users can manage expenses"
  on expenses for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

create index if not exists expenses_property_id_idx on expenses(property_id);
create index if not exists expenses_date_idx on expenses(date desc);

-- ── discount_rules ────────────────────────────────────────────────────────────
-- Defines last-minute or far-future auto-discount guardrails.
-- The cron job (Phase 2) reads these and pushes PriceLabs overrides.
create table if not exists discount_rules (
  id                  uuid primary key default gen_random_uuid(),
  property_id         uuid references properties(id) on delete cascade,
  rule_type           text not null default 'last_minute',  -- 'last_minute' | 'early_bird'
  days_before_checkin int not null,    -- trigger if vacancy within N days
  discount_pct        numeric(5, 2) not null,  -- e.g. 15.00 = 15 %
  min_nights          int default 1,
  enabled             boolean not null default true,
  created_at          timestamptz not null default now()
);

alter table discount_rules enable row level security;
create policy "Authenticated users can manage discount rules"
  on discount_rules for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

create index if not exists discount_rules_property_id_idx on discount_rules(property_id);

-- ── co_host_prospects ─────────────────────────────────────────────────────────
-- Lightweight CRM for co-host pipeline tracking
create table if not exists co_host_prospects (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  platform        text not null default 'airbnb',  -- 'airbnb' | 'direct' | 'referral'
  contact_info    text,                -- email, phone, or Airbnb profile URL
  properties_count int,               -- how many listings they manage
  reached_out_at  date,               -- when they messaged you
  status          text not null default 'new',  -- 'new' | 'contacted' | 'meeting_scheduled' | 'converted' | 'declined'
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

alter table co_host_prospects enable row level security;
create policy "Authenticated users can manage co_host_prospects"
  on co_host_prospects for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');
