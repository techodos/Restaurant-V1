-- =============================================================================
-- 0048 — A branch with history cannot be deleted
--
-- Deleting a branch (admin → Locations → Delete) used to:
--   * set team_members.location_id to null — and null means "restaurant-wide" to RLS (0027) and the write guard
--     (0029), so that branch's manager and staff silently gained access to EVERY branch;
--   * delete every reservation at that branch (on delete cascade);
--   * strip the branch from its orders, reviews and deliveries (shown under every branch, missing from its reports).
-- The app now refuses such a delete with a clear message (repositories/restaurants.ts#deleteLocation: "Deactivate
-- it instead"); these constraints make the database refuse it too, for any other path. A branch's own delivery zones
-- and menu availability overrides still go with it (cascade, unchanged). Existing rows are untouched: re-adding the
-- constraints only changes what a future DELETE of a referenced branch does.
-- Rollback: re-create each constraint with its old action (team_members/orders/reviews/deliveries: on delete set
-- null; reservations: on delete cascade).
-- =============================================================================

alter table team_members drop constraint if exists team_members_location_id_fkey,
  add constraint team_members_location_id_fkey foreign key (location_id) references restaurant1s (id) on delete restrict;

alter table orders drop constraint if exists orders_location_id_fkey,
  add constraint orders_location_id_fkey foreign key (location_id) references restaurant1s (id) on delete restrict;

alter table reservations drop constraint if exists reservations_location_id_fkey,
  add constraint reservations_location_id_fkey foreign key (location_id) references restaurant1s (id) on delete restrict;

alter table reviews drop constraint if exists reviews_location_id_fkey,
  add constraint reviews_location_id_fkey foreign key (location_id) references restaurant1s (id) on delete restrict;

alter table deliveries drop constraint if exists deliveries_location_id_fkey,
  add constraint deliveries_location_id_fkey foreign key (location_id) references restaurant1s (id) on delete restrict;
