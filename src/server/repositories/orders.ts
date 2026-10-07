import { dec, sumMoney, toMoney } from "@/shared/money";
import { isOrderTypeEnabled } from "@/shared/ordering";
import { breakdownForStorage, calculatePricing, estimateReadyAt, PricingError, type ZonePricing } from "@/server/domain/pricing";
import { errors } from "@/server/errors";
import { ACTIVE_ORDER_STATUSES, PAYMENT_METHOD_ORDER_TYPES, type OrderStatus, type OrderType, type PaymentMethod } from "@/shared/contract/enums";
import type { Customer, DeliveryZone, Order, OrderItem, OrderSummary, SalesAnalytics } from "@/shared/contract/models";
import { paginate, type Paginated } from "@/shared/contract/api";
import { randomUUID } from "node:crypto";
import { servingZones } from "./deliveries";
import { toCouponPricing } from "./coupons";
import { saveFirstAccountPhone, upsertCustomer } from "./customers";
import { mapOrderableItems, orderableItemsSql } from "./menu";
import { resolveMenuSelection } from "@/server/domain/menu-selection";
import { mapCoupon, mapCustomer, mapDelivery, mapDeliveryZone, mapRestaurant, mapOrder, mapOrderItem, mapOrderItemAddon, mapOrderStatusEvent, mapPayment, branchFilter, num, str, type Row } from "@/server/db/mappers";
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
         (select coalesce(json_agg(m), '[]') from (${orderableItemsSql("$1", "$3", "$5")}) m) as menu,
         case when $4::boolean then
           (select coalesce(json_agg(zs order by zs.sort_order, zs.name), '[]') from (
              -- each zone with its branch's city: delivery coverage never crosses a city (deliveries.ts#servingZones)
              select z.*, l.city as branch_city, l.latitude as branch_latitude, l.longitude as branch_longitude
                from delivery_zones z
                join restaurant1s l on l.id = z.location_id and l.is_active
               where z.restaurant_id = $1 and z.is_active and ($5::uuid is null or z.location_id = $5)) zs)
         end as zones,
         -- the branch named by the tray cookie: must be an active branch of THIS restaurant
         case when $5::uuid is not null then
           (select row_to_json(b) from (select id, city, is_active from restaurant1s where id = $5 and restaurant_id = $1) b)
         end as branch,
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

    // branch: the id comes from a browser cookie, so it is checked here, whatever the order type ---------
    // Multi-branch ordering: every order is cooked by a branch the customer chose. The storefront never
    // gets here without one (checkout redirects to the menu), but a stale or edited cookie could — and an
    // order with no branch is owned by no kitchen. Refuse it rather than guess.
    if (restaurant.features.BranchingFeature && !input.locationId) {
      throw errors.custom("BRANCH_UNAVAILABLE", "Please choose the branch for this order on the menu, then check out again.");
    }
    if (input.locationId) {
      const branch = read?.branch as Row | null | undefined;
      if (!branch || branch.is_active !== true) {
        throw errors.custom("BRANCH_UNAVAILABLE", "That branch is not taking orders. Please choose another branch.");
      }
    }

    // delivery zone -----------------------------------------------------------------------------
    let locationId = input.locationId ?? null;
    let zone: ZonePricing | null = null;
    let zoneRecord: DeliveryZone | null = null;
    if (input.orderType === "delivery") {
      if (!input.address?.line1) {
        throw new PricingError("DELIVERY_ZONE_REQUIRED", "A delivery address is required.");
      }
      const zoneRows = (read?.zones as Row[] | null) ?? [];
      const zones = zoneRows.map(mapDeliveryZone);
      const branches = new Map(
        zoneRows.map((row) => [
          str(row.location_id),
          {
            city: row.branch_city ? str(row.branch_city) : null,
            latitude: row.branch_latitude == null ? null : Number(row.branch_latitude),
            longitude: row.branch_longitude == null ? null : Number(row.branch_longitude),
          },
        ]),
      );
      if (!input.address.city?.trim()) {
        throw new PricingError("DELIVERY_UNAVAILABLE", "Please add the city of your delivery address.");
      }
      // The address decides, never the browser: only zones of THIS order's branch, in the address's city,
      // covering its map pin (drawn area / radius) or, without a pin, its area/postal code. A zone id from
      // the form ("Delivery area") is just a preference among those — one that does not serve is ignored.
      // The pin is the delivery point itself (the rider goes there; it is stored on the order).
      const serving = servingZones(
        zones,
        {
          area: input.address.area ?? null,
          city: input.address.city ?? null,
          postalCode: input.address.postalCode ?? null,
          latitude: input.address.latitude ?? null,
          longitude: input.address.longitude ?? null,
        },
        (zoneLocationId) => branches.get(zoneLocationId),
      );
      zoneRecord = serving.find((candidate) => candidate.id === input.deliveryZoneId) ?? serving[0] ?? null;
      if (!zoneRecord) {
        throw new PricingError("DELIVERY_UNAVAILABLE", "Sorry, this branch does not deliver to that address.");
      }
      // no branch named (single-location / feature-off restaurants): the branch whose zone delivers it is
      // the one that cooks it — record that instead of leaving the order unowned
      locationId ??= zoneRecord.locationId;
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
        locationId,
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

    // `position` = the line's place in the tray (and an add-on's place in its line): one statement
    // writes them all with the same created_at, so it is the only stable sort key (0028)
    const lineStart = push(
      ...resolvedLines.flatMap((line, position) => [
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
        position,
      ]),
    );
    parts.push(`order_lines as (
      insert into order_items
        (id, order_id, restaurant_id, menu_item_id, variant_id, item_name, variant_name, quantity, unit_price,
         addons_total, line_total, special_instructions, position)
      values ${valuesList(resolvedLines.length, 13, { 0: "::uuid", 1: "::uuid", 2: "::uuid", 3: "::uuid", 4: "::uuid", 7: "::int", 8: "::numeric", 9: "::numeric", 10: "::numeric", 12: "::int" }, lineStart)})`);

    const addonRows = resolvedLines.flatMap((line) =>
      line.addons.map((addon, position) => [line.id, addon.addonId, addon.groupName, addon.name, addon.price, addon.quantity, position]),
    );
    if (addonRows.length > 0) {
      const addonStart = push(...addonRows.flat());
      parts.push(`order_addons as (
        insert into order_item_addons (order_item_id, menu_addon_id, group_name, addon_name, unit_price, quantity, position)
        values ${valuesList(addonRows.length, 7, { 0: "::uuid", 1: "::uuid", 4: "::numeric", 5: "::int", 6: "::int" }, addonStart)})`);
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
        locationId,
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
  locationId?: string;
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
    if (filters.locationId) {
      params.push(filters.locationId);
      conditions.push(branchFilter("o", `$${params.length}`));
    }

    const where = conditions.join(" and ");
    // the page and the total in ONE statement (`count(*) over ()` counts every match before LIMIT);
    // only a page past the end (no rows to carry the total) needs the separate count
    const rows = await tx.query<Row>(
      `select o.id, o.order_number, o.status, o.order_type, o.customer_name, o.customer_phone, o.total, o.currency,
              o.payment_status, o.payment_method, o.created_at, o.subtotal, o.discount_amount, o.tax_amount, l.name as location_name,
              (select coalesce(sum(oi.quantity),0) from order_items oi where oi.order_id = o.id) as item_count,
              (select coalesce(json_agg(oi.item_name order by oi.position, oi.created_at), '[]'::json) from order_items oi where oi.order_id = o.id) as item_preview,
              count(*) over () as total_count
         from orders o
         left join restaurant1s l on l.id = o.location_id
        where ${where}
        order by o.created_at desc
        limit ${pageSize} offset ${(page - 1) * pageSize}`,
      params,
    );
    const total =
      rows.length > 0
        ? num(rows[0]!.total_count)
        : page > 1
          ? await tx.queryCount(`select count(*) from orders o where ${where}`, params)
          : 0;

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
      subtotal: toMoney(str(row.subtotal)),
      discountAmount: toMoney(str(row.discount_amount)),
      taxAmount: toMoney(str(row.tax_amount)),
      locationName: row.location_name ? str(row.location_name) : null,
    }));

    return paginate(summaries, total, page, pageSize);
  });
}

