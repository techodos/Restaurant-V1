-- =============================================================================
-- 0006 — Triggers, business rules, RLS policies, database roles & grants
-- =============================================================================

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'restaurants','restaurant_locations','team_members','websites','website_pages',
    'menu_categories','menu_items','menu_item_variants','menu_addon_groups','menu_addons',
    'customers','customer_addresses','carts','cart_items','coupons','delivery_zones',
    'orders','payments','deliveries','reviews','reservations']
  loop
    execute format(
      'drop trigger if exists set_updated_at on %I; create trigger set_updated_at before update on %I
       for each row execute function app.set_updated_at();', t, t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Order numbers: ORD-YYMM-XXXXX
-- ---------------------------------------------------------------------------
create or replace function app.assign_order_number()
returns trigger language plpgsql as $$
begin
  if new.order_number is null or new.order_number = '' then
    new.order_number := 'ORD-' || to_char(now(), 'YYMM') || '-' ||
                        lpad(nextval('order_number_seq')::text, 5, '0');
  end if;
  return new;
end $$;

create trigger assign_order_number before insert on orders
for each row execute function app.assign_order_number();

-- ---------------------------------------------------------------------------
-- Order status state machine (mirrors ORDER_STATUS_RANK in src/lib/contract.ts)
--   pending(0) -> confirmed(1) -> preparing(2) -> ready(3) -> out_for_delivery(4)
--   -> completed(5).  Forward jumps are allowed; cancelled is reachable from any
--   non-terminal state. Backwards moves and moves out of a terminal state are not.
-- ---------------------------------------------------------------------------
create or replace function app.order_status_rank(p_status order_status)
returns smallint language sql immutable as $$
  select case p_status
    when 'pending' then 0 when 'confirmed' then 1 when 'preparing' then 2
    when 'ready' then 3 when 'out_for_delivery' then 4 when 'completed' then 5
    else -1 end::smallint;
$$;

create or replace function app.order_transition_allowed(p_from order_status, p_to order_status)
returns boolean language sql immutable as $$
  select case
    when p_from is null then true
    when p_from = p_to then true
    when p_from in ('completed', 'cancelled') then false
    when p_to = 'cancelled' then true
    when p_to = 'completed' then true
    else app.order_status_rank(p_to) > app.order_status_rank(p_from)
  end;
$$;

create or replace function app.enforce_order_status_transition()
returns trigger language plpgsql as $$
begin
  if new.status is distinct from old.status then
    if not app.order_transition_allowed(old.status, new.status) then
      raise exception 'Invalid order status transition: % -> %', old.status, new.status
        using errcode = 'check_violation';
    end if;
    if new.status = 'confirmed' and new.confirmed_at is null then new.confirmed_at := now(); end if;
    if new.status = 'preparing' and new.confirmed_at is null then new.confirmed_at := now(); end if;
    if new.status = 'ready' then new.ready_at := coalesce(new.ready_at, now()); end if;
    if new.status = 'out_for_delivery' then new.dispatched_at := coalesce(new.dispatched_at, now()); end if;
    if new.status = 'completed' then new.completed_at := coalesce(new.completed_at, now()); end if;
    if new.status = 'cancelled' then new.cancelled_at := coalesce(new.cancelled_at, now()); end if;
  end if;
  return new;
end $$;

create trigger enforce_order_status_transition before update on orders
for each row execute function app.enforce_order_status_transition();

-- Every status change is recorded in order_status_history.
create or replace function app.record_order_status()
returns trigger language plpgsql security definer set search_path = public, app, pg_temp as $$
declare v_actor_name text;
begin
  if tg_op = 'INSERT' then
    insert into order_status_history (order_id, restaurant_id, from_status, to_status, note, changed_by, changed_by_name)
    values (new.id, new.restaurant_id, null, new.status,
            case when new.placed_by = 'staff' then 'Order created by staff' else 'Order placed by customer' end,
            app.current_user_id(), coalesce(nullif(app.current_actor(), 'system'), 'customer'));
  elsif new.status is distinct from old.status then
    select tm.full_name into v_actor_name from team_members tm
      where tm.user_id = app.current_user_id() and tm.restaurant_id = new.restaurant_id limit 1;
    insert into order_status_history (order_id, restaurant_id, from_status, to_status, changed_by, changed_by_name)
    values (new.id, new.restaurant_id, old.status, new.status, app.current_user_id(),
            coalesce(v_actor_name, app.current_actor(), 'staff'));
  end if;
  return new;
end $$;

create trigger record_order_status after insert or update of status on orders
for each row execute function app.record_order_status();

-- ---------------------------------------------------------------------------
-- Delivery status mirrors the order status for delivery orders
-- ---------------------------------------------------------------------------
create or replace function app.sync_delivery_from_order()
returns trigger language plpgsql security definer set search_path = public, app, pg_temp as $$
begin
  if new.status is distinct from old.status and new.order_type = 'delivery' then
    update deliveries d set
      status = case
        when new.status = 'out_for_delivery' then 'in_transit'::delivery_status
        when new.status = 'completed' then 'delivered'::delivery_status
        when new.status = 'cancelled' then 'cancelled'::delivery_status
        else d.status end,
      picked_up_at = case when new.status = 'out_for_delivery' then coalesce(d.picked_up_at, now()) else d.picked_up_at end,
      delivered_at = case when new.status = 'completed' then coalesce(d.delivered_at, now()) else d.delivered_at end,
      updated_at = now()
    where d.order_id = new.id;
  end if;
  return new;
end $$;

create trigger sync_delivery_from_order after update of status on orders
for each row execute function app.sync_delivery_from_order();

-- ---------------------------------------------------------------------------
-- Customer aggregates kept in sync with orders
-- ---------------------------------------------------------------------------
create or replace function app.recalculate_customer_stats(p_customer_id uuid)
returns void language sql security definer set search_path = public, app, pg_temp as $$
  update customers c set
    total_orders = coalesce(agg.order_count, 0),
    total_spent  = coalesce(agg.spent, 0),
    last_order_at = agg.last_order_at,
    updated_at = now()
  from (
    select count(*) filter (where status <> 'cancelled') as order_count,
           sum(total) filter (where status = 'completed') as spent,
           max(created_at) as last_order_at
    from orders where customer_id = p_customer_id
  ) agg
  where c.id = p_customer_id;
$$;

create or replace function app.trg_order_customer_stats()
returns trigger language plpgsql security definer set search_path = public, app, pg_temp as $$
begin
  perform app.recalculate_customer_stats(coalesce(new.customer_id, old.customer_id));
  if tg_op = 'UPDATE' and old.customer_id is distinct from new.customer_id and old.customer_id is not null then
    perform app.recalculate_customer_stats(old.customer_id);
  end if;
  return null;
end $$;

create trigger order_customer_stats after insert or update on orders
for each row execute function app.trg_order_customer_stats();

-- ---------------------------------------------------------------------------
-- Payment status stays consistent between payments and orders
-- ---------------------------------------------------------------------------
create or replace function app.sync_order_payment_status()
returns trigger language plpgsql security definer set search_path = public, app, pg_temp as $$
begin
  if new.status is distinct from old.status and new.status = 'paid' and new.paid_at is null then
    new.paid_at := now();
  end if;
  if new.status is distinct from old.status and new.status = 'refunded' and new.refunded_at is null then
    new.refunded_at := now();
  end if;
  return new;
end $$;

create trigger sync_payment_timestamps before update on payments
for each row execute function app.sync_order_payment_status();

create or replace function app.trg_payment_to_order()
returns trigger language plpgsql security definer set search_path = public, app, pg_temp as $$
begin
  update orders o set payment_status = (
      select case
        when bool_or(p.status = 'paid') then 'paid'::payment_status
        when bool_or(p.status = 'authorized') then 'authorized'::payment_status
        when bool_or(p.status = 'refunded') then 'refunded'::payment_status
        when bool_or(p.status = 'failed') then 'failed'::payment_status
        when bool_or(p.status = 'cancelled') then 'cancelled'::payment_status
        else 'pending'::payment_status end
      from payments p where p.order_id = new.order_id)
  where o.id = new.order_id;
  return null;
end $$;

create trigger payment_to_order after insert or update of status on payments
for each row execute function app.trg_payment_to_order();

-- ---------------------------------------------------------------------------
-- Reservation confirmation codes (BN-XXXXXX)
-- ---------------------------------------------------------------------------
create or replace function app.assign_reservation_code()
returns trigger language plpgsql as $$
begin
  if new.confirmation_code is null or new.confirmation_code = '' then
    new.confirmation_code := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8));
  end if;
  return new;
