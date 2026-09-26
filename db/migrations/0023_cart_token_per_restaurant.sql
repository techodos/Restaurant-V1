-- =============================================================================
-- 0023 — One active cart per (restaurant, token), not per token
-- 0010 said a visitor may shop at two restaurants at the same time (the cart cookie is per browser and
-- shared by every restaurant on the host), but the unique index it created was on session_token alone.
-- A browser that had an active cart at one restaurant could therefore never start one at another: the
-- insert hit the index, and the per-restaurant lookup could not see the other restaurant's cart.
-- =============================================================================

create unique index if not exists carts_restaurant_token_active_uidx
  on carts (restaurant_id, session_token) where status = 'active';

drop index if exists carts_session_token_active_idx;
