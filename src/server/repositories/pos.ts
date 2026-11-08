import { randomUUID } from "node:crypto";
import { dec, toMoney } from "@/shared/money";
import type { PaymentMethod } from "@/shared/contract/enums";
import {
  formatInvoiceNumber,
  POS_TENDER_LABELS,
  POS_TENDER_METHOD,
  type FiscalInvoiceView,
  type FiscalStatus,
  type PosDevice,
  type PosOp,
  type PosOpResult,
  type PosShift,
  type FiscalInvoiceDocument,
  type FiscalOutcome,
  type ReceiptLine,
  type ZReport,
  type ZReportTender,
} from "@/shared/pos";
import { breakdownForStorage, estimateReadyAt } from "@/server/domain/pricing";
import { priceTicket, saleTaxMethod, validateTenders } from "@/server/domain/pos";
import { resolveMenuSelection } from "@/server/domain/menu-selection";
import { errors } from "@/server/errors";
import { mapRestaurant, num, str, strOrNull, iso, isoRequired, dateOnly, type Row } from "@/server/db/mappers";
import { type DbClient } from "@/server/db/database";
import { getDb } from "@/server/db/registry";
import { type RequestContext } from "@/server/context";
import { mapOrderableItems, orderableItemsSql } from "./menu";

/**
 * In-store POS (SKILL.md §43). A counter sale is an ordinary `orders` row (source 'pos'), its tenders are
 * `payments`, so the kitchen board, admin orders, reports and the payment -> order trigger see it unchanged.
 * Added here: tills (pos_devices), shifts, fiscal invoices (immutable, PRA queue) and the audit log.
 *
 * Every write runs as app_service after the service checked pos.use / pos.manage; reads that list rows run as
 * app_runtime so RLS (restaurant + branch) decides what a cashier sees.
 */

/** Who is acting at the till: the staff member (team_members.id) and their login (auth.users.id). */
export interface PosActor {
  restaurantId: string;
  memberId: string;
  userId: string;
  name: string;
}

// ---------------------------------------------------------------------------------------------------------------
// mappers
// ---------------------------------------------------------------------------------------------------------------

const DEVICE_COLUMNS = `d.id, d.restaurant_id, d.location_id, l.name as location_name, d.name, d.code, d.last_invoice_seq, d.is_active`;

function mapDevice(row: Row): PosDevice {
  return {
    id: str(row.id),
    restaurantId: str(row.restaurant_id),
    locationId: str(row.location_id),
    locationName: str(row.location_name),
    name: str(row.name),
    code: str(row.code),
    lastInvoiceSeq: num(row.last_invoice_seq),
    isActive: row.is_active === true,
  };
}

function mapShift(row: Row): PosShift {
  return {
    id: str(row.id),
    deviceId: str(row.device_id),
    locationId: str(row.location_id),
    shiftNumber: num(row.shift_number),
    businessDate: dateOnly(row.business_date),
    status: row.status === "closed" ? "closed" : "open",
    openedByName: str(row.opened_by_name),
    openedAt: isoRequired(row.opened_at),
    openingFloat: toMoney(str(row.opening_float) || "0"),
    closedAt: iso(row.closed_at),
    closedByName: strOrNull(row.closed_by_name),
    countedCash: row.counted_cash == null ? null : toMoney(str(row.counted_cash)),
    expectedCash: row.expected_cash == null ? null : toMoney(str(row.expected_cash)),
  };
}

function mapInvoice(row: Row): FiscalInvoiceView {
  return {
    id: str(row.id),
    orderId: str(row.order_id),
    kind: row.kind === "credit_note" ? "credit_note" : "sale",
    invoiceNumber: str(row.invoice_number),
    issuedAt: isoRequired(row.issued_at),
    paymentMethod: str(row.payment_method) as PaymentMethod,
    total: toMoney(str(row.total)),
    taxAmount: toMoney(str(row.tax_amount)),
    status: str(row.status) as FiscalStatus,
    authorityInvoiceNumber: strOrNull(row.authority_invoice_number),
    qrPayload: strOrNull(row.qr_payload),
    lastError: strOrNull(row.last_error),
  };
}

function actorContext(actor: PosActor, ctx: RequestContext): RequestContext {
  return { ...ctx, restaurantId: actor.restaurantId, userId: actor.userId, customerId: null, actor: actor.name };
}

async function audit(
  tx: DbClient,
  actor: PosActor,
  entry: { action: string; entityType: string; entityId: string | null; locationId: string | null; details?: Record<string, unknown> },
): Promise<void> {
  await tx.query(
    `insert into audit_log (restaurant_id, location_id, actor_member_id, actor_name, action, entity_type, entity_id, details)
     values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)`,
    [actor.restaurantId, entry.locationId, actor.memberId, actor.name, entry.action, entry.entityType, entry.entityId, JSON.stringify(entry.details ?? {})],
  );
}

// ---------------------------------------------------------------------------------------------------------------
// tills
// ---------------------------------------------------------------------------------------------------------------

/** Tills the caller can see (RLS: pos.use, own branch for branch-scoped staff). */
export async function listDevices(restaurantId: string, ctx: RequestContext): Promise<PosDevice[]> {
  const rows = await getDb({ restaurantId }).query<Row>(
    { ...ctx, restaurantId },
    `select ${DEVICE_COLUMNS} from pos_devices d join restaurant1s l on l.id = d.location_id
      where d.restaurant_id = $1 and d.is_active order by l.name, d.name`,
    [restaurantId],
  );
  return rows.map(mapDevice);
}

