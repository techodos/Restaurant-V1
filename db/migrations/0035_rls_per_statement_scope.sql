-- =============================================================================
-- 0035 — Staff RLS checks run once per statement, not once per row
--
-- The team policies call app.has_permission(restaurant_id, ...) and
-- app.can_access_location(restaurant_id, location_id) for EVERY row: SECURITY
-- DEFINER SQL functions (never inlined) that each run a team_members query, and
-- can_access_location runs member_location_id twice. A staff read of N orders
-- ran ~4 sub-queries per row. Measured on 1,451 orders: the admin layout's status
-- count took 181 ms; a status count over 100k orders would take seconds, on every
-- admin page view (and kitchen, orders list, reports, exports).
--
-- Same rules, evaluated once: the caller's grants become arrays computed in an
-- InitPlan (a `(select f())` with no reference to the row), and each row only
-- does array membership tests:
--   has_permission(r, p)         = r = any (permitted_restaurant_ids(p))
--   can_access_location(r, l)    = l is null
--                                  or r <> all (branch_scoped_restaurant_ids())
--                                  or l = any (member_location_ids())
-- Identical to the old functions for one membership per (user, restaurant); with
-- two active rows for one login at one restaurant the old ones picked an arbitrary
-- row (limit 1 without order), these grant if either row does.
-- Measured on the same data: 181 ms -> 2.3 ms, identical rows. Only the
-- high-volume tables change (orders and what hangs off them, reservations,
-- reviews, customers); the old helpers stay for everything else.
-- =============================================================================

create or replace function app.permitted_restaurant_ids(p_permission text)
returns uuid[]
language sql
stable
security definer
set search_path = public, app, pg_temp
as $$
  select coalesce(array_agg(distinct grants.restaurant_id), '{}')
    from (
      -- the caller's own memberships: deny overrides, then allow, then the role's permissions (has_permission)
      select tm.restaurant_id
        from team_members tm
       where tm.is_active
         and tm.user_id = app.current_user_id()
         and case
               when (tm.permissions -> 'deny') ? p_permission then false
               when (tm.permissions -> 'allow') ? p_permission then true
               else p_permission = any (app.role_permissions(tm.role))
             end
      union all
      -- a platform super admin: every restaurant where they have no membership row of their own
      select r.id
        from restaurants r
       where app.is_super_admin()
         and p_permission = any (app.role_permissions('super_admin'))
         and not exists (
           select 1 from team_members tm
            where tm.restaurant_id = r.id and tm.is_active and tm.user_id = app.current_user_id()
         )
    ) grants;
$$;

create or replace function app.branch_scoped_restaurant_ids()
returns uuid[]
language sql
stable
security definer
set search_path = public, app, pg_temp
as $$
  select coalesce(array_agg(distinct tm.restaurant_id), '{}')
    from team_members tm
   where tm.is_active and tm.user_id = app.current_user_id() and tm.location_id is not null;
$$;

create or replace function app.member_location_ids()
returns uuid[]
language sql
stable
security definer
set search_path = public, app, pg_temp
as $$
  select coalesce(array_agg(distinct tm.location_id), '{}')
    from team_members tm
   where tm.is_active and tm.user_id = app.current_user_id() and tm.location_id is not null;
$$;

revoke all on function app.permitted_restaurant_ids(text), app.branch_scoped_restaurant_ids(), app.member_location_ids() from public;
grant execute on function app.permitted_restaurant_ids(text), app.branch_scoped_restaurant_ids(), app.member_location_ids()
  to app_runtime, app_service;

-- -----------------------------------------------------------------------------
-- orders (+ location)
-- -----------------------------------------------------------------------------
drop policy if exists orders_team_select on orders;
drop policy if exists orders_team_insert on orders;
drop policy if exists orders_team_update on orders;
drop policy if exists orders_team_delete on orders;