end $$;

create trigger assign_reservation_code before insert on reservations
for each row execute function app.assign_reservation_code();

-- ---------------------------------------------------------------------------
-- Normalisation helpers (defensive: keeps data tidy even if a caller forgets)
-- ---------------------------------------------------------------------------
create or replace function app.normalize_coupon_code()
returns trigger language plpgsql as $$
begin
  new.code := upper(trim(new.code));
  return new;
end $$;

create trigger normalize_coupon_code before insert or update of code on coupons
for each row execute function app.normalize_coupon_code();

create or replace function app.normalize_slug()
returns trigger language plpgsql as $$
begin
  new.slug := app.slugify(new.slug);
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['restaurants','menu_categories','menu_items','restaurant_locations'] loop
    execute format('drop trigger if exists normalize_slug on %I; create trigger normalize_slug before insert or update of slug on %I
      for each row execute function app.normalize_slug();', t, t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'restaurants','restaurant_locations','team_members','websites','website_pages','media',
    'menu_categories','menu_items','menu_item_variants','menu_addon_groups','menu_addons',
    'customers','customer_addresses','carts','cart_items','cart_item_addons','coupons','delivery_zones',
    'orders','order_items','order_item_addons','order_status_history','payments','deliveries',
    'reviews','reservations']
  loop
    execute format('alter table %I enable row level security;', t);
  end loop;