/** One till, if the caller can see it (RLS) — the branch check every till action starts with. */
export async function findDevice(restaurantId: string, deviceId: string, ctx: RequestContext): Promise<PosDevice | null> {
  const row = await getDb({ restaurantId }).queryOne<Row>(
    { ...ctx, restaurantId },
    `select ${DEVICE_COLUMNS} from pos_devices d join restaurant1s l on l.id = d.location_id
      where d.restaurant_id = $1 and d.id = $2`,
    [restaurantId, deviceId],
  );
  return row ? mapDevice(row) : null;
}

export async function registerDevice(
  input: { locationId: string; name: string; code: string },
  actor: PosActor,
  ctx: RequestContext,
): Promise<PosDevice> {
  return getDb({ restaurantId: actor.restaurantId }).write(actorContext(actor, ctx), async (tx) => {
    const row = await tx.queryOne<Row>(
      `with d as (
         insert into pos_devices (restaurant_id, location_id, name, code, registered_by)
         select $1, l.id, $3, $4, $5 from restaurant1s l where l.id = $2 and l.restaurant_id = $1 and l.is_active
         returning *)
       select ${DEVICE_COLUMNS} from d join restaurant1s l on l.id = d.location_id`,
      [actor.restaurantId, input.locationId, input.name.trim(), input.code, actor.memberId],
    );
    if (!row) throw errors.notFound("Branch");
    const device = mapDevice(row);
    await audit(tx, actor, { action: "pos.device_registered", entityType: "pos_device", entityId: device.id, locationId: device.locationId, details: { name: device.name, code: device.code } });
    return device;
  });
}

// ---------------------------------------------------------------------------------------------------------------
// shifts
// ---------------------------------------------------------------------------------------------------------------

export async function getOpenShift(restaurantId: string, deviceId: string, ctx: RequestContext): Promise<PosShift | null> {
  const row = await getDb({ restaurantId }).queryOne<Row>(
    { ...ctx, restaurantId },
    `select * from pos_shifts where restaurant_id = $1 and device_id = $2 and status = 'open'`,
    [restaurantId, deviceId],
  );
  return row ? mapShift(row) : null;
}

export async function getShift(restaurantId: string, shiftId: string, ctx: RequestContext): Promise<PosShift | null> {
  const row = await getDb({ restaurantId }).queryOne<Row>(
    { ...ctx, restaurantId },
    `select * from pos_shifts where restaurant_id = $1 and id = $2`,
    [restaurantId, shiftId],
  );
  return row ? mapShift(row) : null;
}

const ONE_OPEN_SHIFT = "pos_shifts_one_open_per_device";

/** Opens the till's shift; `businessDate` is the restaurant's calendar day. One open shift per till (unique index). */
export async function openShift(
  input: { deviceId: string; openingFloat: string; businessDate: string },
  actor: PosActor,
  ctx: RequestContext,
): Promise<PosShift> {
  try {
    return await getDb({ restaurantId: actor.restaurantId }).write(actorContext(actor, ctx), async (tx) => {
      const row = await tx.queryOne<Row>(
        `insert into pos_shifts (restaurant_id, location_id, device_id, shift_number, business_date, opened_by, opened_by_name, opening_float)
         select d.restaurant_id, d.location_id, d.id,
                coalesce((select max(shift_number) from pos_shifts s where s.device_id = d.id and s.business_date = $3::date), 0) + 1,
                $3::date, $4, $5, $6::numeric
           from pos_devices d where d.id = $1 and d.restaurant_id = $2 and d.is_active
         returning *`,
        [input.deviceId, actor.restaurantId, input.businessDate, actor.memberId, actor.name, input.openingFloat],
      );
      if (!row) throw errors.notFound("Till");
      const shift = mapShift(row);
      await audit(tx, actor, { action: "pos.shift_opened", entityType: "pos_shift", entityId: shift.id, locationId: shift.locationId, details: { openingFloat: shift.openingFloat, shiftNumber: shift.shiftNumber } });
      return shift;
    });
  } catch (error) {
    if ((error as { constraint?: string }).constraint === ONE_OPEN_SHIFT) throw errors.conflict("This till already has an open shift.");
    throw error;
  }
}

// ---------------------------------------------------------------------------------------------------------------
// tickets and sales (the till's queued ops)
// ---------------------------------------------------------------------------------------------------------------

/** Constraints a concurrent retry of the same op can trip: run once more and the read finds the winner's rows. */
const RETRY_CONSTRAINTS = new Set(["orders_pos_idempotency_uidx", "order_items_client_line_uidx", "payments_idempotency_uidx", "fiscal_invoices_one_sale_per_order"]);

/**
 * Applies one queued till op in ONE transaction, idempotently: a ticket creates the order (or adds the lines it
 * does not have yet); a sale also prices it with the tender's tax rate, records the tenders and issues the fiscal
 * invoice under the number the till printed. Replaying an op that was already applied writes nothing.
 */
export async function applyPosOp(op: PosOp, actor: PosActor, ctx: RequestContext, now = new Date()): Promise<PosOpResult> {
  const db = getDb({ restaurantId: actor.restaurantId });
  const context = actorContext(actor, ctx);
  try {
    return await db.write(context, (tx) => applyInTransaction(tx, op, actor, now));
  } catch (error) {
    const constraint = (error as { code?: string; constraint?: string }).constraint;
    if ((error as { code?: string }).code === "23505" && constraint && RETRY_CONSTRAINTS.has(constraint)) {
      return db.write(context, (tx) => applyInTransaction(tx, op, actor, now));
    }
    throw error;
  }
}

interface ExistingOrder {
  id: string;
  order_number: string;
  status: string;
  payment_status: string;
  line_count: number;
  client_line_ids: string[];
  lines: { unit_price: string; addons_total: string; quantity: number }[];
  invoice_number: string | null;
}

