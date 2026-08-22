-- Device-bound PIN + passkey sign-in.
--
-- THREAT MODEL — why a PIN is acceptable here at all:
-- A 4-digit PIN is only 10,000 combinations, so it is NEVER the sole
-- credential. It unlocks a *specific, already-authorized device*. Enrolment
-- requires a full Supabase session (magic link), which mints a random 256-bit
-- device secret held only by that browser. Unlocking requires BOTH the device
-- secret AND the PIN. Knowing the PIN without the device gets you nothing, and
-- possessing the device without the PIN gets you nothing.
--
-- Never readable by clients: pin_hash and secret_hash live behind the service
-- role only. RLS denies everything by default and no policy grants select, so
-- even a leaked anon key exposes nothing here.

create table if not exists auth_devices (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users (id) on delete cascade,

  -- Public identifier for the browser; stored client-side, safe to send.
  device_id         text not null unique,
  -- sha256 of the device secret. The secret itself never touches the server
  -- in storable form, so a database dump cannot be replayed as a device.
  secret_hash       text not null,
  -- scrypt(pin, salt). Salt is per-device and stored alongside.
  pin_hash          text,
  pin_salt          text,

  label             text,

  -- Brute-force containment. Attempts are counted per device, so an attacker
  -- who somehow has the secret still cannot grind the 10k PIN space.
  failed_attempts   int not null default 0,
  locked_until      timestamptz,

  -- WebAuthn (Face ID / Touch ID / Windows Hello), optional upgrade.
  passkey_cred_id   text unique,
  passkey_pubkey    text,
  passkey_counter   bigint not null default 0,
  passkey_transports text[],

  created_at        timestamptz not null default now(),
  last_used_at      timestamptz
);

create index if not exists auth_devices_user_idx on auth_devices (user_id);
create index if not exists auth_devices_device_idx on auth_devices (device_id);

-- Short-lived WebAuthn challenges. Single-use, expire fast.
create table if not exists auth_challenges (
  id          uuid primary key default gen_random_uuid(),
  device_id   text,
  user_id     uuid references auth.users (id) on delete cascade,
  challenge   text not null,
  purpose     text not null check (purpose in ('register', 'authenticate')),
  expires_at  timestamptz not null,
  created_at  timestamptz not null default now()
);

create index if not exists auth_challenges_lookup_idx
  on auth_challenges (device_id, purpose, expires_at desc);

-- Deny-by-default: service role bypasses RLS, everyone else gets nothing.
alter table auth_devices enable row level security;
alter table auth_challenges enable row level security;

-- NO policies are defined, on purpose. RLS with zero policies denies every
-- client read and write; only the service role (server routes) can touch these
-- rows.
--
-- A "users can read their own devices" policy looks harmless and is NOT: it
-- would hand the signed-in client its own pin_hash. A 4-digit PIN has 10,000
-- possible values, so an attacker who obtained a session could dump the hash
-- and brute-force the PIN offline in milliseconds, completely bypassing the
-- server-side lockout that makes a short PIN safe in the first place. Device
-- management is therefore done through server routes that return only
-- non-sensitive columns.
