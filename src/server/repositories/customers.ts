import { getDb } from "@/server/db/registry";
import { type RequestContext } from "@/server/context";
import { errors } from "@/server/errors";
import { mapAddress, mapCustomer, num, str, type Row } from "@/server/db/mappers";
import type { Customer, CustomerAddress } from "@/shared/contract/models";
import type { Paginated } from "@/shared/contract/api";
import { paginate } from "@/shared/contract/api";

const CUSTOMER_COLUMNS = `*`;

export interface CustomerListFilters {
  search?: string;
  page?: number;
  pageSize?: number;
  sort?: "recent" | "spend";
}

export async function listCustomers(
  restaurantId: string,
  filters: CustomerListFilters,
  ctx: RequestContext,
): Promise<Paginated<Customer>> {
  const db = getDb({ restaurantId });
  return db.read(ctx, async (tx) => {
    const page = filters.page ?? 1;
    const pageSize = filters.pageSize ?? 20;
    const params: unknown[] = [restaurantId];
    let where = "restaurant_id = $1";
    if (filters.search?.trim()) {
      params.push(`%${filters.search.trim()}%`);
      where += ` and (full_name ilike $${params.length} or phone ilike $${params.length} or email ilike $${params.length})`;
    }
    const total = await tx.queryCount(`select count(*) from customers where ${where}`, params);
    const order = filters.sort === "spend" ? "total_spent desc" : "coalesce(last_order_at, created_at) desc";
    const rows = await tx.query<Row>(
      `select ${CUSTOMER_COLUMNS} from customers where ${where} order by ${order} limit ${pageSize} offset ${(page - 1) * pageSize}`,
      params,
    );
    return paginate(rows.map(mapCustomer), total, page, pageSize);
  });
}

export async function getCustomerById(customerId: string, ctx: RequestContext): Promise<Customer | null> {
  const row = await getDb(ctx).queryOne<Row>(ctx, `select ${CUSTOMER_COLUMNS} from customers where id = $1`, [customerId]);
  return row ? mapCustomer(row) : null;
}

export async function markCustomerEmailVerified(customerId: string, ctx: RequestContext = {}): Promise<void> {
  await getDb(ctx).write(ctx, (tx) =>
    tx.query(`update customers set is_email_verified = true where id = $1 and is_email_verified = false`, [customerId]),
  );
}

/** First Google sign-in for an account that started as email/password: link the Google sub onto it. */
export async function linkGoogleToCustomer(customerId: string, googleSub: string, ctx: RequestContext): Promise<void> {
  await getDb(ctx).write(ctx, (tx) =>
    tx.query(
      `update customers set google_sub = $2, is_email_verified = true,
         auth_provider = case when auth_provider = 'password' then 'password+google' else auth_provider end
       where id = $1`,
      [customerId, googleSub],
    ),
  );
}

export interface GoogleCustomerInput {
  restaurantId: string;
  fullName: string;
  email: string;
  phone: string;
  googleSub: string;
}

/** Creates (or upgrades a same-phone guest row into) a Google-linked customer account. */
export async function createGoogleCustomer(input: GoogleCustomerInput, ctx: RequestContext): Promise<Customer> {
  const row = await getDb(ctx).write(ctx, (tx) =>
    tx.queryOne<Row>(
      `insert into customers (restaurant_id, full_name, email, phone, google_sub, auth_provider, is_email_verified, is_guest)
       values ($1,$2,$3,$4,$5,'google',true,false)
       on conflict (restaurant_id, phone) do update set
         full_name = excluded.full_name, email = excluded.email, google_sub = excluded.google_sub,
         auth_provider = case when customers.auth_provider = 'password' then 'password+google' else excluded.auth_provider end,
         is_email_verified = true, is_guest = false
       returning ${CUSTOMER_COLUMNS}`,
      [input.restaurantId, input.fullName, input.email.trim().toLowerCase(), input.phone.trim(), input.googleSub],
    ),
  );
  if (!row) throw new Error("Unable to create the account");
  return mapCustomer(row);
}

export async function getCustomerByPhone(
  restaurantId: string,
  phone: string,
  ctx: RequestContext = {},
): Promise<Customer | null> {
  const row = await getDb({ restaurantId }).queryOne<Row>(
    ctx,
    `select ${CUSTOMER_COLUMNS} from customers where restaurant_id = $1 and phone = $2 limit 1`,
    [restaurantId, phone],
  );
  return row ? mapCustomer(row) : null;
}

/**
 * Privileged (`write`/`asService`): the caller doesn't know the customer's
 * `id` yet — that's what this resolves — so there is no `ctx.customerId` to
 * put in RLS's `app.current_customer_id()`, and `customers_self` (0006:
 * `id = app.current_customer_id()`) would block every row under app_runtime
 * regardless of which email/google_sub is queried. Only used to bootstrap
 * identity (sign-in, "does this Google account already have an account
 * here"); once the customer id is known, use `getCustomerById` instead.
 */
