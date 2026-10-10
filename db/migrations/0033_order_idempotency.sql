-- =============================================================================
-- 0033 — Order idempotency key
--
-- "Place order" could create the same order twice: a network retry after the
-- response was lost, a resubmit after "We could not confirm your order", or two
-- requests racing. The checkout form now sends one random key per checkout; the
-- order transaction (repositories/orders.ts#createOrder) returns the order that
-- already has this key instead of inserting a second one. The unique index is
-- what makes two concurrent requests safe: the loser's insert fails and is
-- answered with the winner's order.
--
-- Additive: older code never writes the column (null = no key, never unique).
-- Apply BEFORE deploying the code that writes it.
-- =============================================================================

alter table orders add column if not exists idempotency_key uuid;

create unique index if not exists orders_idempotency_key_uidx
  on orders (restaurant_id, customer_id, idempotency_key)
  where idempotency_key is not null;