async function applyInTransaction(tx: DbClient, op: PosOp, actor: PosActor, now: Date): Promise<PosOpResult> {
  const ticket = op.ticket;
  const sale = op.kind === "sale" ? op.sale : null;

  // 1 ─ everything the op is decided from, in one statement --------------------------------------------------
  const read = await tx.queryOne<Row>(
    `select
       (select row_to_json(r) from (select id, name, slug, status, currency, currency_symbol, locale, timezone, country,
                                           features, entitlements, settings, checkout_mode
                                      from restaurants where id = $1) r) as restaurant,
       (select row_to_json(s) from (select s.id, s.status, s.location_id, s.device_id, d.code as device_code, d.is_active as device_active
                                      from pos_shifts s join pos_devices d on d.id = s.device_id
                                     where s.id = $2 and s.restaurant_id = $1 for share of s) s) as shift,
       (select row_to_json(o) from (
          select o.id, o.order_number, o.status, o.payment_status,
                 (select count(*) from order_items oi where oi.order_id = o.id)::int as line_count,
                 (select coalesce(json_agg(oi.client_line_id), '[]') from order_items oi
                   where oi.order_id = o.id and oi.client_line_id is not null) as client_line_ids,
                 (select coalesce(json_agg(json_build_object('unit_price', oi.unit_price::text, 'addons_total', oi.addons_total::text,
                                                             'quantity', oi.quantity)), '[]')
                    from order_items oi where oi.order_id = o.id) as lines,
                 (select f.invoice_number from fiscal_invoices f where f.order_id = o.id and f.kind = 'sale') as invoice_number
            from orders o
           where o.restaurant_id = $1 and o.source = 'pos' and o.idempotency_key = $3::uuid
           for update of o) o) as existing,
       (select coalesce(json_agg(m), '[]') from (${orderableItemsSql("$1", "$4", "(select location_id from pos_shifts where id = $2)")}) m) as menu,
       case when $5::bigint is not null then
         (select f.order_id from fiscal_invoices f join pos_shifts s on s.device_id = f.device_id
           where s.id = $2 and f.invoice_seq = $5::bigint)
       end as seq_owner`,
    [
      actor.restaurantId,
      op.shiftId,
      ticket.clientOrderId,
      [...new Set(ticket.lines.map((line) => line.menuItemId))],
      sale ? sale.invoiceSeq : null,
    ],
  );

  const restaurant = read?.restaurant ? mapRestaurant(read.restaurant as Row) : null;
  if (!restaurant) throw errors.notFound("Restaurant");
  const existing = (read?.existing as ExistingOrder | null) ?? null;

  // a sale already invoiced: this is a retry — answer with what was issued, whatever changed since
  if (sale && existing?.invoice_number) {
    return { id: op.id, ok: true, replayed: true, orderId: existing.id, orderNumber: existing.order_number, invoiceNumber: existing.invoice_number };
  }

  const shift = read?.shift as Row | null | undefined;
  if (!shift) throw errors.notFound("Shift");
  if (shift.status !== "open" || shift.device_active !== true) {
    throw errors.custom("SHIFT_CLOSED", "This shift is closed. Open a new shift to take orders.");
  }
  const locationId = str(shift.location_id);
  const deviceId = str(shift.device_id);

  if (existing && existing.status === "cancelled") throw errors.custom("ORDER_PAID", "This order was cancelled.");
  const knownLines = new Set(existing?.client_line_ids ?? []);
  const newLines = ticket.lines.filter((line) => !knownLines.has(line.clientLineId));
  if (existing && (existing.payment_status === "paid" || existing.invoice_number)) {
    if (newLines.length === 0 && !sale) {
      return { id: op.id, ok: true, replayed: true, orderId: existing.id, orderNumber: existing.order_number };
    }
    throw errors.custom("ORDER_PAID", "This order is already paid. Start a new ticket for more items.");
  }
  if (!existing && newLines.length === 0) throw errors.custom("CART_EMPTY", "Add an item first.");

  // 2 ─ the new lines, re-priced from the live menu (the till sends ids and quantities only) ------------------
  const menu = mapOrderableItems((read?.menu as Row[] | undefined) ?? []);
  let maxPrep = restaurant.settings.ordering.preparationTimeMinutes;
  const resolved = newLines.map((line) => {
    const selection = resolveMenuSelection(menu.get(line.menuItemId), line, restaurant.timezone, now);
    maxPrep = Math.max(maxPrep, selection.item.prepTimeMinutes);
    return {
      id: randomUUID(),
      clientLineId: line.clientLineId,
      itemId: selection.item.id,
      variantId: selection.variant?.id ?? null,
      itemName: selection.item.name,
      variantName: selection.variant?.name ?? null,
      unitPrice: selection.unitPrice,
      addonsTotal: selection.addonsTotal,
      quantity: Math.min(Math.max(1, Math.trunc(line.quantity) || 1), 99),
      notes: line.notes?.slice(0, 300) || null,
      addons: selection.addons,
    };
  });

  // 3 ─ price the whole ticket: unpaid at the cash rate; a sale at its tender's rate -------------------------
  const paymentMethod: PaymentMethod | null = sale ? saleTaxMethod(sale.tenders) : null;
  const allLines = [
    ...(existing?.lines ?? []).map((line) => ({ unitPrice: line.unit_price, addonsTotal: line.addons_total, quantity: line.quantity })),
    ...resolved.map((line) => ({ unitPrice: line.unitPrice, addonsTotal: line.addonsTotal, quantity: line.quantity })),
  ];
  const pricing = priceTicket(allLines, ticket.orderType, restaurant.settings, paymentMethod);
  let changeDue = "0.00";
  if (sale) {
    // the till's own tenders must add up to what it printed (a broken till payload is refused, not recorded)
    changeDue = validateTenders(sale.expectedTotal, sale.tenders);
    if (read?.seq_owner && (!existing || str(read.seq_owner) !== existing.id)) {
      throw errors.custom("INVOICE_SEQ_TAKEN", `Invoice ${formatInvoiceNumber(str(shift.device_code), sale.invoiceSeq)} was already used on this till.`);
    }
  }

  // 4 ─ the order ------------------------------------------------------------------------------------------
  const customerName =
    ticket.customerName?.trim() ||
    (ticket.orderType === "dine_in" && ticket.tableNumber ? `Table ${ticket.tableNumber.trim()}` : "Walk-in");
  const orderValues = [
    pricing.subtotal, pricing.discount, pricing.deliveryFee, pricing.tax, pricing.serviceFee, pricing.total,
    pricing.taxRate, JSON.stringify(breakdownForStorage(pricing, now)), paymentMethod ?? "cash",
  ];
  let orderId: string;
  let orderNumber: string;
  if (existing) {
    orderId = existing.id;
    orderNumber = existing.order_number;
    await tx.query(
      `update orders set subtotal = $2::numeric, discount_amount = $3::numeric, delivery_fee = $4::numeric, tax_amount = $5::numeric,
              service_fee = $6::numeric, total = $7::numeric, tax_rate = $8::numeric, pricing_breakdown = $9::jsonb,
              payment_method = $10::payment_method, table_number = $11, guests = $12, customer_name = $13, notes = $14, updated_at = now()
        where id = $1`,
      [orderId, ...orderValues, ticket.tableNumber ?? null, ticket.guests ?? null, customerName, ticket.notes ?? null],
    );
  } else {
    const row = await tx.queryOne<Row>(
      `insert into orders
         (restaurant_id, location_id, order_type, status, confirmed_at, customer_name, customer_phone, delivery_address,
          table_number, guests, subtotal, discount_amount, delivery_fee, tax_amount, service_fee, tip_amount, total, currency,
          tax_rate, pricing_breakdown, payment_method, payment_status, notes, placed_by, estimated_ready_at,
          idempotency_key, source, pos_device_id, pos_shift_id)
       values ($1, $2, $3, 'confirmed', now(), $4, $5, $6::jsonb, $7, $8, $9::numeric, $10::numeric, $11::numeric, $12::numeric,
               $13::numeric, 0, $14::numeric, $15, $16::numeric, $17::jsonb, $18::payment_method, 'pending', $19, 'staff',
               $20::timestamptz, $21::uuid, 'pos', $22, $23)
       returning id, order_number`,
      [
        actor.restaurantId, locationId, ticket.orderType, customerName, ticket.customerPhone?.trim() ?? "",
        ticket.orderType === "delivery" && ticket.address?.trim() ? JSON.stringify({ line1: ticket.address.trim() }) : null,
        ticket.tableNumber ?? null, ticket.guests ?? null,
        ...orderValues.slice(0, 5), orderValues[5], restaurant.currency, orderValues[6], orderValues[7], orderValues[8],
        ticket.notes ?? null, estimateReadyAt(maxPrep, ticket.orderType, now).toISOString(), ticket.clientOrderId, deviceId, op.shiftId,
      ],
    );
    if (!row) throw errors.internal("Unable to create the order");
    orderId = str(row.id);
    orderNumber = str(row.order_number);
  }

  // 5 ─ new lines (+ add-ons, + delivery row for a new delivery order) in one statement -------------------------
  const params: unknown[] = [];
  const push = (...values: unknown[]) => {
    const start = params.length;
    params.push(...values);
    return start;
  };
  const parts: string[] = [];
  const offset = existing?.line_count ?? 0;
  if (resolved.length > 0) {
    const rows = resolved.map((line, index) => {
      const start = push(
        line.id, orderId, actor.restaurantId, line.itemId, line.variantId, line.itemName, line.variantName, line.quantity,
        line.unitPrice, line.addonsTotal, toMoney(dec(line.unitPrice).plus(dec(line.addonsTotal)).times(line.quantity)),
        line.notes, offset + index, line.clientLineId,
      );
      const p = (n: number) => `$${start + n}`;
      return `(${p(1)}::uuid,${p(2)}::uuid,${p(3)}::uuid,${p(4)}::uuid,${p(5)}::uuid,${p(6)},${p(7)},${p(8)}::int,${p(9)}::numeric,${p(10)}::numeric,${p(11)}::numeric,${p(12)},${p(13)}::int,${p(14)}::uuid)`;
    });
    parts.push(`lines as (
      insert into order_items (id, order_id, restaurant_id, menu_item_id, variant_id, item_name, variant_name, quantity, unit_price,
                               addons_total, line_total, special_instructions, position, client_line_id)
      values ${rows.join(",")} returning id)`);
    const addonRows = resolved.flatMap((line) =>
      line.addons.map((addon, position) => {
        const start = push(line.id, addon.addonId, addon.groupName, addon.name, addon.price, addon.quantity, position);
        const p = (n: number) => `$${start + n}`;
        return `(${p(1)}::uuid,${p(2)}::uuid,${p(3)},${p(4)},${p(5)}::numeric,${p(6)}::int,${p(7)}::int)`;
      }),
    );
    if (addonRows.length > 0) {
      parts.push(`addons as (
        insert into order_item_addons (order_item_id, menu_addon_id, group_name, addon_name, unit_price, quantity, position)
        values ${addonRows.join(",")})`);
    }
  }
  if (!existing && ticket.orderType === "delivery") {
    const start = push(actor.restaurantId, orderId, locationId);
    parts.push(`delivery as (
      insert into deliveries (restaurant_id, order_id, location_id, status, delivery_fee)
      values ($${start + 1}::uuid, $${start + 2}::uuid, $${start + 3}::uuid, 'unassigned', 0))`);
  }
  if (parts.length > 0) await tx.query(`with ${parts.join(",\n")} select 1`, params);

  if (!sale) return { id: op.id, ok: true, orderId, orderNumber };

  // 6 ─ the sale: tenders, fiscal invoice, the till's counter, audit ------------------------------------------
  const tenderParams: unknown[] = [];
  const tenderRows = sale.tenders.map((tender) => {
    const { method, provider } = POS_TENDER_METHOD[tender.tender];
    const change = tender.tendered == null ? "0.00" : toMoney(dec(tender.tendered).minus(dec(tender.amount)));
    const start = tenderParams.length;
    tenderParams.push(actor.restaurantId, orderId, provider, method, tender.amount, restaurant.currency, op.shiftId, deviceId,
      tender.tendered ?? null, change, tender.clientPaymentId, actor.memberId);
    const p = (n: number) => `$${start + n}`;
    return `(${p(1)}::uuid,${p(2)}::uuid,${p(3)},${p(4)}::payment_method,'paid',${p(5)}::numeric,${p(6)},now(),${p(7)}::uuid,${p(8)}::uuid,${p(9)}::numeric,${p(10)}::numeric,${p(11)}::uuid,${p(12)}::uuid)`;
  });
  await tx.query(
    `insert into payments (restaurant_id, order_id, provider, method, status, amount, currency, paid_at, shift_id, device_id,
                           tendered_amount, change_amount, idempotency_key, received_by)
     values ${tenderRows.join(",")}
     on conflict (restaurant_id, idempotency_key) where idempotency_key is not null do nothing`,
    tenderParams,
  );

  const invoiceNumber = formatInvoiceNumber(str(shift.device_code), sale.invoiceSeq);
  await tx.query(
    `insert into fiscal_invoices
       (restaurant_id, location_id, order_id, device_id, shift_id, kind, invoice_seq, invoice_number, issued_at, cashier_id,
        cashier_name, payment_method, subtotal, discount_amount, service_fee, tax_rate, tax_amount, total, currency, lines)
     select $1, $2, $3, $4, $5, 'sale', $6::bigint, $7, $8::timestamptz, $9, $10, $11::payment_method, $12::numeric, $13::numeric,
            $14::numeric, $15::numeric, $16::numeric, $17::numeric, $18,
            (select coalesce(json_agg(json_build_object('name', oi.item_name, 'variant', oi.variant_name, 'quantity', oi.quantity,
                                                        'unitPrice', (oi.unit_price + oi.addons_total)::text, 'lineTotal', oi.line_total::text)
                                      order by oi.position, oi.created_at), '[]')
               from order_items oi where oi.order_id = $3)`,
    [
      actor.restaurantId, locationId, orderId, deviceId, op.shiftId, sale.invoiceSeq, invoiceNumber, sale.issuedAt, actor.memberId,
      actor.name, paymentMethod, pricing.subtotal, pricing.discount, pricing.serviceFee, pricing.taxRate, pricing.tax, pricing.total,
      restaurant.currency,
    ],
  );
  await tx.query(
    `update pos_devices set last_invoice_seq = greatest(last_invoice_seq, $2::bigint), last_seen_at = now() where id = $1`,
    [deviceId, sale.invoiceSeq],
  );

  const mismatch = dec(sale.expectedTotal).equals(dec(pricing.total)) ? null : { expected: toMoney(sale.expectedTotal), actual: pricing.total };
  await audit(tx, actor, {
    action: mismatch ? "pos.sale_total_mismatch" : "pos.sale",
    entityType: "order",
    entityId: orderId,
    locationId,
    details: { invoiceNumber, total: pricing.total, method: paymentMethod, changeDue, ...(mismatch ? { printedTotal: mismatch.expected } : {}) },
  });
  return { id: op.id, ok: true, orderId, orderNumber, invoiceNumber, totalMismatch: mismatch };
}

