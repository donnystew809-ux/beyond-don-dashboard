-- Messaging schema for Phase 2: guest message ingest + Claude-drafted replies + Jasmin review queue.
-- All sends remain manual (Jasmin pastes the approved draft into Airbnb host inbox).
-- This table tracks threads & messages plus drafted replies; it does NOT send anything.

create table if not exists message_threads (
  id uuid primary key default uuid_generate_v4(),
  property_id uuid references properties(id) on delete set null,
  airbnb_thread_id text unique,                     -- e.g. 2521931233 from /hosting/messages/<id>
  guest_name text,
  guest_first_name text,
  reservation_code text,
  check_in date,
  check_out date,
  city text,
  status text not null default 'active'            -- active | archived | flagged
    check (status in ('active','archived','flagged')),
  last_message_at timestamptz,
  last_message_preview text,
  unread_count int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on message_threads (property_id);
create index on message_threads (last_message_at desc);
create index on message_threads (status);

create table if not exists messages (
  id uuid primary key default uuid_generate_v4(),
  thread_id uuid not null references message_threads(id) on delete cascade,
  direction text not null check (direction in ('inbound','outbound')),
  sender text,                                      -- 'Donovan' | 'Anthony' | 'Airbnb' (system)
  body text,
  sent_at timestamptz not null,
  airbnb_message_id text,                           -- if discoverable
  raw jsonb,                                        -- the raw aria-label or scraped blob
  created_at timestamptz not null default now(),
  unique (thread_id, sent_at, sender, body)         -- best-effort dedupe key
);
create index on messages (thread_id, sent_at);

create table if not exists message_drafts (
  id uuid primary key default uuid_generate_v4(),
  thread_id uuid not null references message_threads(id) on delete cascade,
  in_reply_to_message_id uuid references messages(id) on delete set null,
  draft_body text not null,
  reasoning text,                                   -- model's rationale
  model text not null default 'claude-opus-4-7',
  status text not null default 'pending'            -- pending | approved | edited | rejected | sent
    check (status in ('pending','approved','edited','rejected','sent')),
  approved_by uuid references auth.users(id),
  approved_at timestamptz,
  edited_body text,                                 -- if Jasmin edited before approving
  input_tokens int,
  output_tokens int,
  cost_usd numeric(10,4),
  created_at timestamptz not null default now()
);
create index on message_drafts (thread_id, created_at desc);
create index on message_drafts (status);

-- Single-row tone brain (markdown) used as system prompt for the drafter
create table if not exists tone_brain (
  id int primary key default 1 check (id = 1),
  body_md text not null,
  source text,                                      -- 'manual' | 'corpus_v0' | 'corpus_full'
  updated_at timestamptz not null default now()
);

-- RLS: same rules as the rest of the app (admin sees all, operator sees all messages but
-- not the cost columns; we'll filter cost in app code rather than via column-level RLS)
alter table message_threads enable row level security;
alter table messages enable row level security;
alter table message_drafts enable row level security;
alter table tone_brain enable row level security;

create policy "members read threads" on message_threads
  for select using (is_member());
create policy "admins write threads" on message_threads
  for all using (is_admin()) with check (is_admin());

create policy "members read messages" on messages
  for select using (is_member());
create policy "admins write messages" on messages
  for all using (is_admin()) with check (is_admin());

create policy "members read drafts" on message_drafts
  for select using (is_member());
create policy "members update drafts" on message_drafts
  for update using (is_member()) with check (is_member());
create policy "admins manage drafts" on message_drafts
  for all using (is_admin()) with check (is_admin());

create policy "members read tone_brain" on tone_brain
  for select using (is_member());
create policy "admins write tone_brain" on tone_brain
  for all using (is_admin()) with check (is_admin());
