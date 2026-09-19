import { getDb, type RequestContext } from "./pool";
import { mapPayment, num, str, type Row } from "./map";
import type { Payment } from "../contract/models";
import type { PaymentMethod, PaymentStatus } from "../contract/enums";
import { paginate, type Paginated } from "../contract/api";

export interface PaymentListFilters {
  status?: PaymentStatus | "all";
  method?: PaymentMethod;
  page?: number;
  pageSize?: number;
}

export async function listPayments(
  restaurantId: string,
  filters: PaymentListFilters,
  ctx: RequestContext,
): Promise<Paginated<Payment & { orderNumber: string; customerName: string }>> {
  const db = getDb();
  return db.read({ ...ctx, restaurantId }, async (tx) => {
    const page = filters.page ?? 1;
    const pageSize = filters.pageSize ?? 20;
    const params: unknown[] = [restaurantId];
    const conditions = ["p.restaurant_id = $1"];
    if (filters.status && filters.status !== "all") {
      params.push(filters.status);
      conditions.push(`p.status = $${params.length}::payment_status`);
    }
    if (filters.method) {
      params.push(filters.method);
      conditions.push(`p.method = $${params.length}::payment_method`);
    }
    const where = conditions.join(" and ");
    const total = await tx.queryCount(
      `select count(*) from payments p join orders o on o.id = p.order_id where ${where}`,
      params,
    );
    const rows = await tx.query<Row>(
      `select p.*, o.order_number, o.customer_name
         from payments p join orders o on o.id = p.order_id
        where ${where}
        order by p.created_at desc
        limit ${pageSize} offset ${(page - 1) * pageSize}`,
      params,
    );
    return paginate(
      rows.map((row) => ({
        ...mapPayment(row),
        orderNumber: str(row.order_number),
        customerName: str(row.customer_name),
      })),
      total,
      page,
      pageSize,
    );
  });
}

export async function getPaymentByOrder(orderId: string, ctx: RequestContext): Promise<Payment | null> {
  const row = await getDb().queryOne<Row>(
    ctx,
    `select * from payments where order_id = $1 order by created_at desc limit 1`,
    [orderId],
  );
  return row ? mapPayment(row) : null;
}

/** Cash / terminal confirmations recorded by staff. */
export async function recordManualPayment(
  params: { orderId: string; restaurantId: string; method: PaymentMethod; amount: string; currency: string; note?: string | null },
  ctx: RequestContext,
): Promise<Payment> {
  const db = getDb();
  return db.write(ctx, async (tx) => {
    const row = await tx.queryOne<Row>(
      `insert into payments (restaurant_id, order_id, provider, method, status, amount, currency, paid_at)
       values ($1,$2,'manual',$3::payment_method,'paid',$4::numeric,$5, now())
       returning *`,
      [params.restaurantId, params.orderId, params.method, params.amount, params.currency],
    );
    if (!row) throw new Error("Unable to record the payment");
    if (params.note) {
      await tx.query(`update payments set provider_payload = jsonb_build_object('note', $2::text) where id = $1`, [
        str(row.id),
        params.note,
      ]);
    }
    return mapPayment(row);
  });
}

export interface PaymentMethodSummary {
  method: PaymentMethod;
  count: number;
  total: string;
}

export async function summarizePaymentsByMethod(
  restaurantId: string,
  ctx: RequestContext,
  sinceIso?: string,
): Promise<PaymentMethodSummary[]> {
  const db = getDb();
  const params: unknown[] = [restaurantId];
  let where = "restaurant_id = $1 and status = 'paid'";
  if (sinceIso) {
    params.push(sinceIso);
    where += ` and created_at >= $${params.length}::timestamptz`;
  }
  const rows = await db.read({ ...ctx, restaurantId }, async (tx) =>
    tx.query<Row>(
      `select method, count(*) as count, coalesce(sum(amount),0) as total from payments where ${where} group by method`,
      params,
    ),
  );
  return rows.map((row) => ({
    method: str(row.method) as PaymentMethod,
    count: num(row.count),
    total: num(row.total).toFixed(2),
  }));
}
