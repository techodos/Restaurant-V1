import { dec, sumMoney, toMoney } from "@/shared/money";
import { isOrderTypeEnabled } from "@/shared/ordering";
import { breakdownForStorage, calculatePricing, estimateReadyAt, PricingError, type ZonePricing } from "@/server/domain/pricing";
import { errors } from "@/server/errors";
import { ACTIVE_ORDER_STATUSES, PAYMENT_METHOD_ORDER_TYPES, type OrderStatus, type OrderType, type PaymentMethod } from "@/shared/contract/enums";
import type { Customer, DeliveryZone, Order, OrderItem, OrderSummary } from "@/shared/contract/models";
import { paginate, type Paginated } from "@/shared/contract/api";
import { randomUUID } from "node:crypto";
import { matchDeliveryZone } from "./deliveries";
import { toCouponPricing } from "./coupons";
import { upsertCustomer } from "./customers";
import { mapOrderableItems, orderableItemsSql } from "./menu";
import { resolveMenuSelection } from "@/server/domain/menu-selection";
import { mapCoupon, mapCustomer, mapDelivery, mapDeliveryZone, mapRestaurant, mapOrder, mapOrderItem, mapOrderItemAddon, mapOrderStatusEvent, mapPayment, num, str, type Row } from "@/server/db/mappers";
import { type DbClient } from "@/server/db/database";
import { getDb } from "@/server/db/registry";
import { type RequestContext } from "@/server/context";

/**
 * Order lifecycle. Order creation is a single privileged transaction:
 * every price, availability flag and coupon rule is re-derived from the
 * database inside this transaction — nothing from the browser is trusted.
 */

export interface CreateOrderLine {
  menuItemId: string;
  variantId: string | null;
  quantity: number;
  addons: { addonId: string; quantity: number }[];
  specialInstructions?: string | null;
}

export interface CreateOrderInput {
  restaurantId: string;
  /** the tray's lines (browser cookie) — only ids and quantities; every price is re-resolved here */
  lines: CreateOrderLine[];
  locationId?: string | null;
  orderType: OrderType;
  customer: { fullName: string; phone: string; email?: string | null; marketingOptIn?: boolean };
  address?: {
    line1: string;
    line2?: string | null;
    area?: string | null;
    city?: string | null;
    postalCode?: string | null;
    notes?: string | null;
    latitude?: number | null;
    longitude?: number | null;
  } | null;
  deliveryZoneId?: string | null;
  tableNumber?: string | null;
  guests?: number | null;
  scheduledFor?: string | null;
  paymentMethod: PaymentMethod;
  couponCode?: string | null;
  tipAmount?: string | null;
  notes?: string | null;
  specialInstructions?: string | null;
  customerId?: string | null;
  /**
   * The signed-in customer's own row: the order is linked to it directly (no phone lookup). When
   * `saveAccountPhone` is set and the account has no mobile yet, `customer.phone` is stored on it in the
   * same transaction, so it is saved only if the order commits.
   */
  accountCustomerId?: string | null;
  saveAccountPhone?: boolean;
  /** refuse the order (EMAIL_NOT_VERIFIED) unless the account's login email is verified — read in this transaction */
  requireVerifiedEmail?: boolean;
  userId?: string | null;
  actor?: string | null;
}

export interface CreateOrderResult {
  order: Order;
  paymentId: string;
  requiresOnlinePayment: boolean;
  /** the customer row the order was linked to (its saved phone/email are the order's) */
  customer: Customer;
}

/**
 * Stores a first mobile on the signed-in customer's already-locked row, in one statement: refused with
 * a CONFLICT (not a raw unique violation) when another customer of this restaurant already has it.
 */
async function saveFirstAccountPhone(tx: DbClient, restaurantId: string, customerId: string, phone: string): Promise<Customer> {
  const updated = await tx.queryOne<Row>(
    `update customers set phone = $2, updated_at = now()
      where id = $1 and not exists (select 1 from customers where restaurant_id = $3 and phone = $2 and id <> $1)
      returning *`,
    [customerId, phone, restaurantId],
  );
  if (!updated) {
    throw errors.conflict("That mobile number is already used by another account here. Please use a different number.");
  }
  return mapCustomer(updated);
}

/**
 * Only what an order is decided from — on the hosted pooler a response's time grows with its size, and
 * the full rows (SEO, social, theme and customer metadata JSON) are dead weight here.
 */
const ORDER_RESTAURANT_COLUMNS = "id, name, slug, status, currency, currency_symbol, locale, timezone, country, features, settings";
const ORDER_CUSTOMER_COLUMNS = "id, restaurant_id, full_name, phone, email, is_email_verified, is_guest, auth_provider, created_at";

/** `($1,$2,…),($n,…)` placeholders for a multi-row insert of `rows` × `width` parameters, starting after `offset`. */
function valuesList(rows: number, width: number, casts: Record<number, string> = {}, offset = 0): string {
  return Array.from(
    { length: rows },
    (_, row) => `(${Array.from({ length: width }, (_, col) => `$${offset + row * width + col + 1}${casts[col] ?? ""}`).join(",")})`,
  ).join(",");
}

