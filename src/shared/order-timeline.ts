import { ORDER_STATUS_LABELS, ORDER_STATUS_RANK, type OrderStatus } from "@/shared/contract/enums";
import type { OrderStatusEvent } from "@/shared/contract/models";

/**
 * Order tracking timeline, generated from the real rows in
 * order_status_history — never from a hardcoded assumption about progress.
 */
export interface TimelineStep {
  status: OrderStatus;
  label: string;
  state: "done" | "current" | "upcoming" | "cancelled";
  at: string | null;
  note: string | null;
}

const FORWARD_FLOW: OrderStatus[] = ["pending", "confirmed", "preparing", "ready", "out_for_delivery", "completed"];

export function buildOrderTimeline(
  history: OrderStatusEvent[],
  options: { orderType?: "delivery" | "pickup" | "dine_in" } = {},
): TimelineStep[] {
  const orderType = options.orderType ?? "delivery";
  const flow = FORWARD_FLOW.filter((status) => {
    if (status === "out_for_delivery") return orderType === "delivery";
    return true;
  });

  const reachedAt = new Map<OrderStatus, OrderStatusEvent>();
  let cancelled: OrderStatusEvent | null = null;
  for (const event of history) {
    if (event.toStatus === "cancelled") cancelled = event;
    if (!reachedAt.has(event.toStatus)) reachedAt.set(event.toStatus, event);
  }

  const currentStatus = history.length > 0 ? history[history.length - 1]!.toStatus : "pending";
  const currentRank = ORDER_STATUS_RANK[currentStatus] ?? 0;

  return flow.map((status) => {
    const event = reachedAt.get(status) ?? null;
    const rank = ORDER_STATUS_RANK[status];
    let state: TimelineStep["state"] = "upcoming";
    if (cancelled && !event) state = "cancelled";
    else if (event) state = "done";
    if (!cancelled && status === currentStatus) state = "current";
    if (!cancelled && !event && rank < currentRank) state = "done";
    return {
      status,
      label: ORDER_STATUS_LABELS[status],
      state,
      at: event?.createdAt ?? null,
      note: event?.note ?? null,
    };
  });
}

/** e.g. "Arriving in about 12 minutes" — only when real timestamps exist. */
export function describeEta(estimatedArrivalAt: string | null, now = new Date()): string | null {
  if (!estimatedArrivalAt) return null;
  const target = new Date(estimatedArrivalAt);
  const minutes = Math.round((target.getTime() - now.getTime()) / 60_000);
  if (minutes < -5) return "Running a little behind schedule";
  if (minutes <= 1) return "Arriving any moment";
  return `Estimated in about ${minutes} minutes`;
}
