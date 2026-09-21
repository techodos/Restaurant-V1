/**
 * Database verification — run with `npm run db:verify`.
 *
 * Checks the things a human would otherwise check by hand: schema coverage,
 * seed presence, tenant isolation, pricing arithmetic stored on real orders,
 * order-status integrity and the security guarantees RLS depends on.
 */
import { Client } from "pg";
import { Database } from "../../src/server/db/database";
import { type RequestContext } from "../../src/server/context";
import { loadEnv } from "./env";

loadEnv(".env.local");
if (process.env.VERIFY_DATABASE_URL) process.env.DATABASE_URL = process.env.VERIFY_DATABASE_URL;
if (process.env.VERIFY_DATABASE_URL_SERVICE) process.env.DATABASE_URL_SERVICE = process.env.VERIFY_DATABASE_URL_SERVICE;

const migratorUrl =
  process.env.VERIFY_DATABASE_URL_MIGRATOR ??
  process.env.DATABASE_URL_MIGRATOR ??
  "postgresql://app_owner:app_owner@localhost:5432/restaurant_platform";

const EXPECTED_TABLES = [
  "auth.users",
  "restaurants",
  "restaurant1s",
  "team_members",
  "websites",
  "website_pages",
  "media",
  "menu_categories",
  "menu_items",
  "menu_item_variants",
  "menu_addon_groups",
  "menu_addons",
  "customers",
  "customer_addresses",
  "carts",
  "cart_items",
  "cart_item_addons",
  "coupons",
  "delivery_zones",
  "orders",
  "order_items",
  "order_item_addons",
  "order_status_history",
  "payments",
  "deliveries",
  "reviews",
  "reservations",
  "notification_events",
  "customer_push_tokens",
] as const;

let failures = 0;
let checks = 0;

