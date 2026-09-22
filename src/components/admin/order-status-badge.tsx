import type { BadgeProps } from "@/components/ui/badge";
import type { OrderStatus } from "@/shared/contract/enums";

/** Consistent status → badge colour across the dashboard, order list and order detail. */
export function orderStatusBadgeVariant(status: OrderStatus): NonNullable<BadgeProps["variant"]> {
  switch (status) {
    case "pending":
      return "warning";
    case "confirmed":
    case "preparing":
      return "info";
    case "ready":
    case "out_for_delivery":
      return "soft";
    case "completed":
      return "success";
    case "cancelled":
      return "danger";
    default:
      return "neutral";
  }
}