create policy orders_team_select on orders for select using (
  restaurant_id = any (coalesce((select app.permitted_restaurant_ids('orders.view')), '{}'))
  and (location_id is null
       or restaurant_id <> all (coalesce((select app.branch_scoped_restaurant_ids()), '{}'))
       or location_id = any (coalesce((select app.member_location_ids()), '{}')))
);
create policy orders_team_insert on orders for insert with check (
  restaurant_id = any (coalesce((select app.permitted_restaurant_ids('orders.manage')), '{}'))
  and (location_id is null
       or restaurant_id <> all (coalesce((select app.branch_scoped_restaurant_ids()), '{}'))
       or location_id = any (coalesce((select app.member_location_ids()), '{}')))
);
create policy orders_team_update on orders for update using (
  restaurant_id = any (coalesce((select app.permitted_restaurant_ids('orders.manage')), '{}'))
  and (location_id is null
       or restaurant_id <> all (coalesce((select app.branch_scoped_restaurant_ids()), '{}'))
       or location_id = any (coalesce((select app.member_location_ids()), '{}')))
) with check (
  restaurant_id = any (coalesce((select app.permitted_restaurant_ids('orders.manage')), '{}'))
  and (location_id is null
       or restaurant_id <> all (coalesce((select app.branch_scoped_restaurant_ids()), '{}'))
       or location_id = any (coalesce((select app.member_location_ids()), '{}')))
);
create policy orders_team_delete on orders for delete using (
  restaurant_id = any (coalesce((select app.permitted_restaurant_ids('orders.manage')), '{}'))
  and (location_id is null
       or restaurant_id <> all (coalesce((select app.branch_scoped_restaurant_ids()), '{}'))
       or location_id = any (coalesce((select app.member_location_ids()), '{}')))
);

-- -----------------------------------------------------------------------------
-- order_items / order_status_history / payments: the parent order's branch decides
-- -----------------------------------------------------------------------------
drop policy if exists order_items_team_select on order_items;
drop policy if exists order_items_team_insert on order_items;
drop policy if exists order_items_team_update on order_items;
drop policy if exists order_items_team_delete on order_items;

create policy order_items_team_select on order_items for select using (
  restaurant_id = any (coalesce((select app.permitted_restaurant_ids('orders.view')), '{}'))
  and exists (select 1 from orders o where o.id = order_id
                and (o.location_id is null
                     or o.restaurant_id <> all (coalesce((select app.branch_scoped_restaurant_ids()), '{}'))
                     or o.location_id = any (coalesce((select app.member_location_ids()), '{}'))))
);
create policy order_items_team_insert on order_items for insert with check (
  restaurant_id = any (coalesce((select app.permitted_restaurant_ids('orders.manage')), '{}'))
  and exists (select 1 from orders o where o.id = order_id
                and (o.location_id is null
                     or o.restaurant_id <> all (coalesce((select app.branch_scoped_restaurant_ids()), '{}'))
                     or o.location_id = any (coalesce((select app.member_location_ids()), '{}'))))
);
create policy order_items_team_update on order_items for update using (
  restaurant_id = any (coalesce((select app.permitted_restaurant_ids('orders.manage')), '{}'))
  and exists (select 1 from orders o where o.id = order_id
                and (o.location_id is null
                     or o.restaurant_id <> all (coalesce((select app.branch_scoped_restaurant_ids()), '{}'))
                     or o.location_id = any (coalesce((select app.member_location_ids()), '{}'))))
) with check (
  restaurant_id = any (coalesce((select app.permitted_restaurant_ids('orders.manage')), '{}'))
  and exists (select 1 from orders o where o.id = order_id
                and (o.location_id is null
                     or o.restaurant_id <> all (coalesce((select app.branch_scoped_restaurant_ids()), '{}'))
                     or o.location_id = any (coalesce((select app.member_location_ids()), '{}'))))
);
create policy order_items_team_delete on order_items for delete using (
  restaurant_id = any (coalesce((select app.permitted_restaurant_ids('orders.manage')), '{}'))
  and exists (select 1 from orders o where o.id = order_id
                and (o.location_id is null
                     or o.restaurant_id <> all (coalesce((select app.branch_scoped_restaurant_ids()), '{}'))
                     or o.location_id = any (coalesce((select app.member_location_ids()), '{}'))))
);

drop policy if exists order_status_history_team_select on order_status_history;
drop policy if exists order_status_history_insert on order_status_history;

create policy order_status_history_team_select on order_status_history for select using (
  restaurant_id = any (coalesce((select app.permitted_restaurant_ids('orders.view')), '{}'))
  and exists (select 1 from orders o where o.id = order_id
                and (o.location_id is null
                     or o.restaurant_id <> all (coalesce((select app.branch_scoped_restaurant_ids()), '{}'))
                     or o.location_id = any (coalesce((select app.member_location_ids()), '{}'))))
);
create policy order_status_history_insert on order_status_history for insert with check (
  restaurant_id = any (coalesce((select app.permitted_restaurant_ids('orders.manage')), '{}'))
);

drop policy if exists payments_team_select on payments;
drop policy if exists payments_team_insert on payments;
drop policy if exists payments_team_update on payments;
drop policy if exists payments_team_delete on payments;

