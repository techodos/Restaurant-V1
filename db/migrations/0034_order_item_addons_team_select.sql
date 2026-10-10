-- =============================================================================
-- 0034 — Staff can read an order's add-ons
--
-- order_item_addons has RLS on (0006) but only the customer (0006) and guest
-- (0009) select policies. Every staff read of an order runs as app_runtime
-- (admin order detail, kitchen tickets, the orders list), so under RLS each
-- line came back WITHOUT its add-ons: a ticket said "Margherita" where the
-- customer paid for stuffed crust + extra mozzarella. 0027 gave order_items
-- (and history/payments/deliveries) a team policy keyed off the parent order;
-- this is the same rule for the add-ons, which have no restaurant_id of their own.
-- =============================================================================

drop policy if exists order_item_addons_team_select on order_item_addons;

create policy order_item_addons_team_select on order_item_addons for select using (
  exists (
    select 1
      from order_items oi
      join orders o on o.id = oi.order_id
     where oi.id = order_item_id
       and app.has_permission(o.restaurant_id, 'orders.view')
       and app.can_access_location(o.restaurant_id, o.location_id)
  )
);
