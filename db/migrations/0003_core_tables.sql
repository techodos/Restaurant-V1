-- =============================================================================
-- 0003 — Platform core: restaurants, locations, team, websites, pages, media
-- =============================================================================

-- ---------------------------------------------------------------------------
-- restaurants — tenant root
-- ---------------------------------------------------------------------------
create table restaurants (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null,
  slug                text not null unique,
  legal_name          text,
  description         text,
  short_description   text,
  cuisines            text[] not null default '{}',
  phone               text,
  whatsapp            text,
  email               text,
  website_url         text,
  logo_url            text,
  cover_url           text,
  primary_color       text,
  currency            text not null default 'PKR',
  currency_symbol     text not null default 'Rs',
  locale              text not null default 'en',
  timezone            text not null default 'Asia/Karachi',
  country             text not null default 'PK',
  status              restaurant_status not null default 'onboarding',
  -- Platform/subscription readiness for the future Super Admin area.
  plan                text not null default 'standard',
  plan_status         text not null default 'active',
  trial_ends_at       timestamptz,
  -- Feature toggles consumed by storefront + admin (see src/lib/contract.ts)
  features            jsonb not null default '{}'::jsonb,
  -- Operational settings: tax, fees, ordering rules, prep times ...
  settings            jsonb not null default '{}'::jsonb,
  social              jsonb not null default '{}'::jsonb,
  seo                 jsonb not null default '{}'::jsonb,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint restaurants_currency_len check (char_length(currency) between 3 and 4)
);

