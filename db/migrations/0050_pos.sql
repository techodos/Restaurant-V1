-- =============================================================================
-- 0050 — In-store POS: terminals, shifts, fiscal (PRA/FBR) invoices, audit log
--
-- The POS is not a second order system: a counter sale is a row in `orders`
-- (source 'pos', placed_by 'staff'), its lines are `order_items`, its tenders are
-- `payments` (already many per order) — so the kitchen board, admin orders,
-- reports and the payment -> order status trigger all see it unchanged. Money stays
-- numeric(12,2) like every other amount (SKILL.md §5 rule 1); tax rates come from
-- restaurants.settings.tax (§35), not a new table.
--
-- New here:
--   pos_devices        one per till; `code` prefixes its invoice numbers and
--                      `last_invoice_seq` is the highest number the server has seen
--                      (the till numbers invoices itself, offline too)
--   pos_shifts         one open shift per till; closing it is the day close (Z-report)
--   fiscal_invoices    one per sale (+ credit notes); immutable once written; status
--                      pending -> synced | failed, retried by the fiscal dispatcher
--   fiscal_invoice_attempts  every request/response to the tax authority
--   audit_log          append-only record of POS actions
--
-- Additive only: existing rows and policies are untouched (orders_source_check is
-- widened, not narrowed). App roles get no DELETE on the new tables; triggers refuse
-- UPDATEs of issued data and DELETEs except by the table owner (migrations/seeds).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- permissions: pos.use (take orders and payments, open/close own shift),
-- pos.manage (register tills, refunds / credit notes, audit log).
-- Mirrored by server/auth/permissions.ts (tests/rbac.test.ts checks parity).
-- -----------------------------------------------------------------------------
create or replace function app.role_permissions(p_role team_role)
returns text[]
language sql immutable
as $$
  select case p_role
    when 'super_admin' then array[
      'orders.view','orders.manage','orders.update_status','kitchen.view','menu.view','menu.manage',
      'customers.view','customers.manage','reservations.view','reservations.manage','reviews.view','reviews.manage',
      'delivery.view','delivery.manage','coupons.view','coupons.manage','media.view','media.manage',
      'website.view','website.manage','staff.view','staff.manage','locations.view','locations.manage',
      'payments.view','analytics.view','settings.view','settings.manage','pos.use','pos.manage']
    when 'owner' then array[
      'orders.view','orders.manage','orders.update_status','kitchen.view','menu.view','menu.manage',
      'customers.view','customers.manage','reservations.view','reservations.manage','reviews.view','reviews.manage',
      'delivery.view','delivery.manage','coupons.view','coupons.manage','media.view','media.manage',
      'website.view','website.manage','staff.view','staff.manage','locations.view','locations.manage',
      'payments.view','analytics.view','settings.view','settings.manage','pos.use','pos.manage']
    when 'admin' then array[
      'orders.view','orders.manage','orders.update_status','kitchen.view','menu.view','menu.manage',
      'customers.view','customers.manage','reservations.view','reservations.manage','reviews.view','reviews.manage',
      'delivery.view','delivery.manage','coupons.view','coupons.manage','media.view','media.manage',
      'website.view','website.manage','staff.view','staff.manage','locations.view','locations.manage',
      'payments.view','analytics.view','settings.view','settings.manage','pos.use','pos.manage']
    when 'manager' then array[
      'orders.view','orders.manage','orders.update_status','kitchen.view','menu.view','menu.manage',
      'customers.view','customers.manage','reservations.view','reservations.manage','reviews.view','reviews.manage',
      'delivery.view','delivery.manage','coupons.view','coupons.manage','media.view','media.manage',
      'staff.view','staff.manage','locations.view','payments.view','analytics.view','pos.use','pos.manage']
    when 'staff' then array[
      'orders.view','orders.update_status','kitchen.view','menu.view','customers.view',
      'reservations.view','reservations.manage','reviews.view','delivery.view']
    when 'cashier' then array[
      'orders.view','kitchen.view','menu.view','pos.use']
    else array[]::text[]
  end;
