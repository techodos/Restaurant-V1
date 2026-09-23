-- =============================================================================
-- 0019 — Replace auth.users with an app-owned `users` table
--
-- auth.users (Supabase's auth shim, see 0001) turned out to be read-only for
-- the app in practice: app_service (the bypassrls role every write transaction
-- runs as, see database.ts#write/asService) was never granted INSERT/UPDATE/
-- DELETE on it, and it never can be — auth.users is owned by
-- supabase_auth_admin on hosted Supabase, our migrator role holds a few
-- privileges on it directly but with no GRANT OPTION, so it cannot delegate
-- them onward (confirmed 2026-09-23: `GRANT ... ON auth.users` succeeds but
-- silently grants nothing — "no privileges were granted for users"). This
-- broke every account-creating flow that touches it: Google sign-up
-- (upsertGoogleUser), email/password customer sign-up and staff creation.
--
-- Fix: stop using auth.users. `users` (public schema, owned by our migrator)
-- replaces it as the one login-identity table, with the columns the app
-- actually reads/writes (no Supabase-auth cruft) plus `role` and
-- `is_email_verified` promoted to real columns instead of a jsonb dig /
-- nullable timestamp. `role` here is a coarse account-type flag
-- ('customer' | 'staff'), separate from team_members.role, which stays the
-- authoritative per-restaurant RBAC role (a person can be staff at one
-- restaurant and just a customer elsewhere, so that can't live on `users`).
--
-- This also drops the unrelated `public.users` table (id bigint, columns
-- id/created_at/password/name) that existed only as manually-added rows in
-- the Supabase dashboard — no migration created it and no app code reads it.
--
-- auth.users itself is left in place (Supabase owns it; we cannot drop it,
-- and Supabase's own internal tables — auth.identities, auth.sessions, etc.
-- — still FK to it) but the app no longer reads or writes it.
-- =============================================================================

drop table if exists public.users;

create table users (
  id                uuid primary key default gen_random_uuid(),
  email             text not null unique,
  password_hash     text,
  name              text not null,
  role              text not null default 'customer',
  is_email_verified boolean not null default false,
  last_sign_in_at   timestamptz,
  created_at        timestamptz not null default now()
);

alter table users enable row level security;
grant select, insert, update, delete on users to app_service;

-- Backfill from auth.users, preserving ids so every FK below repoints for free.
insert into users (id, email, password_hash, name, role, is_email_verified, last_sign_in_at, created_at)
select
  u.id,
  u.email,
  u.encrypted_password,
  coalesce(u.raw_user_meta_data ->> 'name', ''),
  case when exists (select 1 from team_members tm where tm.user_id = u.id) then 'staff' else 'customer' end,
  u.email_confirmed_at is not null,
  u.last_sign_in_at,
  coalesce(u.created_at, now())
from auth.users u;

-- Repoint every app-owned FK from auth.users(id) to users(id). Supabase's own
-- auth.* tables (identities, sessions, mfa_factors, ...) keep pointing at
-- auth.users — those are not ours to touch.
alter table team_members drop constraint team_members_user_id_fkey;
alter table team_members add constraint team_members_user_id_fkey
  foreign key (user_id) references users (id) on delete set null;

alter table media drop constraint media_uploaded_by_fkey;
alter table media add constraint media_uploaded_by_fkey
  foreign key (uploaded_by) references users (id) on delete set null;

alter table customers drop constraint customers_user_id_fkey;
alter table customers add constraint customers_user_id_fkey
  foreign key (user_id) references users (id) on delete set null;

alter table order_status_history drop constraint order_status_history_changed_by_fkey;
alter table order_status_history add constraint order_status_history_changed_by_fkey
  foreign key (changed_by) references users (id) on delete set null;

alter table deliveries drop constraint deliveries_driver_user_id_fkey;
alter table deliveries add constraint deliveries_driver_user_id_fkey
  foreign key (driver_user_id) references users (id) on delete set null;

alter table reviews drop constraint reviews_responded_by_fkey;
alter table reviews add constraint reviews_responded_by_fkey
  foreign key (responded_by) references users (id) on delete set null;

alter table user_auth drop constraint customer_identities_user_id_fkey;
alter table user_auth add constraint user_auth_user_id_fkey
  foreign key (user_id) references users (id) on delete cascade;

alter table email_verification_codes drop constraint email_verification_codes_user_id_fkey;
alter table email_verification_codes add constraint email_verification_codes_user_id_fkey
  foreign key (user_id) references users (id) on delete cascade;
