-- =============================================================================
-- 0015 — Live order status via Postgres LISTEN/NOTIFY (served to browsers by SSE)
--
-- Replaces the Supabase Realtime approach of 0014, which needed a browser-side
-- token and an `anon` policy: that policy is dropped again here.
--
-- A trigger sends one NOTIFY on channel `order_changes` when a field the order
-- page shows (status, payment status, ETA) really changes. NOTIFY is transactional:
-- it is delivered on COMMIT, never for a rolled-back change, and it does not matter
-- who changed the row (storefront, a future admin UI, the SQL editor).
--
-- The payload is small and carries no personal data:
--   { id, restaurant_id, status, payment_status, estimated_ready_at, updated_at }
-- The app server (server/db/listener.ts) is the only listener; browsers never touch
-- the database. Access to an order's stream is decided by the same ownership proof
-- as the order page itself (server/services/order-events.ts).
-- =============================================================================

drop policy if exists orders_realtime_grant on orders;

create or replace function app.notify_order_change()
returns trigger
language plpgsql
as $$
begin
  perform pg_notify(
    'order_changes',
    json_build_object(
      'id', new.id,
      'restaurant_id', new.restaurant_id,
      'status', new.status,
      'payment_status', new.payment_status,
      'estimated_ready_at', new.estimated_ready_at,
      'updated_at', new.updated_at
    )::text
  );
  return null;
end;
$$;

drop trigger if exists notify_order_change on orders;
create trigger notify_order_change
  after update on orders
  for each row
  when (
    old.status is distinct from new.status
    or old.payment_status is distinct from new.payment_status
    or old.estimated_ready_at is distinct from new.estimated_ready_at
  )
  execute function app.notify_order_change();