$$;

-- true when the session user owns the table (migrations, seeds, a restaurant cascade-delete run as owner)
create or replace function app.is_relation_owner(p_relid oid)
returns boolean
language sql stable
as $$
  select pg_has_role(current_user, (select relowner from pg_class where oid = p_relid), 'MEMBER');
$$;

-- -----------------------------------------------------------------------------
-- pos_devices
-- -----------------------------------------------------------------------------
create table pos_devices (
  id                uuid primary key default gen_random_uuid(),
  restaurant_id     uuid not null references restaurants (id) on delete cascade,
  location_id       uuid not null references restaurant1s (id),
  name              text not null check (char_length(btrim(name)) between 1 and 60),
  -- invoice prefix: GUL1 -> GUL1-000042
  code              text not null check (code ~ '^[A-Z0-9]{2,8}$'),
  last_invoice_seq  bigint not null default 0 check (last_invoice_seq >= 0),
  is_active         boolean not null default true,
  registered_by     uuid references team_members (id) on delete set null,
  last_seen_at      timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (restaurant_id, code)
);

create index pos_devices_location_idx on pos_devices (restaurant_id, location_id) where is_active;
create trigger set_updated_at before update on pos_devices for each row execute function app.set_updated_at();

-- -----------------------------------------------------------------------------
-- pos_shifts
-- -----------------------------------------------------------------------------
create table pos_shifts (
  id              uuid primary key default gen_random_uuid(),
  restaurant_id   uuid not null references restaurants (id) on delete cascade,
  location_id     uuid not null references restaurant1s (id),
  device_id       uuid not null references pos_devices (id),
  -- 1, 2, ... per till per business day (shown as "Shift 1")
  shift_number    integer not null check (shift_number > 0),
  business_date   date not null,
  status          text not null default 'open' check (status in ('open', 'closed')),
  opened_by       uuid,
  opened_by_name  text not null,
  opened_at       timestamptz not null default now(),
  opening_float   numeric(12, 2) not null default 0 check (opening_float >= 0),
  closed_by       uuid,
  closed_by_name  text,
  closed_at       timestamptz,
  counted_cash    numeric(12, 2) check (counted_cash >= 0),
  expected_cash   numeric(12, 2),
  -- the Z-report as it was at close (totals by method, drawer, invoice counts)
  z_report        jsonb,
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check ((status = 'closed') = (closed_at is not null)),
  check (status = 'open' or (counted_cash is not null and expected_cash is not null and z_report is not null))
);

create unique index pos_shifts_one_open_per_device on pos_shifts (device_id) where status = 'open';
create index pos_shifts_location_idx on pos_shifts (restaurant_id, location_id, opened_at desc);
create trigger set_updated_at before update on pos_shifts for each row execute function app.set_updated_at();

-- a closed shift (its Z-report) never changes; an open one may only be closed
create or replace function app.guard_pos_shift()
returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    if app.is_relation_owner(tg_relid) then return old; end if;
    raise exception 'A shift cannot be deleted' using errcode = 'check_violation';
  end if;
  if old.status = 'closed' then
    raise exception 'A closed shift cannot be changed' using errcode = 'check_violation';
  end if;
  if (old.restaurant_id, old.location_id, old.device_id, old.shift_number, old.business_date,
      old.opened_by, old.opened_by_name, old.opened_at, old.opening_float)
     is distinct from
     (new.restaurant_id, new.location_id, new.device_id, new.shift_number, new.business_date,
      new.opened_by, new.opened_by_name, new.opened_at, new.opening_float) then
    raise exception 'An open shift''s opening details cannot be changed' using errcode = 'check_violation';
  end if;
  return new;
end $$;

create trigger guard_pos_shift before update or delete on pos_shifts
  for each row execute function app.guard_pos_shift();

-- -----------------------------------------------------------------------------
-- orders / order_items / payments: POS columns (all nullable, existing rows untouched)
-- -----------------------------------------------------------------------------
alter table orders drop constraint if exists orders_source_check;
alter table orders add constraint orders_source_check check (source in ('web', 'whatsapp', 'pos'));

