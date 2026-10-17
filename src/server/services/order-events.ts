import { TERMINAL_ORDER_STATUSES } from "@/shared/contract/enums";
import { parseOrderRecord, toLiveState, type LiveOrderState } from "@/shared/order-live";
import type { RequestContext } from "@/server/context";
import { logger } from "@/server/logger";
import { orderChangeFeedConfigured, watchOrderChanges, watchRestaurantOrderActivity } from "@/server/repositories/order-events";
import { findVisitorOrder, getOrderActivitySince } from "@/server/services/orders";

/**
 * Live order status for the customer's order page (delivered over SSE by the route
 * handler). Framework-free: the transport only supplies a sink.
 *
 * Access is the same proof as the page itself (`findVisitorOrder`: cart cookie,
 * signed-in customer or signed email link), so a stream can only ever follow an
 * order the visitor may already see, inside their own restaurant. Push (FCM) and
 * email (Resend) are unrelated to this.
 */

export interface OrderStreamSink {
  send: (state: LiveOrderState) => void;
  /** the order reached a final status; nothing more will be sent */
  end: () => void;
}

export interface OrderStream {
  close: () => void;
}

export function orderEventsEnabled(): boolean {
  return orderChangeFeedConfigured();
}

/**
 * Starts following an order. Returns null when the visitor may not see it.
 * Order of steps matters: subscribe first, read the current state second, so a
 * change landing in between is delivered (and a stale one ignored by the client).
 */
export async function openOrderStream(
  restaurantId: string,
  orderNumber: string,
  visitor: RequestContext,
  accessToken: string | null | undefined,
  sink: OrderStreamSink,
): Promise<OrderStream | null> {
  // the live state is four fields of the order row: never load items/history/payment/delivery here
  // (this ran twice per opened tracking page, ~4.5 KB each, before any event)
  const order = await findVisitorOrder(restaurantId, orderNumber, visitor, accessToken, { withDetails: false });
  if (!order) return null;

  let closed = false;
  let stop: (() => void) | null = null;
  const close = () => {
    closed = true;
    stop?.();
  };

  const push = (state: LiveOrderState) => {
    if (closed) return;
    sink.send(state);
    if (TERMINAL_ORDER_STATUSES.includes(state.status)) {
      close();
      sink.end();
    }
  };

  const snapshot = async () => {
    const current = await findVisitorOrder(restaurantId, orderNumber, visitor, accessToken, { withDetails: false });
    if (current && !closed) push(toLiveState(current));
  };

  stop = await watchOrderChanges(order.id, {
    onChange(record) {
      // belt and braces: the id already pins the order, the restaurant must match too
      if (record.restaurant_id !== order.restaurantId) return;
      const state = parseOrderRecord(record);
      if (state) push(state);
    },
    onReset() {
      snapshot().catch((error: unknown) =>
        logger.warn("db", "order stream: re-sync after reconnect failed", error instanceof Error ? error.message : String(error)),
      );
    },
  });
  if (closed) stop();

  try {
    await snapshot();
  } catch (error) {
    close();
    throw error;
  }
  return { close };
}

/**
 * Admin "new order" / "cancelled order" feed (one restaurant, every order), delivered over SSE by the
 * route handler. Replaces polling GET /admin/orders/activity every 3 s: the trigger (migration 0042)
 * sends one NOTIFY per real insert/status/payment/ETA change and this follows this restaurant's rows
 * on the same shared LISTEN connection the customer tracking page already uses.
 *
 * A re-check window closes the same race `listOrderActivitySince`'s doc comment describes for the old
 * poll's cursor: `createOrder` can take over a second to commit, and its `created_at`/`updated_at` are
 * stamped at transaction START, not COMMIT. Subscribing BEFORE the catch-up read (same ordering as
 * `openOrderStream`) means a row that commits in that gap is still caught — the catch-up query re-reads
 * a trailing margin of recent activity rather than trusting an exact cursor, so a duplicate event is
 * possible (harmless: the client already dedupes by orderNumber+status+isNew) but a silent loss is not.
 */
export interface OrderActivityStreamEvent {
  orderNumber: string;
  status: string;
  isNew: boolean;
}

export interface OrderActivityStreamSink {
  send: (event: OrderActivityStreamEvent) => void;
}

export interface OrderActivityStream {
  close: () => void;
}

const ACTIVITY_CATCH_UP_MARGIN_MS = 5_000;

export function orderActivityStreamEnabled(): boolean {
  return orderChangeFeedConfigured();
}

export async function openOrderActivityStream(
  restaurantId: string,
  locationId: string | null,
  ctx: RequestContext,
  sink: OrderActivityStreamSink,
): Promise<OrderActivityStream> {
  let closed = false;
  let cursor = new Date();
  let stop: (() => void) | null = null;
  const close = () => {
    closed = true;
    stop?.();
  };

  const emit = (event: OrderActivityStreamEvent) => {
    if (closed) return;
    sink.send(event);
  };

  const catchUp = async () => {
    const sinceIso = new Date(cursor.getTime() - ACTIVITY_CATCH_UP_MARGIN_MS).toISOString();
    const { events, now } = await getOrderActivitySince(restaurantId, sinceIso, ctx, locationId);
    for (const event of events) emit({ orderNumber: event.orderNumber, status: event.status, isNew: event.isNew });
    cursor = new Date(now);
  };

  stop = await watchRestaurantOrderActivity(restaurantId, {
    onChange(record) {
      // belt and braces: the repository already filters by restaurant_id, this is the same
      // defensive re-check openOrderStream does for a single order
      if (record.restaurant_id !== restaurantId) return;
      if (locationId !== null && record.location_id !== locationId) return;
      emit({ orderNumber: record.order_number, status: record.status, isNew: record.is_new });
      const updatedAt = new Date(record.updated_at);
      if (updatedAt > cursor) cursor = updatedAt;
    },
    onReset() {
      catchUp().catch((error: unknown) =>
        logger.warn("db", "order activity stream: re-sync after reconnect failed", error instanceof Error ? error.message : String(error)),
      );
    },
  });
  if (closed) {
    stop();
    return { close };
  }

  try {
    // closes the subscribe-race window: anything that landed just before/during subscribing
    await catchUp();
  } catch (error) {
    close();
    throw error;
  }
  return { close };
}
