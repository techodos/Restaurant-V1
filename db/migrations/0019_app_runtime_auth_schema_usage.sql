-- =============================================================================
-- 0019 — Grant app_runtime USAGE on the auth schema (hosted Supabase)
--
-- Same gap as 0018, for the other runtime role. RLS policies call
-- app.current_user_id(), which calls auth.uid() (see 0001/0006); under
-- app_runtime (RLS enforced, not BYPASSRLS) every policy check hits that
-- function. On hosted Supabase, app_runtime never got real USAGE on schema
-- auth (0006's `grant usage on schema ... auth to app_runtime, app_service`
-- reports success but Supabase silently no-ops it for custom roles), so any
-- RLS-checked read failed with `permission denied for schema auth` — this
-- broke authenticateStaff() on every admin page load right after a
-- successful sign-in (sign-in itself runs as app_service via db.write(),
-- which bypasses RLS, so it never hit this).
--
-- Role MEMBERSHIP (not a direct schema grant) is the one thing Supabase
-- honours here, same as 0018. Membership only inherits privilege GRANTs, not
-- role ATTRIBUTES — app_runtime does NOT gain BYPASSRLS or superuser this way,
-- so DECISIONS.md §3 ("the runtime role is deliberately unprivileged") still
-- holds: this only resolves the auth schema/function lookup RLS policies need,
-- not table-level access.
--
-- On plain PostgreSQL (no Supabase, no `service_role`), this migration is a
-- no-op, guarded the same way as 0018.
--
-- The runner wraps this file in a transaction: it applies completely or not at all.
-- Rollback: revoke service_role from app_runtime;
-- =============================================================================

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant service_role to app_runtime;
  end if;
end $$;
