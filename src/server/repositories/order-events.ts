import { config } from "@/server/config";
import { listenToChannel } from "@/server/db/listener";

/**
 * Change feed for orders. The `notify_order_change` trigger (migration 0015) sends
 * one NOTIFY per real change; this narrows the shared stream to a single order.
 * No SQL is issued per subscriber and nothing is polled.
 */

const CHANNEL = "order_changes";

export interface OrderChangeRecord {
  id: string;
  restaurant_id: string;
  status: string;
  payment_status: string;
  estimated_ready_at: string | null;
  updated_at: string;
}

export interface OrderChangeHandlers {
  onChange: (record: OrderChangeRecord) => void;
  /** the change feed was interrupted and restored: re-read the order */
  onReset: () => void;
}

/** False until a session-mode connection string is configured (DATABASE_URL_LISTEN). */
export function orderChangeFeedConfigured(): boolean {
  return config.orderEvents.listenUrl !== null;
}

/** Follows one order. Resolves once the feed is active; call the returned function to stop. */
export function watchOrderChanges(orderId: string, handlers: OrderChangeHandlers): Promise<() => void> {
  const url = config.orderEvents.listenUrl;
  if (!url) return Promise.reject(new Error("DATABASE_URL_LISTEN is not configured."));
  return listenToChannel(url, CHANNEL, {
    onNotify(payload) {
      let record: unknown;
      try {
        record = JSON.parse(payload);
      } catch {
        return;
      }
      if (record && typeof record === "object" && (record as { id?: unknown }).id === orderId) {
        handlers.onChange(record as OrderChangeRecord);
      }
    },
    onReset: handlers.onReset,
  });
}

/** The extra fields migration 0042 adds to the NOTIFY payload, for the admin order-activity feed. */
export interface OrderActivityChangeRecord extends OrderChangeRecord {
  location_id: string | null;
  order_number: string;
  created_at: string;
  is_new: boolean;
}

export interface OrderActivityHandlers {
  onChange: (record: OrderActivityChangeRecord) => void;
  /** the change feed was interrupted and restored: anything sent meanwhile was missed */
  onReset: () => void;
}

/**
 * Follows every order of one restaurant (not a single id) — the admin "new order" chime/banner's feed.
 * Same shared channel and connection as `watchOrderChanges`; only the filter differs (restaurant, not
 * order). Resolves once the feed is active; call the returned function to stop.
 */
export function watchRestaurantOrderActivity(restaurantId: string, handlers: OrderActivityHandlers): Promise<() => void> {
  const url = config.orderEvents.listenUrl;
  if (!url) return Promise.reject(new Error("DATABASE_URL_LISTEN is not configured."));
  return listenToChannel(url, CHANNEL, {
    onNotify(payload) {
      let record: unknown;
      try {
        record = JSON.parse(payload);
      } catch {
        return;
      }
      if (record && typeof record === "object" && (record as { restaurant_id?: unknown }).restaurant_id === restaurantId) {
        handlers.onChange(record as OrderActivityChangeRecord);
      }
    },
    onReset: handlers.onReset,
  });
}
