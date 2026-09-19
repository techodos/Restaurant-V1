-- =============================================================================
-- 0005 — Customers, carts, coupons, delivery zones, orders, payments,
--        deliveries, reviews, reservations
-- =============================================================================

-- ---------------------------------------------------------------------------
-- customers — storefront customers, scoped per restaurant
-- ---------------------------------------------------------------------------
create table customers (
  id               uuid primary key default gen_random_uuid(),
  restaurant_id    uuid not null references restaurants (id) on delete cascade,
  user_id          uuid references auth.users (id) on delete set null,
  full_name        text not null,
  email            text,
  phone            text not null,
  notes            text,
  marketing_opt_in boolean not null default false,
  is_blocked       boolean not null default false,
  is_guest         boolean not null default true,
  total_orders     integer not null default 0,
  total_spent      numeric(14, 2) not null default 0,
  last_order_at    timestamptz,
  metadata         jsonb not null default '{}'::jsonb,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (restaurant_id, phone)
);

create index customers_restaurant_idx on customers (restaurant_id, created_at desc);
create index customers_user_idx on customers (user_id) where user_id is not null;
create index customers_email_idx on customers (restaurant_id, lower(email));

-- ---------------------------------------------------------------------------
-- customer_addresses
-- ---------------------------------------------------------------------------
create table customer_addresses (
  id               uuid primary key default gen_random_uuid(),
  restaurant_id    uuid not null references restaurants (id) on delete cascade,
  customer_id      uuid not null references customers (id) on delete cascade,
  label            text not null default 'Home',
  recipient_name   text,
  phone            text,
  address_line1    text not null,
  address_line2    text,
  area             text,
  city             text,
  state            text,
  postal_code      text,
  country          text not null default 'PK',
  delivery_notes   text,
  latitude         numeric(10, 7),
  longitude        numeric(10, 7),
  is_default       boolean not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index customer_addresses_customer_idx on customer_addresses (customer_id);
create unique index customer_addresses_one_default_idx
  on customer_addresses (customer_id) where is_default;

-- ---------------------------------------------------------------------------
-- carts + cart_items — guest or authenticated, server-recalculated
-- ---------------------------------------------------------------------------
create table carts (
  id                uuid primary key default gen_random_uuid(),
  restaurant_id     uuid not null references restaurants (id) on delete cascade,
  customer_id       uuid references customers (id) on delete set null,
  location_id       uuid references restaurant_locations (id) on delete set null,
  session_token     text not null unique,
  status            cart_status not null default 'active',
  order_type        order_type not null default 'delivery',
  coupon_id         uuid,
  coupon_code       text,
  currency          text not null default 'PKR',
  notes             text,
  expires_at        timestamptz not null default (now() + interval '14 days'),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index carts_customer_idx on carts (customer_id, status);
create index carts_restaurant_idx on carts (restaurant_id, status, updated_at desc);

create table cart_items (
  id                 uuid primary key default gen_random_uuid(),
  cart_id            uuid not null references carts (id) on delete cascade,
  restaurant_id      uuid not null references restaurants (id) on delete cascade,
  menu_item_id       uuid not null references menu_items (id) on delete cascade,
  variant_id         uuid references menu_item_variants (id) on delete set null,
  quantity           integer not null default 1 check (quantity between 1 and 99),
  special_instructions text,
  -- rendered name snapshot for fast display, recomputed from DB on every change
  item_name          text not null,
  variant_name       text,
  unit_price         numeric(12, 2) not null default 0,
  addons_total       numeric(12, 2) not null default 0,
  line_total         numeric(12, 2) not null default 0,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index cart_items_cart_idx on cart_items (cart_id);

create table cart_item_addons (
  id                uuid primary key default gen_random_uuid(),
  cart_item_id      uuid not null references cart_items (id) on delete cascade,
  menu_addon_id     uuid not null references menu_addons (id) on delete cascade,
  addon_group_id    uuid references menu_addon_groups (id) on delete set null,
  group_name        text not null,
  addon_name        text not null,
  unit_price        numeric(12, 2) not null default 0,
  quantity          integer not null default 1 check (quantity between 1 and 20),
  created_at        timestamptz not null default now()
);

create index cart_item_addons_item_idx on cart_item_addons (cart_item_id);

-- ---------------------------------------------------------------------------
-- coupons
-- ---------------------------------------------------------------------------
create table coupons (
  id                    uuid primary key default gen_random_uuid(),
  restaurant_id         uuid not null references restaurants (id) on delete cascade,
  code                  text not null,
  description           text,
  discount_type         coupon_discount_type not null default 'percentage',
  discount_value        numeric(12, 2) not null default 0 check (discount_value >= 0),
  min_order_amount      numeric(12, 2) not null default 0 check (min_order_amount >= 0),
  max_discount_amount   numeric(12, 2),
  applies_to            text not null default 'order' check (applies_to in ('order', 'delivery_fee')),
  order_types           order_type[] not null default '{delivery,pickup,dine_in}',
  starts_at             timestamptz,
  ends_at               timestamptz,
  usage_limit           integer check (usage_limit is null or usage_limit > 0),
  usage_limit_per_customer integer check (usage_limit_per_customer is null or usage_limit_per_customer > 0),
  used_count            integer not null default 0,
  is_active             boolean not null default true,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (restaurant_id, code),
  constraint coupons_percentage_range
    check (discount_type <> 'percentage' or discount_value between 0 and 100)
);

create index coupons_restaurant_idx on coupons (restaurant_id, is_active);

-- ---------------------------------------------------------------------------
-- delivery_zones — per location polygons/areas with fee + minimum + ETA
-- ---------------------------------------------------------------------------
create table delivery_zones (
  id                 uuid primary key default gen_random_uuid(),
  restaurant_id      uuid not null references restaurants (id) on delete cascade,
  location_id        uuid not null references restaurant_locations (id) on delete cascade,
  name               text not null,
  description        text,
  -- areas: ["Gulberg", "DHA Phase 5"] — matched case-insensitively on checkout
  areas              text[] not null default '{}',
  postal_codes       text[] not null default '{}',
  delivery_fee       numeric(12, 2) not null default 0 check (delivery_fee >= 0),
  min_order_amount   numeric(12, 2) not null default 0 check (min_order_amount >= 0),
  free_delivery_over numeric(12, 2) check (free_delivery_over is null or free_delivery_over >= 0),
  eta_min_minutes    integer not null default 30 check (eta_min_minutes >= 0),
  eta_max_minutes    integer not null default 45 check (eta_max_minutes >= eta_min_minutes),
  is_active          boolean not null default true,
  sort_order         integer not null default 0,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index delivery_zones_location_idx on delivery_zones (location_id, is_active);

-- ---------------------------------------------------------------------------
-- orders
-- ---------------------------------------------------------------------------
create sequence order_number_seq start 1001;

create table orders (
  id                   uuid primary key default gen_random_uuid(),
  restaurant_id        uuid not null references restaurants (id) on delete cascade,
  location_id          uuid references restaurant_locations (id) on delete set null,
  customer_id          uuid references customers (id) on delete set null,
  cart_id              uuid references carts (id) on delete set null,
  order_number         text not null unique,
  order_type           order_type not null default 'delivery',
  status               order_status not null default 'pending',
  -- customer snapshot (orders must stay readable even if the customer record changes)
  customer_name        text not null,
  customer_email       text,
  customer_phone       text not null,
  delivery_address     jsonb,
  delivery_zone_id     uuid references delivery_zones (id) on delete set null,
  table_number         text,
  guests               integer,
  scheduled_for        timestamptz,
  coupon_id            uuid references coupons (id) on delete set null,
  coupon_code          text,
  -- money (all numeric, never float)
  subtotal             numeric(12, 2) not null default 0 check (subtotal >= 0),
  discount_amount      numeric(12, 2) not null default 0 check (discount_amount >= 0),
  delivery_fee         numeric(12, 2) not null default 0 check (delivery_fee >= 0),
  tax_amount           numeric(12, 2) not null default 0 check (tax_amount >= 0),
  service_fee          numeric(12, 2) not null default 0 check (service_fee >= 0),
  tip_amount           numeric(12, 2) not null default 0 check (tip_amount >= 0),
  total                numeric(12, 2) not null default 0 check (total >= 0),
  currency             text not null default 'PKR',
  -- pricing inputs so a receipt can always be reproduced/audited
  tax_rate             numeric(6, 4) not null default 0,
  pricing_breakdown    jsonb not null default '{}'::jsonb,
  payment_method       payment_method not null default 'cash_on_delivery',
  payment_status       payment_status not null default 'pending',
  notes                text,
  special_instructions text,
  placed_by            text not null default 'customer' check (placed_by in ('customer', 'staff')),
  cancel_reason        text,
  confirmed_at         timestamptz,
  ready_at             timestamptz,
  dispatched_at        timestamptz,
  completed_at         timestamptz,
  cancelled_at         timestamptz,
  estimated_ready_at   timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index orders_restaurant_created_idx on orders (restaurant_id, created_at desc);
create index orders_restaurant_status_idx on orders (restaurant_id, status, created_at desc);
create index orders_customer_idx on orders (customer_id, created_at desc);
create index orders_active_idx on orders (restaurant_id, created_at desc)
  where status in ('pending', 'confirmed', 'preparing', 'ready', 'out_for_delivery');
create index orders_phone_idx on orders (restaurant_id, customer_phone);

create table order_items (
  id                   uuid primary key default gen_random_uuid(),
  order_id             uuid not null references orders (id) on delete cascade,
  restaurant_id        uuid not null references restaurants (id) on delete cascade,
  menu_item_id         uuid references menu_items (id) on delete set null,
  variant_id           uuid references menu_item_variants (id) on delete set null,
  item_name            text not null,
  variant_name         text,
  quantity             integer not null default 1 check (quantity between 1 and 99),
  unit_price           numeric(12, 2) not null default 0 check (unit_price >= 0),
  addons_total         numeric(12, 2) not null default 0 check (addons_total >= 0),
  line_total           numeric(12, 2) not null default 0 check (line_total >= 0),
  special_instructions text,
  created_at           timestamptz not null default now()
);

create index order_items_order_idx on order_items (order_id);
create index order_items_menu_item_idx on order_items (menu_item_id);

create table order_item_addons (
  id             uuid primary key default gen_random_uuid(),
  order_item_id  uuid not null references order_items (id) on delete cascade,
  menu_addon_id  uuid references menu_addons (id) on delete set null,
  group_name     text not null,
  addon_name     text not null,
  unit_price     numeric(12, 2) not null default 0 check (unit_price >= 0),
  quantity       integer not null default 1 check (quantity between 1 and 20),
  created_at     timestamptz not null default now()
);

create index order_item_addons_item_idx on order_item_addons (order_item_id);

create table order_status_history (
  id             uuid primary key default gen_random_uuid(),
  order_id       uuid not null references orders (id) on delete cascade,
  restaurant_id  uuid not null references restaurants (id) on delete cascade,
  from_status    order_status,
  to_status      order_status not null,
  note           text,
  changed_by     uuid references auth.users (id) on delete set null,
  changed_by_name text,
  created_at     timestamptz not null default now()
);

create index order_status_history_order_idx on order_status_history (order_id, created_at);

create table payments (
  id                uuid primary key default gen_random_uuid(),
  restaurant_id     uuid not null references restaurants (id) on delete cascade,
  order_id          uuid not null references orders (id) on delete cascade,
  provider          text not null default 'cash',
  method            payment_method not null default 'cash_on_delivery',
  status            payment_status not null default 'pending',
  amount            numeric(12, 2) not null default 0,
  currency          text not null default 'PKR',
  transaction_id    text,
  provider_intent_id text,
  provider_payload  jsonb not null default '{}'::jsonb,
  failure_reason    text,
  paid_at           timestamptz,
  refunded_at       timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index payments_order_idx on payments (order_id);
create index payments_restaurant_idx on payments (restaurant_id, status, created_at desc);

create table deliveries (
  id                   uuid primary key default gen_random_uuid(),
  restaurant_id        uuid not null references restaurants (id) on delete cascade,
  order_id             uuid not null unique references orders (id) on delete cascade,
  location_id          uuid references restaurant_locations (id) on delete set null,
  delivery_zone_id     uuid references delivery_zones (id) on delete set null,
  status               delivery_status not null default 'unassigned',
  driver_name          text,
  driver_phone         text,
  driver_user_id       uuid references auth.users (id) on delete set null,
  tracking_url         text,
  current_latitude     numeric(10, 7),
  current_longitude    numeric(10, 7),
  distance_km          numeric(6, 2),
  delivery_fee         numeric(12, 2) not null default 0,
  assigned_at          timestamptz,
  picked_up_at         timestamptz,
  estimated_arrival_at timestamptz,
  delivered_at         timestamptz,
  failed_at            timestamptz,
  failure_reason       text,
  notes                text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index deliveries_restaurant_idx on deliveries (restaurant_id, status, created_at desc);

-- ---------------------------------------------------------------------------
-- reviews
-- ---------------------------------------------------------------------------
create table reviews (
  id             uuid primary key default gen_random_uuid(),
  restaurant_id  uuid not null references restaurants (id) on delete cascade,
  location_id    uuid references restaurant_locations (id) on delete set null,
  customer_id    uuid references customers (id) on delete set null,
  order_id       uuid references orders (id) on delete set null,
  menu_item_id   uuid references menu_items (id) on delete set null,
  author_name    text not null,
  author_email   text,
  rating         smallint not null check (rating between 1 and 5),
  title          text,
  comment        text,
  status         review_status not null default 'pending',
  is_featured    boolean not null default false,
  response       text,
  responded_at   timestamptz,
  responded_by   uuid references auth.users (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index reviews_restaurant_idx on reviews (restaurant_id, status, created_at desc);
create index reviews_menu_item_idx on reviews (menu_item_id, status);
create unique index reviews_one_per_order_idx on reviews (order_id) where order_id is not null;

-- ---------------------------------------------------------------------------
-- reservations
-- ---------------------------------------------------------------------------
create table reservations (
  id                uuid primary key default gen_random_uuid(),
  restaurant_id     uuid not null references restaurants (id) on delete cascade,
  location_id       uuid not null references restaurant_locations (id) on delete cascade,
  customer_id       uuid references customers (id) on delete set null,
  confirmation_code text not null unique,
  guest_name        text not null,
  guest_email      text,
  guest_phone       text not null,
  reservation_date  date not null,
  reservation_time  time not null,
  duration_minutes  integer not null default 90 check (duration_minutes between 15 and 600),
  guests            integer not null check (guests between 1 and 60),
  table_number      text,
  special_requests  text,
  occasion          text,
  status            reservation_status not null default 'pending',
  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index reservations_restaurant_date_idx on reservations (restaurant_id, reservation_date desc, reservation_time);
create index reservations_location_slot_idx
  on reservations (location_id, reservation_date, reservation_time)
  where status in ('pending', 'confirmed', 'seated');

-- ---------------------------------------------------------------------------
-- Cart ownership helpers (need the carts/cart_items tables above)
-- ---------------------------------------------------------------------------
create or replace function app.cart_is_owned(p_cart_id uuid) returns boolean
language sql stable security definer set search_path = public, app, pg_temp as $$
  select exists (
    select 1 from carts c
    where c.id = p_cart_id
      and ((c.customer_id is not null and c.customer_id = app.current_customer_id())
           or (c.customer_id is null and c.session_token = app.cart_token()))
  );
$$;

create or replace function app.cart_item_is_owned(p_cart_item_id uuid) returns boolean
language sql stable security definer set search_path = public, app, pg_temp as $$
  select exists (
    select 1 from cart_items ci join carts c on c.id = ci.cart_id
    where ci.id = p_cart_item_id
      and ((c.customer_id is not null and c.customer_id = app.current_customer_id())
           or (c.customer_id is null and c.session_token = app.cart_token()))
  );
$$;