// ---------------------------------------------------------------------------------------------------------------
// invoices, credit notes
// ---------------------------------------------------------------------------------------------------------------

export async function getInvoiceForOrder(restaurantId: string, orderId: string, ctx: RequestContext): Promise<FiscalInvoiceView | null> {
  const row = await getDb({ restaurantId }).queryOne<Row>(
    { ...ctx, restaurantId },
    `select * from fiscal_invoices where restaurant_id = $1 and order_id = $2 and kind = 'sale'`,
    [restaurantId, orderId],
  );
  return row ? mapInvoice(row) : null;
}

/** The till's recent invoices (sales + credit notes) on one shift, newest first. */
export async function listShiftInvoices(restaurantId: string, shiftId: string, ctx: RequestContext, limit = 50): Promise<(FiscalInvoiceView & { orderNumber: string; tableNumber: string | null; refunded: boolean })[]> {
  const rows = await getDb({ restaurantId }).query<Row>(
    { ...ctx, restaurantId },
    `select f.*, o.order_number, o.table_number,
            exists (select 1 from fiscal_invoices c where c.original_invoice_id = f.id) as refunded
       from fiscal_invoices f join orders o on o.id = f.order_id
      where f.restaurant_id = $1 and f.shift_id = $2
      order by f.issued_at desc limit $3`,
    [restaurantId, shiftId, limit],
  );
  return rows.map((row) => ({ ...mapInvoice(row), orderNumber: str(row.order_number), tableNumber: strOrNull(row.table_number), refunded: row.refunded === true }));
}

