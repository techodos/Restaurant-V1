-- =============================================================================
-- 0012 — Harden the migration bookkeeping table
-- schema_migrations is internal infrastructure: it is not part of any tenant's
-- data and no application role should read it. RLS without any policy means
-- only the migration owner (app_owner, via BYPASSRLS/superuser) can touch it.
-- =============================================================================

alter table schema_migrations enable row level security;

revoke all on table schema_migrations from app_runtime, app_service;
