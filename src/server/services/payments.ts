import type { RequestContext } from "@/server/context";
import type { Payment } from "@/shared/contract/models";
import type { Paginated } from "@/shared/contract/api";
import { listPayments, type PaymentListFilters } from "@/server/repositories/payments";

/** Staff-facing payment transactions (admin, view only). */
export function listPaymentsForAdmin(
  restaurantId: string,
  filters: PaymentListFilters,
  ctx: RequestContext,
): Promise<Paginated<Payment & { orderNumber: string; customerName: string }>> {
  return listPayments(restaurantId, filters, ctx);
}
