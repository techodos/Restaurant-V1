-- =============================================================================
-- 0001 — Extensions, Supabase-compatible auth shim, request context helpers
-- =============================================================================
-- This migration is written to work in TWO environments:
--   1. Supabase Postgres  (auth schema + auth.uid()/auth.jwt() already exist)
--   2. Plain Postgres     (we create a compatible shim)
-- RLS policies are expressed only in terms of app.*() helpers so that they
-- behave identically in both environments.
-- =============================================================================

create extension if not exists "pgcrypto";
create extension if not exists "pg_trgm";

create schema if not exists app;

-- ---------------------------------------------------------------------------
-- auth shim (no-op when running on Supabase)
-- ---------------------------------------------------------------------------
create schema if not exists auth;

create table if not exists auth.users (
  id                 uuid primary key default gen_random_uuid(),
  email              text not null unique,
  encrypted_password text,
  phone              text,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  email_confirmed_at timestamptz,
  last_sign_in_at    timestamptz,
  is_platform_admin  boolean not null default false,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create or replace function auth.uid()
returns uuid
language sql stable
as $$
  select nullif(
    coalesce(
      current_setting('request.jwt.claims', true)::jsonb ->> 'sub',
      current_setting('app.current_user_id', true)
    ), ''
  )::uuid;
$$;

create or replace function auth.jwt()
returns jsonb
language sql stable
as $$
  select coalesce(current_setting('request.jwt.claims', true)::jsonb, '{}'::jsonb);
$$;

-- ---------------------------------------------------------------------------
-- Request-scoped context
-- ---------------------------------------------------------------------------
-- Values are set with `set local` inside a transaction by src/lib/db/pool.ts.
--   app.current_restaurant_id : tenant pin for team/admin operations
--   app.current_customer_id   : authenticated storefront customer
--   app.actor                 : human readable actor for audit columns
-- ---------------------------------------------------------------------------

create or replace function app.current_user_id() returns uuid
language sql stable as $$ select auth.uid(); $$;

create or replace function app.current_restaurant_id() returns uuid
language sql stable as $$
  select nullif(current_setting('app.current_restaurant_id', true), '')::uuid;
$$;

create or replace function app.current_customer_id() returns uuid
language sql stable as $$
  select nullif(current_setting('app.current_customer_id', true), '')::uuid;
$$;

create or replace function app.current_actor() returns text
language sql stable as $$
  select coalesce(nullif(current_setting('app.actor', true), ''), 'system');
$$;

create or replace function app.slugify(p_text text)
returns text
language sql immutable
as $$
  select trim(both '-' from regexp_replace(lower(coalesce(p_text, '')), '[^a-z0-9]+', '-', 'g'));
$$;

create or replace function app.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Guest cart ownership helpers
create or replace function app.cart_token() returns text
language sql stable as $$
  select coalesce(nullif(current_setting('app.cart_token', true), ''), '~none~');
$$;

-- NOTE: team/role/permission helpers that read domain tables (app.is_team_member,
-- app.team_role, app.has_permission, app.is_restaurant_public) are created in
-- 0003_core_tables.sql, after those tables exist.
