-- =============================================================================
-- 0027 — Branch-scoped staff (team_members.location_id enforced via RLS) +
--        per-branch menu item availability
-- =============================================================================

-- A team member's assigned branch, null = HQ/all-branch staff (owner/admin).
-- Mirrors app.team_role's shape exactly, so it composes with app.has_permission.
create or replace function app.member_location_id(p_restaurant_id uuid)
returns uuid
language sql stable security definer set search_path = public, app, pg_temp
as $$
  select tm.location_id from team_members tm
  where tm.restaurant_id = p_restaurant_id
    and tm.is_active
    and tm.user_id = app.current_user_id()
  limit 1;
$$;

create or replace function app.can_access_location(p_restaurant_id uuid, p_location_id uuid)
returns boolean
language sql stable security definer set search_path = public, app, pg_temp
as $$
  select app.member_location_id(p_restaurant_id) is null
      or p_location_id is null
      or app.member_location_id(p_restaurant_id) = p_location_id;
$$;

-- ---------------------------------------------------------------------------
-- orders — replace the generic team policies with branch-aware versions
-- ---------------------------------------------------------------------------
drop policy if exists orders_team_select on orders;
drop policy if exists orders_team_insert on orders;
drop policy if exists orders_team_update on orders;
drop policy if exists orders_team_delete on orders;

create policy orders_team_select on orders for select using (
  app.has_permission(restaurant_id, 'orders.view') and app.can_access_location(restaurant_id, location_id)
);
create policy orders_team_insert on orders for insert with check (
  app.has_permission(restaurant_id, 'orders.manage') and app.can_access_location(restaurant_id, location_id)
);
create policy orders_team_update on orders for update using (
  app.has_permission(restaurant_id, 'orders.manage') and app.can_access_location(restaurant_id, location_id)
) with check (
  app.has_permission(restaurant_id, 'orders.manage') and app.can_access_location(restaurant_id, location_id)
);
create policy orders_team_delete on orders for delete using (
  app.has_permission(restaurant_id, 'orders.manage') and app.can_access_location(restaurant_id, location_id)
);

-- order_items / order_status_history / payments / deliveries all key off their parent order's
-- branch, so the same staff member who cannot see an order must not see its lines/history/
-- payment/delivery either (same root cause as the orders table itself).
drop policy if exists order_items_team_select on order_items;
drop policy if exists order_items_team_insert on order_items;
drop policy if exists order_items_team_update on order_items;
drop policy if exists order_items_team_delete on order_items;

create policy order_items_team_select on order_items for select using (
  app.has_permission(restaurant_id, 'orders.view')
  and exists (select 1 from orders o where o.id = order_id and app.can_access_location(o.restaurant_id, o.location_id))
);
create policy order_items_team_insert on order_items for insert with check (
  app.has_permission(restaurant_id, 'orders.manage')
  and exists (select 1 from orders o where o.id = order_id and app.can_access_location(o.restaurant_id, o.location_id))
);
create policy order_items_team_update on order_items for update using (
  app.has_permission(restaurant_id, 'orders.manage')
  and exists (select 1 from orders o where o.id = order_id and app.can_access_location(o.restaurant_id, o.location_id))
) with check (
  app.has_permission(restaurant_id, 'orders.manage')
  and exists (select 1 from orders o where o.id = order_id and app.can_access_location(o.restaurant_id, o.location_id))
);
create policy order_items_team_delete on order_items for delete using (
  app.has_permission(restaurant_id, 'orders.manage')
  and exists (select 1 from orders o where o.id = order_id and app.can_access_location(o.restaurant_id, o.location_id))
);

-- order_status_history previously had no team select policy at all (only the customer-facing
-- select and the orders.manage insert check) — staff could never read it. Fixing that gap here,
-- branch-scoped from the start.
create policy order_status_history_team_select on order_status_history for select using (
  app.has_permission(restaurant_id, 'orders.view')
  and exists (select 1 from orders o where o.id = order_id and app.can_access_location(o.restaurant_id, o.location_id))
);

drop policy if exists payments_team_select on payments;
drop policy if exists payments_team_insert on payments;
drop policy if exists payments_team_update on payments;
drop policy if exists payments_team_delete on payments;

