-- 0006_organizations.sql
-- ─────────────────────────────────────────────────────────────────────────
-- Multi-tenancy foundation.
--
-- Introduces `organizations` + `organization_members`, scopes every existing
-- tenant table to an org via `organization_id`, and replaces all RLS policies
-- with org-membership checks. Existing BEYOND DON LLC data is backfilled into
-- the first org.
--
-- After this migration:
--   * Donovan (owner) and Jasmin (operator) both belong to org "beyond-don".
--   * Every read query is automatically filtered by the caller's org via RLS.
--   * Every insert/update must include organization_id; the policy's WITH
--     CHECK ensures the user can only write into orgs they're a member of.
--   * Service-role queries bypass RLS as usual (server-side ingest, cron).
--   * `user_roles` table is left in place untouched for now — will be dropped
--     in a follow-up migration once all app code reads from
--     organization_members instead.
--
-- Designed to be safe to re-run (everything uses IF NOT EXISTS / DO blocks
-- that check current state).
-- ─────────────────────────────────────────────────────────────────────────

-- ── 1. Core tables ──────────────────────────────────────────────────────

create table if not exists organizations (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  slug text unique not null,
  owner_user_id uuid references auth.users(id),
  plan text not null default 'pro' check (plan in ('free','pro','enterprise')),
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists organization_members (
  organization_id uuid not null references organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'admin' check (role in ('owner','admin','operator')),
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);
create index if not exists idx_org_members_user on organization_members(user_id);


-- ── 2. Seed BEYOND DON LLC and assign Donovan + Jasmin ──────────────────

do $seed$
declare
  v_org_id uuid;
  v_donovan_id uuid;
  v_jasmin_id uuid;
begin
  -- Get or create the org
  select id into v_org_id from organizations where slug = 'beyond-don';
  if v_org_id is null then
    insert into organizations (name, slug)
    values ('BEYOND DON LLC', 'beyond-don')
    returning id into v_org_id;
  end if;

  -- Donovan → owner
  select id into v_donovan_id from auth.users where lower(email) = 'donnystew809@gmail.com';
  if v_donovan_id is not null then
    insert into organization_members (organization_id, user_id, role)
    values (v_org_id, v_donovan_id, 'owner')
    on conflict (organization_id, user_id) do update set role = excluded.role;
    update organizations set owner_user_id = v_donovan_id where id = v_org_id and owner_user_id is null;
  end if;

  -- Jasmin → operator
  select id into v_jasmin_id from auth.users where lower(email) = 'jasrcom92@gmail.com';
  if v_jasmin_id is not null then
    insert into organization_members (organization_id, user_id, role)
    values (v_org_id, v_jasmin_id, 'operator')
    on conflict (organization_id, user_id) do update set role = excluded.role;
  end if;
end
$seed$;


-- ── 3. Add organization_id to every tenant-scoped table ─────────────────
--
-- For each: add nullable column → backfill with beyond-don org → set NOT NULL
--           → add FK → add index. Idempotent.

do $scope$
declare
  v_org_id uuid;
  v_table text;
  v_tables text[] := array[
    'properties',
    'reservations',
    'prices',
    'cleanings',
    'sync_log',
    'optimizations',
    'message_threads',
    'messages',
    'message_drafts',
    'tone_brain',
    'pricing_override_log',
    'expenses',
    'discount_rules',
    'co_host_prospects'
  ];
begin
  select id into v_org_id from organizations where slug = 'beyond-don';

  foreach v_table in array v_tables loop
    -- Skip tables that don't exist yet (defensive — some are conditional)
    if not exists (
      select 1 from information_schema.tables
      where table_schema = 'public' and table_name = v_table
    ) then
      raise notice 'Skipping % (table does not exist)', v_table;
      continue;
    end if;

    -- Add column if absent
    if not exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = v_table
        and column_name = 'organization_id'
    ) then
      execute format('alter table %I add column organization_id uuid', v_table);
    end if;

    -- Backfill nulls
    execute format(
      'update %I set organization_id = %L where organization_id is null',
      v_table, v_org_id
    );

    -- Set NOT NULL (idempotent — checks if already not null)
    execute format('alter table %I alter column organization_id set not null', v_table);

    -- Add FK if absent
    if not exists (
      select 1 from information_schema.table_constraints
      where table_schema = 'public' and table_name = v_table
        and constraint_name = v_table || '_org_fk'
    ) then
      execute format(
        'alter table %I add constraint %I foreign key (organization_id) references organizations(id) on delete cascade',
        v_table, v_table || '_org_fk'
      );
    end if;

    -- Add index if absent
    if not exists (
      select 1 from pg_indexes
      where schemaname = 'public' and tablename = v_table
        and indexname = 'idx_' || v_table || '_org'
    ) then
      execute format('create index %I on %I (organization_id)', 'idx_' || v_table || '_org', v_table);
    end if;

    raise notice '✓ %', v_table;
  end loop;
