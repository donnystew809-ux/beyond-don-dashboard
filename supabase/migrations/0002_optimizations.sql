-- Listing Optimizer — stores AI-generated analysis per property.
-- Run via Supabase SQL editor or supabase db push.

create table optimizations (
  id uuid primary key default uuid_generate_v4(),
  property_id uuid not null references properties(id) on delete cascade,
  generated_at timestamptz not null default now(),
  generated_by uuid references auth.users(id),
  model text not null default 'claude-opus-4-7',
  -- Top-level summary the model produces
  positioning text,
  -- Arrays of suggestions (jsonb keeps shape flexible as we iterate)
  titles jsonb not null default '[]'::jsonb,
  description jsonb,
  amenity_gaps jsonb not null default '[]'::jsonb,
  pricing_notes jsonb,
  raw jsonb,
  input_tokens int,
  output_tokens int,
  cost_usd numeric(10,4)
);

create index optimizations_property_idx
  on optimizations (property_id, generated_at desc);

alter table optimizations enable row level security;

create policy optimizations_read on optimizations
  for select using (is_member());

create policy optimizations_write on optimizations
  for all using (is_admin()) with check (is_admin());