alter table orders add column if not exists pos_device_id uuid references pos_devices (id) on delete set null;
alter table orders add column if not exists pos_shift_id uuid references pos_shifts (id) on delete set null;

-- a till's queued order replayed after a lost response is found, not inserted twice (no customer, so the
-- storefront index on (restaurant_id, customer_id, idempotency_key) cannot catch it: null customer ids are distinct)
create unique index if not exists orders_pos_idempotency_uidx
  on orders (restaurant_id, idempotency_key)
  where source = 'pos' and idempotency_key is not null;
create index if not exists orders_pos_shift_idx on orders (pos_shift_id) where pos_shift_id is not null;

-- lines added at the till carry the till's own id: a re-sent "send to kitchen" adds only what is new
alter table order_items add column if not exists client_line_id uuid;
create unique index if not exists order_items_client_line_uidx
  on order_items (order_id, client_line_id)
  where client_line_id is not null;

alter table payments add column if not exists shift_id uuid references pos_shifts (id) on delete set null;
alter table payments add column if not exists device_id uuid references pos_devices (id) on delete set null;
-- cash handed over and change given (cash tenders only)
alter table payments add column if not exists tendered_amount numeric(12, 2) check (tendered_amount >= 0);
alter table payments add column if not exists change_amount numeric(12, 2) not null default 0 check (change_amount >= 0);
alter table payments add column if not exists idempotency_key uuid;
alter table payments add column if not exists received_by uuid references team_members (id) on delete set null;
create unique index if not exists payments_idempotency_uidx
  on payments (restaurant_id, idempotency_key)
  where idempotency_key is not null;
create index if not exists payments_shift_idx on payments (shift_id) where shift_id is not null;

-- -----------------------------------------------------------------------------
-- fiscal_invoices
-- -----------------------------------------------------------------------------
create table fiscal_invoices (
  id                        uuid primary key default gen_random_uuid(),
  restaurant_id             uuid not null references restaurants (id) on delete cascade,
  location_id               uuid not null references restaurant1s (id),
  order_id                  uuid not null references orders (id),
  device_id                 uuid not null references pos_devices (id),
  shift_id                  uuid not null references pos_shifts (id),
  kind                      text not null default 'sale' check (kind in ('sale', 'credit_note')),
  original_invoice_id       uuid references fiscal_invoices (id),
  -- our number: <device code>-<seq>, sequential per till, assigned by the till (works offline)
  invoice_seq               bigint not null check (invoice_seq > 0),
  invoice_number            text not null,
  issued_at                 timestamptz not null,
  cashier_id                uuid,
  cashier_name              text not null,
  payment_method            payment_method not null,
  subtotal                  numeric(12, 2) not null check (subtotal >= 0),
  discount_amount           numeric(12, 2) not null default 0 check (discount_amount >= 0),
  service_fee               numeric(12, 2) not null default 0 check (service_fee >= 0),
  tax_rate                  numeric(6, 4) not null check (tax_rate >= 0),
  tax_amount                numeric(12, 2) not null check (tax_amount >= 0),
  total                     numeric(12, 2) not null check (total >= 0),
  currency                  text not null default 'PKR',
  -- the lines exactly as printed: [{name, variant, quantity, unitPrice, lineTotal}]
  lines                     jsonb not null,
  -- tax authority (PRA today; FBR possible): never decides whether the sale happened
  authority                 text not null default 'pra' check (authority in ('pra', 'fbr')),
  status                    text not null default 'pending' check (status in ('pending', 'synced', 'failed')),
  authority_invoice_number  text,
  qr_payload                text,
  attempts                  integer not null default 0 check (attempts >= 0),
  next_attempt_at           timestamptz not null default now(),
  locked_until              timestamptz,
  last_error                text,
  synced_at                 timestamptz,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  unique (device_id, invoice_seq),
  unique (restaurant_id, invoice_number),
  check ((kind = 'credit_note') = (original_invoice_id is not null)),
  check (status <> 'synced' or (authority_invoice_number is not null and synced_at is not null))
);

