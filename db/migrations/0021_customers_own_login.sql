-- =============================================================================
-- 0021 — customers own their login; auth.users goes back to staff-only
--
-- Context: 0019/0020 replaced auth.users with an app-owned `users` table so
-- customer sign-up/Google sign-in could actually write somewhere (auth.users
-- itself can never be granted INSERT/UPDATE for a runtime role — confirmed
-- twice now, independently, on two different branches of this project).
--
-- That `users` table was a *shared* login table, same design as auth.users:
-- one row per person, `customers` rows per restaurant linking to it via
-- `user_id`. But this project's admin/staff portal (built on a different
-- branch, sharing this hosted dev DB) keeps its own auth-service.ts pointed
-- at auth.users for staff, and its own migrations re-grant service_role
-- membership for that — a second, incompatible attempt at the same "can't
-- write auth.users" problem, on the same shared database. Running both
-- means either wins by accident depending on migration order (confirmed
-- 2026-09-23: the FKs this file's predecessor pointed at `users` were found
-- reverted to auth.users, and `users` emptied, after the other branch's
-- scripts ran against the same DB).
--
-- Fix, at the requester's direction: stop needing a shared login table at
-- all for customers. `customers` becomes the login identity itself — email,
-- password_hash, is_email_verified, google_sub, auth_provider move onto it
-- directly. A customer's login is *already* restaurant-scoped by design (a
-- person signing in at two restaurants gets two customers rows) — the extra
-- `users` row it pointed at was bookkeeping this schema never actually
-- needed for the customer side, only for the (unrelated) staff side.
--
-- Staff/admin (team_members, and the who-did-this columns on media, orders,
-- deliveries, reviews) goes back to auth.users, unaltered — that is the
-- other branch's territory, entirely separate from customer accounts, and
-- this migration does not touch its access model. Staff accounts are still
-- created via `scripts/db/create-staff.ts` against the migrator connection,
-- never through a live request — same as before.
-- =============================================================================

alter table customers
  add column password_hash     text,
  add column is_email_verified boolean not null default false,
  add column google_sub        text,
  add column auth_provider     text not null default 'password',
  add column last_sign_in_at   timestamptz;

-- Dev-data cleanup: a handful of duplicate non-guest rows exist per (restaurant,
-- email) from testing before this constraint existed. Keep the most recently
-- created row as the real account; demote the rest to guest rows (data kept,
-- just no longer treated as a second login for the same email).
with ranked as (
  select id, row_number() over (
    partition by restaurant_id, lower(email)
    order by created_at desc
  ) as rn
  from customers
  where not is_guest and email is not null
)
update customers set is_guest = true
where id in (select id from ranked where rn > 1);

-- One password/Google account per restaurant per email (guests are exempt —
-- many guest rows can legitimately share an email, or have none).
create unique index customers_restaurant_email_key
  on customers (restaurant_id, lower(email))
  where not is_guest and email is not null;

-- google_sub unique per restaurant; NULLs (everyone who never used Google)
-- are not compared against each other by a plain unique index.
alter table customers add constraint customers_restaurant_google_sub_key unique (restaurant_id, google_sub);

alter table customers drop constraint customers_user_id_fkey;
alter table customers drop column user_id;

-- email_verification_codes now keys off the customer directly.
alter table email_verification_codes rename column user_id to customer_id;
alter table email_verification_codes drop constraint email_verification_codes_user_id_fkey;
alter table email_verification_codes add constraint email_verification_codes_customer_id_fkey
  foreign key (customer_id) references customers (id) on delete cascade;
alter index email_verification_codes_user_idx rename to email_verification_codes_customer_idx;

-- Staff-side FKs go back to auth.users (0019 had repointed these at `users`
-- along with the customer one; only the customer one belonged there).
alter table team_members drop constraint team_members_user_id_fkey;
alter table team_members add constraint team_members_user_id_fkey
  foreign key (user_id) references auth.users (id) on delete set null;

alter table media drop constraint media_uploaded_by_fkey;
alter table media add constraint media_uploaded_by_fkey
  foreign key (uploaded_by) references auth.users (id) on delete set null;

alter table order_status_history drop constraint order_status_history_changed_by_fkey;
alter table order_status_history add constraint order_status_history_changed_by_fkey
  foreign key (changed_by) references auth.users (id) on delete set null;

alter table deliveries drop constraint deliveries_driver_user_id_fkey;
alter table deliveries add constraint deliveries_driver_user_id_fkey
  foreign key (driver_user_id) references auth.users (id) on delete set null;

alter table reviews drop constraint reviews_responded_by_fkey;
alter table reviews add constraint reviews_responded_by_fkey
  foreign key (responded_by) references auth.users (id) on delete set null;

-- The app-owned login table from 0019/0020 is no longer used by anything.
drop table if exists users;