/**
 * Places an order in ONE privileged transaction — the only database work in the whole ordering flow
 * (the tray itself lives in a browser cookie, DECISIONS.md §28). Every price, availability flag,
 * delivery zone, coupon rule and the customer's email verification is re-derived from the database
 * inside this transaction; nothing from the browser is trusted but ids and quantities.
 *
 * Five round trips for any order, whatever its size, type or coupon (measured on the hosted pooler,
 * where each is ~0.3 s and the server spends < 5 ms on all of them — see SKILL.md §20):
 *   1. begin + role + request context (one message, `Database.transaction`)
 *   2. ONE read: restaurant, the customer's row (locked), the whole tray's menu, [zones], [coupon + this
 *      phone's usage]
 *   3. insert the order (its triggers assign the number, history, outbox event, live-tracking notify)
 *   4. ONE write: every line, every add-on, the payment, [the delivery], [coupon usage]
 *   5. commit
 * (+1 only on a customer's very first order without a saved mobile, to store it on the account.)
 */
export async function createOrder(input: CreateOrderInput, ctx: RequestContext): Promise<CreateOrderResult> {
  const db = getDb({ restaurantId: input.restaurantId });
  // A customer is identified by customer_id only. `userId` (the database session's app.current_user_id /
  // auth.uid()) is reserved for staff, whose ids live in auth.users: the order triggers write it into
  // order_status_history.changed_by (FK to auth.users), so a customer's id there failed with 23503.
  // input.userId still decides below whether the customer row is a guest.
  const context: RequestContext = {
    ...ctx,
    restaurantId: input.restaurantId,
    userId: null,
    customerId: input.customerId ?? ctx.customerId ?? null,
    actor: input.actor ?? input.customer.fullName,
  };

  if (input.lines.length === 0) throw errors.custom("CART_EMPTY", "Your cart is empty.");

  return db.write(context, async (tx) => {
    // 1 ─ everything the order is decided from, in one statement ------------------------------------
    const read = await tx.queryOne<Row>(
      `select
         (select row_to_json(r) from (select ${ORDER_RESTAURANT_COLUMNS} from restaurants where id = $1) r) as restaurant,
         (select row_to_json(c) from (select ${ORDER_CUSTOMER_COLUMNS} from customers
                                        where id = $2 and restaurant_id = $1 for update) c) as customer,
         (select coalesce(json_agg(m), '[]') from (${orderableItemsSql("$1", "$3")}) m) as menu,
         case when $4::boolean then
           (select coalesce(json_agg(z order by z.sort_order, z.name), '[]') from delivery_zones z
             where z.restaurant_id = $1 and z.is_active and ($5::uuid is null or z.location_id = $5))
         end as zones,
         case when $6::text is not null then
           (select row_to_json(x) from (
              select c.*, (select count(*) from orders o
                            where o.restaurant_id = c.restaurant_id and o.coupon_id = c.id and o.status <> 'cancelled'
                              and o.customer_phone = coalesce(nullif(trim((select phone from customers where id = $2)), ''), $7)
                          )::int as phone_usage
                from coupons c where c.restaurant_id = $1 and c.code = upper(trim($6))) x)
         end as coupon`,
      [
        input.restaurantId,
        input.accountCustomerId ?? null,
        [...new Set(input.lines.map((line) => line.menuItemId))],
        input.orderType === "delivery",
        input.locationId ?? null,
        input.couponCode || null,
        input.customer.phone,
      ],
    );

    // restaurant + configuration (this transaction's own read, never a cached copy)
    const restaurant = read?.restaurant ? mapRestaurant(read.restaurant as Row) : null;
    if (!restaurant) throw errors.notFound("Restaurant");
    if (restaurant.status !== "active") throw errors.custom("ORDERING_DISABLED", "This restaurant is not accepting orders right now.");
    if (!restaurant.features.onlineOrdering) {
      throw errors.custom("ORDERING_DISABLED", "Online ordering is currently switched off.");
    }
    const settings = restaurant.settings;
    const currency = restaurant.currency;

    if (!isOrderTypeEnabled(restaurant.features, input.orderType)) {
      throw errors.custom("ORDERING_DISABLED", "That order type is not available at the moment.");
    }
    if (!settings.payments.enabledMethods.includes(input.paymentMethod)) {
      throw errors.custom("PAYMENT_UNAVAILABLE", "That payment method is not available.");
    }
    // "Cash on delivery" for a dine-in order, a terminal payment for delivery, etc. make no sense —
    // the checkout page already filters these (getCheckoutOptions), this is the boundary that
    // cannot be bypassed by a stale form submission.
    if (!PAYMENT_METHOD_ORDER_TYPES[input.paymentMethod].includes(input.orderType)) {
      throw errors.custom("PAYMENT_UNAVAILABLE", "That payment method is not available for this order type.");
    }
    const requiresOnlinePayment = input.paymentMethod === "card_online" || input.paymentMethod === "wallet";

    // customer: the signed-in account's own row (now locked). Its verification and saved mobile/email
    // are read here, never trusted from the session; a guest (no account) is upserted by phone.
    let customer: Customer;
    if (input.accountCustomerId) {
      if (!read?.customer) throw errors.custom("SIGN_IN_REQUIRED", "Please sign in again to place your order.");
      const accountRow = read.customer as Row;
      if (input.requireVerifiedEmail && !accountRow.is_email_verified) {
        throw errors.custom("EMAIL_NOT_VERIFIED", "Please verify your email before placing an order.");
      }
      customer = mapCustomer(accountRow);
    } else {
      customer = await upsertCustomer(
        {
          restaurantId: input.restaurantId,
          fullName: input.customer.fullName,
          phone: input.customer.phone,
          email: input.customer.email ?? null,
          marketingOptIn: input.customer.marketingOptIn ?? false,
          isGuest: !input.userId,
        },
        context,
        tx,
      );
    }
    const hasSavedPhone = Boolean(customer.phone.trim());
    // the account's own saved mobile/email win over what the form sent
    const orderPhone = hasSavedPhone ? customer.phone : input.customer.phone;
    const orderEmail = customer.email || input.customer.email || null;

    // re-validate every line against the live menu -----------------------------------------------
    const menu = mapOrderableItems((read?.menu as Row[] | undefined) ?? []);
    const now = new Date();
    let maxPrepTime = settings.ordering.preparationTimeMinutes;
    const resolvedLines = input.lines.map((line) => {
      const resolved = resolveMenuSelection(menu.get(line.menuItemId), line, restaurant.timezone, now);
      maxPrepTime = Math.max(maxPrepTime, resolved.item.prepTimeMinutes);
      return {
        id: randomUUID(), // generated here so add-on rows can reference their line within one batched insert
        itemId: resolved.item.id,
        variantId: resolved.variant?.id ?? null,
        itemName: resolved.item.name,
        variantName: resolved.variant?.name ?? null,
        unitPrice: resolved.unitPrice,
        addonsTotal: resolved.addonsTotal,
        quantity: Math.min(Math.max(1, Math.trunc(line.quantity) || 1), 99),
        specialInstructions: line.specialInstructions?.slice(0, 300) || null,
        addons: resolved.addons,
        isBuffetPackage: resolved.item.isBuffetPackage,
      };
    });
    // A buffet package (priced per head) is a dine-in booking. The tray already flags it outside dine-in
    // (services/cart.ts#priceTray); this is where an order is written, so it cannot be bypassed here.
    if (input.orderType !== "dine_in" && resolvedLines.some((line) => line.isBuffetPackage)) {
      throw errors.custom("BUFFET_REQUIRES_DINE_IN", "A dine-in buffet in your cart can only be ordered as Dine-in.");
    }

    // delivery zone -----------------------------------------------------------------------------
    let zone: ZonePricing | null = null;
    let zoneRecord: DeliveryZone | null = null;
    if (input.orderType === "delivery") {
      if (!input.address?.line1) {
        throw new PricingError("DELIVERY_ZONE_REQUIRED", "A delivery address is required.");
      }
      const zones = ((read?.zones as Row[] | null) ?? []).map(mapDeliveryZone);
      zoneRecord = input.deliveryZoneId
        ? (zones.find((candidate) => candidate.id === input.deliveryZoneId) ?? null)
        : matchDeliveryZone(zones, {
            area: input.address.area ?? null,
            city: input.address.city ?? null,
            postalCode: input.address.postalCode ?? null,
          });
      if (!zoneRecord) {
        throw new PricingError("DELIVERY_UNAVAILABLE", "Sorry, we do not deliver to that address yet.");
      }
      zone = {
        id: zoneRecord.id,
        name: zoneRecord.name,
        deliveryFee: zoneRecord.deliveryFee,
        minOrderAmount: zoneRecord.minOrderAmount,
        freeDeliveryOver: zoneRecord.freeDeliveryOver,
      };
    }

    // coupon (with this phone's past usage, read in the same statement) ---------------------------
    let coupon = null;
    let couponUsageByCustomer = 0;
    if (input.couponCode) {
      const row = read?.coupon as Row | null | undefined;
      if (!row) throw new PricingError("COUPON_INVALID", "That promo code is not valid.");
      coupon = toCouponPricing(mapCoupon(row));
      couponUsageByCustomer = num(row.phone_usage);
    }

    // pricing (authoritative) ---------------------------------------------------------------------
    const pricing = calculatePricing({
      lines: resolvedLines.map((line) => ({ unitPrice: line.unitPrice, addonsTotal: line.addonsTotal, quantity: line.quantity })),
      orderType: input.orderType,
      settings,
      zone,
      coupon,
      tipAmount: input.tipAmount ?? "0",
      couponUsageByCustomer,
      // a coupon restricted to specific customers (eligibleEmails/eligiblePhones) is checked against the
      // account's own email/mobile, not what the form sent
      customerEmail: orderEmail,
      customerPhone: orderPhone,
    });

    // a signed-in customer's first mobile is stored on the account only now, once the order is valid
    if (input.accountCustomerId && input.saveAccountPhone && !hasSavedPhone) {
      customer = await saveFirstAccountPhone(tx, input.restaurantId, customer.id, input.customer.phone);
    }

    // 2 ─ order -----------------------------------------------------------------------------------
    const estimatedReadyAt = estimateReadyAt(maxPrepTime, input.orderType);
    const orderRow = await tx.queryOne<Row>(
      `insert into orders
         (restaurant_id, location_id, customer_id, cart_id, order_type, status, customer_name, customer_email,
          customer_phone, delivery_address, delivery_zone_id, table_number, guests, scheduled_for, coupon_id,
          coupon_code, subtotal, discount_amount, delivery_fee, tax_amount, service_fee, tip_amount, total, currency,
          tax_rate, pricing_breakdown, payment_method, payment_status, notes, special_instructions, placed_by,
          estimated_ready_at)
       values ($1,$2,$3,null,$4,'pending',$5,$6,$7,$8::jsonb,$9,$10,$11,$12::timestamptz,$13,$14,
               $15::numeric,$16::numeric,$17::numeric,$18::numeric,$19::numeric,$20::numeric,$21::numeric,$22,
               $23::numeric,$24::jsonb,$25,'pending',$26,$27,'customer',$28::timestamptz)
       returning *`,
      [
        input.restaurantId,
        input.locationId ?? null,
        customer.id,
        input.orderType,
        input.customer.fullName,
        orderEmail,
        orderPhone,
        input.address ? JSON.stringify(input.address) : null,
        zoneRecord?.id ?? null,
        input.tableNumber ?? null,
        input.guests ?? null,
        input.scheduledFor ?? null,
        coupon?.id ?? null,
        coupon?.code ?? null,
        pricing.subtotal,
        pricing.discount,
        pricing.deliveryFee,
        pricing.tax,
        pricing.serviceFee,
        pricing.tip,
        pricing.total,
        currency,
        pricing.taxRate,
        JSON.stringify(breakdownForStorage(pricing)),
        input.paymentMethod,
        input.notes ?? null,
        input.specialInstructions ?? null,
        estimatedReadyAt.toISOString(),
      ],
    );
    if (!orderRow) throw errors.internal("Unable to create the order");
    const orderId = str(orderRow.id);

    // 3 ─ everything that hangs off the order, in one statement --------------------------------------
    // Data-modifying CTEs run as one statement: foreign keys between them (add-on → line) are checked
    // at its end, and the payment trigger (payment_status → orders) sees the order written above.
    const params: unknown[] = [];
    const push = (...values: unknown[]) => {
      const start = params.length;
      params.push(...values);
      return start;
    };
    const parts: string[] = [];

    const lineStart = push(
      ...resolvedLines.flatMap((line) => [
        line.id,
        orderId,
        input.restaurantId,
        line.itemId,
        line.variantId,
        line.itemName,
        line.variantName,
        line.quantity,
        line.unitPrice,
        line.addonsTotal,
        toMoney(dec(line.unitPrice).plus(dec(line.addonsTotal)).times(line.quantity)),
        line.specialInstructions,
      ]),
    );
    parts.push(`order_lines as (
      insert into order_items
        (id, order_id, restaurant_id, menu_item_id, variant_id, item_name, variant_name, quantity, unit_price,
         addons_total, line_total, special_instructions)
      values ${valuesList(resolvedLines.length, 12, { 0: "::uuid", 1: "::uuid", 2: "::uuid", 3: "::uuid", 4: "::uuid", 7: "::int", 8: "::numeric", 9: "::numeric", 10: "::numeric" }, lineStart)})`);

    const addonRows = resolvedLines.flatMap((line) =>
      line.addons.map((addon) => [line.id, addon.addonId, addon.groupName, addon.name, addon.price, addon.quantity]),
    );
    if (addonRows.length > 0) {
      const addonStart = push(...addonRows.flat());
      parts.push(`order_addons as (
        insert into order_item_addons (order_item_id, menu_addon_id, group_name, addon_name, unit_price, quantity)
        values ${valuesList(addonRows.length, 6, { 0: "::uuid", 1: "::uuid", 4: "::numeric", 5: "::int" }, addonStart)})`);
    }

    const paymentStart = push(
      input.restaurantId,
      orderId,
      requiresOnlinePayment ? (settings.payments.onlineProvider === "stripe" ? "stripe" : "manual") : "cash",
      input.paymentMethod,
      pricing.total,
      currency,
    );
    parts.push(`payment as (
      insert into payments (restaurant_id, order_id, provider, method, status, amount, currency)
      values ($${paymentStart + 1}::uuid, $${paymentStart + 2}::uuid, $${paymentStart + 3}, $${paymentStart + 4}::payment_method,
              'pending', $${paymentStart + 5}::numeric, $${paymentStart + 6})
      returning id)`);

    if (input.orderType === "delivery") {
      const etaMinutes = zoneRecord?.etaMaxMinutes ?? settings.delivery.defaultEtaMinutes;
      const deliveryStart = push(
        input.restaurantId,
        orderId,
        input.locationId ?? null,
        zoneRecord?.id ?? null,
        pricing.deliveryFee,
        new Date(Date.now() + etaMinutes * 60_000).toISOString(),
      );
      parts.push(`delivery as (
        insert into deliveries (restaurant_id, order_id, location_id, delivery_zone_id, status, delivery_fee, estimated_arrival_at)
        values ($${deliveryStart + 1}::uuid, $${deliveryStart + 2}::uuid, $${deliveryStart + 3}::uuid, $${deliveryStart + 4}::uuid,
                'unassigned', $${deliveryStart + 5}::numeric, $${deliveryStart + 6}::timestamptz))`);
    }

    if (coupon) {
      const couponStart = push(coupon.id);
      parts.push(`coupon_use as (update coupons set used_count = used_count + 1 where id = $${couponStart + 1}::uuid)`);
    }

    const paymentRow = await tx.queryOne<Row>(`with ${parts.join(",\n")} select id from payment`, params);

    const order = mapOrder({ ...orderRow, delivery_zone_name: zoneRecord?.name ?? null });
    return { order, paymentId: str(paymentRow?.id ?? ""), requiresOnlinePayment, customer };
  });
}