/**
 * A full refund of an issued sale: a credit note (its own number from the till's sequence, same amounts, linked to
 * the original) on the CURRENT shift, and the order's tenders marked refunded. The original invoice is untouched.
 */
export async function issueCreditNote(
  input: { originalInvoiceId: string; shiftId: string; invoiceSeq: number; reason: string; issuedAt: string },
  actor: PosActor,
  ctx: RequestContext,
): Promise<FiscalInvoiceView> {
  return getDb({ restaurantId: actor.restaurantId }).write(actorContext(actor, ctx), async (tx) => {
    const read = await tx.queryOne<Row>(
      `select (select row_to_json(f) from (select * from fiscal_invoices where id = $1 and restaurant_id = $2 and kind = 'sale' for update) f) as original,
              (select row_to_json(s) from (select s.id, s.status, s.device_id, s.location_id, d.code as device_code
                                             from pos_shifts s join pos_devices d on d.id = s.device_id
                                            where s.id = $3 and s.restaurant_id = $2 for share of s) s) as shift,
              exists (select 1 from fiscal_invoices where original_invoice_id = $1) as already_refunded`,
      [input.originalInvoiceId, actor.restaurantId, input.shiftId],
    );
    const original = read?.original as Row | null;
    const shift = read?.shift as Row | null;
    if (!original) throw errors.notFound("Invoice");
    if (!shift || shift.status !== "open") throw errors.custom("SHIFT_CLOSED", "Open a shift to issue a refund.");
    if (read?.already_refunded) throw errors.conflict("This invoice was already refunded.");
    if (str(shift.location_id) !== str(original.location_id)) throw errors.forbidden("Refund the sale at the branch that made it.");

    const invoiceNumber = formatInvoiceNumber(str(shift.device_code), input.invoiceSeq);
    const row = await tx.queryOne<Row>(
      `insert into fiscal_invoices
         (restaurant_id, location_id, order_id, device_id, shift_id, kind, original_invoice_id, invoice_seq, invoice_number, issued_at,
          cashier_id, cashier_name, payment_method, subtotal, discount_amount, service_fee, tax_rate, tax_amount, total, currency, lines)
       select restaurant_id, location_id, order_id, $2, $3, 'credit_note', id, $4::bigint, $5, $6::timestamptz, $7, $8,
              payment_method, subtotal, discount_amount, service_fee, tax_rate, tax_amount, total, currency, lines
         from fiscal_invoices where id = $1
       returning *`,
      [input.originalInvoiceId, str(shift.device_id), input.shiftId, input.invoiceSeq, invoiceNumber, input.issuedAt, actor.memberId, actor.name],
    );
    if (!row) throw errors.internal("Unable to issue the credit note");
    await tx.query(`update payments set status = 'refunded' where order_id = $1 and status = 'paid'`, [str(original.order_id)]);
    await tx.query(
      `update pos_devices set last_invoice_seq = greatest(last_invoice_seq, $2::bigint), last_seen_at = now() where id = $1`,
      [str(shift.device_id), input.invoiceSeq],
    );
    await audit(tx, actor, {
      action: "pos.credit_note",
      entityType: "fiscal_invoice",
      entityId: str(row.id),
      locationId: str(row.location_id),
      details: { invoiceNumber, originalInvoiceNumber: str(original.invoice_number), total: str(original.total), reason: input.reason },
    });
    return mapInvoice(row);
  });
}

