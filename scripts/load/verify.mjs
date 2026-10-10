// Data-integrity checks after a load run, against the LOCAL load-test database only.
//   LOADTEST_DB_URL=postgresql://app_owner:app_owner@localhost:54329/restaurant_platform_test node scripts/load/verify.mjs [sinceIso]
// Every order the run's test customers placed: no duplicate idempotency keys, every order has lines, exactly one
// payment of the order's total, history, a delivery row for delivery orders, totals that add up; outbox states.
import pg from "pg";

const DB = process.env.LOADTEST_DB_URL ?? "";
if (!/^postgres(ql)?:\/\/[^@]*@(localhost|127\.0\.0\.1)[:/]/.test(DB)) throw new Error("LOADTEST_DB_URL must be a local database");
const since = process.argv[2] ?? "1970-01-01";
const client = new pg.Client({ connectionString: DB });
await client.connect();
const q = async (sql, params = []) => (await client.query(sql, params)).rows;
const LT = `o.customer_id in (select id from customers where email like 'lt-%@loadtest.example')`;

const [summary] = await q(
  `select count(*)::int as orders,
          count(distinct o.customer_id)::int as customers,
          count(*) filter (where o.idempotency_key is null)::int as without_key,
          min(o.created_at) as first, max(o.created_at) as last
     from orders o where ${LT} and o.created_at >= $1`,
  [since],
);
const perRestaurant = await q(
  `select r.slug, count(*)::int as orders from orders o join restaurants r on r.id = o.restaurant_id
    where ${LT} and o.created_at >= $1 group by r.slug order by r.slug`,
  [since],
);
const dupKeys = await q(
  `select o.customer_id, o.idempotency_key, count(*)::int n from orders o
    where ${LT} and o.idempotency_key is not null and o.created_at >= $1
    group by 1, 2 having count(*) > 1`,
  [since],
);
const noItems = await q(
  `select o.order_number from orders o where ${LT} and o.created_at >= $1
      and not exists (select 1 from order_items i where i.order_id = o.id)`,
  [since],
);
const paymentMismatch = await q(
  `select o.order_number, o.total, p.amount, (select count(*) from payments p2 where p2.order_id = o.id)::int as payments
     from orders o left join payments p on p.order_id = o.id
    where ${LT} and o.created_at >= $1
      and (p.id is null or p.amount <> o.total or (select count(*) from payments p2 where p2.order_id = o.id) <> 1)`,
  [since],
);
const totalMismatch = await q(
  `select o.order_number, o.subtotal, o.total,
          (select coalesce(sum(i.line_total), 0) from order_items i where i.order_id = o.id) as lines
     from orders o where ${LT} and o.created_at >= $1
      and (o.subtotal <> (select coalesce(sum(i.line_total), 0) from order_items i where i.order_id = o.id)
           or o.total <> o.subtotal - o.discount_amount + o.delivery_fee + o.tax_amount + o.service_fee + o.tip_amount)`,
  [since],
);
const noHistory = await q(
  `select o.order_number from orders o where ${LT} and o.created_at >= $1
      and not exists (select 1 from order_status_history h where h.order_id = o.id)`,
  [since],
);
const deliveryMissing = await q(
  `select o.order_number from orders o where ${LT} and o.created_at >= $1 and o.order_type = 'delivery'
      and not exists (select 1 from deliveries d where d.order_id = o.id)`,
  [since],
);
const outbox = await q(
  `select e.status, e.email_state, e.push_state, count(*)::int n from notification_events e
     join orders o on o.id = e.order_id where ${LT} and o.created_at >= $1 group by 1, 2, 3 order by 4 desc`,
  [since],
);
const statuses = await q(
  `select o.status, count(*)::int n from orders o where ${LT} and o.created_at >= $1 group by 1 order by 2 desc`,
  [since],
);

console.log(JSON.stringify({
  summary, perRestaurant, statuses,
  duplicateIdempotencyKeys: dupKeys.length,
  ordersWithoutItems: noItems.length,
  paymentMismatches: paymentMismatch.length,
  totalMismatches: totalMismatch.length,
  ordersWithoutHistory: noHistory.length,
  deliveryOrdersWithoutDelivery: deliveryMissing.length,
  outbox,
  samples: { dupKeys: dupKeys.slice(0, 3), paymentMismatch: paymentMismatch.slice(0, 3), totalMismatch: totalMismatch.slice(0, 3) },
}, null, 2));
await client.end();