export async function getCustomerByEmail(restaurantId: string, email: string, ctx: RequestContext = {}): Promise<Customer | null> {
  const row = await getDb(ctx).write(ctx, (tx) =>
    tx.queryOne<Row>(
      `select ${CUSTOMER_COLUMNS} from customers where restaurant_id = $1 and lower(email) = lower($2) and not is_guest limit 1`,
      [restaurantId, email.trim()],
    ),
  );
  return row ? mapCustomer(row) : null;
}

/** Matches by Google sub first, falling back to email — the same account may have signed up with a password first. */
export async function getCustomerByGoogleSubOrEmail(
  restaurantId: string,
  googleSub: string,
  email: string,
  ctx: RequestContext = {},
): Promise<Customer | null> {
  const row = await getDb(ctx).write(ctx, (tx) =>
    tx.queryOne<Row>(
      `select ${CUSTOMER_COLUMNS} from customers
        where restaurant_id = $1 and not is_guest and (google_sub = $2 or lower(email) = lower($3))
        order by (google_sub = $2) desc
        limit 1`,
      [restaurantId, googleSub, email.trim()],
    ),
  );
  return row ? mapCustomer(row) : null;
}

export interface UpsertCustomerInput {
  restaurantId: string;
  fullName: string;
  phone: string;
  email?: string | null;
  marketingOptIn?: boolean;
  isGuest?: boolean;
}

/** Guests are real customer records; the phone number is the natural key. */
export async function upsertCustomer(
  input: UpsertCustomerInput,
  ctx: RequestContext,
  tx?: { query: <T extends Row>(text: string, params?: readonly unknown[]) => Promise<T[]>; queryOne: <T extends Row>(text: string, params?: readonly unknown[]) => Promise<T | null> },
): Promise<Customer> {
  const run = async (db: { queryOne: <T extends Row>(text: string, params?: readonly unknown[]) => Promise<T | null> }) => {
    const existing = await db.queryOne<Row>(
      `select ${CUSTOMER_COLUMNS} from customers where restaurant_id = $1 and phone = $2 limit 1`,
      [input.restaurantId, input.phone],
    );
    if (existing) {
      return db.queryOne<Row>(
        `update customers set
           full_name = coalesce(nullif($2,''), full_name),
           email = coalesce(nullif($3,''), email),
           marketing_opt_in = coalesce($4, marketing_opt_in),
           is_guest = case when $5 = false then false else is_guest end
         where id = $1 returning ${CUSTOMER_COLUMNS}`,
        [str(existing.id), input.fullName, input.email ?? "", input.marketingOptIn ?? null, input.isGuest ?? null],
      );
    }
    return db.queryOne<Row>(
      `insert into customers (restaurant_id, full_name, email, phone, marketing_opt_in, is_guest)
       values ($1,$2,$3,$4,coalesce($5,false),coalesce($6,true))
       returning ${CUSTOMER_COLUMNS}`,
      [input.restaurantId, input.fullName, input.email ?? null, input.phone,
       input.marketingOptIn ?? null, input.isGuest ?? null],
    );
  };

  const row = tx ? await run(tx) : await getDb({ restaurantId: input.restaurantId }).write(ctx, (db) => run(db));
  if (!row) throw new Error("Unable to save the customer");
  return mapCustomer(row);
}

export async function listAddresses(customerId: string, ctx: RequestContext): Promise<CustomerAddress[]> {
  const rows = await getDb(ctx).query<Row>(
    ctx,
    `select * from customer_addresses where customer_id = $1 order by is_default desc, created_at`,
    [customerId],
  );
  return rows.map(mapAddress);
}

export interface AddressInput {
  label?: string;
  recipientName?: string | null;
  phone?: string | null;
  addressLine1: string;
  addressLine2?: string | null;
  area?: string | null;
  city?: string | null;
  postalCode?: string | null;
  deliveryNotes?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  isDefault?: boolean;
}

export async function saveAddress(
  customerId: string,
  restaurantId: string,
  input: AddressInput,
  ctx: RequestContext,
): Promise<CustomerAddress> {
  const db = getDb({ restaurantId });
  return db.asRuntime({ ...ctx, customerId }, async (tx) => {
    if (input.isDefault) {
      await tx.query(`update customer_addresses set is_default = false where customer_id = $1`, [customerId]);
    }
    const row = await tx.queryOne<Row>(
      `insert into customer_addresses
         (restaurant_id, customer_id, label, recipient_name, phone, address_line1, address_line2, area, city,
          postal_code, delivery_notes, latitude, longitude, is_default)
       values ($1,$2,coalesce($3,'Home'),$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,
               coalesce($14, not exists (select 1 from customer_addresses where customer_id = $2)))
       returning *`,
      [
        restaurantId, customerId, input.label ?? null, input.recipientName ?? null, input.phone ?? null,
        input.addressLine1, input.addressLine2 ?? null, input.area ?? null, input.city ?? null,
        input.postalCode ?? null, input.deliveryNotes ?? null, input.latitude ?? null, input.longitude ?? null,
        input.isDefault ?? null,
      ],
    );
    if (!row) throw new Error("Unable to save the address");
    return mapAddress(row);
  });
}