// ---------------------------------------------------------------------------------------------------------------
// Z-report and day close
// ---------------------------------------------------------------------------------------------------------------

const TENDER_ORDER = ["cash", "card_terminal", "jazzcash", "easypaisa", "raast"] as const;
const PROVIDER_LABELS: Record<string, string> = {
  cash: POS_TENDER_LABELS.cash,
  card_terminal: POS_TENDER_LABELS.card,
  jazzcash: POS_TENDER_LABELS.jazzcash,
  easypaisa: POS_TENDER_LABELS.easypaisa,
  raast: POS_TENDER_LABELS.raast,
};

/** The shift's figures in one statement (also used, frozen, as the shift's z_report at close). */
async function readZReport(tx: DbClient, restaurantId: string, shiftId: string, countedCash: string | null): Promise<ZReport | null> {
  const row = await tx.queryOne<Row>(
    `select s.id, s.opening_float::text as opening_float,
            (select count(*) from fiscal_invoices f where f.shift_id = s.id and f.kind = 'sale')::int as sales_count,
            (select count(*) from fiscal_invoices f where f.shift_id = s.id and f.kind = 'credit_note')::int as credit_notes,
            (select coalesce(sum(case when f.kind = 'sale' then f.total - f.tax_amount else -(f.total - f.tax_amount) end), 0)::text
               from fiscal_invoices f where f.shift_id = s.id) as net_sales,
            (select coalesce(sum(case when f.kind = 'sale' then f.tax_amount else -f.tax_amount end), 0)::text
               from fiscal_invoices f where f.shift_id = s.id) as tax,
            (select coalesce(sum(case when f.kind = 'sale' then f.total else -f.total end), 0)::text
               from fiscal_invoices f where f.shift_id = s.id) as takings,
            (select coalesce(json_object_agg(provider, amount), '{}') from (
               select p.provider, sum(p.amount)::text as amount from payments p
                where p.shift_id = s.id and p.status in ('paid', 'refunded') group by p.provider) received) as received,
            -- refunds given on THIS shift, by the tender the original sale was paid with
            (select coalesce(json_object_agg(provider, amount), '{}') from (
               select p.provider, sum(p.amount)::text as amount
                 from fiscal_invoices c join payments p on p.order_id = c.order_id and p.shift_id is not null
                where c.shift_id = s.id and c.kind = 'credit_note' group by p.provider) refunded) as refunded,
            (select json_build_object(
                'synced', count(*) filter (where f.status = 'synced'),
                'pending', count(*) filter (where f.status = 'pending'),
                'failed', count(*) filter (where f.status = 'failed'))
               from fiscal_invoices f where f.shift_id = s.id) as fiscal,
            (select count(*) from orders o where o.pos_shift_id = s.id)::int as orders,
            (select count(*) from orders o where o.pos_shift_id = s.id and o.payment_status <> 'paid'
                and o.payment_status <> 'refunded' and o.status <> 'cancelled')::int as unpaid
       from pos_shifts s where s.id = $1 and s.restaurant_id = $2`,
    [shiftId, restaurantId],
  );
  if (!row) return null;
  const received = (row.received ?? {}) as Record<string, string>;
  const refunded = (row.refunded ?? {}) as Record<string, string>;
  const providers = [...new Set([...TENDER_ORDER, ...Object.keys(received), ...Object.keys(refunded)])];
  const tenders: ZReportTender[] = providers.map((provider) => {
    const inAmount = dec(received[provider] ?? "0");
    const outAmount = dec(refunded[provider] ?? "0");
    return { tender: provider, label: PROVIDER_LABELS[provider] ?? provider, received: toMoney(inAmount), refunded: toMoney(outAmount), net: toMoney(inAmount.minus(outAmount)) };
  });
  const cash = tenders.find((tender) => tender.tender === "cash")!;
  const expected = dec(str(row.opening_float)).plus(dec(cash.net));
  const fiscal = row.fiscal as { synced: number; pending: number; failed: number };
  return {
    shiftId,
    generatedAt: new Date().toISOString(),
    orders: num(row.orders),
    salesCount: num(row.sales_count),
    creditNotes: num(row.credit_notes),
    netSales: toMoney(str(row.net_sales)),
    taxCollected: toMoney(str(row.tax)),
    totalTakings: toMoney(str(row.takings)),
    tenders,
    openingFloat: toMoney(str(row.opening_float)),
    cashSales: cash.received,
    cashRefunds: cash.refunded,
    expectedCash: toMoney(expected),
    countedCash: countedCash == null ? null : toMoney(countedCash),
    difference: countedCash == null ? null : toMoney(dec(countedCash).minus(expected)),
    fiscal: { synced: num(fiscal?.synced), pending: num(fiscal?.pending), failed: num(fiscal?.failed) },
    unpaidOrders: num(row.unpaid),
  };
}

