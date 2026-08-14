-- 0012_contracts.sql
-- ─────────────────────────────────────────────────────────────────────────
-- Phase 7: e-sign contract lifecycle (Dropbox Sign). Tracks each envelope
-- from draft → sent → viewed → signed (or declined/voided), linked to a
-- property and/or a website lead (co_host_prospects). The signed PDF is
-- stored in the private `contracts` Storage bucket (created separately in
-- the dashboard UI or via storage API — buckets aren't SQL objects).
-- ─────────────────────────────────────────────────────────────────────────

create table if not exists contracts (
  id uuid primary key default uuid_generate_v4(),
  title text not null,
  signer_name text not null,
  signer_email text not null,
  property_id uuid references properties (id) on delete set null,
  prospect_id uuid,                       -- co_host_prospects.id (soft link)
  status text not null default 'draft'
    check (status in ('draft', 'sent', 'viewed', 'signed', 'declined', 'voided', 'error')),
  provider text not null default 'dropbox_sign',
  envelope_id text unique,                -- provider signature_request_id
  signed_pdf_path text,                   -- Storage path once completed
  message text,                           -- note included in the sign request
  sent_at timestamptz,
  completed_at timestamptz,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists contracts_status_idx on contracts (status, created_at desc);

alter table contracts enable row level security;
create policy "members read contracts" on contracts
  for select using (is_member());
create policy "admins write contracts" on contracts
  for all using (is_admin()) with check (is_admin());
-- webhook writes come via the service role.
