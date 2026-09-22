-- =============================================================================
-- 0018 — Grant app_service USAGE on the auth schema (hosted Supabase)
--
-- On hosted Supabase, `grant usage on schema auth to app_service` (0006) and a
-- direct re-grant both report success but have no effect: has_schema_privilege
-- stays false. Supabase silently protects ACL changes on its own `auth` schema
-- for arbitrary roles. `service_role` is the one role Supabase itself grants
-- real `USAGE` on schema auth (its standard privileged/service role), and
-- granting *membership* in it (not a direct ACL grant) is honoured, so
-- app_service inherits schema access through it. Table-level access on
-- auth.users still comes from 0017's direct grant (SELECT only — INSERT/UPDATE
-- on auth.users stay blocked for everyone except supabase_auth_admin; see
-- docs/skills/restaurant-platform/SKILL.md §6 and §16).
--
-- On plain PostgreSQL (no Supabase, no `service_role`), this migration is a
-- no-op: granting membership in a role that does not exist would fail the
-- whole file, so it is guarded.
--
-- The runner wraps this file in a transaction: it applies completely or not at all.
-- Rollback: revoke service_role from app_service;
-- =============================================================================

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant service_role to app_service;
  end if;
end $$;