export async function getZReport(restaurantId: string, shiftId: string, ctx: RequestContext): Promise<ZReport | null> {
  return getDb({ restaurantId }).read({ ...ctx, restaurantId }, (tx) => readZReport(tx, restaurantId, shiftId, null));
}

/**
 * Day close: refused while any invoice of the shift is not yet accepted by the authority (FISCAL_UNSYNCED). The
 * shift row is locked first, so a sale arriving at the same moment either lands before (and is counted) or is
 * refused as SHIFT_CLOSED — never lands in a closed shift.
 */
export async function closeShift(
  input: { shiftId: string; countedCash: string; notes?: string | null },
  actor: PosActor,
  ctx: RequestContext,
): Promise<{ shift: PosShift; report: ZReport }> {
  return getDb({ restaurantId: actor.restaurantId }).write(actorContext(actor, ctx), async (tx) => {
    const locked = await tx.queryOne<Row>(
      `select id, status, location_id from pos_shifts where id = $1 and restaurant_id = $2 for update`,
      [input.shiftId, actor.restaurantId],
    );
    if (!locked) throw errors.notFound("Shift");
    if (locked.status !== "open") throw errors.custom("SHIFT_CLOSED", "This shift is already closed.");
    const report = await readZReport(tx, actor.restaurantId, input.shiftId, input.countedCash);
    if (!report) throw errors.notFound("Shift");
    const unsynced = report.fiscal.pending + report.fiscal.failed;
    if (unsynced > 0) {
      throw errors.custom(
        "FISCAL_UNSYNCED",
        `${unsynced} invoice${unsynced === 1 ? " is" : "s are"} still waiting to reach PRA. The day can be closed once every invoice is reported.`,
        { pending: report.fiscal.pending, failed: report.fiscal.failed },
      );
    }
    const row = await tx.queryOne<Row>(
      `update pos_shifts set status = 'closed', closed_at = now(), closed_by = $2, closed_by_name = $3, counted_cash = $4::numeric,
              expected_cash = $5::numeric, z_report = $6::jsonb, notes = $7
        where id = $1 returning *`,
      [input.shiftId, actor.memberId, actor.name, input.countedCash, report.expectedCash, JSON.stringify(report), input.notes ?? null],
    );
    const shift = mapShift(row!);
    await audit(tx, actor, {
      action: "pos.shift_closed",
      entityType: "pos_shift",
      entityId: shift.id,
      locationId: shift.locationId,
      details: { expectedCash: report.expectedCash, countedCash: report.countedCash, difference: report.difference, takings: report.totalTakings },
    });
    return { shift, report };
  });
}

// ---------------------------------------------------------------------------------------------------------------
// fiscal queue (PRA/FBR). Server-only: app_service, no RLS (the dispatcher runs for every restaurant).
// ---------------------------------------------------------------------------------------------------------------

/**
 * Claims up to `limit` invoices due for sending (pending, or failed and due for retry) and not being sent by another
 * worker: `for update skip locked` + a short lease (`locked_until`), so a crashed worker's rows are re-claimed after it.
 * `orderIds` claims those orders' invoices (the till's "send now" right after a sale); `includeFailed` also takes
 * failed ones whose retry time has not come yet (one more try before a day close). A credit note waits until its
 * sale is accepted: the authority needs the sale's number to credit it.
 */