create unique index fiscal_invoices_one_sale_per_order on fiscal_invoices (order_id) where kind = 'sale';
create unique index fiscal_invoices_one_credit_note on fiscal_invoices (original_invoice_id) where kind = 'credit_note';
create index fiscal_invoices_due_idx on fiscal_invoices (next_attempt_at) where status <> 'synced';
create index fiscal_invoices_shift_idx on fiscal_invoices (shift_id);
create index fiscal_invoices_restaurant_idx on fiscal_invoices (restaurant_id, issued_at desc);
create trigger set_updated_at before update on fiscal_invoices for each row execute function app.set_updated_at();

-- What was issued never changes: only the authority's answer (status, number, QR, retry bookkeeping) is
-- written later, and a synced invoice's answer is final. Corrections are credit notes.
create or replace function app.guard_fiscal_invoice()
returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    if app.is_relation_owner(tg_relid) then return old; end if;
    raise exception 'An issued invoice cannot be deleted; issue a credit note instead' using errcode = 'check_violation';
  end if;
  if (old.restaurant_id, old.location_id, old.order_id, old.device_id, old.shift_id, old.kind, old.original_invoice_id,
      old.invoice_seq, old.invoice_number, old.issued_at, old.cashier_id, old.cashier_name, old.payment_method,
      old.subtotal, old.discount_amount, old.service_fee, old.tax_rate, old.tax_amount, old.total, old.currency,
      old.lines, old.authority, old.created_at)
     is distinct from
     (new.restaurant_id, new.location_id, new.order_id, new.device_id, new.shift_id, new.kind, new.original_invoice_id,
      new.invoice_seq, new.invoice_number, new.issued_at, new.cashier_id, new.cashier_name, new.payment_method,
      new.subtotal, new.discount_amount, new.service_fee, new.tax_rate, new.tax_amount, new.total, new.currency,
      new.lines, new.authority, new.created_at) then
    raise exception 'An issued invoice cannot be changed; issue a credit note instead' using errcode = 'check_violation';
  end if;
  if old.status = 'synced' and (
       new.status <> 'synced'
       or new.authority_invoice_number is distinct from old.authority_invoice_number
       or new.qr_payload is distinct from old.qr_payload
       or new.synced_at is distinct from old.synced_at) then
    raise exception 'A reported invoice''s authority details cannot be changed' using errcode = 'check_violation';
  end if;
  return new;
end $$;

create trigger guard_fiscal_invoice before update or delete on fiscal_invoices
  for each row execute function app.guard_fiscal_invoice();

-- every request/response exchanged with the authority (the request/response log)
create table fiscal_invoice_attempts (
  id                  uuid primary key default gen_random_uuid(),
  restaurant_id       uuid not null references restaurants (id) on delete cascade,
  fiscal_invoice_id   uuid not null references fiscal_invoices (id) on delete cascade,
  attempt             integer not null check (attempt > 0),
  adapter             text not null,
  outcome             text not null check (outcome in ('synced', 'retryable', 'rejected')),
  request_payload     jsonb not null,
  response_payload    jsonb,
  error               text,
  duration_ms         integer,
  created_at          timestamptz not null default now()
);

create index fiscal_invoice_attempts_invoice_idx on fiscal_invoice_attempts (fiscal_invoice_id, attempt);

-- -----------------------------------------------------------------------------
-- audit_log (append-only)
-- -----------------------------------------------------------------------------
create table audit_log (
  id               uuid primary key default gen_random_uuid(),
  restaurant_id    uuid not null references restaurants (id) on delete cascade,
  location_id      uuid,
  actor_member_id  uuid,
  actor_name       text not null,
  action           text not null check (char_length(action) between 1 and 80),
  entity_type      text not null,
  entity_id        uuid,
  details          jsonb not null default '{}'::jsonb,
  created_at       timestamptz not null default now()
);

