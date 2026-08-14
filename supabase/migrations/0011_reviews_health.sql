-- 0011_reviews_health.sql
-- ─────────────────────────────────────────────────────────────────────────
-- Phase 6: guest reviews store, feeding the property-health composite.
-- Ingested from the Airbnb data export (scripts/ingest-reviews.mjs); later
-- refreshable from future exports. Owner-visible (their properties only).
-- ─────────────────────────────────────────────────────────────────────────

create table if not exists property_reviews (
  id uuid primary key default uuid_generate_v4(),
  property_id uuid not null references properties (id) on delete cascade,
  airbnb_review_id text not null unique,
  rating int check (rating between 1 and 5),
  comment text,
  submitted_at timestamptz,
  raw jsonb,
  created_at timestamptz not null default now()
);
create index if not exists property_reviews_property_idx
  on property_reviews (property_id, submitted_at desc);

alter table property_reviews enable row level security;
create policy "members read reviews" on property_reviews
  for select using (is_member());
-- Owners see reviews for their properties (cleaning-level access does not).
create policy "owner read reviews" on property_reviews
  for select using (has_owner_access(property_id));
-- writes come from the service role (ingest script); no member write policy.
