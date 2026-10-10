-- =============================================================================
-- 0038 — Revert 0037 (admin NOTIFY-on-insert feed): out of scope for the fix actually needed
--
-- 0037 extended notify_order_change to also fire on insert, for an admin multi-order SSE feed.
-- That feed turned out to be more than the reported bug needed (a minimal cursor fix in
-- orders/activity's poll closes it — see server/repositories/orders.ts#listOrderActivitySince and
-- components/admin/order-sound-notifications.tsx's CURSOR_SAFETY_MARGIN_MS), so this restores the
-- original after-update-only trigger from migration 0015. Nothing currently listens for the insert
-- notification; removing it avoids an extra pg_notify() per order with no consumer.
-- =============================================================================

drop trigger if exists notify_order_insert on orders;
drop trigger if exists notify_order_change on orders;

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

create trigger notify_order_change
  after update on orders
  for each row
  when (
    old.status is distinct from new.status
    or old.payment_status is distinct from new.payment_status
    or old.estimated_ready_at is distinct from new.estimated_ready_at
  )
  execute function app.notify_order_change();
