-- =============================================================================
-- 0024 — Menu items can be flagged as a buffet package (Villa The Grand Buffet)
-- A buffet package (e.g. "The Grand Dinner", Rs 2650/head) is sold per-head, not per-dish, and is
-- normally booked by reservation rather than delivered. The storefront shows a "Reserve a table"
-- CTA alongside the usual "Add to cart" for a flagged item; ordinary items are unaffected
-- (default false). Priced with the existing variant mechanism (e.g. an "Adult" and a
-- "Child (3-7)" variant) — no new pricing concept needed, just this one flag.
-- =============================================================================

alter table menu_items add column is_buffet_package boolean not null default false;
