-- =============================================================================
-- 0010 — Cart token lifecycle
-- A guest browser keeps the same opaque token for months, but it may only own
-- one *active* cart at a time. Converted/abandoned carts stay as history, so the
-- uniqueness must be partial instead of absolute.
-- =============================================================================

alter table carts drop constraint if exists carts_session_token_key;

create unique index if not exists carts_session_token_active_idx
  on carts (session_token) where status = 'active';

-- Fast lookup for the storefront: "the active cart for this browser", scoped per
-- restaurant so the same visitor can shop at two restaurants simultaneously.
create index if not exists carts_restaurant_token_active_idx
  on carts (restaurant_id, session_token)
  where status = 'active';
