-- =============================================================================
-- 0021 — Restore team_members.user_id -> auth.users
--
-- Found 2026-09-22: a concurrent, out-of-repo change (migrations
-- "0019_replace_users_table.sql" / "0020_merge_user_auth_into_users.sql",
-- recorded in schema_migrations but never committed to db/migrations/) had
-- repointed team_members_user_id_fkey at a new public.users table (built for
-- customer auth, e.g. Google sign-in — columns password_hash/google_sub/
-- auth_provider) without migrating the seeded staff rows into it, so every
-- team_members.user_id went NULL and staff sign-in broke ("Invalid email or
-- password" even though auth.users still had the correct password hashes).
--
-- This app's staff auth (server/auth/auth-service.ts) reads/writes auth.users,
-- not public.users, so team_members must keep pointing at auth.users until (if
-- ever) that code is deliberately migrated too. public.users is left in place
-- untouched — only the FK target and the orphaned links are restored.
--
-- The runner wraps this file in a transaction: it applies completely or not at all.
-- =============================================================================

alter table team_members drop constraint if exists team_members_user_id_fkey;
alter table team_members
  add constraint team_members_user_id_fkey foreign key (user_id) references auth.users (id) on delete set null;

update team_members tm
   set user_id = u.id
  from auth.users u
 where lower(u.email) = lower(tm.email)
   and tm.user_id is distinct from u.id;