create policy payments_team_select on payments for select using (
  restaurant_id = any (coalesce((select app.permitted_restaurant_ids('payments.view')), '{}'))
  and exists (select 1 from orders o where o.id = order_id
                and (o.location_id is null
                     or o.restaurant_id <> all (coalesce((select app.branch_scoped_restaurant_ids()), '{}'))
                     or o.location_id = any (coalesce((select app.member_location_ids()), '{}'))))
);
create policy payments_team_insert on payments for insert with check (
  restaurant_id = any (coalesce((select app.permitted_restaurant_ids('payments.manage')), '{}'))
  and exists (select 1 from orders o where o.id = order_id
                and (o.location_id is null
                     or o.restaurant_id <> all (coalesce((select app.branch_scoped_restaurant_ids()), '{}'))
                     or o.location_id = any (coalesce((select app.member_location_ids()), '{}'))))
);
create policy payments_team_update on payments for update using (
  restaurant_id = any (coalesce((select app.permitted_restaurant_ids('payments.manage')), '{}'))
  and exists (select 1 from orders o where o.id = order_id
                and (o.location_id is null
                     or o.restaurant_id <> all (coalesce((select app.branch_scoped_restaurant_ids()), '{}'))
                     or o.location_id = any (coalesce((select app.member_location_ids()), '{}'))))
) with check (
  restaurant_id = any (coalesce((select app.permitted_restaurant_ids('payments.manage')), '{}'))
  and exists (select 1 from orders o where o.id = order_id
                and (o.location_id is null
                     or o.restaurant_id <> all (coalesce((select app.branch_scoped_restaurant_ids()), '{}'))
                     or o.location_id = any (coalesce((select app.member_location_ids()), '{}'))))
);
create policy payments_team_delete on payments for delete using (
  restaurant_id = any (coalesce((select app.permitted_restaurant_ids('payments.manage')), '{}'))
  and exists (select 1 from orders o where o.id = order_id
                and (o.location_id is null
                     or o.restaurant_id <> all (coalesce((select app.branch_scoped_restaurant_ids()), '{}'))
                     or o.location_id = any (coalesce((select app.member_location_ids()), '{}'))))
);

-- order_item_addons (0034): no restaurant_id of its own — through the line's order
drop policy if exists order_item_addons_team_select on order_item_addons;
create policy order_item_addons_team_select on order_item_addons for select using (
  exists (
    select 1
      from order_items oi
      join orders o on o.id = oi.order_id
     where oi.id = order_item_id
       and o.restaurant_id = any (coalesce((select app.permitted_restaurant_ids('orders.view')), '{}'))
       and (o.location_id is null
            or o.restaurant_id <> all (coalesce((select app.branch_scoped_restaurant_ids()), '{}'))
            or o.location_id = any (coalesce((select app.member_location_ids()), '{}')))
  )
);

-- -----------------------------------------------------------------------------
-- deliveries / reservations (+ location)
-- -----------------------------------------------------------------------------
drop policy if exists deliveries_team_select on deliveries;
drop policy if exists deliveries_team_insert on deliveries;
drop policy if exists deliveries_team_update on deliveries;
drop policy if exists deliveries_team_delete on deliveries;

create policy deliveries_team_select on deliveries for select using (
  restaurant_id = any (coalesce((select app.permitted_restaurant_ids('delivery.view')), '{}'))
  and (location_id is null
       or restaurant_id <> all (coalesce((select app.branch_scoped_restaurant_ids()), '{}'))
       or location_id = any (coalesce((select app.member_location_ids()), '{}')))
);
create policy deliveries_team_insert on deliveries for insert with check (
  restaurant_id = any (coalesce((select app.permitted_restaurant_ids('delivery.manage')), '{}'))
  and (location_id is null
       or restaurant_id <> all (coalesce((select app.branch_scoped_restaurant_ids()), '{}'))
       or location_id = any (coalesce((select app.member_location_ids()), '{}')))
);
create policy deliveries_team_update on deliveries for update using (
  restaurant_id = any (coalesce((select app.permitted_restaurant_ids('delivery.manage')), '{}'))
  and (location_id is null
       or restaurant_id <> all (coalesce((select app.branch_scoped_restaurant_ids()), '{}'))
       or location_id = any (coalesce((select app.member_location_ids()), '{}')))
) with check (
  restaurant_id = any (coalesce((select app.permitted_restaurant_ids('delivery.manage')), '{}'))
  and (location_id is null
       or restaurant_id <> all (coalesce((select app.branch_scoped_restaurant_ids()), '{}'))
       or location_id = any (coalesce((select app.member_location_ids()), '{}')))
);
create policy deliveries_team_delete on deliveries for delete using (
  restaurant_id = any (coalesce((select app.permitted_restaurant_ids('delivery.manage')), '{}'))
  and (location_id is null
       or restaurant_id <> all (coalesce((select app.branch_scoped_restaurant_ids()), '{}'))
       or location_id = any (coalesce((select app.member_location_ids()), '{}')))
);