create policy payments_team_select on payments for select using (
  app.has_permission(restaurant_id, 'payments.view')
  and exists (select 1 from orders o where o.id = order_id and app.can_access_location(o.restaurant_id, o.location_id))
);
create policy payments_team_insert on payments for insert with check (
  app.has_permission(restaurant_id, 'payments.manage')
  and exists (select 1 from orders o where o.id = order_id and app.can_access_location(o.restaurant_id, o.location_id))
);
create policy payments_team_update on payments for update using (
  app.has_permission(restaurant_id, 'payments.manage')
  and exists (select 1 from orders o where o.id = order_id and app.can_access_location(o.restaurant_id, o.location_id))
) with check (
  app.has_permission(restaurant_id, 'payments.manage')
  and exists (select 1 from orders o where o.id = order_id and app.can_access_location(o.restaurant_id, o.location_id))
);
create policy payments_team_delete on payments for delete using (
  app.has_permission(restaurant_id, 'payments.manage')
  and exists (select 1 from orders o where o.id = order_id and app.can_access_location(o.restaurant_id, o.location_id))
);

drop policy if exists deliveries_team_select on deliveries;
drop policy if exists deliveries_team_insert on deliveries;
drop policy if exists deliveries_team_update on deliveries;
drop policy if exists deliveries_team_delete on deliveries;

create policy deliveries_team_select on deliveries for select using (
  app.has_permission(restaurant_id, 'delivery.view') and app.can_access_location(restaurant_id, location_id)
);
create policy deliveries_team_insert on deliveries for insert with check (
  app.has_permission(restaurant_id, 'delivery.manage') and app.can_access_location(restaurant_id, location_id)
);
create policy deliveries_team_update on deliveries for update using (
  app.has_permission(restaurant_id, 'delivery.manage') and app.can_access_location(restaurant_id, location_id)
) with check (
  app.has_permission(restaurant_id, 'delivery.manage') and app.can_access_location(restaurant_id, location_id)
);
create policy deliveries_team_delete on deliveries for delete using (
  app.has_permission(restaurant_id, 'delivery.manage') and app.can_access_location(restaurant_id, location_id)
);

-- ---------------------------------------------------------------------------
-- reservations — same treatment
-- ---------------------------------------------------------------------------
drop policy if exists reservations_team_select on reservations;
drop policy if exists reservations_team_insert on reservations;
drop policy if exists reservations_team_update on reservations;
drop policy if exists reservations_team_delete on reservations;

create policy reservations_team_select on reservations for select using (
  app.has_permission(restaurant_id, 'reservations.view') and app.can_access_location(restaurant_id, location_id)
);
create policy reservations_team_insert on reservations for insert with check (
  app.has_permission(restaurant_id, 'reservations.manage') and app.can_access_location(restaurant_id, location_id)
);
create policy reservations_team_update on reservations for update using (
  app.has_permission(restaurant_id, 'reservations.manage') and app.can_access_location(restaurant_id, location_id)
) with check (
  app.has_permission(restaurant_id, 'reservations.manage') and app.can_access_location(restaurant_id, location_id)
);
create policy reservations_team_delete on reservations for delete using (
  app.has_permission(restaurant_id, 'reservations.manage') and app.can_access_location(restaurant_id, location_id)
);

-- ---------------------------------------------------------------------------
-- menu_item_location_overrides — per-branch item availability
-- ---------------------------------------------------------------------------
create table menu_item_location_overrides (
  id             uuid primary key default gen_random_uuid(),
  restaurant_id  uuid not null references restaurants (id) on delete cascade,
  location_id    uuid not null references restaurant1s (id) on delete cascade,
  menu_item_id   uuid not null references menu_items (id) on delete cascade,
  is_available   boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (location_id, menu_item_id)
);

create index menu_item_location_overrides_lookup_idx
  on menu_item_location_overrides (location_id, menu_item_id);

alter table menu_item_location_overrides enable row level security;

create policy menu_item_location_overrides_team_select on menu_item_location_overrides for select using (
  app.has_permission(restaurant_id, 'menu.view')
);
create policy menu_item_location_overrides_team_insert on menu_item_location_overrides for insert with check (
  app.has_permission(restaurant_id, 'menu.manage')
);
create policy menu_item_location_overrides_team_update on menu_item_location_overrides for update using (
  app.has_permission(restaurant_id, 'menu.manage')
) with check (
  app.has_permission(restaurant_id, 'menu.manage')
);
create policy menu_item_location_overrides_team_delete on menu_item_location_overrides for delete using (
  app.has_permission(restaurant_id, 'menu.manage')
);
create policy menu_item_location_overrides_public on menu_item_location_overrides for select using (
  app.is_restaurant_public(restaurant_id)
);

grant select, insert, update, delete on menu_item_location_overrides to app_runtime, app_service;
