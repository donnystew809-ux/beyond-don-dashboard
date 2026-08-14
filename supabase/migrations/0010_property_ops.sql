-- 0010_property_ops.sql
-- ─────────────────────────────────────────────────────────────────────────
-- Phase 3 (part 2) + Phase 5 foundation, in one apply:
--   1. Cleaning checklists  — per-property templates; cleaner completes and
--      submits a checklist tied to a specific cleaning.
--   2. Inventory            — items with par levels + usage log.
--   3. Maintenance          — cadence schedules that materialize dated tasks
--      (api/cron/daily-ops) + notifications.
--   4. Owner scoping        — has_owner_access(): owners read their
--      properties' reservations (+ expenses if the table exists) for the
--      owner portal. Cleaners do NOT gain financial access.
--
-- All policies are ADDITIVE/permissive. Staff (is_member/is_admin) behaviour
-- unchanged. Scoped users only ever GAIN access to their granted rows.
-- ─────────────────────────────────────────────────────────────────────────

-- ── 1. Checklists ────────────────────────────────────────────────────────
create table if not exists checklist_templates (
  id uuid primary key default uuid_generate_v4(),
  property_id uuid not null references properties (id) on delete cascade,
  title text not null default 'Cleaning checklist',
  items jsonb not null default '[]'::jsonb,  -- ordered: [{"text": "..."}]
  updated_by uuid references auth.users (id),
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create unique index if not exists checklist_templates_property_idx
  on checklist_templates (property_id);

create table if not exists cleaning_checklists (
  id uuid primary key default uuid_generate_v4(),
  cleaning_id uuid not null references cleanings (id) on delete cascade,
  property_id uuid not null references properties (id) on delete cascade,
  template_id uuid references checklist_templates (id) on delete set null,
  items jsonb not null default '[]'::jsonb,  -- [{"text": "...", "checked": bool}]
  status text not null default 'in_progress'
    check (status in ('in_progress', 'submitted')),
  submitted_by uuid references auth.users (id),
  submitted_at timestamptz,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create unique index if not exists cleaning_checklists_cleaning_idx
  on cleaning_checklists (cleaning_id);

alter table checklist_templates enable row level security;
create policy "members read templates" on checklist_templates
  for select using (is_member());
create policy "admins write templates" on checklist_templates
  for all using (is_admin()) with check (is_admin());
create policy "scoped read templates" on checklist_templates
  for select using (has_property_access(property_id));

alter table cleaning_checklists enable row level security;
create policy "members read checklists" on cleaning_checklists
  for select using (is_member());
create policy "admins write checklists" on cleaning_checklists
  for all using (is_admin()) with check (is_admin());
-- A granted cleaner works their own property's checklist end-to-end.
create policy "scoped read own checklists" on cleaning_checklists
  for select using (has_property_access(property_id));
create policy "scoped insert checklists" on cleaning_checklists
  for insert with check (has_property_access(property_id));
create policy "scoped update checklists" on cleaning_checklists
  for update using (has_property_access(property_id))
  with check (has_property_access(property_id));

-- ── 2. Inventory ─────────────────────────────────────────────────────────
create table if not exists inventory_items (
  id uuid primary key default uuid_generate_v4(),
  property_id uuid not null references properties (id) on delete cascade,
  name text not null,
  unit text not null default 'ct',
  par_level int not null default 0,
  current_qty int not null default 0,
  notes text,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists inventory_items_property_idx
  on inventory_items (property_id);

create table if not exists inventory_log (
  id uuid primary key default uuid_generate_v4(),
  item_id uuid not null references inventory_items (id) on delete cascade,
  delta int not null,
  qty_after int not null,
  note text,
  reported_by uuid references auth.users (id),
  created_at timestamptz not null default now()
);
create index if not exists inventory_log_item_idx on inventory_log (item_id, created_at desc);

alter table inventory_items enable row level security;
create policy "members read inventory" on inventory_items
  for select using (is_member());
create policy "admins write inventory" on inventory_items
  for all using (is_admin()) with check (is_admin());
create policy "scoped read inventory" on inventory_items
  for select using (has_property_access(property_id));
-- Cleaners report stock counts during turnovers.
create policy "scoped update inventory" on inventory_items
  for update using (has_property_access(property_id))
  with check (has_property_access(property_id));

alter table inventory_log enable row level security;
create policy "members read inventory_log" on inventory_log
  for select using (is_member());
create policy "scoped insert inventory_log" on inventory_log
  for insert with check (
    exists (select 1 from inventory_items i
            where i.id = item_id and has_property_access(i.property_id))
  );
create policy "scoped read inventory_log" on inventory_log
  for select using (
    exists (select 1 from inventory_items i
            where i.id = item_id and has_property_access(i.property_id))
  );

-- ── 3. Maintenance ───────────────────────────────────────────────────────
create table if not exists maintenance_schedules (
  id uuid primary key default uuid_generate_v4(),
  property_id uuid not null references properties (id) on delete cascade,
  title text not null,                      -- e.g. "Replace air filters"
  cadence_days int not null check (cadence_days > 0),
  last_done_on date,
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists maintenance_schedules_property_idx
  on maintenance_schedules (property_id);

create table if not exists maintenance_tasks (
  id uuid primary key default uuid_generate_v4(),
  schedule_id uuid references maintenance_schedules (id) on delete cascade,
  property_id uuid not null references properties (id) on delete cascade,
  title text not null,
  due_on date not null,
  status text not null default 'pending'
    check (status in ('pending', 'done', 'skipped')),
  completed_by uuid references auth.users (id),
  completed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists maintenance_tasks_due_idx
  on maintenance_tasks (status, due_on);
-- One open task per schedule at a time (cron guard).
create unique index if not exists maintenance_tasks_open_per_schedule
  on maintenance_tasks (schedule_id) where (status = 'pending');

alter table maintenance_schedules enable row level security;
create policy "members read maint_schedules" on maintenance_schedules
  for select using (is_member());
create policy "admins write maint_schedules" on maintenance_schedules
  for all using (is_admin()) with check (is_admin());
create policy "scoped read maint_schedules" on maintenance_schedules
  for select using (has_property_access(property_id));

alter table maintenance_tasks enable row level security;
create policy "members read maint_tasks" on maintenance_tasks
  for select using (is_member());
create policy "admins write maint_tasks" on maintenance_tasks
  for all using (is_admin()) with check (is_admin());
create policy "scoped read maint_tasks" on maintenance_tasks
  for select using (has_property_access(property_id));
create policy "scoped update maint_tasks" on maintenance_tasks
  for update using (has_property_access(property_id))
  with check (has_property_access(property_id));

-- ── 4. Owner portal scoping ──────────────────────────────────────────────
-- Financial visibility is OWNER-level only (owner_view/full), never cleaning.
create or replace function has_owner_access(pid uuid) returns boolean as $$
  select is_member() or exists (
    select 1 from property_access
    where user_id = auth.uid() and property_id = pid
      and access_level in ('owner_view', 'full')
  );
$$ language sql security definer stable;

create policy "owner read reservations" on reservations
  for select using (has_owner_access(property_id));

-- expenses table exists in prod but predates the generated types; guard so
-- this migration also applies cleanly on a fresh database without it.
do $$
begin
  if to_regclass('public.expenses') is not null then
    execute 'create policy "owner read expenses" on expenses
             for select using (has_owner_access(property_id))';
  end if;
end $$;
