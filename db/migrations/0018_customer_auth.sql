-- =============================================================================
-- 0018 — Customer sign-in: Google account linking + email verification codes
--
-- auth.users already models "the users table" (Supabase-shaped; server/auth/
-- auth-service.ts reads/writes it directly, see 0001). On hosted Supabase the
-- app's migrator role does not own `auth.users` (Supabase's own admin role
-- does), so it cannot ALTER that table — confirmed 2026-09-22 ("must be owner
-- of table users"). Google linking therefore lives in its own app-owned
-- table, `user_auth` (one row per user who has ever linked/created via
-- Google), left-joined onto `auth.users` by every query in
-- `repositories/users.ts` instead of living as columns on it.
--   - email_verification_codes: one-time codes for the checkout email-verify
--     gate. Verifying sets auth.users.email_confirmed_at (a native Supabase
--     column, already the one read everywhere "is this login's email
--     verified" matters), so no new verified-flag is introduced.
-- Both tables are server-only: RLS enabled, no app_runtime policy, only
-- app_service (BYPASSRLS) may touch them — same pattern as
-- notification_events (0013).
-- =============================================================================

create table user_auth (
  user_id       uuid primary key references auth.users (id) on delete cascade,
  google_sub    text unique,
  auth_provider text not null default 'password',
  created_at    timestamptz not null default now()
);

alter table user_auth enable row level security;
grant select, insert, update, delete on user_auth to app_service;

create table email_verification_codes (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  email        text not null,
  code_hash    text not null,
  attempts     integer not null default 0,
  max_attempts integer not null default 5,
  expires_at   timestamptz not null,
  consumed_at  timestamptz,
  created_at   timestamptz not null default now()
);

create index email_verification_codes_user_idx on email_verification_codes (user_id, created_at desc);

alter table email_verification_codes enable row level security;
grant select, insert, update, delete on email_verification_codes to app_service;
