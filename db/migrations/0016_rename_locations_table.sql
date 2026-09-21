-- =============================================================================
-- 0016 — Rename table restaurant_locations -> restaurant1s
--
-- ALTER TABLE ... RENAME keeps everything attached to the table (data, grants,
-- RLS on/off, policies, triggers, and the foreign keys in carts, deliveries,
-- delivery_zones, menu_categories, orders, reservations, reviews, team_members).
-- No function or view refers to the old name (checked), so nothing else needs a
-- rewrite. The index / constraint / policy names are renamed as well so that
-- nothing in the database still says "restaurant_locations".
--
-- The runner wraps this file in a transaction: it applies completely or not at all.
-- Rollback script: see the bottom of this file (do NOT run it as part of the migration).
-- =============================================================================

alter table restaurant_locations rename to restaurant1s;

-- indexes (the primary key and unique-constraint indexes are renamed with their constraints below)
alter index restaurant_locations_restaurant_idx    rename to restaurant1s_restaurant_idx;
alter index restaurant_locations_one_primary_idx   rename to restaurant1s_one_primary_idx;

-- constraints (renaming a constraint also renames its backing index)
alter table restaurant1s rename constraint restaurant_locations_pkey                  to restaurant1s_pkey;
alter table restaurant1s rename constraint restaurant_locations_restaurant_id_fkey    to restaurant1s_restaurant_id_fkey;
alter table restaurant1s rename constraint restaurant_locations_restaurant_id_slug_key to restaurant1s_restaurant_id_slug_key;

-- row level security policies (created by 0006 with the table name in their names)
alter policy restaurant_locations_team_select on restaurant1s rename to restaurant1s_team_select;
alter policy restaurant_locations_team_insert on restaurant1s rename to restaurant1s_team_insert;
alter policy restaurant_locations_team_update on restaurant1s rename to restaurant1s_team_update;
alter policy restaurant_locations_team_delete on restaurant1s rename to restaurant1s_team_delete;

-- =============================================================================
-- ROLLBACK (manual, only if this migration must be undone; also delete the row
-- '0016_rename_locations_table.sql' from schema_migrations afterwards, and deploy
-- the previous code version):
--
--   alter policy restaurant1s_team_select on restaurant1s rename to restaurant_locations_team_select;
--   alter policy restaurant1s_team_insert on restaurant1s rename to restaurant_locations_team_insert;
--   alter policy restaurant1s_team_update on restaurant1s rename to restaurant_locations_team_update;
--   alter policy restaurant1s_team_delete on restaurant1s rename to restaurant_locations_team_delete;
--   alter table restaurant1s rename constraint restaurant1s_restaurant_id_slug_key to restaurant_locations_restaurant_id_slug_key;
--   alter table restaurant1s rename constraint restaurant1s_restaurant_id_fkey    to restaurant_locations_restaurant_id_fkey;
--   alter table restaurant1s rename constraint restaurant1s_pkey                  to restaurant_locations_pkey;
--   alter index restaurant1s_one_primary_idx rename to restaurant_locations_one_primary_idx;
--   alter index restaurant1s_restaurant_idx  rename to restaurant_locations_restaurant_idx;
--   alter table restaurant1s rename to restaurant_locations;
--   delete from schema_migrations where version = '0016_rename_locations_table.sql';
-- =============================================================================
