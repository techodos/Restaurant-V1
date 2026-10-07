-- =============================================================================
-- 0029 — Branch + tenant guard on privileged writes, manager permissions
-- =============================================================================
-- Why: 0027 put branch scoping into RLS, but RLS only applies to app_runtime. Every admin WRITE runs as
-- app_service (BYPASSRLS, `db.write`), and most of them address a row by id alone (`update orders ...
-- where id = $1`). So a branch manager could change another branch's order/reservation/zone/staff row —
-- or any restaurant's row — by sending its id. One trigger function, attached to every table the admin
-- writes, closes that for every current and future write path at once:
--   * tenant: when the transaction is pinned to a restaurant (app.current_restaurant_id(), set on every
--     app transaction), the row must belong to it;
--   * branch: when the caller is an active branch-scoped team member (app.member_location_id is not
--     null), the row must be at their branch. Unassigned rows (location null) stay writable, matching
--     0027's can_access_location — except team_members ('strict'), where a null location means an HQ
--     account that branch staff must never edit.
-- Both checks run on the old AND the new row, so a row can neither be touched nor moved across the line.
-- Callers with no pin and no staff identity (migrations, seeds, the dispatcher) are unaffected.

create or replace function app.guard_scoped_write()
returns trigger
language plpgsql
security definer
set search_path = public, app, pg_temp
as $$
declare
  pin          uuid := app.current_restaurant_id();
  location_col text := tg_argv[0];                       -- '' = table has no branch column
  strict_null  boolean := coalesce(tg_argv[1], '') = 'strict';
  side         jsonb;
  restaurant   uuid;
  member_loc   uuid;
  row_loc      uuid;
begin
  foreach side in array (
    case tg_op
      when 'INSERT' then array[to_jsonb(new)]
      when 'DELETE' then array[to_jsonb(old)]
      else array[to_jsonb(old), to_jsonb(new)]
    end
  ) loop
    restaurant := (side ->> 'restaurant_id')::uuid;
    if pin is not null and restaurant is distinct from pin then
      raise exception 'write outside the current restaurant (%)', tg_table_name using errcode = 'RB403';
    end if;

    if location_col <> '' then
      member_loc := app.member_location_id(restaurant);
      if member_loc is not null then
        row_loc := (side ->> location_col)::uuid;
        if (row_loc is null and strict_null) or (row_loc is not null and row_loc <> member_loc) then
          raise exception 'write outside the caller''s branch (%)', tg_table_name using errcode = 'RB403';
        end if;
      end if;
    end if;
  end loop;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

-- branch data: (table, branch column, null rule)
do $$
declare
  spec text[];
begin
  foreach spec slice 1 in array array[
    array['orders',                       'location_id', ''],
    array['reservations',                 'location_id', ''],
    array['reviews',                      'location_id', ''],
    array['delivery_zones',               'location_id', ''],
    array['menu_item_location_overrides', 'location_id', ''],
    array['restaurant1s',                 'id',          ''],
    array['team_members',                 'location_id', 'strict'],
    -- restaurant-wide data: tenant check only
    array['payments',                     '',            ''],
    array['menu_categories',              '',            ''],
    array['menu_items',                   '',            ''],
    array['menu_item_variants',           '',            ''],
    array['menu_addon_groups',            '',            ''],
    array['menu_addons',                  '',            ''],
    array['coupons',                      '',            '']
  ] loop
    execute format('drop trigger if exists guard_scoped_write on %I', spec[1]);
    execute format(
      'create trigger guard_scoped_write before insert or update or delete on %I
         for each row execute function app.guard_scoped_write(%L, %L)',
      spec[1], spec[2], spec[3]
    );
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Manager: no restaurant-wide Settings (owner/admin only); manages staff at their own branch
-- (the app limits them to the `staff` role and their branch; the trigger above enforces the branch).
-- Mirrors server/auth/permissions.ts — tests/rbac.test.ts checks the two stay in sync.
-- ---------------------------------------------------------------------------
create or replace function app.role_permissions(p_role team_role)
returns text[]
language sql immutable
as $$
  select case p_role
    when 'owner' then array[
      'orders.view','orders.manage','orders.update_status','kitchen.view','menu.view','menu.manage',
      'customers.view','customers.manage','reservations.view','reservations.manage','reviews.view','reviews.manage',
      'delivery.view','delivery.manage','coupons.view','coupons.manage','media.view','media.manage',
      'website.view','website.manage','staff.view','staff.manage','locations.view','locations.manage',
      'payments.view','analytics.view','settings.view','settings.manage']
    when 'admin' then array[
      'orders.view','orders.manage','orders.update_status','kitchen.view','menu.view','menu.manage',
      'customers.view','customers.manage','reservations.view','reservations.manage','reviews.view','reviews.manage',
      'delivery.view','delivery.manage','coupons.view','coupons.manage','media.view','media.manage',
      'website.view','website.manage','staff.view','staff.manage','locations.view','locations.manage',
      'payments.view','analytics.view','settings.view','settings.manage']
    when 'manager' then array[
      'orders.view','orders.manage','orders.update_status','kitchen.view','menu.view','menu.manage',
      'customers.view','customers.manage','reservations.view','reservations.manage','reviews.view','reviews.manage',
      'delivery.view','delivery.manage','coupons.view','coupons.manage','media.view','media.manage',
      'staff.view','staff.manage','locations.view','payments.view','analytics.view']
    when 'staff' then array[
      'orders.view','orders.update_status','kitchen.view','menu.view','customers.view',
      'reservations.view','reservations.manage','reviews.view','delivery.view']
    else array[]::text[]
  end;
$$;

-- Owner/admin are restaurant-wide by definition. Several demo seeds gave every member one branch, which
-- RLS (0027) then reads as "this owner only sees that branch". Clear it.
update team_members set location_id = null where role in ('owner', 'admin') and location_id is not null;
