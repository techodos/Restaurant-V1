import { ORDER_STATUSES, PAYMENT_STATUSES, type OrderStatus, type PaymentStatus } from "@/shared/contract/enums";
import type { OrderStatusEvent } from "@/shared/contract/models";

/**
 * Live order tracking rules, kept free of React and Supabase so they are testable
 * and identical wherever the page is rendered. The browser side lives in
 * components/storefront/use-order-events.ts, the server side in
 * server/services/order-events.ts.
 */

/** The order fields the tracking page reacts to. Everything else on the row is ignored. */
export interface LiveOrderState {
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  estimatedReadyAt: string | null;
  updatedAt: string;
}

const isStatus = (value: unknown): value is OrderStatus => ORDER_STATUSES.includes(value as OrderStatus);
const isPaymentStatus = (value: unknown): value is PaymentStatus => PAYMENT_STATUSES.includes(value as PaymentStatus);

/** Reads a raw `orders` row or NOTIFY payload (snake_case). Null when it is not a usable order row. */
export function parseOrderRecord(record: unknown): LiveOrderState | null {
  if (!record || typeof record !== "object") return null;
  const row = record as Record<string, unknown>;
  if (!isStatus(row.status) || !isPaymentStatus(row.payment_status) || typeof row.updated_at !== "string") return null;
  if (Number.isNaN(Date.parse(row.updated_at))) return null;
  return {
    status: row.status,
    paymentStatus: row.payment_status,
    estimatedReadyAt: typeof row.estimated_ready_at === "string" ? row.estimated_ready_at : null,
    updatedAt: row.updated_at,
  };
}

/** Validates a state received over the wire (SSE event data). Null when it is not a usable state. */
export function parseLiveOrderState(value: unknown): LiveOrderState | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (!isStatus(v.status) || !isPaymentStatus(v.paymentStatus) || typeof v.updatedAt !== "string") return null;
  if (Number.isNaN(Date.parse(v.updatedAt))) return null;
  return {
    status: v.status,
    paymentStatus: v.paymentStatus,
    estimatedReadyAt: typeof v.estimatedReadyAt === "string" ? v.estimatedReadyAt : null,
    updatedAt: v.updatedAt,
  };
}

/** The live fields of a full order (used for the snapshot sent when a stream opens). */
export function toLiveState(order: {
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  estimatedReadyAt: string | null;
  updatedAt: string;
}): LiveOrderState {
  return {
    status: order.status,
    paymentStatus: order.paymentStatus,
    estimatedReadyAt: order.estimatedReadyAt,
    updatedAt: order.updatedAt,
  };
}

/**
 * Merges an incoming state into the current one.
 *  - older than what is shown  -> ignored (events can arrive late or after a re-sync)
 *  - identical relevant fields -> ignored (e.g. PREPARING -> PREPARING, or an update to notes only)
 *  - otherwise                 -> applied, `changed: true`
 */
export function nextLiveState(current: LiveOrderState, incoming: LiveOrderState): { state: LiveOrderState; changed: boolean } {
  if (Date.parse(incoming.updatedAt) < Date.parse(current.updatedAt)) return { state: current, changed: false };
  const same =
    incoming.status === current.status &&
    incoming.paymentStatus === current.paymentStatus &&
    incoming.estimatedReadyAt === current.estimatedReadyAt;
  return same ? { state: current, changed: false } : { state: incoming, changed: true };
}

/**
 * The server-rendered history knows only the transitions that existed at render
 * time. When a live status is ahead of it, add that transition so the timeline
 * moves immediately; once the page is re-rendered the real row replaces it.
 */
export function withLiveStatus(history: OrderStatusEvent[], live: LiveOrderState): OrderStatusEvent[] {
  const last = history[history.length - 1];
  if (last && last.toStatus === live.status) return history;
  if (!last && live.status === "pending") return history;
  return [
    ...history,
    {
      id: `live-${live.status}`,
      orderId: last?.orderId ?? "",
      fromStatus: last?.toStatus ?? null,
      toStatus: live.status,
      note: null,
      changedByName: null,
      createdAt: live.updatedAt,
    },
  ];
}
