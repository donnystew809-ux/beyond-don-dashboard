-- 0008_roles_and_property_access.sql
-- ─────────────────────────────────────────────────────────────────────────
-- Phase 2 of the automation roadmap: role system + per-property scoping,
-- the foundation the cleaner view (Phase 3) and owner portal (Phase 5) sit on.
--
-- ⚠️ SAFETY / WHY THIS IS A NO-OP FOR CURRENT ACCESS:
-- Today `is_member()` means "has ANY row in user_roles", and every read
-- policy uses it. If we simply added an 'owner'/'cleaner' role, that user
-- would immediately satisfy is_member() and could read the ENTIRE portfolio.
-- So this migration REDEFINES is_member() to mean STAFF (admin/operator).
-- Because the only roles that exist today are admin/operator, this change is
-- behaviourally IDENTICAL for current data — staff keep full access, and any
-- future owner/cleaner/partner is blocked by default until granted access
-- through the new scoped policies (added here for property_profiles; the rest
-- land with their UIs in Phase 3/5).
--
-- APPLY NOTE: the `alter type ... add value` statements below add enum values
-- that are NOT used elsewhere in this migration, so they're safe to run in the
-- same batch. If your Postgres complains, run the four add-value lines first,
-- then the rest.
-- ─────────────────────────────────────────────────────────────────────────

-- ── 1. New roles ─────────────────────────────────────────────────────────
alter type user_role add value if not exists 'owner';
alter type user_role add value if not exists 'cleaner';
alter type user_role add value if not exists 'partner';

-- ── 2. Redefine membership as STAFF (admin/operator) ─────────────────────
-- Identical behaviour for today's data; the guard that keeps new roles from
-- inheriting blanket portfolio access.
create or replace function is_member() returns boolean as $$
  select exists (
    select 1 from user_roles
    where user_id = auth.uid() and role in ('admin', 'operator')
  );
$$ language sql security definer stable;

-- is_admin() is unchanged (still admin-only); add is_staff() as an explicit
-- alias so future code can read clearly.
create or replace function is_staff() returns boolean as $$
  select is_member();
$$ language sql security definer stable;

-- ── 3. Per-property access grants ────────────────────────────────────────
-- One row per (user, property) a non-staff member may see, with the depth of
-- access. cleaning = cleaner view (profile + checklist + inventory);
-- owner_view = owner portal (financials + health for their property);
-- full = partner-level (rare).
create table if not exists property_access (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users (id) on delete cascade,
  property_id uuid not null references properties (id) on delete cascade,
  access_level text not null default 'cleaning'
    check (access_level in ('cleaning', 'owner_view', 'full')),
  granted_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  unique (user_id, property_id)
);
create index on property_access (user_id);
create index on property_access (property_id);

-- has_property_access(pid): staff see everything; others only their grants.
create or replace function has_property_access(pid uuid) returns boolean as $$
  select is_member() or exists (
    select 1 from property_access
    where user_id = auth.uid() and property_id = pid
  );
$$ language sql security definer stable;

alter table property_access enable row level security;
create policy "staff manage property_access" on property_access
  for all using (is_admin()) with check (is_admin());
create policy "see own property_access" on property_access
  for select using (user_id = auth.uid() or is_member());

-- ── 4. Invites ───────────────────────────────────────────────────────────
-- An admin creates an invite (email + role + optional property scope); the
-- invitee accepts via a tokenised link (reuses the magic-link pattern), which
-- creates their user_roles row + property_access rows. Accept flow lands with
-- the invites API in the next Phase 2 step.
create table if not exists invites (
  id uuid primary key default uuid_generate_v4(),
  email text not null,
  role user_role not null,
  property_ids uuid[] not null default '{}',
  access_level text not null default 'cleaning'
    check (access_level in ('cleaning', 'owner_view', 'full')),
  token text not null unique,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'revoked', 'expired')),
  invited_by uuid references auth.users (id),
  expires_at timestamptz not null,
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);
create index on invites (email);
create index on invites (token);

alter table invites enable row level security;
create policy "admins manage invites" on invites
  for all using (is_admin()) with check (is_admin());

-- ── 5. Scoped read for property profiles (cleaner-visible in Phase 3) ─────
-- The Phase 1 policy only lets staff (is_member) read profiles. Add an
-- ADDITIVE policy so a granted cleaner/owner can read the profile for their
-- property. RLS is permissive (OR), so this only ever GRANTS — it can't
-- restrict staff. The rest of the scoped read policies (reservations,
-- cleanings, etc.) land with their Phase 3/5 UIs, each tested per-role first.
create policy "scoped read profiles" on property_profiles
  for select using (has_property_access(property_id));