drop policy if exists reservations_team_select on reservations;
drop policy if exists reservations_team_insert on reservations;
drop policy if exists reservations_team_update on reservations;
drop policy if exists reservations_team_delete on reservations;

create policy reservations_team_select on reservations for select using (
  restaurant_id = any (coalesce((select app.permitted_restaurant_ids('reservations.view')), '{}'))
  and (location_id is null
       or restaurant_id <> all (coalesce((select app.branch_scoped_restaurant_ids()), '{}'))
       or location_id = any (coalesce((select app.member_location_ids()), '{}')))
);
create policy reservations_team_insert on reservations for insert with check (
  restaurant_id = any (coalesce((select app.permitted_restaurant_ids('reservations.manage')), '{}'))
  and (location_id is null
       or restaurant_id <> all (coalesce((select app.branch_scoped_restaurant_ids()), '{}'))
       or location_id = any (coalesce((select app.member_location_ids()), '{}')))
);
create policy reservations_team_update on reservations for update using (
  restaurant_id = any (coalesce((select app.permitted_restaurant_ids('reservations.manage')), '{}'))
  and (location_id is null
       or restaurant_id <> all (coalesce((select app.branch_scoped_restaurant_ids()), '{}'))
       or location_id = any (coalesce((select app.member_location_ids()), '{}')))
) with check (
  restaurant_id = any (coalesce((select app.permitted_restaurant_ids('reservations.manage')), '{}'))
  and (location_id is null
       or restaurant_id <> all (coalesce((select app.branch_scoped_restaurant_ids()), '{}'))
       or location_id = any (coalesce((select app.member_location_ids()), '{}')))
);
create policy reservations_team_delete on reservations for delete using (
  restaurant_id = any (coalesce((select app.permitted_restaurant_ids('reservations.manage')), '{}'))
  and (location_id is null
       or restaurant_id <> all (coalesce((select app.branch_scoped_restaurant_ids()), '{}'))
       or location_id = any (coalesce((select app.member_location_ids()), '{}')))
);

-- -----------------------------------------------------------------------------
-- reviews / customers (restaurant-wide)
-- -----------------------------------------------------------------------------
drop policy if exists reviews_team_select on reviews;
drop policy if exists reviews_team_insert on reviews;
drop policy if exists reviews_team_update on reviews;
drop policy if exists reviews_team_delete on reviews;

create policy reviews_team_select on reviews for select using (
  restaurant_id = any (coalesce((select app.permitted_restaurant_ids('reviews.view')), '{}'))
);
create policy reviews_team_insert on reviews for insert with check (
  restaurant_id = any (coalesce((select app.permitted_restaurant_ids('reviews.manage')), '{}'))
);
create policy reviews_team_update on reviews for update using (
  restaurant_id = any (coalesce((select app.permitted_restaurant_ids('reviews.manage')), '{}'))
) with check (
  restaurant_id = any (coalesce((select app.permitted_restaurant_ids('reviews.manage')), '{}'))
);
create policy reviews_team_delete on reviews for delete using (
  restaurant_id = any (coalesce((select app.permitted_restaurant_ids('reviews.manage')), '{}'))
);

drop policy if exists customers_team_select on customers;
drop policy if exists customers_team_insert on customers;
drop policy if exists customers_team_update on customers;
drop policy if exists customers_team_delete on customers;

create policy customers_team_select on customers for select using (
  restaurant_id = any (coalesce((select app.permitted_restaurant_ids('customers.view')), '{}'))
);
create policy customers_team_insert on customers for insert with check (
  restaurant_id = any (coalesce((select app.permitted_restaurant_ids('customers.manage')), '{}'))
);
create policy customers_team_update on customers for update using (
  restaurant_id = any (coalesce((select app.permitted_restaurant_ids('customers.manage')), '{}'))
) with check (
  restaurant_id = any (coalesce((select app.permitted_restaurant_ids('customers.manage')), '{}'))
);
create policy customers_team_delete on customers for delete using (
  restaurant_id = any (coalesce((select app.permitted_restaurant_ids('customers.manage')), '{}'))
);
