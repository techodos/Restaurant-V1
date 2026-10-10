"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { updatePaymentStatusAction } from "@/app/r/[restaurantSlug]/admin/(dashboard)/orders/actions";
import { useSettledToast } from "@/components/admin/use-settled-toast";
import { manualPaymentTargets, PAYMENT_ACTION_LABELS } from "@/shared/payment-flow";
import type { PaymentMethod, PaymentStatus } from "@/shared/contract/enums";

/**
 * Mark an offline payment paid / failed / refunded / unpaid (order detail and the Payments list). Renders nothing
 * for online payments or when no change is allowed (shared/payment-flow.ts). Refund and "unpaid" ask first.
 */
export function PaymentStatusControl({
  orderId,
  orderNumber,
  method,
  status,
  size = "sm",
}: {
  orderId: string;
  orderNumber: string;
  method: PaymentMethod;
  status: PaymentStatus;
  size?: "sm" | "xs";
}) {
  const [pending, startTransition] = useTransition();
  const [target, setTarget] = useState<PaymentStatus | null>(null);
  const later = useSettledToast(pending);
  const { confirm, dialog } = useConfirm();
  const targets = manualPaymentTargets(method, status);
  if (targets.length === 0) return null;

  async function apply(next: PaymentStatus) {
    if (next === "refunded" || next === "pending") {
      const ok = await confirm({
        title: next === "refunded" ? `Mark ${orderNumber} refunded?` : `Mark ${orderNumber} unpaid?`,
        description:
          next === "refunded"
            ? "Only do this after the money has been given back to the customer."
            : "Use this to undo a payment that was marked paid by mistake.",
        variant: next === "refunded" ? "danger" : "primary",
        confirmLabel: PAYMENT_ACTION_LABELS[next],
      });
      if (!ok) return;
    }
    setTarget(next);
    startTransition(async () => {
      const result = await updatePaymentStatusAction({ orderId, status: next });
      if (!result.success) {
        toast.error(result.error.message);
        return;
      }
      // shown once the page shows the new status (useSettledToast)
      later(`Payment for ${result.data.orderNumber} marked ${next === "pending" ? "unpaid" : next}.`);
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {dialog}
      {targets.map((next) => (
        <Button
          key={next}
          size="sm"
          variant={next === "paid" ? "primary" : next === "refunded" ? "danger" : "outline"}
          className={size === "xs" ? "h-8 px-3 text-xs" : undefined}
          disabled={pending}
          onClick={() => apply(next)}
        >
          {pending && target === next ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : null}
          {PAYMENT_ACTION_LABELS[next]}
        </Button>
      ))}
    </div>
  );
}