export interface OrderListFilters {
  status?: OrderStatus | "active" | "all";
  orderType?: OrderType;
  search?: string;
  dateFrom?: string;
  dateTo?: string;
  paymentStatus?: string;
  page?: number;
  pageSize?: number;
}

export async function listOrders(
  restaurantId: string,
  filters: OrderListFilters,
  ctx: RequestContext,
): Promise<Paginated<OrderSummary>> {
  const db = getDb({ restaurantId });
  return db.read({ ...ctx, restaurantId }, async (tx) => {
    const page = filters.page ?? 1;
    const pageSize = Math.min(filters.pageSize ?? 20, 100);
    const params: unknown[] = [restaurantId];
    const conditions: string[] = ["o.restaurant_id = $1"];

    if (filters.status === "active") {
      conditions.push("o.status in ('pending','confirmed','preparing','ready','out_for_delivery')");
    } else if (filters.status && filters.status !== "all") {
      params.push(filters.status);
      conditions.push(`o.status = $${params.length}::order_status`);
    }
    if (filters.orderType) {
      params.push(filters.orderType);
      conditions.push(`o.order_type = $${params.length}::order_type`);
    }
    if (filters.paymentStatus) {
      params.push(filters.paymentStatus);
      conditions.push(`o.payment_status = $${params.length}::payment_status`);
    }
    if (filters.search?.trim()) {
      params.push(`%${filters.search.trim()}%`);
      conditions.push(
        `(o.order_number ilike $${params.length} or o.customer_name ilike $${params.length} or o.customer_phone ilike $${params.length})`,
      );
    }
    if (filters.dateFrom) {
      params.push(filters.dateFrom);
      conditions.push(`o.created_at >= $${params.length}::timestamptz`);
    }
    if (filters.dateTo) {
      params.push(filters.dateTo);
      conditions.push(`o.created_at < ($${params.length}::timestamptz + interval '1 day')`);
    }

    const where = conditions.join(" and ");
    const total = await tx.queryCount(`select count(*) from orders o where ${where}`, params);
    const rows = await tx.query<Row>(
      `select o.id, o.order_number, o.status, o.order_type, o.customer_name, o.customer_phone, o.total, o.currency,
              o.payment_status, o.payment_method, o.created_at,
              (select coalesce(sum(oi.quantity),0) from order_items oi where oi.order_id = o.id) as item_count,
              (select coalesce(json_agg(oi.item_name order by oi.created_at), '[]'::json) from order_items oi where oi.order_id = o.id) as item_preview
         from orders o
        where ${where}
        order by o.created_at desc
        limit ${pageSize} offset ${(page - 1) * pageSize}`,
      params,
    );

    const summaries: OrderSummary[] = rows.map((row) => ({
      id: str(row.id),
      orderNumber: str(row.order_number),
      status: str(row.status) as OrderStatus,
      orderType: str(row.order_type) as OrderType,
      customerName: str(row.customer_name),
      customerPhone: str(row.customer_phone),
      total: toMoney(str(row.total)),
      currency: str(row.currency),
      paymentStatus: str(row.payment_status) as OrderSummary["paymentStatus"],
      paymentMethod: str(row.payment_method) as PaymentMethod,
      createdAt: new Date(String(row.created_at)).toISOString(),
      itemCount: num(row.item_count),
      itemPreview: Array.isArray(row.item_preview) ? (row.item_preview as string[]) : [],
    }));

    return paginate(summaries, total, page, pageSize);
  });
}

