-- =============================================================================
-- 0042 — notify_order_change also fires on INSERT, for the admin order-activity feed
--
-- Re-introduces what 0037 added and 0038 reverted (0038 called it "out of scope" because
-- nothing consumed it yet). It now has a real consumer: the admin "new order" chime/banner
-- (components/admin/order-sound-notifications.tsx) polled GET /admin/orders/activity every
-- 3 seconds, hitting the database on a timer regardless of whether anything changed. That
-- poll is replaced by an SSE feed (server/services/order-events.ts#openOrderActivityStream,
-- GET /admin/orders/events) built on the same LISTEN/NOTIFY infrastructure the customer
-- order-tracking page already uses (section 8 of the skill) — nothing is polled once this
-- feed is live; the poll only remains as a fallback for restaurants without
-- DATABASE_URL_LISTEN configured.
--
-- Extends the NOTIFY payload with order_number/location_id/created_at/is_new so the admin
-- feed can play the right chime and apply branch scope without a DB round trip per event.
-- The single-order customer watcher (watchOrderChanges) is unaffected: it already filters
-- by `id`, ignores unknown fields, and no visitor is on an order's tracking page before
-- that order exists (so the new insert-time NOTIFY is simply never seen by it).
-- =============================================================================

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
      'location_id', new.location_id,
      'order_number', new.order_number,
      'status', new.status,
      'payment_status', new.payment_status,
      'estimated_ready_at', new.estimated_ready_at,
      'created_at', new.created_at,
      'updated_at', new.updated_at,
      'is_new', (tg_op = 'INSERT')
    )::text
  );
  return null;
end;
$$;

-- WHEN cannot reference tg_op (it's a plpgsql-only special variable, not visible to the trigger DDL's
-- WHEN clause), and OLD does not exist for an insert — so insert and update are two triggers sharing
-- the same function, rather than one trigger with a tg_op check in WHEN.
drop trigger if exists notify_order_change on orders;
drop trigger if exists notify_order_insert on orders;
create trigger notify_order_insert
  after insert on orders
  for each row
  execute function app.notify_order_change();

create trigger notify_order_change
  after update on orders
  for each row
  when (
    old.status is distinct from new.status
    or old.payment_status is distinct from new.payment_status
    or old.estimated_ready_at is distinct from new.estimated_ready_at
  )
  execute function app.notify_order_change();
