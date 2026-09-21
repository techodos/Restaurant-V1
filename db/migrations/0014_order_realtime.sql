-- =============================================================================
-- 0014 — Live order tracking through Supabase Realtime
--
-- Realtime evaluates row-level security with the SUBSCRIBER'S Supabase JWT and
-- never sets the app.* session settings (app.cart_token, app.current_customer_id)
-- that the storefront policies rely on, so a guest could receive nothing. Instead
-- of loosening those policies, the server — after proving the visitor may see the
-- order (cart cookie, signed-in customer or signed email link) — mints a
-- short-lived JWT for the `anon` role that names exactly one order:
--
--     { "role": "anon", "order_id": "<uuid>", "restaurant_id": "<uuid>", "exp": … }
--
-- and this policy lets `anon` read only the row that matches BOTH claims. The
-- token has no `sub`, so auth.uid() stays null and no other policy (team, customer)
-- can match. A token for order A1 can never read or receive order B1, nor any
-- order of another restaurant.
--
-- Scope: SELECT on `orders` for `anon` only. Nothing else is granted or changed;
-- the existing policies are untouched. Skipped on plain Postgres (no `anon` role),
-- e.g. the local test database, where Realtime does not exist.
-- =============================================================================

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    raise notice '0014: role "anon" not found (plain Postgres); order realtime policy skipped';
    return;
  end if;

  -- Tables created by a non-default owner do not get Supabase's default grants.
  execute 'grant usage on schema public to anon';
  execute 'grant select on table public.orders to anon';

  execute 'drop policy if exists orders_realtime_grant on public.orders';
  execute $policy$
    create policy orders_realtime_grant on public.orders
      for select to anon
      using (
        id = nullif(auth.jwt() ->> 'order_id', '')::uuid
        and restaurant_id = nullif(auth.jwt() ->> 'restaurant_id', '')::uuid
      )
  $policy$;
end
$$;