end
$scope$;


-- ── 4. RLS policies on org tables themselves ────────────────────────────

alter table organizations enable row level security;
alter table organization_members enable row level security;

-- Members can read their orgs
drop policy if exists "members read org" on organizations;
create policy "members read org" on organizations for select
  using (
    id in (
      select organization_id from organization_members
      where user_id = (select auth.uid())
    )
  );

-- Owners/admins can update their orgs
drop policy if exists "owners update org" on organizations;
create policy "owners update org" on organizations for update
  using (
    id in (
      select organization_id from organization_members
      where user_id = (select auth.uid()) and role in ('owner','admin')
    )
  )
  with check (
    id in (
      select organization_id from organization_members
      where user_id = (select auth.uid()) and role in ('owner','admin')
    )
  );

-- Members can see their own memberships
drop policy if exists "members read self memberships" on organization_members;
create policy "members read self memberships" on organization_members for select
  using (user_id = (select auth.uid()));

-- Owners/admins can manage memberships
drop policy if exists "owners manage memberships" on organization_members;
create policy "owners manage memberships" on organization_members for all
  using (
    organization_id in (
      select organization_id from organization_members
      where user_id = (select auth.uid()) and role in ('owner','admin')
    )
  )
  with check (
    organization_id in (
      select organization_id from organization_members
      where user_id = (select auth.uid()) and role in ('owner','admin')
    )
  );


-- ── 5. Drop existing RLS policies on tenant tables, rebuild as org-based ─

do $rls$
declare
  v_table text;
  v_pol record;
  v_tables text[] := array[
    'properties',
    'reservations',
    'prices',
    'cleanings',
    'sync_log',
    'optimizations',
    'message_threads',
    'messages',
    'message_drafts',
    'tone_brain',
    'pricing_override_log',
    'expenses',
    'discount_rules',
    'co_host_prospects'
  ];
begin
  foreach v_table in array v_tables loop
    if not exists (
      select 1 from information_schema.tables
      where table_schema = 'public' and table_name = v_table
    ) then
      continue;
    end if;

    -- Enable RLS (idempotent)
    execute format('alter table %I enable row level security', v_table);

    -- Drop every existing policy on this table
    for v_pol in
      select polname from pg_policy
      where polrelid = (quote_ident(v_table))::regclass
    loop
      execute format('drop policy %I on %I', v_pol.polname, v_table);
    end loop;

    -- Single broad policy: members of the org can do anything within it
    execute format($p$
      create policy "org members all" on %I for all
      using (
        organization_id in (
          select organization_id from organization_members
          where user_id = (select auth.uid())
        )
      )
      with check (
        organization_id in (
          select organization_id from organization_members
          where user_id = (select auth.uid())
        )
      )
    $p$, v_table);

    raise notice '✓ RLS on %', v_table;
  end loop;
end
$rls$;