/**
 * Sales Reports summary for one restaurant-local calendar-date range (inclusive both ends).
 * Four queries share the same date-range predicate and params so the boundary logic cannot drift
 * between the summary, the status/payment breakdowns and the daily trend. "Sales" always means
 * completed orders only (cancelled/in-progress orders are never counted as revenue).
 */
export async function getSalesAnalytics(
  restaurantId: string,
  filters: { fromDateKey: string; toDateKey: string; timezone: string; locationId?: string | null },
  ctx: RequestContext,
): Promise<SalesAnalytics> {
  const db = getDb({ restaurantId });
  return db.read({ ...ctx, restaurantId }, async (tx) => {
    const params = [restaurantId, filters.fromDateKey, filters.toDateKey, filters.timezone, filters.locationId ?? null];
    // local midnight of fromDateKey .. local midnight of the day after toDateKey, both converted to UTC in SQL;
    // every sub-select shares it, so the branch (null = all) applies to all four breakdowns alike
    const range = `created_at >= ($2::date)::timestamp at time zone $4
                    and created_at < ($3::date + 1)::timestamp at time zone $4
                    and ${branchFilter("orders", "$5")}`;

    // ONE statement for the four breakdowns (they were four queries in a row on the same range):
    // the same SQL as before, each as a sub-select, so totals and boundaries cannot differ
    const report = await tx.queryOne<Row>(
      `select
         (select row_to_json(s) from (
            select count(*) as total_orders,
                   count(*) filter (where status = 'completed') as completed_orders,
                   count(*) filter (where status = 'cancelled') as cancelled_orders,
                   coalesce(sum(total) filter (where status = 'completed'), 0)::text as total_sales,
                   coalesce(sum(discount_amount) filter (where status = 'completed'), 0)::text as total_discounts,
                   coalesce(avg(total) filter (where status = 'completed'), 0)::text as avg_order_value
              from orders where restaurant_id = $1 and ${range}) s) as summary,
         (select coalesce(json_agg(x), '[]'::json) from (
            select status, count(*) as count from orders where restaurant_id = $1 and ${range} group by status) x) as statuses,
         (select coalesce(json_agg(x), '[]'::json) from (
            select payment_method, count(*) as orders, coalesce(sum(total), 0)::text as amount
              from orders where restaurant_id = $1 and ${range} and status = 'completed'
             group by payment_method) x) as payments,
         (select coalesce(json_agg(x order by x.day), '[]'::json) from (
            select to_char(date_trunc('day', created_at at time zone $4), 'YYYY-MM-DD') as day,
                   count(*) as orders,
                   coalesce(sum(total) filter (where status = 'completed'), 0)::text as sales
              from orders where restaurant_id = $1 and ${range}
             group by 1) x) as trend`,
      params,
    );
    const summaryRow = (report?.summary as Row | null) ?? null;
    const statusRows = (report?.statuses as Row[] | null) ?? [];
    const paymentRows = (report?.payments as Row[] | null) ?? [];
    const trendRows = (report?.trend as Row[] | null) ?? [];

    const statusBreakdown = {
      pending: 0, confirmed: 0, preparing: 0, ready: 0, out_for_delivery: 0, completed: 0, cancelled: 0,
    } as Record<OrderStatus, number>;
    for (const row of statusRows) statusBreakdown[str(row.status) as OrderStatus] = num(row.count);

    const totalOrders = num(summaryRow?.total_orders);
    const completedOrders = num(summaryRow?.completed_orders);
    const cancelledOrders = num(summaryRow?.cancelled_orders);

    return {
      totalSales: toMoney(str(summaryRow?.total_sales)),
      totalOrders,
      completedOrders,
      cancelledOrders,
      activeOrders: Math.max(0, totalOrders - completedOrders - cancelledOrders),
      averageOrderValue: toMoney(str(summaryRow?.avg_order_value)),
      totalDiscounts: toMoney(str(summaryRow?.total_discounts)),
      paymentBreakdown: paymentRows.map((row) => ({
        method: str(row.payment_method) as PaymentMethod,
        orders: num(row.orders),
        amount: toMoney(str(row.amount)),
      })),
      statusBreakdown,
      dailyTrend: trendRows.map((row) => ({
        date: str(row.day),
        orders: num(row.orders),
        sales: toMoney(str(row.sales)),
      })),
    };
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
      where oi.order_id = any($1::uuid[]) order by oi.order_id, oi.position, oi.created_at`,
    [orderIds],
  );
  const addons = rows.length
    ? await tx.query<Row>(
        `select * from order_item_addons where order_item_id = any($1::uuid[]) order by order_item_id, position, created_at`,
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
/**
 * How many orders this visitor has in progress — all the storefront layout shows (the floating "track
 * your order" widget and the dock), on EVERY page view of a signed-in customer. It used to load the
 * active orders AND up to 20 past ones, full rows with every item, only to count the active ones (on the
 * hosted pooler response time grows with size: several seconds per page view for a regular customer).
 * Same ownership rule as `listVisitorOrders` (customer id, or a guest's cart token), same RLS context.
 */
export async function countActiveVisitorOrders(restaurantId: string, visitor: RequestContext): Promise<number> {
  const customerId = visitor.customerId ?? null;
  const cartToken = visitor.cartToken ?? null;
  if (!customerId && !cartToken) return 0;
  const ctx: RequestContext = { restaurantId, customerId, cartToken, userId: null };
  const row = await getDb({ restaurantId }).queryOne<Row>(
    ctx,
    customerId
      ? `select count(*) as count from orders o
          where o.restaurant_id = $1 and o.customer_id = $2 and o.status = any($3::order_status[])`
      : `select count(*) as count from orders o join carts c on c.id = o.cart_id
          where o.restaurant_id = $1 and c.session_token = $2 and o.status = any($3::order_status[])`,
    [restaurantId, customerId ?? cartToken, [...ACTIVE_ORDER_STATUSES]],
  );
  return num(row?.count);
}

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

/**
 * The items of order `o` (each with its add-ons) as ONE JSON column, so a page reads an order and its
 * lines in a single statement instead of one query for the lines and another for their add-ons — per
 * order (the kitchen screen used to pay those two round trips for every active ticket). Same rows,
 * same order and the same mappers as the separate queries (`itemsFromJson`).
 */
export const ORDER_ITEMS_JSON = `
  coalesce((
    select json_agg(x order by x.position, x.created_at)
      from (select oi.*, mi.image_url, mi.slug,
                   coalesce((select json_agg(a order by a.position, a.created_at) from order_item_addons a
                              where a.order_item_id = oi.id), '[]'::json) as addon_rows
              from order_items oi left join menu_items mi on mi.id = oi.menu_item_id
             where oi.order_id = o.id) x), '[]'::json) as item_rows
`;

/** Everything an order page shows besides the order row: items, history, latest payment, delivery. */
const ORDER_RELATIONS_JSON = `
  ${ORDER_ITEMS_JSON},
  coalesce((select json_agg(h order by h.created_at) from order_status_history h where h.order_id = o.id), '[]'::json) as history_rows,
  (select row_to_json(p) from (select * from payments where order_id = o.id order by created_at desc limit 1) p) as payment_row,
  (select row_to_json(d) from deliveries d where d.order_id = o.id) as delivery_row
`;

const jsonRows = (value: unknown): Row[] => (Array.isArray(value) ? (value as Row[]) : []);

export function itemsFromJson(value: unknown): OrderItem[] {
  return jsonRows(value).map((row) => mapOrderItem(row, jsonRows(row.addon_rows).map(mapOrderItemAddon)));
}

/** Puts `ORDER_RELATIONS_JSON`'s columns onto the mapped order. */
function applyOrderRelations(order: Order, row: Row): Order {
  order.items = itemsFromJson(row.item_rows);
  order.statusHistory = jsonRows(row.history_rows).map(mapOrderStatusEvent);
  order.payment = row.payment_row ? mapPayment(row.payment_row as Row) : null;
  order.delivery = row.delivery_row ? mapDelivery(row.delivery_row as Row) : null;
  return order;
}

export async function getOrderByNumber(
  restaurantId: string,
  orderNumber: string,
  ctx: RequestContext = {},
  options: { withDetails?: boolean } = { withDetails: true },
): Promise<Order | null> {
  const withDetails = options.withDetails !== false;
  // ONE statement for the order and (withDetails) its items, history, payment and delivery — it was
  // six queries in a row (~2 s on the hosted pooler for every admin order page and tracking page)
  const row = await getDb({ restaurantId }).queryOne<Row>(
    { ...ctx, restaurantId },
    `select ${ORDER_DETAIL_SELECT}${withDetails ? `, ${ORDER_RELATIONS_JSON}` : ""}
       from orders o
       left join restaurant1s l on l.id = o.location_id
       left join delivery_zones dz on dz.id = o.delivery_zone_id
      where o.restaurant_id = $1 and o.order_number = $2`,
    [restaurantId, orderNumber],
  );
  if (!row) return null;
  return withDetails ? applyOrderRelations(mapOrder(row), row) : mapOrder(row);
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
  options: { withDetails?: boolean } = { withDetails: true },
): Promise<Order | null> {
  const withDetails = options.withDetails !== false;
  const db = getDb({ restaurantId });
  return db.write({ restaurantId, actor: "order-access-link" }, async (tx) => {
    const row = await tx.queryOne<Row>(
      `select ${ORDER_DETAIL_SELECT}${withDetails ? `, ${ORDER_RELATIONS_JSON}` : ""}
         from orders o
         left join restaurant1s l on l.id = o.location_id
         left join delivery_zones dz on dz.id = o.delivery_zone_id
        where o.id = $1 and o.restaurant_id = $2 and o.order_number = $3`,
      [orderId, restaurantId, orderNumber],
    );
    if (!row) return null;
    return withDetails ? applyOrderRelations(mapOrder(row), row) : mapOrder(row);
  });
}

export async function getOrderById(
  orderId: string,
  ctx: RequestContext,
  options: { withDetails?: boolean } = { withDetails: true },
): Promise<Order | null> {
  const withDetails = options.withDetails !== false;
  const row = await getDb(ctx).queryOne<Row>(
    ctx,
    `select ${ORDER_DETAIL_SELECT}${withDetails ? `, ${ORDER_RELATIONS_JSON}` : ""}
       from orders o
       left join restaurant1s l on l.id = o.location_id
       left join delivery_zones dz on dz.id = o.delivery_zone_id
      where o.id = $1`,
    [orderId],
  );
  if (!row) return null;
  return withDetails ? applyOrderRelations(mapOrder(row), row) : mapOrder(row);
}

/** Active orders for the kitchen display, oldest first (FIFO). */
export async function listKitchenOrders(restaurantId: string, ctx: RequestContext, locationId: string | null = null): Promise<Order[]> {
  // ONE statement whatever the number of tickets: it used to read each order's items with two more
  // queries, one order after another (~0.7 s per active order on the hosted pooler, every 20 s refresh)
  const rows = await getDb({ restaurantId }).query<Row>(
    { ...ctx, restaurantId },
    `select ${ORDER_DETAIL_SELECT}, ${ORDER_ITEMS_JSON}
       from orders o
       left join restaurant1s l on l.id = o.location_id
       left join delivery_zones dz on dz.id = o.delivery_zone_id
      where o.restaurant_id = $1 and o.status in ('pending','confirmed','preparing','ready')
        and ${branchFilter("o", "$2")}
      order by o.created_at asc
      limit 60`,
    [restaurantId, locationId],
  );
  return rows.map((row) => {
    const order = mapOrder(row);
    order.items = itemsFromJson(row.item_rows);
    return order;
  });
}

export async function listCustomerOrders(
  customerId: string,
  ctx: RequestContext,
  limit = 20,
  locationId: string | null = null,
): Promise<OrderSummary[]> {
  const db = getDb(ctx);
  const rows = await db.read({ ...ctx, customerId }, async (tx) =>
    tx.query<Row>(
      `select o.id, o.order_number, o.status, o.order_type, o.customer_name, o.customer_phone, o.total, o.currency,
              o.payment_status, o.payment_method, o.created_at,
              (select coalesce(sum(oi.quantity),0) from order_items oi where oi.order_id = o.id) as item_count,
              (select coalesce(json_agg(oi.item_name order by oi.position, oi.created_at), '[]'::json) from order_items oi where oi.order_id = o.id) as item_preview
         from orders o
        where o.customer_id = $1 and ${branchFilter("o", "$3")}
        order by o.created_at desc
        limit $2`,
      [customerId, limit, locationId],
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
/** What a status change reports back: nobody needs the whole order (pages re-read it to render). */
export interface OrderStatusChange {
  id: string;
  orderNumber: string;
  status: OrderStatus;
}

/**
 * Moves an order to `status` in ONE statement (plus one more only when a `note` is given). The database
 * does the rest in the same transaction: `enforce_order_status_transition` refuses an invalid move,
 * `record_order_status` writes the history row, `enqueue_order_notification` queues the customer's
 * email/push, `notify_order_change` wakes live tracking, and the delivery/customer-stats triggers follow.
 * It used to re-read the order's items and history afterwards (three more round trips, ~1 s) and return
 * them; no caller used them.
 */
export async function updateOrderStatus(
  orderId: string,
  status: OrderStatus,
  ctx: RequestContext,
  options: { note?: string | null; cancelReason?: string | null } = {},
): Promise<OrderStatusChange> {
  const db = getDb(ctx);
  return db.write(ctx, async (tx) => {
    const row = await tx.queryOne<Row>(
      `update orders set
         status = $2::order_status,
         cancel_reason = case when $2 = 'cancelled' then coalesce($3, cancel_reason) else cancel_reason end
       where id = $1
         -- this runs as app_service (no RLS): keep the caller to their restaurant and, for branch staff,
         -- their branch — an order id from elsewhere is "not found" (0029's guard is the backstop)
         and restaurant_id = coalesce(app.current_restaurant_id(), restaurant_id)
         and app.can_access_location(restaurant_id, location_id)
       returning id, order_number, status`,
      [orderId, status, options.cancelReason ?? null],
    );
    if (!row) throw errors.notFound("Order");
    if (options.note) {
      // the history row is inserted by the trigger above, so it is only visible to a later statement
      await tx.query(
        `update order_status_history set note = $2
          where id = (select id from order_status_history where order_id = $1 order by created_at desc limit 1)`,
        [orderId, options.note],
      );
    }
    return { id: str(row.id), orderNumber: str(row.order_number), status: str(row.status) as OrderStatus };
  });
}

/** Status counters used by the admin dashboard and order tabs. */
export async function countOrdersByStatus(
  restaurantId: string,
  ctx: RequestContext,
  locationId: string | null = null,
): Promise<Record<OrderStatus, number>> {
  const db = getDb({ restaurantId });
  const rows = await db.read({ ...ctx, restaurantId }, async (tx) =>
    tx.query<Row>(
      `select status, count(*) as count from orders o where o.restaurant_id = $1 and ${branchFilter("o", "$2")} group by status`,
      [restaurantId, locationId],
    ),
  );
  const counts = {
    pending: 0, confirmed: 0, preparing: 0, ready: 0, out_for_delivery: 0, completed: 0, cancelled: 0,
  } as Record<OrderStatus, number>;
  for (const row of rows) counts[str(row.status) as OrderStatus] = num(row.count);
  return counts;
}

export async function listRecentOrders(
  restaurantId: string,
  ctx: RequestContext,
  limit = 8,
  locationId: string | null = null,
): Promise<OrderSummary[]> {
  const result = await listOrders(restaurantId, { page: 1, pageSize: limit, locationId: locationId ?? undefined }, ctx);
  return result.rows;
}

export interface OrderActivityEvent {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  /** created_at === updated_at (to the second): this row is a brand-new order, not a status change */
  isNew: boolean;
  updatedAt: string;
}

/**
 * Rows touched since `sinceIso`, for the admin's order-sound polling (no SSE/LISTEN infra for a
 * multi-order staff feed exists yet — see KitchenAutoRefresh's own comment; this is the same
 * poll-don't-push tradeoff, just for "did anything change" instead of a full page refresh).
 */
export async function listOrderActivitySince(
  restaurantId: string,
  sinceIso: string,
  ctx: RequestContext,
  locationId: string | null = null,
): Promise<OrderActivityEvent[]> {
  const db = getDb({ restaurantId });
  const rows = await db.read({ ...ctx, restaurantId }, async (tx) =>
    tx.query<Row>(
      `select id, order_number, status, updated_at, (updated_at = created_at) as is_new
         from orders o
        where o.restaurant_id = $1 and o.updated_at > $2::timestamptz and ${branchFilter("o", "$3")}
        order by o.updated_at asc
        limit 50`,
      [restaurantId, sinceIso, locationId],
    ),
  );
  return rows.map((row) => ({
    id: str(row.id),
    orderNumber: str(row.order_number),
    status: str(row.status) as OrderStatus,
    isNew: Boolean(row.is_new),
    updatedAt: new Date(String(row.updated_at)).toISOString(),
  }));
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
    const items = await tx.query<Row>(`select * from order_items where order_id = $1 order by position, created_at`, [orderId]);
    const addons = items.length
      ? await tx.query<Row>(`select * from order_item_addons where order_item_id = any($1::uuid[]) order by position, created_at`, [items.map((row) => str(row.id))])
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