end $$;

-- === Policy model =========================================================
-- Reads run as app_runtime with RLS enforced: public storefront reads are
-- limited to active/published rows, customers see only their own records, and
-- team reads require the matching *.view permission. Every management write
-- requires the matching *.manage permission.
-- ---------------------------------------------------------------------------
create policy restaurants_read on restaurants for select using (
  app.is_team_member(id) or status = 'active'
);
create policy restaurants_update on restaurants for update using (
  app.has_permission(id, 'settings.manage')
) with check (app.has_permission(id, 'settings.manage'));

-- Generic per-domain team policies: select needs <perm>.view,
-- insert/update/delete need <perm>.manage.
do $$
declare r record;
begin
  for r in select * from (values
    ('restaurant_locations','locations'), ('websites','website'), ('website_pages','website'),
    ('media','media'), ('menu_categories','menu'), ('menu_items','menu'),
    ('menu_item_variants','menu'), ('menu_addon_groups','menu'), ('menu_addons','menu'),
    ('coupons','coupons'), ('delivery_zones','delivery'), ('orders','orders'),
    ('order_items','orders'), ('payments','payments'), ('deliveries','delivery'),
    ('reservations','reservations'), ('reviews','reviews'), ('customers','customers'),
    ('team_members','staff')
  ) as t(tbl, perm)
  loop
    execute format($f$
      create policy %1$s_team_select on %1$I for select
        using (app.has_permission(restaurant_id, %2$L || '.view'));
      create policy %1$s_team_insert on %1$I for insert
        with check (app.has_permission(restaurant_id, %2$L || '.manage'));
      create policy %1$s_team_update on %1$I for update
        using (app.has_permission(restaurant_id, %2$L || '.manage'))
        with check (app.has_permission(restaurant_id, %2$L || '.manage'));
      create policy %1$s_team_delete on %1$I for delete
        using (app.has_permission(restaurant_id, %2$L || '.manage'));
    $f$, r.tbl, r.perm);
  end loop;
end $$;

