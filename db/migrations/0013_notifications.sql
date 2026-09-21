-- =============================================================================
-- 0013 — Customer notifications (transactional outbox + push tokens)
--
-- notification_events   one row per (order, event). It is written by a trigger in
--                       the SAME transaction that inserts the order / changes its
--                       status, so an event exists if and only if the change was
--                       committed — regardless of who made it (storefront, staff
--                       UI, SQL editor). A dispatcher (server/services/
--                       notifications.ts) delivers the rows afterwards, so a
--                       failing email/push provider can never roll an order back.
--                       unique (order_id, event_type) is the idempotency key:
--                       the same event can never be queued, and so never sent, twice.
--
-- customer_push_tokens  customer -> device/browser -> FCM token (many per customer).
--
-- Both tables are server-only: RLS is enabled with no policy for app_runtime, and
-- only app_service (BYPASSRLS) is granted access.
-- =============================================================================

create table notification_events (
  id               uuid primary key default gen_random_uuid(),
  restaurant_id    uuid not null references restaurants (id) on delete cascade,
  order_id         uuid not null references orders (id) on delete cascade,
  customer_id      uuid references customers (id) on delete set null,
  -- 'placed' for a new order, otherwise the new order_status value
  event_type       text not null,
  status           text not null default 'pending' check (status in ('pending', 'processing', 'done', 'dead')),
  attempts         integer not null default 0,
  next_attempt_at  timestamptz not null default now(),
  locked_until     timestamptz,
  -- per-channel outcome; null = not attempted yet. Lets a retry skip a channel that already succeeded.
  email_state      text check (email_state in ('sent', 'skipped', 'failed')),
  push_state       text check (push_state in ('sent', 'skipped', 'failed')),
  last_error       text,
  created_at       timestamptz not null default now(),
  processed_at     timestamptz,
  unique (order_id, event_type)
);

create index notification_events_due_idx on notification_events (next_attempt_at)
  where status in ('pending', 'processing');
create index notification_events_restaurant_idx on notification_events (restaurant_id, created_at desc);

create table customer_push_tokens (
  id                 uuid primary key default gen_random_uuid(),
  restaurant_id      uuid not null references restaurants (id) on delete cascade,
  customer_id        uuid not null references customers (id) on delete cascade,
  token              text not null,
  platform           text not null default 'web' check (platform in ('web', 'android', 'ios')),
  user_agent         text,
  is_active          boolean not null default true,
  deactivated_reason text,
  last_seen_at       timestamptz not null default now(),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  -- one browser may serve several guest customers (shared device); each keeps its own link
  unique (restaurant_id, customer_id, token)
);

create index customer_push_tokens_customer_idx on customer_push_tokens (customer_id) where is_active;

create trigger set_updated_at before update on customer_push_tokens
  for each row execute function app.set_updated_at();

-- Queue an event whenever an order is created or its status changes.
create or replace function app.enqueue_order_notification()
returns trigger language plpgsql security definer set search_path = public, app, pg_temp as $$
begin
  if tg_op = 'INSERT' then
    insert into notification_events (restaurant_id, order_id, customer_id, event_type)
    values (new.restaurant_id, new.id, new.customer_id, 'placed')
    on conflict (order_id, event_type) do nothing;
  elsif new.status is distinct from old.status then
    insert into notification_events (restaurant_id, order_id, customer_id, event_type)
    values (new.restaurant_id, new.id, new.customer_id, new.status::text)
    on conflict (order_id, event_type) do nothing;
  end if;
  return new;
end $$;

create trigger enqueue_order_notification after insert or update of status on orders
  for each row execute function app.enqueue_order_notification();

alter table notification_events enable row level security;
alter table customer_push_tokens enable row level security;

grant select, insert, update, delete on notification_events, customer_push_tokens to app_service;