export async function getOrderItems(tx: DbClient, orderId: string): Promise<OrderItem[]> {
  return (await getItemsForOrders(tx, [orderId])).get(orderId) ?? [];
}

/** Items (with add-ons) of several orders in two queries, keyed by order id. */
async function getItemsForOrders(tx: DbClient, orderIds: readonly string[]): Promise<Map<string, OrderItem[]>> {
  const byOrder = new Map<string, OrderItem[]>();
  if (orderIds.length === 0) return byOrder;
  const rows = await tx.query<Row>(
    `select oi.*, mi.image_url, mi.slug
       from order_items oi left join menu_items mi on mi.id = oi.menu_item_id
      where oi.order_id = any($1::uuid[]) order by oi.created_at`,
    [orderIds],
  );
  const addons = rows.length
    ? await tx.query<Row>(
        `select * from order_item_addons where order_item_id = any($1::uuid[]) order by created_at`,
        [rows.map((row) => str(row.id))],
      )
    : [];
  for (const row of rows) {
    const item = mapOrderItem(row, addons.filter((addon) => str(addon.order_item_id) === str(row.id)).map(mapOrderItemAddon));
    const orderId = str(row.order_id);
    const list = byOrder.get(orderId);
    if (list) list.push(item);
    else byOrder.set(orderId, [item]);
  }
  return byOrder;
}

