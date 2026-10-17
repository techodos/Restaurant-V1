import { z } from "zod";
import { ORDER_STATUSES, ORDER_TYPES, PAYMENT_STATUSES } from "@/shared/contract/enums";

export const updateOrderStatusSchema = z.object({
  orderId: z.string().uuid(),
  status: z.enum(ORDER_STATUSES),
  note: z.string().trim().max(500).optional().or(z.literal("")),
  cancelReason: z.string().trim().max(500).optional().or(z.literal("")),
});
export type UpdateOrderStatusInput = z.infer<typeof updateOrderStatusSchema>;

/** Orders list bulk action: each selected order to its own next status (one page of the list at most). */
export const bulkUpdateOrderStatusSchema = z.object({
  changes: z.array(z.object({ orderId: z.string().uuid(), status: z.enum(ORDER_STATUSES).exclude(["pending", "cancelled"]) })).min(1).max(100),
});

export const cancelOrderSchema = z.object({
  reason: z.string().trim().max(500).optional().or(z.literal("")),
});
export type CancelOrderInput = z.infer<typeof cancelOrderSchema>;

export const orderListFiltersSchema = z.object({
  status: z.union([z.enum(ORDER_STATUSES), z.literal("active"), z.literal("all")]).optional(),
  orderType: z.enum(ORDER_TYPES).optional(),
  search: z.string().trim().max(120).optional().or(z.literal("")),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
});
export type OrderListFiltersInput = z.infer<typeof orderListFiltersSchema>;

export const updatePaymentStatusSchema = z.object({
  orderId: z.string().uuid(),
  status: z.enum(PAYMENT_STATUSES),
});
