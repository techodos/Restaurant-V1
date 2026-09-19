-- =============================================================================
-- 0009 — Guest order line-item access
-- 0008 opened orders/order_items/status-history/payments/deliveries to the cart
-- that placed the order; the add-on snapshots attached to those lines need the
-- same treatment so the confirmation page can show "Extra mozzarella ×1".
-- =============================================================================

create or replace function app.order_item_belongs_to_cart(p_order_item_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, app
as $$
  select exists (
    select 1
      from order_items oi
      join orders o on o.id = oi.order_id
      join carts c on c.id = o.cart_id
     where oi.id = p_order_item_id
       and c.session_token = app.cart_token()
  );
$$;

revoke all on function app.order_item_belongs_to_cart(uuid) from public;
grant execute on function app.order_item_belongs_to_cart(uuid) to app_runtime, app_service;

drop policy if exists order_item_addons_guest_select on order_item_addons;
create policy order_item_addons_guest_select on order_item_addons
  for select using (app.order_item_belongs_to_cart(order_item_id));
