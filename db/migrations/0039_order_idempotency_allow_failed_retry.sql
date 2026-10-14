-- =============================================================================
-- 0039 — Idempotency key no longer pins a customer to a failed order
--
-- createOrder returns the order already matching (restaurant_id, customer_id,
-- idempotency_key) unchanged ("replay"), so a network retry or double submit
-- never creates a second order. The checkout form generates ONE idempotency
-- key per page load and reuses it on every submit within that session
-- (checkout-form.tsx), including a resubmit after a failed online payment
-- with a DIFFERENT payment method (e.g. card declined -> switch to COD).
--
-- Before this migration, that resubmit hit the replay path and silently
-- returned the original failed order untouched: same payment_method, same
-- tax rate/amount as the card attempt that never charged anything. With
-- payment-method-based tax (card vs COD rates), that is a real, visible bug,
-- not just a missed retry optimisation.
--
-- Fix: the unique index (and the replay lookup in repositories/orders.ts)
-- now excludes orders whose payment definitively failed — nothing was
-- charged, so there is nothing to protect by pinning the customer to that
-- row. Reusing the same idempotency key after a failure inserts a fresh
-- order (new id/order number) with the corrected payment method and a
-- correctly recomputed tax. Orders that succeeded, or are still pending
-- (cash/COD, or an online payment awaiting its webhook), are unaffected —
-- those still replay exactly as before; this only lets go of handled.
-- =============================================================================

drop index if exists orders_idempotency_key_uidx;

create unique index orders_idempotency_key_uidx
  on orders (restaurant_id, customer_id, idempotency_key)
  where idempotency_key is not null and payment_status <> 'failed';