/**
 * "My Orders": the orders THIS visitor owns, decided here and again by RLS (both run in the
 * same query, so neither can widen the other):
 *  - signed-in customer: their own orders (`customer_id`), current and history;
 *  - guest: only orders of the carts owned by their cart token, and only orders still in
 *    progress. A guest never gets history back, even though the token may have placed
 *    earlier orders and RLS (0008) would let the order tracking page open them.
 *  - neither: nothing, without touching the database.
 * The browser sends no order id, so there is nothing to tamper with.
 */
export async function listVisitorOrders(
  restaurantId: string,
  visitor: RequestContext,
  options: { historyLimit?: number } = {},
): Promise<{ orders: Order[]; history: boolean }> {
  const customerId = visitor.customerId ?? null;
  const cartToken = visitor.cartToken ?? null;
  if (!customerId && !cartToken) return { orders: [], history: false };

  const db = getDb({ restaurantId });
  // customer identity is customer_id / cart token only; app.current_user_id (auth.users) is for staff
  const ctx: RequestContext = { restaurantId, customerId, cartToken, userId: null };
  const active = [...ACTIVE_ORDER_STATUSES];
  const orders = await db.read(ctx, async (tx) => {
    const rows = customerId
      ? await tx.query<Row>(
          `select * from (
             select ${ORDER_DETAIL_SELECT},
                    row_number() over (partition by (o.status = any($3::order_status[])) order by o.created_at desc) as rn
               from orders o
               left join restaurant1s l on l.id = o.location_id
               left join delivery_zones dz on dz.id = o.delivery_zone_id
              where o.restaurant_id = $1 and o.customer_id = $2
           ) ranked
           where status = any($3::order_status[]) or rn <= $4
           order by created_at desc`,
          [restaurantId, customerId, active, options.historyLimit ?? 20],
        )
      : await tx.query<Row>(
          `select ${ORDER_DETAIL_SELECT}
             from orders o
             join carts c on c.id = o.cart_id
             left join restaurant1s l on l.id = o.location_id
             left join delivery_zones dz on dz.id = o.delivery_zone_id
            where o.restaurant_id = $1 and c.session_token = $2 and o.status = any($3::order_status[])
            order by o.created_at desc`,
          [restaurantId, cartToken, active],
        );
    const mapped = rows.map(mapOrder);
    const items = await getItemsForOrders(tx, mapped.map((order) => order.id));
    for (const order of mapped) order.items = items.get(order.id) ?? [];
    return mapped;
  });
  return { orders, history: Boolean(customerId) };
}

