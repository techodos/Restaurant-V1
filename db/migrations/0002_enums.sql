-- =============================================================================
-- 0002 — Domain enums
-- =============================================================================

create type restaurant_status as enum ('onboarding', 'active', 'suspended', 'closed');

create type team_role as enum ('owner', 'admin', 'manager', 'staff');

create type website_status as enum ('draft', 'published', 'disabled');

create type media_purpose as enum (
  'logo', 'cover', 'hero', 'gallery', 'menu_item', 'category',
  'location', 'website', 'avatar', 'other'
);

create type order_type as enum ('delivery', 'pickup', 'dine_in');

create type order_status as enum (
  'pending', 'confirmed', 'preparing', 'ready',
  'out_for_delivery', 'completed', 'cancelled'
);

create type payment_method as enum (
  'cash_on_delivery', 'cash', 'card_online', 'card_terminal', 'wallet', 'bank_transfer'
);

create type payment_status as enum ('pending', 'authorized', 'paid', 'failed', 'refunded', 'cancelled');

create type delivery_status as enum (
  'unassigned', 'assigned', 'picked_up', 'in_transit', 'delivered', 'failed', 'cancelled'
);

create type reservation_status as enum (
  'pending', 'confirmed', 'seated', 'completed', 'cancelled', 'no_show'
);

create type review_status as enum ('pending', 'approved', 'rejected');

create type coupon_discount_type as enum ('percentage', 'fixed');

create type cart_status as enum ('active', 'converted', 'abandoned');

-- ---------------------------------------------------------------------------
-- Permission model — role defaults (mirrored 1:1 by src/lib/rbac.ts; parity is
-- asserted in tests/rbac.test.ts). team_members.permissions may add
-- { "allow": [...], "deny": [...] } overrides applied by app.has_permission().
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
      'website.view','website.manage','staff.view','locations.view','locations.manage',
      'payments.view','analytics.view','settings.view','settings.manage']
    when 'manager' then array[
      'orders.view','orders.manage','orders.update_status','kitchen.view','menu.view','menu.manage',
      'customers.view','customers.manage','reservations.view','reservations.manage','reviews.view','reviews.manage',
      'delivery.view','delivery.manage','coupons.view','coupons.manage','media.view','media.manage',
      'locations.view','payments.view','analytics.view','settings.view']
    when 'staff' then array[
      'orders.view','orders.update_status','kitchen.view','menu.view','customers.view',
      'reservations.view','reservations.manage','reviews.view','delivery.view']
    else array[]::text[]
  end;
$$;
