import { getDb, type RequestContext } from "./pool";
import { mapAddress, mapCustomer, num, str, type Row } from "./map";
import type { Customer, CustomerAddress } from "../contract/models";
import type { Paginated } from "../contract/api";
import { paginate } from "../contract/api";

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
  const db = getDb();
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
  const row = await getDb().queryOne<Row>(ctx, `select ${CUSTOMER_COLUMNS} from customers where id = $1`, [customerId]);
  return row ? mapCustomer(row) : null;
}

export async function getCustomerByPhone(
  restaurantId: string,
  phone: string,
  ctx: RequestContext = {},
): Promise<Customer | null> {
  const row = await getDb().queryOne<Row>(
    ctx,
    `select ${CUSTOMER_COLUMNS} from customers where restaurant_id = $1 and phone = $2 limit 1`,
    [restaurantId, phone],
  );
  return row ? mapCustomer(row) : null;
}

export async function getCustomerByUserId(userId: string, ctx: RequestContext = {}): Promise<Customer | null> {
  const row = await getDb().queryOne<Row>(ctx, `select ${CUSTOMER_COLUMNS} from customers where user_id = $1 limit 1`, [
    userId,
  ]);
  return row ? mapCustomer(row) : null;
}

export interface UpsertCustomerInput {
  restaurantId: string;
  fullName: string;
  phone: string;
  email?: string | null;
  userId?: string | null;
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
           user_id = coalesce($4, user_id),
           marketing_opt_in = coalesce($5, marketing_opt_in),
           is_guest = case when $4 is not null then false else is_guest end
         where id = $1 returning ${CUSTOMER_COLUMNS}`,
        [str(existing.id), input.fullName, input.email ?? "", input.userId ?? null, input.marketingOptIn ?? null],
      );
    }
    return db.queryOne<Row>(
      `insert into customers (restaurant_id, user_id, full_name, email, phone, marketing_opt_in, is_guest)
       values ($1,$2,$3,$4,$5,coalesce($6,false),coalesce($7,true))
       returning ${CUSTOMER_COLUMNS}`,
      [input.restaurantId, input.userId ?? null, input.fullName, input.email ?? null, input.phone,
       input.marketingOptIn ?? null, input.isGuest ?? null],
    );
  };

  const row = tx ? await run(tx) : await getDb().write(ctx, (db) => run(db));
  if (!row) throw new Error("Unable to save the customer");
  return mapCustomer(row);
}

export async function listAddresses(customerId: string, ctx: RequestContext): Promise<CustomerAddress[]> {
  const rows = await getDb().query<Row>(
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
  const db = getDb();
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

export async function deleteAddress(addressId: string, ctx: RequestContext): Promise<void> {
  await getDb().asRuntime(ctx, async (tx) => {
    await tx.query(`delete from customer_addresses where id = $1`, [addressId]);
  });
}

/** Aggregates for the customer detail screen. */
export async function getCustomerStats(
  customerId: string,
  ctx: RequestContext,
): Promise<{ orders: number; spent: string; averageOrderValue: string; lastOrderAt: string | null }> {
  const db = getDb();
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