function check(label: string, condition: boolean, detail?: string) {
  checks += 1;
  if (condition) {
    console.log(`  \u2713 ${label}`);
  } else {
    failures += 1;
    console.log(`  \u2717 ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

function section(title: string) {
  console.log(`\n${title}`);
}

async function main() {
  const admin = new Client({ connectionString: migratorUrl });
  await admin.connect();

  const runtimeUrl = process.env.DATABASE_URL;
  const serviceUrl = process.env.DATABASE_URL_SERVICE;
  if (!runtimeUrl) throw new Error("DATABASE_URL is not set — copy .env.example to .env.local");
  const db = new Database(runtimeUrl, serviceUrl);

  try {
    // ── schema ──────────────────────────────────────────────────────────────
    section("Schema");
    const tables = await admin.query<{ table_schema: string; table_name: string }>(
      `select table_schema, table_name from information_schema.tables
        where table_schema in ('public', 'auth') and table_type = 'BASE TABLE'`,
    );
    // public tables are addressed by bare name (that is how the app queries them)
    const present = new Set(
      tables.rows.map((row) => (row.table_schema === "public" ? row.table_name : `${row.table_schema}.${row.table_name}`)),
    );
    for (const table of EXPECTED_TABLES) {
      if (!present.has(table)) check(`table ${table}`, false, "missing");
    }
    check(`all ${EXPECTED_TABLES.length} domain tables exist`, EXPECTED_TABLES.every((table) => present.has(table)));

    const migrations = await admin.query<{ count: string }>("select count(*) from schema_migrations");
    const migrationCount = Number.parseInt(migrations.rows[0]?.count ?? "0", 10);
    check(`migrations recorded (${migrationCount})`, migrationCount > 0);
    const appTables = tables.rows.filter(
      (row) => row.table_schema === "public" || (row.table_schema === "auth" && row.table_name === "users"),
    );
    check(
      `no unexpected public tables (${appTables.length} total, incl. auth.users)`,
      appTables.length <= EXPECTED_TABLES.length + 1,
    );

    const rlsTables = await admin.query<{ relname: string }>(
      `select c.relname from pg_class c
         join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity`,
    );
    const readableBookkeeping = await admin.query<{ has_table_privilege: boolean }>(
      `select has_table_privilege('app_runtime', 'schema_migrations', 'select') as has_table_privilege`,
    );
    check("application roles cannot read the migration table", readableBookkeeping.rows[0]?.has_table_privilege === false);
    check(
      "row level security enabled on every public table",
      rlsTables.rows.length === 0,
      rlsTables.rows.map((row) => row.relname).join(", "),
    );

    const roles = await admin.query<{ rolname: string; rolsuper: boolean; rolbypassrls: boolean }>(
      `select rolname, rolsuper, rolbypassrls from pg_roles where rolname in ('app_runtime', 'app_service')`,
    );
    const runtimeRole = roles.rows.find((row) => row.rolname === "app_runtime");
    const serviceRole = roles.rows.find((row) => row.rolname === "app_service");
    check("app_runtime cannot bypass RLS", runtimeRole ? !runtimeRole.rolsuper && !runtimeRole.rolbypassrls : false);
    check("app_service is the privileged bypass role", serviceRole ? serviceRole.rolbypassrls : false);

    // ── seed presence ───────────────────────────────────────────────────────
    section("Seed data");
    const counts = await admin.query<{
      restaurants: string;
      locations: string;
      categories: string;
      items: string;
      variants: string;
      addon_groups: string;
      addons: string;
      zones: string;
      coupons: string;
      customers: string;
      orders: string;
      order_items: string;
      reviews: string;
      reservations: string;
      pages: string;
      staff: string;
    }>(
      `select
         (select count(*) from restaurants)          as restaurants,
         (select count(*) from restaurant1s) as locations,
         (select count(*) from menu_categories)      as categories,
         (select count(*) from menu_items)           as items,
         (select count(*) from menu_item_variants)   as variants,
         (select count(*) from menu_addon_groups)    as addon_groups,
         (select count(*) from menu_addons)          as addons,
         (select count(*) from delivery_zones)       as zones,
         (select count(*) from coupons)              as coupons,
         (select count(*) from customers)            as customers,
         (select count(*) from orders)               as orders,
         (select count(*) from order_items)          as order_items,
         (select count(*) from reviews)              as reviews,
         (select count(*) from reservations)         as reservations,
         (select count(*) from website_pages)        as pages,
         (select count(*) from team_members)         as staff`,
    );
    const row = counts.rows[0];
    if (!row) throw new Error("count query returned nothing");
    const summary = [
      ["restaurants", 2],
      ["locations", 2],
      ["categories", 6],
      ["items", 25],
      ["orders", 1],
      ["staff", 2],
      ["pages", 1],
    ] as const;
    for (const [key, minimum] of summary) {
      const value = Number.parseInt(row[key], 10);
      check(`${key}: ${value}`, value >= minimum, `expected at least ${minimum}`);
    }
    console.log(
      `    seed totals → ${row.restaurants} restaurants · ${row.items} items (${row.variants} variants, ${row.addons} add-ons in ${row.addon_groups} groups) · ${row.orders} orders (${row.order_items} lines) · ${row.customers} customers · ${row.reviews} reviews · ${row.reservations} reservations · ${row.coupons} coupons · ${row.zones} zones`,
    );

    const bella = await admin.query<{ id: string; slug: string; timezone: string; currency: string }>(
      `select id, slug, timezone, currency from restaurants where slug = 'bella-napoli'`,
    );
    const bellaRow = bella.rows[0];
    check("bella-napoli exists with a timezone and currency", Boolean(bellaRow?.timezone && bellaRow?.currency));
    if (!bellaRow) throw new Error("seed data missing — run npm run db:seed");

    const other = await admin.query<{ id: string }>(
      `select id from restaurants where slug <> 'bella-napoli' limit 1`,
    );
    check("a second tenant exists (tenant-isolation can be proven)", other.rows.length === 1);

    // ── integrity ───────────────────────────────────────────────────────────
    section("Data integrity");
    const orphans = await admin.query<{ label: string; count: string }>(
      `select 'order_items without an order' as label, count(*)::text as count
         from order_items oi left join orders o on o.id = oi.order_id where o.id is null
       union all
       select 'orders without items', count(*)::text
         from orders o where not exists (select 1 from order_items oi where oi.order_id = o.id)
       union all
       select 'orders without status history', count(*)::text
         from orders o where not exists (select 1 from order_status_history h where h.order_id = o.id)
       union all
       select 'order lines without add-on snapshots', count(*)::text
         from order_items oi
        where oi.addons_total > 0 and not exists (select 1 from order_item_addons a where a.order_item_id = oi.id)
       union all
       select 'deliveries on non-delivery orders', count(*)::text
         from deliveries d join orders o on o.id = d.order_id where o.order_type <> 'delivery'
       union all
       select 'cart items pointing at inactive items', count(*)::text
         from cart_items ci join menu_items mi on mi.id = ci.menu_item_id where not mi.is_active
       union all
       select 'coupons stored with a lowercase code', count(*)::text
         from coupons where code <> upper(code)
       union all
       select 'payments without an order', count(*)::text
         from payments p left join orders o on o.id = p.order_id where o.id is null
       union all
       select 'order line add-on totals that disagree with the add-on snapshots', count(*)::text
         from order_items oi
        where oi.addons_total <> coalesce(
          (select sum(a.unit_price * a.quantity) from order_item_addons a where a.order_item_id = oi.id), 0
        )
       union all
       select 'order lines whose line_total is not (unit + add-ons) × qty', count(*)::text
         from order_items
        where line_total <> round((unit_price + addons_total) * quantity, 2)`,
    );
    for (const entry of orphans.rows) {
      check(entry.label, Number.parseInt(entry.count, 10) === 0, `${entry.count} row(s)`);
    }

    const historyOrder = await admin.query<{ count: string }>(
      `select count(*)::text as count from (
         select order_id, count(*) as events, count(*) filter (where to_status = 'pending') as initial
           from order_status_history group by order_id
       ) t where t.events > 1 and t.initial = 0`,
    );
    check("every multi-step order starts at pending", Number.parseInt(historyOrder.rows[0]?.count ?? "1", 10) === 0);

    // ── pricing arithmetic on stored orders ─────────────────────────────────
    section("Pricing stored on real orders");
    const orders = await admin.query<{
      order_number: string;
      subtotal: string;
      discount_amount: string;
      delivery_fee: string;
      tax_amount: string;
      service_fee: string;
      tip_amount: string;
      total: string;
      items_total: string;
      addons_total: string;
    }>(
      `select o.order_number, o.subtotal::text, o.discount_amount::text, o.delivery_fee::text, o.tax_amount::text,
              o.service_fee::text, o.tip_amount::text, o.total::text,
              coalesce(sum(oi.line_total), 0)::text as items_total,
              coalesce(sum(oi.addons_total), 0)::text as addons_total
         from orders o left join order_items oi on oi.order_id = o.id
        group by o.id
        order by o.created_at`,
    );

    let lineMismatch = 0;
    let totalMismatch = 0;
    const offBy: string[] = [];
    for (const order of orders.rows) {
      const money = (value: string) => Math.round(Number.parseFloat(value) * 100);
      if (money(order.items_total) !== money(order.subtotal)) lineMismatch += 1;
      const expectedTotal =
        money(order.subtotal) -
        money(order.discount_amount) +
        money(order.delivery_fee) +
        money(order.tax_amount) +
        money(order.service_fee) +
        money(order.tip_amount);
      if (expectedTotal !== money(order.total)) {
        totalMismatch += 1;
        if (offBy.length < 3) offBy.push(`${order.order_number}: stored ${order.total}, recomputed ${(expectedTotal / 100).toFixed(2)}`);
      }
    }
    check(
      `line totals sum to the order subtotal (${orders.rows.length} orders)`,
      lineMismatch === 0,
      `${lineMismatch} mismatched`,
    );
    check(
      "subtotal − discount + delivery + tax + service + tip = total",
      totalMismatch === 0,
      offBy.join(" | "),
    );

    const taxCheck = await admin.query<{ count: string }>(
      `select count(*)::text as count from orders
        where pricing_breakdown ? 'taxRate' and tax_rate <> (pricing_breakdown ->> 'taxRate')::numeric`,
    );
    check("stored tax rate matches the pricing breakdown", Number.parseInt(taxCheck.rows[0]?.count ?? "1", 10) === 0);

    const couponCheck = await admin.query<{ count: string }>(
      `select count(*)::text as count from orders o join coupons c on c.id = o.coupon_id
        where o.discount_amount = 0 and c.applies_to = 'order'`,
    );
    check(
      "orders discounted by an order-level coupon carry a discount",
      Number.parseInt(couponCheck.rows[0]?.count ?? "1", 10) === 0,
    );
    const couponCodeCheck = await admin.query<{ count: string }>(
      `select count(*)::text as count from orders o join coupons c on c.id = o.coupon_id
        where o.coupon_code is distinct from c.code`,
    );
    check("the coupon snapshot on the order matches the coupon record", Number.parseInt(couponCodeCheck.rows[0]?.count ?? "1", 10) === 0);

    // ── tenant isolation through the application data layer ─────────────────
    section("Tenant isolation (through the RLS-enforced connection)");
    const identities = await admin.query<{ restaurant_id: string; user_id: string }>(
      `select restaurant_id, user_id from team_members where role = 'owner' and is_active order by created_at`,
    );
    const bellaIdentity = identities.rows.find((entry) => entry.restaurant_id === bellaRow.id);
    const otherIdentity = identities.rows.find((entry) => entry.restaurant_id === other.rows[0]!.id);
    check("each tenant has an active owner (authorisation has someone to grant)", Boolean(bellaIdentity && otherIdentity));

    const bellaCtx: RequestContext = { restaurantId: bellaRow.id, userId: bellaIdentity?.user_id ?? null };
    const otherCtx: RequestContext = { restaurantId: other.rows[0]!.id, userId: otherIdentity?.user_id ?? null };

    const scopedOrders = await db.read(bellaCtx, (tx) =>
      tx.query<{ restaurant_id: string }>("select restaurant_id from orders"),
    );
    check(
      `orders visible for bella-napoli all belong to it (${scopedOrders.length} rows)`,
      scopedOrders.length > 0 && scopedOrders.every((entry) => entry.restaurant_id === bellaRow.id),
    );

    const anonymousCustomers = await db.read({}, (tx) => tx.query("select id from customers"));
    check("anonymous visitors cannot read customers", anonymousCustomers.length === 0);

    const anonymousOrders = await db.read({}, (tx) => tx.query("select id from orders"));
    check("anonymous visitors cannot read orders", anonymousOrders.length === 0);

    const publicMenu = await db.read({}, (tx) =>
      tx.query<{ is_active: boolean }>("select is_active from menu_items where restaurant_id = $1", [bellaRow.id]),
    );
    check(
      `anonymous visitors see only active storefront menu rows (${publicMenu.length})`,
      publicMenu.length > 0 && publicMenu.every((entry) => entry.is_active),
    );

    const crossTenant = await db.read(otherCtx, (tx) =>
      tx.query("select id from orders where restaurant_id = $1", [bellaRow.id]),
    );
    check("the other tenant cannot read bella-napoli orders", crossTenant.length === 0);

    // ── storefront + admin read paths ───────────────────────────────────────
    section("Read paths");
    const website = await db.read({}, (tx) =>
      tx.queryOne<{ id: string; theme: unknown }>("select id, theme from websites where restaurant_id = $1", [
        bellaRow.id,
      ]),
    );
    check("the storefront website row is publicly readable", Boolean(website?.id));
    check("the website theme is stored as JSONB", website?.theme !== null && typeof website?.theme === "object");

    const pages = await db.read({}, (tx) =>
      tx.query<{ slug: string; sections: unknown }>(
        "select slug, sections from website_pages where restaurant_id = $1 and is_published",
        [bellaRow.id],
      ),
    );
    check(
      `published website pages load with section arrays (${pages.map((page) => page.slug).join(", ")})`,
      pages.length > 0 && pages.every((page) => Array.isArray(page.sections)),
    );

    const approvedReviews = await db.read({}, (tx) =>
      tx.query<{ status: string }>("select status from reviews where restaurant_id = $1", [bellaRow.id]),
    );
    check(
      `storefront reviews are approved-only (${approvedReviews.length})`,
      approvedReviews.length > 0 && approvedReviews.every((entry) => entry.status === "approved"),
    );

    const openZones = await db.read({}, (tx) =>
      tx.query<{ delivery_fee: string; min_order_amount: string }>(
        "select delivery_fee, min_order_amount from delivery_zones where restaurant_id = $1 and is_active",
        [bellaRow.id],
      ),
    );
    check(
      `delivery zones expose numeric money as strings (${openZones.length})`,
      openZones.length > 0 && openZones.every((zone) => /^\d+\.\d{2}$/.test(zone.delivery_fee)),
    );

    section("Result");
    if (failures === 0) {
      console.log(`  ${checks} checks passed — database looks healthy.\n`);
    } else {
      console.log(`  ${failures} of ${checks} checks failed.\n`);
      process.exitCode = 1;
    }
  } finally {
    await db.end();
    await admin.end();
  }
}

main().catch((error: unknown) => {
  console.error("\nVerification crashed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