/** Deletes one of this customer's own addresses (RLS + an explicit owner predicate); false when not theirs. */
export async function deleteAddress(addressId: string, customerId: string, restaurantId: string, ctx: RequestContext): Promise<boolean> {
  return getDb({ restaurantId }).asRuntime({ ...ctx, restaurantId, customerId }, async (tx) => {
    const rows = await tx.query<Row>(
      `delete from customer_addresses where id = $1 and customer_id = $2 returning id`,
      [addressId, customerId],
    );
    return rows.length > 0;
  });
}

/** Updates one of this customer's own addresses; null when the address is not theirs. */
export async function updateAddress(
  addressId: string,
  customerId: string,
  restaurantId: string,
  input: AddressInput,
  ctx: RequestContext,
): Promise<CustomerAddress | null> {
  return getDb({ restaurantId }).asRuntime({ ...ctx, restaurantId, customerId }, async (tx) => {
    if (input.isDefault) {
      await tx.query(`update customer_addresses set is_default = false where customer_id = $1 and id <> $2`, [customerId, addressId]);
    }
    const row = await tx.queryOne<Row>(
      `update customer_addresses set
         label = coalesce($3, label), address_line1 = $4, address_line2 = $5, area = $6, city = $7,
         postal_code = $8, delivery_notes = $9, is_default = coalesce($10, is_default), updated_at = now()
       where id = $1 and customer_id = $2
       returning *`,
      [
        addressId, customerId, input.label ?? null, input.addressLine1, input.addressLine2 ?? null, input.area ?? null,
        input.city ?? null, input.postalCode ?? null, input.deliveryNotes ?? null, input.isDefault ?? null,
      ],
    );
    return row ? mapAddress(row) : null;
  });
}

/**
 * The customer's own editable profile: phone (optional) and the details kept in metadata.profile
 * (gender, date of birth; merged, so other metadata keys are untouched). A phone already used by another
 * customer of this restaurant (unique per restaurant) is refused with a CONFLICT instead of a raw 23505.
 */
export async function updateCustomerProfile(
  customerId: string,
  restaurantId: string,
  input: { phone?: string | null; gender: string | null; dateOfBirth: string | null },
  ctx: RequestContext,
): Promise<Customer> {
  try {
    const row = await getDb({ restaurantId }).write({ ...ctx, restaurantId, customerId }, (tx) =>
      tx.queryOne<Row>(
        `update customers set
           phone = coalesce(nullif($3, ''), phone),
           metadata = jsonb_set(coalesce(metadata, '{}'::jsonb), '{profile}',
                                coalesce(metadata->'profile', '{}'::jsonb) || $4::jsonb),
           updated_at = now()
         where id = $1 and restaurant_id = $2
         returning ${CUSTOMER_COLUMNS}`,
        [customerId, restaurantId, input.phone ?? null, JSON.stringify({ gender: input.gender, dateOfBirth: input.dateOfBirth })],
      ),
    );
    if (!row) throw errors.notFound("Customer");
    return mapCustomer(row);
  } catch (error) {
    if ((error as { code?: string }).code === "23505") {
      throw errors.conflict("That mobile number is already used by another account here. Please use a different number.");
    }
    throw error;
  }
}

/** Aggregates for the customer detail screen. */
export async function getCustomerStats(
  customerId: string,
  ctx: RequestContext,
): Promise<{ orders: number; spent: string; averageOrderValue: string; lastOrderAt: string | null }> {
  const db = getDb(ctx);
  return db.read(ctx, async (tx) => {
    const row = await tx.queryOne<Row>(
      `select count(*) as orders,
              coalesce(sum(total) filter (where status = 'completed'), 0) as spent,
              coalesce(avg(total) filter (where status <> 'cancelled'), 0) as average_order_value,
              max(created_at) as last_order_at
         from orders where customer_id = $1`,
      [customerId],
    );
    const orders = row ? num(row.orders) : 0;
    const spent = row ? Number.parseFloat(str(row.spent) || "0") : 0;
    return {
      orders,
      spent: spent.toFixed(2),
      averageOrderValue: (orders > 0 ? spent / orders : 0).toFixed(2),
      lastOrderAt: row && row.last_order_at ? new Date(String(row.last_order_at)).toISOString() : null,
    };
  });
}
