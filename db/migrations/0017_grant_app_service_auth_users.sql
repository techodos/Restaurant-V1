-- =============================================================================
-- 0017 — Grant app_service access to auth.users
--
-- 0006 granted `select on auth.users` to app_runtime only. Every privileged
-- sign-in/sign-up path (signInStaff, signInCustomer, createCustomerAccount,
-- repositories/team.ts) runs inside db.write(), which elevates the connection
-- to app_service (see server/db/database.ts `set local role`), and reads,
-- inserts into and updates auth.users. Without this grant every one of those
-- paths fails with "permission denied for schema auth" against a real
-- (non-owner) connection — app_service already got `usage on schema ... auth`
-- from 0006 but no table-level privileges. Seed/verify never caught this
-- because they run as app_owner, which bypasses grants entirely.
--
-- The runner wraps this file in a transaction: it applies completely or not at all.
-- Rollback: revoke select, insert, update on auth.users from app_service;
-- =============================================================================

grant select, insert, update on auth.users to app_service;
