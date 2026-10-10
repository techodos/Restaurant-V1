-- =============================================================================
-- 0037 — notify_order_change also fires on INSERT, for a real-time admin order feed
--
-- Root cause fix for: an admin tab plays the "new order" chime but the order list
-- never shows the order without a manual reload (reported 2026-10-10). The admin
-- poll (orders/activity, migration 0036's index) filters `updated_at > $since` and
-- advances its cursor to a timestamp taken AFTER the poll's own query returns.
-- `createOrder` (repositories/orders.ts) is a multi-statement transaction (pricing
-- read, insert order, insert items/add-ons, trigger side effects) that can run for
-- over a second on the hosted pooler. Its `updated_at` is stamped by `now()`
-- (transaction start), but the row only becomes visible to other sessions at
-- COMMIT — seconds later. Any poll whose query runs in that window correctly
-- doesn't see the still-uncommitted row, yet advances its cursor past the row's
-- `updated_at` anyway: the row is then PERMANENTLY excluded from every later poll
-- (`updated_at > cursor` is false forever), with no duplicate, no error, nothing to
-- retry. Reproduced against the hosted dev DB 2026-10-10 (Playwright + a real
-- `createOrder` call racing the live poll): the chime depends on the exact same
-- cursor, so when this race hits, BOTH the chime and the list silently miss the
-- order — matching the reported symptom combination exactly.
--
-- A later-captured watermark cannot fix a race inherent to polling a value stamped
-- at transaction START while visibility happens at COMMIT: no matter how the
-- cursor is computed, a long-running write can always commit with a timestamp the
-- cursor already passed. The actual fix is to stop polling a timestamp column and
-- use the mechanism this app already has for exactly this: `notify_order_change`
-- (migration 0015) sends one NOTIFY per real change, and NOTIFY is delivered on
-- COMMIT — there is no "not visible yet" window because nothing is visible until
-- delivery. It currently only fires `after update` (status/payment/ETA change),
-- because it was built for the single-order customer tracking page, which only
-- ever watches an order that already exists. An admin order FEED also needs to
-- know about brand-new orders, so this fires the same function `after insert` too,
-- and adds `order_number`/`location_id`/`created_at` to the payload so an admin
-- feed can play the right chime and apply branch scope without a DB round trip.
-- The single-order watcher (`watchOrderChanges`) is unaffected: it already filters
-- by `id`, and no visitor is on an order's tracking page before that order exists.
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
