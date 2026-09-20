import { getDb } from "@/server/db/registry";
import { type RequestContext } from "@/server/context";
import { mapDelivery, mapDeliveryZone, str, type Row } from "@/server/db/mappers";
import type { Delivery, DeliveryZone } from "@/shared/contract/models";
import type { DeliveryStatus } from "@/shared/contract/enums";
import type { Paginated } from "@/shared/contract/api";
import { paginate } from "@/shared/contract/api";

export async function listDeliveryZones(
  restaurantId: string,
  ctx: RequestContext = {},
  options: { locationId?: string; activeOnly?: boolean } = {},
): Promise<DeliveryZone[]> {
  const params: unknown[] = [restaurantId];
  let where = "restaurant_id = $1";
  if (options.locationId) {
    params.push(options.locationId);
    where += ` and location_id = $${params.length}`;
  }
  if (options.activeOnly) where += " and is_active";
  const rows = await getDb({ restaurantId }).query<Row>(
    ctx,
    `select * from delivery_zones where ${where} order by sort_order, name`,
    params,
  );
  return rows.map(mapDeliveryZone);
}

export async function getDeliveryZone(zoneId: string, ctx: RequestContext = {}): Promise<DeliveryZone | null> {
  const row = await getDb(ctx).queryOne<Row>(ctx, `select * from delivery_zones where id = $1`, [zoneId]);
  return row ? mapDeliveryZone(row) : null;
}

/**
 * Resolves the delivery zone for a free-text area/postal code. Matching is
 * case-insensitive; a zone matches when any of its areas appears in the address
 * area (or the postal code is listed). Returns null when the address is outside
 * every active zone, which the checkout surface reports as "we do not deliver
 * there yet".
 */
export function matchDeliveryZone(
  zones: DeliveryZone[],
  address: { area?: string | null; city?: string | null; postalCode?: string | null },
): DeliveryZone | null {
  const haystack = [address.area, address.city].filter(Boolean).join(", ").toLowerCase();
  const postal = (address.postalCode ?? "").trim().toLowerCase();

  for (const zone of zones) {
    if (!zone.isActive) continue;
    if (postal && zone.postalCodes.some((code) => code.trim().toLowerCase() === postal)) return zone;
    if (haystack && zone.areas.some((areaName) => areaName.trim() && haystack.includes(areaName.trim().toLowerCase()))) {
      return zone;
    }
  }
  return null;
}

export interface DeliveryZoneInput {
  locationId: string;
  name: string;
  description?: string | null;
  areas?: string[];
  postalCodes?: string[];
  deliveryFee: string;
  minOrderAmount?: string;
  freeDeliveryOver?: string | null;
  etaMinMinutes?: number;
  etaMaxMinutes?: number;
  isActive?: boolean;
  sortOrder?: number;
}

export async function createDeliveryZone(
  restaurantId: string,
  input: DeliveryZoneInput,
  ctx: RequestContext,
): Promise<DeliveryZone> {
  const db = getDb({ restaurantId });
  return db.write(ctx, async (tx) => {
    const row = await tx.queryOne<Row>(
      `insert into delivery_zones
         (restaurant_id, location_id, name, description, areas, postal_codes, delivery_fee, min_order_amount,
          free_delivery_over, eta_min_minutes, eta_max_minutes, is_active, sort_order)
       values ($1,$2,$3,$4,coalesce($5,'{}'),coalesce($6,'{}'),$7::numeric,coalesce($8::numeric,0),$9::numeric,
               coalesce($10,30),coalesce($11,45),coalesce($12,true),
               coalesce($13,(select coalesce(max(sort_order),0)+1 from delivery_zones where restaurant_id = $1)))
       returning *`,
      [
        restaurantId, input.locationId, input.name, input.description ?? null, input.areas ?? null,
        input.postalCodes ?? null, input.deliveryFee, input.minOrderAmount ?? null,
        input.freeDeliveryOver ?? null, input.etaMinMinutes ?? null, input.etaMaxMinutes ?? null,
        input.isActive ?? null, input.sortOrder ?? null,
      ],
    );
    if (!row) throw new Error("Delivery zone insert failed");
    return mapDeliveryZone(row);
  });
}

