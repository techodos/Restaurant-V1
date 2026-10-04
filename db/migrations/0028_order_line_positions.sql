-- ---------------------------------------------------------------------------
-- Order line positions.
--
-- An order's lines (and a line's add-ons) are inserted in one statement, so they
-- all share `created_at`, and every "order by created_at" on them was a tie: the
-- order of lines inside one order was whatever the query plan returned, and could
-- differ between queries and refreshes (kitchen tickets, order pages, emails).
-- `position` is the line's place in the customer's tray (0-based; for add-ons,
-- the add-on's place within its line), written by createOrder, and the sort key
-- of every read.
--
-- Additive and safe for code that does not know the column yet: it defaults to 0
-- and readers break ties by created_at as before.
--
-- Existing rows are numbered in the order they come back today (created_at, then
-- physical row order, which for rows written by one statement is insertion
-- order), so nothing visibly reorders.
-- ---------------------------------------------------------------------------
alter table order_items add column if not exists position integer not null default 0;
alter table order_item_addons add column if not exists position integer not null default 0;

update order_items oi
   set position = numbered.position
  from (select id, (row_number() over (partition by order_id order by created_at, ctid) - 1)::int as position
          from order_items) numbered
 where oi.id = numbered.id and oi.position is distinct from numbered.position;

update order_item_addons a
   set position = numbered.position
  from (select id, (row_number() over (partition by order_item_id order by created_at, ctid) - 1)::int as position
          from order_item_addons) numbered
 where a.id = numbered.id and a.position is distinct from numbered.position;

create index if not exists order_items_order_position_idx on order_items (order_id, position);