-- Public storefront reads (OR-ed with the team policies above) --------------
create policy locations_public on restaurant_locations for select using (
  is_active and app.is_restaurant_public(restaurant_id)
);
create policy websites_public on websites for select using (
  status = 'published' and app.is_restaurant_public(restaurant_id)
);
create policy website_pages_public on website_pages for select using (
  is_published and app.is_restaurant_public(restaurant_id)
);
create policy media_public on media for select using (app.is_restaurant_public(restaurant_id));
create policy menu_categories_public on menu_categories for select using (
  is_active and app.is_restaurant_public(restaurant_id)
);
create policy menu_items_public on menu_items for select using (
  is_active and app.is_restaurant_public(restaurant_id)
);
create policy menu_item_variants_public on menu_item_variants for select using (
  is_available and app.is_restaurant_public(restaurant_id)
);
create policy menu_addon_groups_public on menu_addon_groups for select using (
  is_active and app.is_restaurant_public(restaurant_id)
);
create policy menu_addons_public on menu_addons for select using (
  is_available and app.is_restaurant_public(restaurant_id)
);
create policy delivery_zones_public on delivery_zones for select using (
  is_active and app.is_restaurant_public(restaurant_id)
);
create policy reviews_public on reviews for select using (
  status = 'approved' and app.is_restaurant_public(restaurant_id)
);

-- A team member can always read their own membership row --------------------
create policy team_members_self on team_members for select using (
  user_id = app.current_user_id() or user_id is null
);

-- Customer scope (guest ordering never requires an account) -----------------
create policy customers_self on customers for select using (id = app.current_customer_id());
create policy customer_addresses_self on customer_addresses for all using (
  customer_id = app.current_customer_id() and app.is_restaurant_public(restaurant_id)
) with check (
  customer_id = app.current_customer_id() and app.is_restaurant_public(restaurant_id)
);
create policy orders_customer on orders for select using (
  customer_id is not null and customer_id = app.current_customer_id()
);
create policy order_items_customer on order_items for select using (
  exists (select 1 from orders o where o.id = order_id and o.customer_id = app.current_customer_id())
);
create policy order_item_addons_customer on order_item_addons for select using (
  exists (select 1 from order_items oi join orders o on o.id = oi.order_id
          where oi.id = order_item_id and o.customer_id = app.current_customer_id())
);
create policy order_status_history_customer on order_status_history for select using (
  exists (select 1 from orders o where o.id = order_id and o.customer_id = app.current_customer_id())
);
create policy payments_customer on payments for select using (
  exists (select 1 from orders o where o.id = order_id and o.customer_id = app.current_customer_id())
);
create policy deliveries_customer on deliveries for select using (
  exists (select 1 from orders o where o.id = order_id and o.customer_id = app.current_customer_id())
);
create policy reviews_author on reviews for select using (
  customer_id is not null and customer_id = app.current_customer_id()
);
create policy reservations_customer on reservations for select using (
  customer_id is not null and customer_id = app.current_customer_id()
);

-- History is append-only; only order managers may append -------------------
create policy order_status_history_insert on order_status_history for insert with check (
  app.has_permission(restaurant_id, 'orders.manage')
);

-- Guest carts are scoped by an opaque token held in the request context -----
create policy carts_own on carts for all using (
  (customer_id is not null and customer_id = app.current_customer_id())
  or (customer_id is null and session_token = app.cart_token())
) with check (
  app.is_restaurant_public(restaurant_id)
  and ((customer_id is not null and customer_id = app.current_customer_id())
       or (customer_id is null and session_token = app.cart_token()))
);
create policy cart_items_own on cart_items for all using (
  app.cart_is_owned(cart_id)
) with check (app.cart_is_owned(cart_id));
create policy cart_item_addons_own on cart_item_addons for all using (
  app.cart_item_is_owned(cart_item_id)
) with check (app.cart_item_is_owned(cart_item_id));

-- ---------------------------------------------------------------------------
-- Database roles
--   app_owner   : owns the schema, used by migrations + seeds (bypasses RLS)
--   app_runtime : application read/update role, RLS ALWAYS enforced
--   app_service : privileged server-side operations (Supabase: service_role)
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'app_runtime') then
    create role app_runtime nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'app_service') then
    create role app_service nologin bypassrls;
  end if;
end $$;

grant usage on schema public, app, auth to app_runtime, app_service;
grant select, insert, update, delete on all tables in schema public to app_service;
grant usage, select on all sequences in schema public to app_service;
grant execute on all functions in schema app, public to app_service;

grant select, insert, update, delete on all tables in schema public to app_runtime;
grant usage, select on all sequences in schema public to app_runtime;
grant execute on all functions in schema app, public to app_runtime;
grant select on auth.users to app_runtime;
