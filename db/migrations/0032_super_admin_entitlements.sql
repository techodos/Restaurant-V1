-- 0032 — super_admin permissions + per-restaurant entitlements.
-- entitlements = what the platform ALLOWS this restaurant to use ({} = everything allowed, so existing
-- restaurants keep working). The owner's own switches stay in restaurants.features; a feature is effective
-- only when both allow it (shared/feature-access.ts).
alter table restaurants add column if not exists entitlements jsonb not null default '{}'::jsonb;

create or replace function app.role_permissions(p_role team_role)
returns text[]
language sql immutable
as $$
  select case p_role
    when 'super_admin' then array[
      'orders.view','orders.manage','orders.update_status','kitchen.view','menu.view','menu.manage',
      'customers.view','customers.manage','reservations.view','reservations.manage','reviews.view','reviews.manage',
      'delivery.view','delivery.manage','coupons.view','coupons.manage','media.view','media.manage',
      'website.view','website.manage','staff.view','staff.manage','locations.view','locations.manage',
      'payments.view','analytics.view','settings.view','settings.manage']
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

-- ---------------------------------------------------------------------------
-- RLS: a super_admin (one team_members row, in any restaurant) is a member of EVERY restaurant, restaurant-wide
-- (member_location_id already returns null when the caller has no row there). A real row at the restaurant
-- being asked about always wins, so an ordinary owner/staff is unaffected.
-- ---------------------------------------------------------------------------
create or replace function app.is_super_admin()
returns boolean
language sql stable security definer set search_path = public, app, pg_temp
as $$
  select exists (
    select 1 from team_members tm
    where tm.is_active and tm.role = 'super_admin' and tm.user_id = app.current_user_id()
  );
$$;

create or replace function app.is_team_member(p_restaurant_id uuid)
returns boolean
language sql stable security definer set search_path = public, app, pg_temp
as $$
  select exists (
    select 1 from team_members tm
    where tm.restaurant_id = p_restaurant_id
      and tm.is_active
      and tm.user_id = app.current_user_id()
  ) or app.is_super_admin();
$$;

create or replace function app.team_role(p_restaurant_id uuid)
returns team_role
language sql stable security definer set search_path = public, app, pg_temp
as $$
  select coalesce(
    (select tm.role from team_members tm
      where tm.restaurant_id = p_restaurant_id and tm.is_active and tm.user_id = app.current_user_id()
      limit 1),
    case when app.is_super_admin() then 'super_admin'::team_role end
  );
$$;

create or replace function app.has_permission(p_restaurant_id uuid, p_permission text)
returns boolean
language sql stable security definer set search_path = public, app, pg_temp
as $$
  select coalesce((
    select case
      when (tm.permissions -> 'deny') ? p_permission then false
      when (tm.permissions -> 'allow') ? p_permission then true
      else p_permission = any (app.role_permissions(tm.role))
    end
    from team_members tm
    where tm.restaurant_id = p_restaurant_id
      and tm.is_active
      and tm.user_id = app.current_user_id()
    limit 1
  ), app.is_super_admin() and p_permission = any (app.role_permissions('super_admin')), false);
$$;
