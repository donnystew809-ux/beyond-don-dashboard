-- Account-level PIN: email + PIN signs in from ANY device.
--
-- This is a deliberate trade of security for convenience, made explicitly by
-- the account owner. Device binding (0014) meant a guessed PIN was useless
-- without the enrolled browser. Here the PIN IS the credential, so the entire
-- defence is rate limiting — hence the controls below rather than a bare hash.
--
--   * Lockout after 5 consecutive failures, 15 minutes, per account.
--     A 6-digit PIN (1,000,000 values) therefore needs ~50 years of sustained
--     attack; a 4-digit PIN (10,000) still needs ~3 weeks, and every failure
--     window is visible in auth_login_attempts.
--   * Every attempt is logged with IP, so an ongoing attack is detectable
--     rather than silent.
--   * Sign-in from an unrecognised device triggers an email alert, which turns
--     a successful guess into something the owner finds out about immediately.
--
-- pin_hash is service-role only: no RLS policy grants any client read. A short
-- PIN hash in a browser's hands is an offline brute force, which would defeat
-- the lockout entirely.

create table if not exists user_pins (
  user_id          uuid primary key references auth.users (id) on delete cascade,
  pin_hash         text not null,
  pin_salt         text not null,
  pin_length       int  not null default 6,

  failed_attempts  int  not null default 0,
  locked_until     timestamptz,

  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- Attempt log: powers IP throttling and after-the-fact investigation.
create table if not exists auth_login_attempts (
  id          uuid primary key default gen_random_uuid(),
  email       text,
  ip          text,
  success     boolean not null,
  reason      text,
  created_at  timestamptz not null default now()
);

create index if not exists auth_login_attempts_ip_idx
  on auth_login_attempts (ip, created_at desc);
create index if not exists auth_login_attempts_email_idx
  on auth_login_attempts (email, created_at desc);

-- Devices remain, now purely as a convenience layer: they remember passkeys
-- (which are inherently per-device) and let us recognise a browser so a
-- sign-in from somewhere new can raise an alert.
alter table auth_devices add column if not exists last_ip text;

-- Service role only. No policies, on purpose — see the note above about
-- offline brute force.
alter table user_pins enable row level security;
alter table auth_login_attempts enable row level security;