export async function claimDueFiscalInvoices(
  options: { limit?: number; restaurantId?: string | null; orderIds?: string[] | null; includeFailed?: boolean; leaseSeconds?: number } = {},
): Promise<FiscalInvoiceDocument[]> {
  const db = options.restaurantId ? getDb({ restaurantId: options.restaurantId }) : getDb();
  return db.write({ restaurantId: options.restaurantId ?? null }, async (tx) => {
    const rows = await tx.query<Row>(
      `with due as (
         select i.id from fiscal_invoices i
          where i.status <> 'synced' and (i.next_attempt_at <= now() or $5::boolean or $3::uuid[] is not null)
            and (i.locked_until is null or i.locked_until < now())
            and ($2::uuid is null or i.restaurant_id = $2) and ($3::uuid[] is null or i.order_id = any($3::uuid[]))
            and (i.original_invoice_id is null
                 or exists (select 1 from fiscal_invoices s where s.id = i.original_invoice_id and s.status = 'synced'))
          order by i.next_attempt_at
          limit $1
          for update of i skip locked)
       update fiscal_invoices f
          set locked_until = now() + make_interval(secs => $4), attempts = f.attempts + 1
         from due where f.id = due.id
       returning f.*,
         (select o.invoice_number from fiscal_invoices o where o.id = f.original_invoice_id) as original_invoice_number,
         (select o.authority_invoice_number from fiscal_invoices o where o.id = f.original_invoice_id) as original_authority_number,
         (select json_build_object('name', r.name, 'settings', r.settings) from restaurants r where r.id = f.restaurant_id) as seller,
         (select l.name from restaurant1s l where l.id = f.location_id) as branch_name,
         (select d.code from pos_devices d where d.id = f.device_id) as device_code,
         (select json_build_object('name', o.customer_name, 'phone', nullif(o.customer_phone, '')) from orders o where o.id = f.order_id) as buyer`,
      [options.limit ?? 20, options.restaurantId ?? null, options.orderIds?.length ? options.orderIds : null, options.leaseSeconds ?? 120, options.includeFailed === true],
    );
    return rows.map((row) => {
      const seller = (row.seller ?? {}) as { name?: string; settings?: { receipt?: { businessName?: string; ntn?: string; pntn?: string } } };
      const buyer = (row.buyer ?? {}) as { name?: string; phone?: string | null };
      return {
        id: str(row.id),
        restaurantId: str(row.restaurant_id),
        kind: row.kind === "credit_note" ? "credit_note" : "sale",
        invoiceNumber: str(row.invoice_number),
        originalInvoiceNumber: strOrNull(row.original_invoice_number),
        originalAuthorityInvoiceNumber: strOrNull(row.original_authority_number),
        issuedAt: isoRequired(row.issued_at),
        paymentMethod: str(row.payment_method) as PaymentMethod,
        subtotal: toMoney(str(row.subtotal)),
        discount: toMoney(str(row.discount_amount)),
        serviceFee: toMoney(str(row.service_fee)),
        taxRate: str(row.tax_rate),
        taxAmount: toMoney(str(row.tax_amount)),
        total: toMoney(str(row.total)),
        currency: str(row.currency),
        lines: (row.lines as ReceiptLine[]) ?? [],
        attempts: num(row.attempts),
        seller: {
          name: seller.settings?.receipt?.businessName || str(seller.name),
          ntn: seller.settings?.receipt?.ntn || null,
          pntn: seller.settings?.receipt?.pntn || null,
          branchName: str(row.branch_name),
          deviceCode: str(row.device_code),
        },
        buyer: { name: str(buyer.name), phone: buyer.phone ?? null },
      } satisfies FiscalInvoiceDocument;
    });
  });
}

/** Retry schedule after a failed send: 1, 5, 15, then every 60 minutes until the authority accepts it. */
export function fiscalRetryDelayMinutes(attempts: number): number {
  return [1, 5, 15][attempts - 1] ?? 60;
}

/** Saves one send attempt: the invoice's authority fields + the request/response log row, in one transaction. */
export async function saveFiscalAttempt(
  invoice: Pick<FiscalInvoiceDocument, "id" | "restaurantId" | "attempts">,
  attempt: { adapter: string; outcome: FiscalOutcome; request: unknown; response: unknown; durationMs: number },
): Promise<void> {
  await getDb({ restaurantId: invoice.restaurantId }).write({ restaurantId: invoice.restaurantId }, async (tx) => {
    const { outcome } = attempt;
    if (outcome.kind === "synced") {
      await tx.query(
        `update fiscal_invoices set status = 'synced', authority_invoice_number = $2, qr_payload = $3, synced_at = now(),
                last_error = null, locked_until = null
          where id = $1 and status <> 'synced'`,
        [invoice.id, outcome.authorityInvoiceNumber, outcome.qrPayload],
      );
    } else {
      await tx.query(
        `update fiscal_invoices set status = 'failed', last_error = $2, locked_until = null,
                next_attempt_at = now() + make_interval(mins => $3)
          where id = $1 and status <> 'synced'`,
        [invoice.id, outcome.error.slice(0, 500), fiscalRetryDelayMinutes(invoice.attempts)],
      );
    }
    await tx.query(
      `insert into fiscal_invoice_attempts (restaurant_id, fiscal_invoice_id, attempt, adapter, outcome, request_payload, response_payload, error, duration_ms)
       values ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8, $9)`,
      [
        invoice.restaurantId, invoice.id, Math.max(1, invoice.attempts), attempt.adapter, outcome.kind,
        JSON.stringify(attempt.request ?? {}), attempt.response === undefined ? null : JSON.stringify(attempt.response),
        outcome.kind === "synced" ? null : outcome.error.slice(0, 500), attempt.durationMs,
      ],
    );
  });
}

/** The till's view of one invoice's authority state (after a sale, and when reprinting). */
export async function getFiscalStatus(restaurantId: string, orderIds: string[], ctx: RequestContext): Promise<FiscalInvoiceView[]> {
  if (orderIds.length === 0) return [];
  const rows = await getDb({ restaurantId }).query<Row>(
    { ...ctx, restaurantId },
    `select * from fiscal_invoices where restaurant_id = $1 and order_id = any($2::uuid[]) order by issued_at`,
    [restaurantId, orderIds],
  );
  return rows.map(mapInvoice);
}