const ORDER_DETAIL_SELECT = `
  o.*, l.name as location_name, dz.name as delivery_zone_name
`;

export async function getOrderByNumber(
  restaurantId: string,
  orderNumber: string,
  ctx: RequestContext = {},
  options: { withDetails?: boolean } = { withDetails: true },
): Promise<Order | null> {
  const db = getDb({ restaurantId });
  return db.read({ ...ctx, restaurantId }, async (tx) => {
    const row = await tx.queryOne<Row>(
      `select ${ORDER_DETAIL_SELECT}
         from orders o
         left join restaurant1s l on l.id = o.location_id
         left join delivery_zones dz on dz.id = o.delivery_zone_id
        where o.restaurant_id = $1 and o.order_number = $2`,
      [restaurantId, orderNumber],
    );
    if (!row) return null;
    const order = mapOrder(row);
    if (options.withDetails !== false) await hydrateOrder(tx, order);
    return order;
  });
}

/** Loads items, history, payment and delivery onto an order row already visible to `tx`. */
async function hydrateOrder(tx: DbClient, order: Order): Promise<void> {
  order.items = await getOrderItems(tx, order.id);
  const historyRows = await tx.query<Row>(
    `select * from order_status_history where order_id = $1 order by created_at`,
    [order.id],
  );
  order.statusHistory = historyRows.map(mapOrderStatusEvent);
  const paymentRow = await tx.queryOne<Row>(
    `select * from payments where order_id = $1 order by created_at desc limit 1`,
    [order.id],
  );
  order.payment = paymentRow ? mapPayment(paymentRow) : null;
  const deliveryRow = await tx.queryOne<Row>(`select * from deliveries where order_id = $1`, [order.id]);
  order.delivery = deliveryRow ? mapDelivery(deliveryRow) : null;
}

