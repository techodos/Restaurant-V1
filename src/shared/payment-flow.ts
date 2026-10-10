import type { PaymentMethod, PaymentStatus } from "@/shared/contract/enums";

/**
 * Which payment statuses staff may set by hand. Only for money the restaurant collects itself (cash, card on the
 * terminal, cash on delivery, bank transfer): card_online / wallet are settled by their gateway
 * (services/checkout.ts#confirmOnlinePayment) and must never be marked paid by a click. Pure: the admin buttons and
 * the server (services/orders.ts#changePaymentStatus) use the same answer.
 *   pending  → paid | failed
 *   failed   → paid | pending   (pending = "mark unpaid", undo)
 *   paid     → refunded | pending
 *   authorized / refunded / cancelled → nothing
 */
const GATEWAY_METHODS: readonly PaymentMethod[] = ["card_online", "wallet"];

const NEXT: Partial<Record<PaymentStatus, PaymentStatus[]>> = {
  pending: ["paid", "failed"],
  failed: ["paid", "pending"],
  paid: ["refunded", "pending"],
};

export function isManualPaymentMethod(method: PaymentMethod): boolean {
  return !GATEWAY_METHODS.includes(method);
}

export function manualPaymentTargets(method: PaymentMethod, status: PaymentStatus): PaymentStatus[] {
  return isManualPaymentMethod(method) ? (NEXT[status] ?? []) : [];
}

export const PAYMENT_ACTION_LABELS: Record<PaymentStatus, string> = {
  paid: "Mark paid",
  failed: "Mark failed",
  refunded: "Mark refunded",
  pending: "Mark unpaid",
  authorized: "Mark authorized",
  cancelled: "Mark cancelled",
};
