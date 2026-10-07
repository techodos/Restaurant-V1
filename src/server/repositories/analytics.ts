import { toMoney } from "@/shared/money";
import { getDb } from "@/server/db/registry";
import { type RequestContext } from "@/server/context";
import { dateOnly, num, str, type Row } from "@/server/db/mappers";

/**
 * Dashboard + analytics queries. All date bucketing happens in the restaurant
 * timezone so "today" means the restaurant's today, not the server's.
 */

export interface SalesPoint {
  date: string;
  orders: number;
  revenue: string;
  averageOrderValue: string;
}

export async function getSalesSeries(
  restaurantId: string,
  timezone: string,
  days: number,
  ctx: RequestContext,
): Promise<SalesPoint[]> {
  const db = getDb({ restaurantId });
  const safeDays = Math.min(Math.max(days, 1), 90);
  const rows = await db.read({ ...ctx, restaurantId }, async (tx) =>
    tx.query<Row>(
      `with series as (
         select generate_series(
           (now() at time zone $3)::date - ($2::int - 1),
           (now() at time zone $3)::date,
           interval '1 day')::date as day
       )
       select s.day,
              count(o.id) filter (where o.status <> 'cancelled') as orders,
              coalesce(sum(o.total) filter (where o.status <> 'cancelled'), 0) as revenue
         from series s
         left join orders o
           on o.restaurant_id = $1
          and (o.created_at at time zone $3)::date = s.day
        group by s.day
        order by s.day`,
      [restaurantId, safeDays, timezone],
    ),
  );
  return rows.map((row) => {
    const orders = num(row.orders);
    const revenue = num(row.revenue);
    return {
      date: dateOnly(row.day),
      orders,
      revenue: revenue.toFixed(2),
      averageOrderValue: (orders > 0 ? revenue / orders : 0).toFixed(2),
    };
  });
}

export interface PopularItem {
  menuItemId: string | null;
  name: string;
  quantity: number;
  revenue: string;
}

export async function getPopularItems(
  restaurantId: string,
  days: number,
  ctx: RequestContext,
  limit = 8,
): Promise<PopularItem[]> {
  const db = getDb({ restaurantId });
  const rows = await db.read({ ...ctx, restaurantId }, async (tx) =>
    tx.query<Row>(
      `select oi.menu_item_id, oi.item_name as name, sum(oi.quantity) as quantity,
              sum(oi.line_total) as revenue
         from order_items oi
         join orders o on o.id = oi.order_id
        where oi.restaurant_id = $1 and o.status <> 'cancelled'
          and o.created_at >= now() - ($2::int || ' days')::interval
        group by oi.menu_item_id, oi.item_name
        order by quantity desc
        limit $3`,
      [restaurantId, Math.min(Math.max(days, 1), 365), limit],
    ),
  );
  return rows.map((row) => ({
    menuItemId: row.menu_item_id ? str(row.menu_item_id) : null,
    name: str(row.name),
    quantity: num(row.quantity),
    revenue: toMoney(str(row.revenue)),
  }));
}

export interface HourlyLoadPoint {
  hour: number;
  orders: number;
}

/** Orders per hour of day (last 30 days) — drives the staffing chart. */
export async function getHourlyLoad(
  restaurantId: string,
  timezone: string,
  ctx: RequestContext,
): Promise<HourlyLoadPoint[]> {
  const db = getDb({ restaurantId });
  const rows = await db.read({ ...ctx, restaurantId }, async (tx) =>
    tx.query<Row>(
      `select extract(hour from (created_at at time zone $2))::int as hour, count(*) as orders
         from orders
        where restaurant_id = $1 and created_at >= now() - interval '30 days' and status <> 'cancelled'
        group by 1 order by 1`,
      [restaurantId, timezone],
    ),
  );
  return rows.map((row) => ({ hour: num(row.hour), orders: num(row.orders) }));
}

export interface DeliveryPerformance {
  averageMinutes: number;
  onTimeRate: number;
  activeDeliveries: number;
}

export async function getDeliveryPerformance(
  restaurantId: string,
  ctx: RequestContext,
): Promise<DeliveryPerformance> {
  const db = getDb({ restaurantId });
  return db.read({ ...ctx, restaurantId }, async (tx) => {
    const row = await tx.queryOne<Row>(
      `select
         coalesce(avg(extract(epoch from (delivered_at - created_at)) / 60)
                  filter (where status = 'delivered'), 0) as average_minutes,
         count(*) filter (where status = 'delivered'
                            and (estimated_arrival_at is null or delivered_at <= estimated_arrival_at + interval '10 minutes')) as on_time,
         count(*) filter (where status = 'delivered') as delivered,
         count(*) filter (where status in ('unassigned','assigned','picked_up','in_transit')) as active
       from deliveries where restaurant_id = $1 and created_at >= now() - interval '30 days'`,
      [restaurantId],
    );
    const delivered = num(row?.delivered);
    return {
      averageMinutes: Math.round(num(row?.average_minutes)),
      onTimeRate: delivered > 0 ? Math.round((num(row?.on_time) / delivered) * 100) : 0,
      activeDeliveries: num(row?.active),
    };
  });
}
