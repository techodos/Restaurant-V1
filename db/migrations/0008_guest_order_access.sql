-- =============================================================================
-- 0008 — Guest order tracking
-- A guest who checks out without an account still needs the order tracking page.
-- The cart cookie is the proof of ownership: only the browser that placed the
-- order can read it back (plus the matching child rows). Implemented as a
-- SECURITY DEFINER helper so the child-table policies stay one line each.
-- =============================================================================

create or replace function app.order_belongs_to_cart(p_order_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, app
as $$
  select exists (
    select 1
      from orders o
      join carts c on c.id = o.cart_id
     where o.id = p_order_id
       and c.session_token = app.cart_token()
  );
$$;

revoke all on function app.order_belongs_to_cart(uuid) from public;
grant execute on function app.order_belongs_to_cart(uuid) to app_runtime, app_service;

-- orders ---------------------------------------------------------------------
drop policy if exists orders_guest_select on orders;
create policy orders_guest_select on orders
  for select using (app.order_belongs_to_cart(id));

-- order_items ----------------------------------------------------------------
drop policy if exists order_items_guest_select on order_items;
create policy order_items_guest_select on order_items
  for select using (app.order_belongs_to_cart(order_id));

-- order_status_history -------------------------------------------------------
drop policy if exists order_status_history_guest_select on order_status_history;
create policy order_status_history_guest_select on order_status_history
  for select using (app.order_belongs_to_cart(order_id));

-- payments -------------------------------------------------------------------
drop policy if exists payments_guest_select on payments;
create policy payments_guest_select on payments
  for select using (app.order_belongs_to_cart(order_id));

-- deliveries -----------------------------------------------------------------
drop policy if exists deliveries_guest_select on deliveries;
create policy deliveries_guest_select on deliveries
  for select using (app.order_belongs_to_cart(order_id));
