-- =============================================================================
-- 0007 — Permission matrix refinement
-- Administrators manage the team roster too; managers still cannot (they get
-- staff.view only). Kept as a forward migration so already-applied databases
-- stay checksum-stable.
-- =============================================================================

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
      'staff.view','locations.view','payments.view','analytics.view','settings.view']
    when 'staff' then array[
      'orders.view','orders.update_status','kitchen.view','menu.view','customers.view',
      'reservations.view','reservations.manage','reviews.view','delivery.view']
    else array[]::text[]
  end;
$$;