/**
 * Privileged lookup for the holder of a valid signed order-access token (the link
 * in a notification email). RLS cannot prove ownership from another device, so the
 * caller has already verified the token and passes the order id it names; the
 * restaurant and order number must match as well.
 */
export async function getOrderForAccessGrant(
  restaurantId: string,
  orderNumber: string,
  orderId: string,
): Promise<Order | null> {
  const db = getDb({ restaurantId });
  return db.write({ restaurantId, actor: "order-access-link" }, async (tx) => {
    const row = await tx.queryOne<Row>(
      `select ${ORDER_DETAIL_SELECT}
         from orders o
         left join restaurant1s l on l.id = o.location_id
         left join delivery_zones dz on dz.id = o.delivery_zone_id
        where o.id = $1 and o.restaurant_id = $2 and o.order_number = $3`,
      [orderId, restaurantId, orderNumber],
    );
    if (!row) return null;
    const order = mapOrder(row);
    await hydrateOrder(tx, order);
    return order;
  });
}

export async function getOrderById(
  orderId: string,
  ctx: RequestContext,
  options: { withDetails?: boolean } = { withDetails: true },
): Promise<Order | null> {
  const db = getDb(ctx);
  return db.read(ctx, async (tx) => {
    const row = await tx.queryOne<Row>(
      `select ${ORDER_DETAIL_SELECT}
         from orders o
         left join restaurant1s l on l.id = o.location_id
         left join delivery_zones dz on dz.id = o.delivery_zone_id
        where o.id = $1`,
      [orderId],
    );
    if (!row) return null;
    const order = mapOrder(row);
    if (options.withDetails !== false) {
      order.items = await getOrderItems(tx, orderId);
      const historyRows = await tx.query<Row>(`select * from order_status_history where order_id = $1 order by created_at`, [orderId]);
      order.statusHistory = historyRows.map(mapOrderStatusEvent);
      const paymentRow = await tx.queryOne<Row>(`select * from payments where order_id = $1 order by created_at desc limit 1`, [orderId]);
      order.payment = paymentRow ? mapPayment(paymentRow) : null;
      const deliveryRow = await tx.queryOne<Row>(`select * from deliveries where order_id = $1`, [orderId]);
      order.delivery = deliveryRow ? mapDelivery(deliveryRow) : null;
    }
    return order;
  });
}

/** Active orders for the kitchen display, oldest first (FIFO). */
export async function listKitchenOrders(restaurantId: string, ctx: RequestContext): Promise<Order[]> {
  const db = getDb({ restaurantId });
  return db.read({ ...ctx, restaurantId }, async (tx) => {
    const rows = await tx.query<Row>(
      `select ${ORDER_DETAIL_SELECT}
         from orders o
         left join restaurant1s l on l.id = o.location_id
         left join delivery_zones dz on dz.id = o.delivery_zone_id
        where o.restaurant_id = $1 and o.status in ('pending','confirmed','preparing','ready')
        order by o.created_at asc
        limit 60`,
      [restaurantId],
    );
    const orders = rows.map(mapOrder);
    for (const order of orders) {
      order.items = await getOrderItems(tx, order.id);
    }
    return orders;
  });
}

export async function listCustomerOrders(
  customerId: string,
  ctx: RequestContext,
  limit = 20,
): Promise<OrderSummary[]> {
  const db = getDb(ctx);
  const rows = await db.read({ ...ctx, customerId }, async (tx) =>
    tx.query<Row>(
      `select o.id, o.order_number, o.status, o.order_type, o.customer_name, o.customer_phone, o.total, o.currency,
              o.payment_status, o.payment_method, o.created_at,
              (select coalesce(sum(oi.quantity),0) from order_items oi where oi.order_id = o.id) as item_count,
              (select coalesce(json_agg(oi.item_name order by oi.created_at), '[]'::json) from order_items oi where oi.order_id = o.id) as item_preview
         from orders o
        where o.customer_id = $1
        order by o.created_at desc
        limit $2`,
      [customerId, limit],
    ),
  );
  return rows.map((row) => ({
    id: str(row.id),
    orderNumber: str(row.order_number),
    status: str(row.status) as OrderStatus,
    orderType: str(row.order_type) as OrderType,
    customerName: str(row.customer_name),
    customerPhone: str(row.customer_phone),
    total: toMoney(str(row.total)),
    currency: str(row.currency),
    paymentStatus: str(row.payment_status) as OrderSummary["paymentStatus"],
    paymentMethod: str(row.payment_method) as PaymentMethod,
    createdAt: new Date(String(row.created_at)).toISOString(),
    itemCount: num(row.item_count),
    itemPreview: Array.isArray(row.item_preview) ? (row.item_preview as string[]) : [],
  }));
}

