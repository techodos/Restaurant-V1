-- =============================================================================
-- 0036 — Index for the admin order-activity poll
--
-- Every open admin tab polls `orders where restaurant_id = $1 and updated_at > $2
-- order by updated_at limit 50` every 7 s (order sounds). No index covered
-- updated_at, so each poll read every order of the restaurant: 581 heap blocks /
-- 4.3 ms at 3,200 orders, growing linearly (~130 ms per poll per tab at 100k).
-- With this index the poll reads only the rows changed since the last poll.
-- Plain CREATE INDEX (the runner wraps each file in a transaction); it locks
-- writes on orders for the build, which is instant at today's table sizes.
-- =============================================================================

create index if not exists orders_restaurant_updated_idx on orders (restaurant_id, updated_at);
