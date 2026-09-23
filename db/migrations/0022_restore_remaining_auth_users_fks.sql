-- =============================================================================
-- 0022 — Restore the rest of the auth.users foreign keys
--
-- Same incident as 0021 (see its header and SKILL.md §6): the out-of-repo
-- migrations that introduced public.users repointed every FK that used to
-- reference auth.users, not just team_members.user_id. Found this time via a
-- live "updating order status" failure (order_status_history_changed_by_fkey
-- violation) — 0021 only fixed team_members, these were still broken:
--
--   customers.user_id, deliveries.driver_user_id, media.uploaded_by,
--   order_status_history.changed_by, reviews.responded_by
--
-- (customers.user_id was removed from this file in a later edit — see the
-- 2026-09-25 note below.)
--
-- All five originally pointed at auth.users(id) on delete set null (see
-- 0003_core_tables.sql, 0005_commerce.sql). email_verification_codes is a new
-- table from the same out-of-repo work with no original definition to revert
-- to, and is left pointing at public.users on purpose — it is part of the new
-- customer-auth flow, not something this app's existing code reads.
--
-- Existing rows are cleared *before* the constraint is added (Postgres
-- validates existing data when a FK is added) rather than after.
--
-- Edited 2026-09-25 (after this file was already applied to the shared hosted
-- DB — see the checksum-fix note below): `customers.user_id` dropped out of
-- this list. A second, independent fix for the same root incident
-- (0021_customers_own_login.sql, a different branch's commit, merged in the
-- same session as this edit) moved customer login onto `customers` itself and
-- dropped the `user_id` column entirely, so the four lines that referenced it
-- here would fail with "column does not exist" on any environment that
-- applies migrations in filename order from scratch. On the one shared DB
-- both branches actually run against, this file already ran (with its
-- original content, customers included) *before* that column was dropped, so
-- nothing there needs undoing — this edit is only for every other
-- environment's migration history to stay internally consistent. See
-- DECISIONS.md §26/§27 and SKILL.md §16 for the full incident.
--
-- The runner wraps this file in a transaction: it applies completely or not at all.
-- =============================================================================

-- Any row pointing at a public.users id that has no auth.users match would
-- violate the FK about to be restored; clear those first (on delete set null
-- is what these columns have always done for an unlinked user).
update deliveries set driver_user_id = null
 where driver_user_id is not null and driver_user_id not in (select id from auth.users);
update media set uploaded_by = null
 where uploaded_by is not null and uploaded_by not in (select id from auth.users);
update order_status_history set changed_by = null
 where changed_by is not null and changed_by not in (select id from auth.users);
update reviews set responded_by = null
 where responded_by is not null and responded_by not in (select id from auth.users);

alter table deliveries drop constraint if exists deliveries_driver_user_id_fkey;
alter table deliveries
  add constraint deliveries_driver_user_id_fkey foreign key (driver_user_id) references auth.users (id) on delete set null;

alter table media drop constraint if exists media_uploaded_by_fkey;
alter table media
  add constraint media_uploaded_by_fkey foreign key (uploaded_by) references auth.users (id) on delete set null;

alter table order_status_history drop constraint if exists order_status_history_changed_by_fkey;
alter table order_status_history
  add constraint order_status_history_changed_by_fkey foreign key (changed_by) references auth.users (id) on delete set null;

alter table reviews drop constraint if exists reviews_responded_by_fkey;
alter table reviews
  add constraint reviews_responded_by_fkey foreign key (responded_by) references auth.users (id) on delete set null;