/**
 * Status update. The allowed-transition rule lives in the database trigger
 * (app.order_transition_allowed) and is mirrored in ORDER_STATUS_RANK, so an
 * invalid jump fails in both layers and is recorded in order_status_history.
 */
export async function updateOrderStatus(
  orderId: string,
  status: OrderStatus,
  ctx: RequestContext,
  options: { note?: string | null; cancelReason?: string | null } = {},
): Promise<Order> {
  const db = getDb(ctx);
  return db.write(ctx, async (tx) => {
    const row = await tx.queryOne<Row>(
      `update orders set
         status = $2::order_status,
         cancel_reason = case when $2 = 'cancelled' then coalesce($3, cancel_reason) else cancel_reason end
       where id = $1
       returning *`,
      [orderId, status, options.cancelReason ?? null],
    );
    if (!row) throw errors.notFound("Order");
    if (options.note) {
      await tx.query(
        `update order_status_history set note = $3
          where id = (select id from order_status_history where order_id = $1 order by created_at desc limit 1)`,
        [orderId, null, options.note],
      );
    }
    const order = mapOrder(row);
    order.items = await getOrderItems(tx, orderId);
    const historyRows = await tx.query<Row>(`select * from order_status_history where order_id = $1 order by created_at`, [orderId]);
    order.statusHistory = historyRows.map(mapOrderStatusEvent);
    return order;
  });
}

/** Status counters used by the admin dashboard and order tabs. */
export async function countOrdersByStatus(
  restaurantId: string,
  ctx: RequestContext,
): Promise<Record<OrderStatus, number>> {
  const db = getDb({ restaurantId });
  const rows = await db.read({ ...ctx, restaurantId }, async (tx) =>
    tx.query<Row>(`select status, count(*) as count from orders where restaurant_id = $1 group by status`, [restaurantId]),
  );
  const counts = {
    pending: 0, confirmed: 0, preparing: 0, ready: 0, out_for_delivery: 0, completed: 0, cancelled: 0,
  } as Record<OrderStatus, number>;
  for (const row of rows) counts[str(row.status) as OrderStatus] = num(row.count);
  return counts;
}

export async function listRecentOrders(restaurantId: string, ctx: RequestContext, limit = 8): Promise<OrderSummary[]> {
  const result = await listOrders(restaurantId, { page: 1, pageSize: limit }, ctx);
  return result.rows;
}

/**
 * Updates the `payments` row AND `orders.payment_status` together — they used to drift apart
 * (this function only touched `payments`, so nothing else in the app — order lists, the SSE/live
 * tracking trigger, the admin payment filter — ever saw the result of a call here; it was dead
 * code until the JazzCash return callback started using it, which is what surfaced this).
 */
export async function setOrderPaymentStatus(
  orderId: string,
  status: "pending" | "authorized" | "paid" | "failed" | "refunded" | "cancelled",
  ctx: RequestContext,
  options: { transactionId?: string | null; failureReason?: string | null } = {},
): Promise<void> {
  const db = getDb(ctx);
  await db.write(ctx, async (tx) => {
    await tx.query(
      `update payments set
         status = $2::payment_status,
         transaction_id = coalesce($3, transaction_id),
         failure_reason = coalesce($4, failure_reason),
         paid_at = case when $2 = 'paid' then now() else paid_at end,
         refunded_at = case when $2 = 'refunded' then now() else refunded_at end
       where order_id = $1`,
      [orderId, status, options.transactionId ?? null, options.failureReason ?? null],
    );
    await tx.query(`update orders set payment_status = $2::payment_status where id = $1`, [orderId, status]);
  });
}

/** Recomputes a reorder cart payload from a past order (server-side prices). */
export async function buildReorderLines(orderId: string, ctx: RequestContext): Promise<{ menuItemId: string; variantId: string | null; quantity: number; addons: { addonId: string; quantity: number }[] }[]> {
  const db = getDb(ctx);
  return db.read(ctx, async (tx) => {
    const items = await tx.query<Row>(`select * from order_items where order_id = $1 order by created_at`, [orderId]);
    const addons = items.length
      ? await tx.query<Row>(`select * from order_item_addons where order_item_id = any($1::uuid[])`, [items.map((row) => str(row.id))])
      : [];
    return items.map((item) => ({
      menuItemId: str(item.menu_item_id),
      variantId: item.variant_id ? str(item.variant_id) : null,
      quantity: num(item.quantity, 1),
      addons: addons
        .filter((addon) => str(addon.order_item_id) === str(item.id) && addon.menu_addon_id)
        .map((addon) => ({ addonId: str(addon.menu_addon_id), quantity: num(addon.quantity, 1) })),
    }));
  });
}

export async function sumOrderTotals(items: { lineTotal: string }[]): Promise<string> {
  return toMoney(sumMoney(items.map((item) => dec(item.lineTotal))));
}
