-- =============================================================================
-- 0004 — Menu domain: categories, items, variants, add-on groups, add-ons
-- =============================================================================

-- ---------------------------------------------------------------------------
-- menu_categories — ordered, optionally time-limited groups of items
-- ---------------------------------------------------------------------------
create table menu_categories (
  id             uuid primary key default gen_random_uuid(),
  restaurant_id  uuid not null references restaurants (id) on delete cascade,
  location_id    uuid references restaurant_locations (id) on delete set null,
  name           text not null,
  slug           text not null,
  description    text,
  image_url      text,
  icon           text,
  sort_order     integer not null default 0,
  is_active      boolean not null default true,
  is_featured    boolean not null default false,
  -- availability window: { "days": [1,2,3], "from": "11:00", "to": "15:00" }
  availability   jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (restaurant_id, slug)
);

create index menu_categories_restaurant_idx on menu_categories (restaurant_id, is_active, sort_order);

-- ---------------------------------------------------------------------------
-- menu_items
-- ---------------------------------------------------------------------------
create table menu_items (
  id                 uuid primary key default gen_random_uuid(),
  restaurant_id      uuid not null references restaurants (id) on delete cascade,
  category_id        uuid not null references menu_categories (id) on delete cascade,
  name               text not null,
  slug               text not null,
  description        text,
  short_description  text,
  image_url          text,
  base_price         numeric(12, 2) not null default 0 check (base_price >= 0),
  compare_at_price   numeric(12, 2) check (compare_at_price is null or compare_at_price >= 0),
  cost_price         numeric(12, 2) check (cost_price is null or cost_price >= 0),
  sku                text,
  calories           integer,
  spice_level        smallint not null default 0 check (spice_level between 0 and 5),
  prep_time_minutes  integer not null default 15 check (prep_time_minutes >= 0),
  is_active          boolean not null default true,
  is_available      boolean not null default true,
  is_featured        boolean not null default false,
  -- Badges: ["vegetarian","vegan","halal","gluten_free","new","bestseller","spicy"]
  dietary_tags       text[] not null default '{}',
  allergens          text[] not null default '{}',
  sort_order         integer not null default 0,
  available_from     timestamptz,
  available_until    timestamptz,
  -- availability window shared with categories: { "days": [...], "from": "...", "to": "..." }
  availability       jsonb not null default '{}'::jsonb,
  metadata           jsonb not null default '{}'::jsonb,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (restaurant_id, slug)
);

create index menu_items_restaurant_idx on menu_items (restaurant_id, is_active, is_available);
create index menu_items_category_idx on menu_items (category_id, sort_order);
create index menu_items_featured_idx on menu_items (restaurant_id, is_featured) where is_featured and is_active;
create index menu_items_name_trgm_idx on menu_items using gin (name gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- menu_item_variants — size / portion / crust. price_mode 'absolute' replaces
-- the base price, 'delta' adjusts it.
-- ---------------------------------------------------------------------------
create table menu_item_variants (
  id                uuid primary key default gen_random_uuid(),
  restaurant_id     uuid not null references restaurants (id) on delete cascade,
  menu_item_id      uuid not null references menu_items (id) on delete cascade,
  name              text not null,
  price             numeric(12, 2) not null default 0 check (price >= 0),
  price_mode        text not null default 'absolute' check (price_mode in ('absolute', 'delta')),
  is_default        boolean not null default false,
  is_available      boolean not null default true,
  sort_order        integer not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (menu_item_id, name)
);

create index menu_item_variants_item_idx on menu_item_variants (menu_item_id, sort_order);
create unique index menu_item_variants_one_default_idx
  on menu_item_variants (menu_item_id) where is_default;

-- ---------------------------------------------------------------------------
-- menu_addon_groups — required/optional selection rules per item
-- ---------------------------------------------------------------------------
create table menu_addon_groups (
  id             uuid primary key default gen_random_uuid(),
  restaurant_id  uuid not null references restaurants (id) on delete cascade,
  menu_item_id   uuid not null references menu_items (id) on delete cascade,
  name           text not null,
  description    text,
  is_required    boolean not null default false,
  min_select     integer not null default 0 check (min_select >= 0),
  max_select     integer not null default 1 check (max_select >= 1),
  sort_order     integer not null default 0,
  is_active      boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint menu_addon_groups_rule check (min_select <= max_select),
  constraint menu_addon_groups_required_rule check (not is_required or min_select >= 1)
);

create index menu_addon_groups_item_idx on menu_addon_groups (menu_item_id, sort_order);

-- ---------------------------------------------------------------------------
-- menu_addons
-- ---------------------------------------------------------------------------
create table menu_addons (
  id                   uuid primary key default gen_random_uuid(),
  restaurant_id        uuid not null references restaurants (id) on delete cascade,
  addon_group_id       uuid not null references menu_addon_groups (id) on delete cascade,
  name                 text not null,
  description          text,
  price                numeric(12, 2) not null default 0 check (price >= 0),
  is_default           boolean not null default false,
  is_available         boolean not null default true,
  max_quantity         integer not null default 1 check (max_quantity >= 1),
  sort_order           integer not null default 0,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index menu_addons_group_idx on menu_addons (addon_group_id, sort_order);