export async function updateDeliveryZone(
  zoneId: string,
  patch: Partial<DeliveryZoneInput>,
  ctx: RequestContext,
): Promise<DeliveryZone> {
  const db = getDb(ctx);
  return db.write(ctx, async (tx) => {
    const row = await tx.queryOne<Row>(
      `update delivery_zones set
         name = coalesce($2, name),
         description = coalesce($3, description),
         areas = coalesce($4, areas),
         postal_codes = coalesce($5, postal_codes),
         delivery_fee = coalesce($6::numeric, delivery_fee),
         min_order_amount = coalesce($7::numeric, min_order_amount),
         free_delivery_over = coalesce($8::numeric, free_delivery_over),
         eta_min_minutes = coalesce($9, eta_min_minutes),
         eta_max_minutes = coalesce($10, eta_max_minutes),
         is_active = coalesce($11, is_active),
         sort_order = coalesce($12, sort_order)
       where id = $1 returning *`,
      [
        zoneId, patch.name ?? null, patch.description ?? null, patch.areas ?? null, patch.postalCodes ?? null,
        patch.deliveryFee ?? null, patch.minOrderAmount ?? null, patch.freeDeliveryOver ?? null,
        patch.etaMinMinutes ?? null, patch.etaMaxMinutes ?? null, patch.isActive ?? null, patch.sortOrder ?? null,
      ],
    );
    if (!row) throw new Error("Delivery zone not found");
    return mapDeliveryZone(row);
  });
}

export async function deleteDeliveryZone(zoneId: string, ctx: RequestContext): Promise<void> {
  await getDb(ctx).write(ctx, async (tx) => {
    await tx.query(`delete from delivery_zones where id = $1`, [zoneId]);
  });
}

export interface DeliveryListFilters {
  status?: DeliveryStatus | "active";
  page?: number;
  pageSize?: number;
}

export async function listDeliveries(
  restaurantId: string,
  filters: DeliveryListFilters,
  ctx: RequestContext,
): Promise<Paginated<Delivery & { orderNumber: string; customerName: string }>> {
  const db = getDb({ restaurantId });
  return db.read(ctx, async (tx) => {
    const page = filters.page ?? 1;
    const pageSize = filters.pageSize ?? 20;
    const params: unknown[] = [restaurantId];
    let where = "d.restaurant_id = $1";
    if (filters.status === "active") {
      where += " and d.status in ('unassigned','assigned','picked_up','in_transit')";
    } else if (filters.status) {
      params.push(filters.status);
      where += ` and d.status = $${params.length}::delivery_status`;
    }
    const total = await tx.queryCount(`select count(*) from deliveries d where ${where}`, params);
    const rows = await tx.query<Row>(
      `select d.*, o.order_number, o.customer_name
         from deliveries d join orders o on o.id = d.order_id
        where ${where}
        order by d.created_at desc
        limit ${pageSize} offset ${(page - 1) * pageSize}`,
      params,
    );
    return paginate(
      rows.map((row) => ({ ...mapDelivery(row), orderNumber: str(row.order_number), customerName: str(row.customer_name) })),
      total,
      page,
      pageSize,
    );
  });
}

export async function getDeliveryByOrder(orderId: string, ctx: RequestContext = {}): Promise<Delivery | null> {
  const row = await getDb(ctx).queryOne<Row>(ctx, `select * from deliveries where order_id = $1`, [orderId]);
  return row ? mapDelivery(row) : null;
}

export interface DeliveryUpdateInput {
  status?: DeliveryStatus;
  driverName?: string | null;
  driverPhone?: string | null;
  trackingUrl?: string | null;
  currentLatitude?: number | null;
  currentLongitude?: number | null;
  estimatedArrivalAt?: string | null;
  failureReason?: string | null;
  notes?: string | null;
}

export async function updateDelivery(
  deliveryId: string,
  patch: DeliveryUpdateInput,
  ctx: RequestContext,
): Promise<Delivery> {
  const db = getDb(ctx);
  return db.write(ctx, async (tx) => {
    const row = await tx.queryOne<Row>(
      `update deliveries set
         status = coalesce($2::delivery_status, status),
         driver_name = coalesce($3, driver_name),
         driver_phone = coalesce($4, driver_phone),
         tracking_url = coalesce($5, tracking_url),
         current_latitude = coalesce($6, current_latitude),
         current_longitude = coalesce($7, current_longitude),
         estimated_arrival_at = coalesce($8::timestamptz, estimated_arrival_at),
         failure_reason = coalesce($9, failure_reason),
         notes = coalesce($10, notes),
         assigned_at = case when $3 is not null and assigned_at is null then now() else assigned_at end,
         picked_up_at = case when $2 = 'picked_up' and picked_up_at is null then now() else picked_up_at end,
         delivered_at = case when $2 = 'delivered' and delivered_at is null then now() else delivered_at end,
         failed_at = case when $2 = 'failed' and failed_at is null then now() else failed_at end
       where id = $1
       returning *`,
      [
        deliveryId, patch.status ?? null, patch.driverName ?? null, patch.driverPhone ?? null,
        patch.trackingUrl ?? null, patch.currentLatitude ?? null, patch.currentLongitude ?? null,
        patch.estimatedArrivalAt ?? null, patch.failureReason ?? null, patch.notes ?? null,
      ],
    );
    if (!row) throw new Error("Delivery not found");
    return mapDelivery(row);
  });
}
