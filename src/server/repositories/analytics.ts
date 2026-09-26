import { toMoney } from "@/shared/money";
import type { OrderStatus } from "@/shared/contract/enums";
import { getDb } from "@/server/db/registry";
import { type RequestContext } from "@/server/context";
import { dateOnly, num, str, type Row } from "@/server/db/mappers";

/**
 * Dashboard + analytics queries. All date bucketing happens in the restaurant
 * timezone so "today" means the restaurant's today, not the server's.
 */

export interface DashboardStats {
  todaySales: string;
  todayOrders: number;
  yesterdaySales: string;
  pendingOrders: number;
  activeOrders: number;
  completedToday: number;
  cancelledToday: number;
  averageOrderValue: string;
  monthRevenue: string;
  customerCount: number;
  newCustomersThisMonth: number;
  upcomingReservations: number;
  pendingReviews: number;
  lowAvailabilityItems: number;
  ordersByStatus: Record<OrderStatus, number>;
  ordersByType: { orderType: string; count: number; total: string }[];
  paymentSplit: { method: string; count: number; total: string }[];
}

export async function getDashboardStats(
  restaurantId: string,
  timezone: string,
  ctx: RequestContext,
): Promise<DashboardStats> {
  const db = getDb({ restaurantId });
  return db.read({ ...ctx, restaurantId }, async (tx) => {
    const totals = await tx.queryOne<Row>(
      `select
         coalesce(sum(total) filter (where (created_at at time zone $2)::date = (now() at time zone $2)::date
                                       and status <> 'cancelled'), 0) as today_sales,
         count(*) filter (where (created_at at time zone $2)::date = (now() at time zone $2)::date) as today_orders,
         coalesce(sum(total) filter (where (created_at at time zone $2)::date = (now() at time zone $2)::date - 1
                                       and status <> 'cancelled'), 0) as yesterday_sales,
         count(*) filter (where status = 'pending') as pending_orders,
         count(*) filter (where status in ('confirmed','preparing','ready','out_for_delivery')) as active_orders,
         count(*) filter (where status = 'completed'
                            and (created_at at time zone $2)::date = (now() at time zone $2)::date) as completed_today,
         count(*) filter (where status = 'cancelled'
                            and (created_at at time zone $2)::date = (now() at time zone $2)::date) as cancelled_today,
         coalesce(avg(total) filter (where status <> 'cancelled'
                                       and (created_at at time zone $2)::date = (now() at time zone $2)::date), 0) as aov,
         coalesce(sum(total) filter (where status <> 'cancelled'
                                       and date_trunc('month', created_at at time zone $2)
                                         = date_trunc('month', now() at time zone $2)), 0) as month_revenue
       from orders where restaurant_id = $1`,
      [restaurantId, timezone],
    );

    const statusRows = await tx.query<Row>(
      `select status, count(*) as count from orders where restaurant_id = $1 group by status`,
      [restaurantId],
    );
    const ordersByStatus = {
      pending: 0, confirmed: 0, preparing: 0, ready: 0, out_for_delivery: 0, completed: 0, cancelled: 0,
    } as Record<OrderStatus, number>;
    for (const row of statusRows) ordersByStatus[str(row.status) as OrderStatus] = num(row.count);

    const typeRows = await tx.query<Row>(
      `select order_type, count(*) as count, coalesce(sum(total),0) as total
         from orders
        where restaurant_id = $1 and status <> 'cancelled'
          and created_at >= now() - interval '30 days'
        group by order_type order by count desc`,
      [restaurantId],
    );

    const paymentRows = await tx.query<Row>(
      `select method, count(*) as count, coalesce(sum(amount),0) as total
         from payments
        where restaurant_id = $1 and status = 'paid' and created_at >= now() - interval '30 days'
        group by method order by total desc`,
      [restaurantId],
    );

    const customers = await tx.queryOne<Row>(
      `select count(*) as total,
              count(*) filter (where date_trunc('month', created_at) = date_trunc('month', now())) as new_this_month
         from customers where restaurant_id = $1`,
      [restaurantId],
    );

    const reservations = await tx.queryOne<Row>(
      `select count(*) as upcoming from reservations
        where restaurant_id = $1 and reservation_date >= current_date
          and status in ('pending','confirmed')`,
      [restaurantId],
    );

    const reviews = await tx.queryOne<Row>(
      `select count(*) as pending from reviews where restaurant_id = $1 and status = 'pending'`,
      [restaurantId],
    );

    const unavailable = await tx.queryOne<Row>(
      `select count(*) as count from menu_items where restaurant_id = $1 and is_active and not is_available`,
      [restaurantId],
    );

    return {
      todaySales: toMoney(str(totals?.today_sales ?? 0)),
      todayOrders: num(totals?.today_orders),
      yesterdaySales: toMoney(str(totals?.yesterday_sales ?? 0)),
      pendingOrders: num(totals?.pending_orders),
      activeOrders: num(totals?.active_orders),
      completedToday: num(totals?.completed_today),
      cancelledToday: num(totals?.cancelled_today),
      averageOrderValue: toMoney(str(totals?.aov ?? 0)),
      monthRevenue: toMoney(str(totals?.month_revenue ?? 0)),
      customerCount: num(customers?.total),
      newCustomersThisMonth: num(customers?.new_this_month),
      upcomingReservations: num(reservations?.upcoming),
      pendingReviews: num(reviews?.pending),
      lowAvailabilityItems: num(unavailable?.count),
      ordersByStatus,
      ordersByType: typeRows.map((row) => ({
        orderType: str(row.order_type),
        count: num(row.count),
        total: toMoney(str(row.total)),
      })),
      paymentSplit: paymentRows.map((row) => ({
        method: str(row.method),
        count: num(row.count),
        total: toMoney(str(row.total)),
      })),
    };
  });
}

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
