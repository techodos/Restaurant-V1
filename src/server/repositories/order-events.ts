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
