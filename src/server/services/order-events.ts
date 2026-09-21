import { TERMINAL_ORDER_STATUSES } from "@/shared/contract/enums";
import { parseOrderRecord, toLiveState, type LiveOrderState } from "@/shared/order-live";
import type { RequestContext } from "@/server/context";
import { logger } from "@/server/logger";
import { orderChangeFeedConfigured, watchOrderChanges } from "@/server/repositories/order-events";
import { findVisitorOrder } from "@/server/services/orders";

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
  const order = await findVisitorOrder(restaurantId, orderNumber, visitor, accessToken);
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
    const current = await findVisitorOrder(restaurantId, orderNumber, visitor, accessToken);
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
