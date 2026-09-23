-- =============================================================================
-- 0017 — Reservation emails through the existing notification_events outbo
--
-- notification_events (0013) was order-only. An event now belongs to exactly one
-- subject: an order (order_id) or a reservation (reservation_id). Reservations
-- reuse the whole pipeline: the trigger below writes the event in the SAME
-- transaction that creates the reservation / changes its status, so an event
-- exists iff the change was committed, whoever made it (storefront, a future
-- admin UI, the SQL editor). The dispatcher delivers the rows afterwards, so a
-- failing email provider can never roll a reservation back.
--
--   event_type 'requested'  a request was submitted and awaits the restaurant
--   event_type 'confirmed'  the restaurant confirmed it (or it was auto-confirmed)
--
--   unique (reservation_id, event_type) is the idempotency key: a status that is
--   set again (pending -> confirmed -> pending -> confirmed) can never queue, and
--   so never send, a second email of the same kind.
--
-- Reservations only ever use the email channel (push_state stays 'skipped').
-- The table stays server-only: RLS on, no runtime policy, app_service granted.
-- =============================================================================

alter table notification_events alter column order_id drop not null;

alter table notification_events
  add column reservation_id uuid references reservations (id) on delete cascade;

alter table notification_events
  add constraint notification_events_one_subject
  check ((order_id is not null) <> (reservation_id is not null));

-- unique (order_id, event_type) from 0013 is untouched (NULL order_ids never collide)
alter table notification_events
  add constraint notification_events_reservation_event_key unique (reservation_id, event_type);

-- A new request queues 'requested'; a reservation created already confirmed
-- (restaurants with auto-confirm) queues only 'confirmed'; a later change to
-- 'confirmed' queues 'confirmed'. Other statuses (cancelled, seated, ...) send nothing.
create or replace function app.enqueue_reservation_notification()
returns trigger language plpgsql security definer set search_path = public, app, pg_temp as $$
begin
  if tg_op = 'INSERT' then
    if new.status in ('pending', 'confirmed') then
      insert into notification_events (restaurant_id, reservation_id, customer_id, event_type)
      values (new.restaurant_id, new.id, new.customer_id,
              case new.status when 'pending' then 'requested' else 'confirmed' end)
      on conflict (reservation_id, event_type) do nothing;
    end if;
  elsif new.status is distinct from old.status and new.status = 'confirmed' then
    insert into notification_events (restaurant_id, reservation_id, customer_id, event_type)
    values (new.restaurant_id, new.id, new.customer_id, 'confirmed')
    on conflict (reservation_id, event_type) do nothing;
  end if;
  return new;
end $$;

create trigger enqueue_reservation_notification after insert or update of status on reservations
  for each row execute function app.enqueue_reservation_notification();