create index audit_log_restaurant_idx on audit_log (restaurant_id, created_at desc);
create index audit_log_entity_idx on audit_log (entity_type, entity_id);

create or replace function app.guard_append_only()
returns trigger language plpgsql as $$
begin
  if app.is_relation_owner(tg_relid) then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  raise exception '% is append-only', tg_table_name using errcode = 'check_violation';
end $$;

create trigger guard_audit_log before update or delete on audit_log
  for each row execute function app.guard_append_only();
create trigger guard_fiscal_invoice_attempts before update or delete on fiscal_invoice_attempts
  for each row execute function app.guard_append_only();

-- -----------------------------------------------------------------------------
-- RLS: staff read their restaurant's rows, branch-scoped staff only their branch's
-- (0035 pattern: grants computed once per statement). Writes go through app_service
-- after the service checked pos.use / pos.manage, like every admin write.
-- -----------------------------------------------------------------------------
alter table pos_devices enable row level security;
alter table pos_shifts enable row level security;
alter table fiscal_invoices enable row level security;
alter table fiscal_invoice_attempts enable row level security;
alter table audit_log enable row level security;

create policy pos_devices_team_select on pos_devices for select using (
  restaurant_id = any (coalesce((select app.permitted_restaurant_ids('pos.use')), '{}'))
  and (restaurant_id <> all (coalesce((select app.branch_scoped_restaurant_ids()), '{}'))
       or location_id = any (coalesce((select app.member_location_ids()), '{}')))
);
create policy pos_shifts_team_select on pos_shifts for select using (
  restaurant_id = any (coalesce((select app.permitted_restaurant_ids('pos.use')), '{}'))
  and (restaurant_id <> all (coalesce((select app.branch_scoped_restaurant_ids()), '{}'))
       or location_id = any (coalesce((select app.member_location_ids()), '{}')))
);
create policy fiscal_invoices_team_select on fiscal_invoices for select using (
  restaurant_id = any (coalesce((select app.permitted_restaurant_ids('pos.use')), '{}'))
  and (restaurant_id <> all (coalesce((select app.branch_scoped_restaurant_ids()), '{}'))
       or location_id = any (coalesce((select app.member_location_ids()), '{}')))
);
create policy fiscal_invoice_attempts_team_select on fiscal_invoice_attempts for select using (
  restaurant_id = any (coalesce((select app.permitted_restaurant_ids('pos.manage')), '{}'))
);
create policy audit_log_team_select on audit_log for select using (
  restaurant_id = any (coalesce((select app.permitted_restaurant_ids('pos.manage')), '{}'))
  and (location_id is null
       or restaurant_id <> all (coalesce((select app.branch_scoped_restaurant_ids()), '{}'))
       or location_id = any (coalesce((select app.member_location_ids()), '{}')))
);

-- 0029's write guard as a backstop on the new tables: a write pinned to another restaurant, or by a branch-scoped
-- member (cashier/manager) to another branch's till, shift or invoice, fails even through app_service.
do $$
declare
  spec text[];
begin
  foreach spec slice 1 in array array[
    array['pos_devices',             'location_id'],
    array['pos_shifts',              'location_id'],
    array['fiscal_invoices',         'location_id'],
    array['fiscal_invoice_attempts', ''],
    array['audit_log',               'location_id']
  ] loop
    execute format('drop trigger if exists guard_scoped_write on %I', spec[1]);
    execute format(
      'create trigger guard_scoped_write before insert or update or delete on %I
         for each row execute function app.guard_scoped_write(%L, %L)',
      spec[1], spec[2], ''
    );
  end loop;
end;
$$;

-- 0006 granted "all tables" once; new tables need their own grants. No DELETE for app roles.
grant select on pos_devices, pos_shifts, fiscal_invoices, fiscal_invoice_attempts, audit_log to app_runtime;
grant select, insert, update on pos_devices, pos_shifts, fiscal_invoices to app_service;
grant select, insert on fiscal_invoice_attempts, audit_log to app_service;
grant execute on function app.is_relation_owner(oid) to app_runtime, app_service;
