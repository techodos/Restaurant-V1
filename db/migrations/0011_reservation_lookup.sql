-- =============================================================================
-- 0011 — Guest reservation lookup
-- A guest who books from the storefront must be able to see the booking again
-- without an account. The confirmation code alone is guessable-ish and
-- enumerable, so the lookup requires the code *and* the phone on the booking.
-- Implemented as a SECURITY DEFINER function and exposed only to app_runtime.
-- =============================================================================

create or replace function app.reservation_by_code(
  p_restaurant_id uuid,
  p_code text,
  p_phone text
)
returns setof reservations
language sql
stable
security definer
set search_path = public, app
as $$
  select r.*
    from reservations r
   where r.restaurant_id = p_restaurant_id
     and r.confirmation_code = upper(btrim(p_code))
     and regexp_replace(r.guest_phone, '\D', '', 'g') = regexp_replace(coalesce(p_phone, ''), '\D', '', 'g')
   limit 1;
$$;

revoke all on function app.reservation_by_code(uuid, text, text) from public;
grant execute on function app.reservation_by_code(uuid, text, text) to app_runtime, app_service;