create index restaurants_status_idx on restaurants (status);
create index restaurants_slug_trgm_idx on restaurants using gin (name gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- restaurant_locations — branches (address, hours, geo, service modes)
-- ---------------------------------------------------------------------------
create table restaurant_locations (
  id                  uuid primary key default gen_random_uuid(),
  restaurant_id       uuid not null references restaurants (id) on delete cascade,
  name                text not null,
  slug                text not null,
  is_primary          boolean not null default false,
  is_active           boolean not null default true,
  address_line1       text,
  address_line2       text,
  area                text,
  city                text,
  state               text,
  postal_code         text,
  country             text not null default 'PK',
  phone               text,
  email               text,
  latitude            numeric(10, 7),
  longitude           numeric(10, 7),
  -- hours: { "mon": [{"open":"11:00","close":"23:00"}], "tue": [...], ... } (24h, local time)
  hours               jsonb not null default '{}'::jsonb,
  -- tables: [{"id":"T1","name":"Table 1","seats":4}] — dine-in seating (JSONB config)
  settings            jsonb not null default '{}'::jsonb,
  sort_order          integer not null default 0,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (restaurant_id, slug)
);

create index restaurant_locations_restaurant_idx on restaurant_locations (restaurant_id, is_active);
create unique index restaurant_locations_one_primary_idx
  on restaurant_locations (restaurant_id) where is_primary;

-- ---------------------------------------------------------------------------
-- team_members — staff accounts + RBAC
-- ---------------------------------------------------------------------------
create table team_members (
  id             uuid primary key default gen_random_uuid(),
  restaurant_id  uuid not null references restaurants (id) on delete cascade,
  user_id        uuid references auth.users (id) on delete set null,
  location_id    uuid references restaurant_locations (id) on delete set null,
  email          text not null,
  full_name      text not null,
  phone          text,
  role           team_role not null default 'staff',
  -- { "allow": ["menu.manage"], "deny": ["settings.manage"] }
  permissions    jsonb not null default '{}'::jsonb,
  is_active      boolean not null default true,
  invited_at     timestamptz,
  accepted_at    timestamptz,
  last_login_at  timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (restaurant_id, email)
);

create index team_members_user_idx on team_members (user_id) where is_active;
create index team_members_restaurant_idx on team_members (restaurant_id, is_active);

-- ---------------------------------------------------------------------------
-- websites — one published storefront per restaurant
-- ---------------------------------------------------------------------------
create table websites (
  id             uuid primary key default gen_random_uuid(),
  restaurant_id  uuid not null references restaurants (id) on delete cascade,
  name           text not null default 'Main website',
  domain         text unique,
  subdomain      text unique,
  status         website_status not null default 'draft',
  is_primary     boolean not null default true,
  -- theme: { "name", "primary", "secondary", "accent", "background", "surface",
  --          "foreground", "muted", "font", "headingFont", "radius", "dark" }
  theme          jsonb not null default '{}'::jsonb,
  -- config: announcement, nav, footer, cta, social, ordering, seo defaults ...
  config         jsonb not null default '{}'::jsonb,
  seo            jsonb not null default '{}'::jsonb,
  published_at   timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index websites_restaurant_idx on websites (restaurant_id);

-- ---------------------------------------------------------------------------
-- website_pages — DB-driven pages made of JSON sections
-- ---------------------------------------------------------------------------
create table website_pages (
  id            uuid primary key default gen_random_uuid(),
  website_id    uuid not null references websites (id) on delete cascade,
  restaurant_id uuid not null references restaurants (id) on delete cascade,
  slug          text not null,
  title         text not null,
  description   text,
  is_home       boolean not null default false,
  is_published  boolean not null default true,
  sort_order    integer not null default 0,
  seo           jsonb not null default '{}'::jsonb,
  -- sections: [ { "type": "hero", "enabled": true, "title": "...", ... } ]
  sections      jsonb not null default '[]'::jsonb,
  config        jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (website_id, slug)
);

create index website_pages_lookup_idx on website_pages (restaurant_id, slug, is_published);
create unique index website_pages_one_home_idx on website_pages (website_id) where is_home;

-- ---------------------------------------------------------------------------
-- media — library metadata (binaries live in Supabase Storage / local disk)
-- ---------------------------------------------------------------------------
create table media (
  id             uuid primary key default gen_random_uuid(),
  restaurant_id  uuid not null references restaurants (id) on delete cascade,
  uploaded_by    uuid references auth.users (id) on delete set null,
  bucket         text not null default 'restaurant-media',
  path           text not null,
  url            text not null,
  file_name      text not null,
  mime_type      text not null,
  size_bytes     bigint not null default 0,
  width          integer,
  height         integer,
  purpose        media_purpose not null default 'other',
  alt_text       text,
  tags           text[] not null default '{}',
  created_at     timestamptz not null default now(),
  unique (bucket, path)
);

create index media_restaurant_idx on media (restaurant_id, created_at desc);
create index media_purpose_idx on media (restaurant_id, purpose);

-- ---------------------------------------------------------------------------
-- Context helpers that depend on the tables above
-- ---------------------------------------------------------------------------
create or replace function app.is_team_member(p_restaurant_id uuid)
returns boolean
language sql stable security definer set search_path = public, app, pg_temp
as $$
  select exists (
    select 1 from team_members tm
    where tm.restaurant_id = p_restaurant_id
      and tm.is_active
      and tm.user_id = app.current_user_id()
  );
$$;

create or replace function app.team_role(p_restaurant_id uuid)
returns team_role
language sql stable security definer set search_path = public, app, pg_temp
as $$
  select tm.role from team_members tm
  where tm.restaurant_id = p_restaurant_id
    and tm.is_active
    and tm.user_id = app.current_user_id()
  limit 1;
$$;

create or replace function app.has_permission(p_restaurant_id uuid, p_permission text)
returns boolean
language sql stable security definer set search_path = public, app, pg_temp
as $$
  select coalesce((
    select case
      when (tm.permissions -> 'deny') ? p_permission then false
      when (tm.permissions -> 'allow') ? p_permission then true
      else p_permission = any (app.role_permissions(tm.role))
    end
    from team_members tm
    where tm.restaurant_id = p_restaurant_id
      and tm.is_active
      and tm.user_id = app.current_user_id()
    limit 1
  ), false);
$$;

create or replace function app.is_restaurant_public(p_restaurant_id uuid)
returns boolean
language sql stable security definer set search_path = public, app, pg_temp
as $$
  select exists (
    select 1 from restaurants r
    where r.id = p_restaurant_id and r.status = 'active'
  );
$$;

-- Set of restaurant ids the current user may administer (used by RLS + admin UI)
create or replace function app.member_restaurant_ids()
returns uuid[]
language sql stable security definer set search_path = public, app, pg_temp
as $$
  select coalesce(array_agg(tm.restaurant_id), array[]::uuid[])
  from team_members tm
  where tm.is_active and tm.user_id = app.current_user_id();
$$;
