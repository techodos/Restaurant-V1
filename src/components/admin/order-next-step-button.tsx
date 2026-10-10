"use client";

import { useTransition } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { updateOrderStatusAction } from "@/app/r/[restaurantSlug]/admin/(dashboard)/orders/actions";
import { ORDER_STATUS_LABELS, type OrderStatus } from "@/shared/contract/enums";
import { useSettledToast } from "@/components/admin/use-settled-toast";

/**
 * One click to move an order to its usual next status (shared/order-flow.ts#nextOrderStep), from the orders list. Same
 * action as the order page's status control, so notifications and the DB's transition rules apply unchanged. No
 * client refresh: the action revalidates /orders, so its response already carries the updated list.
 */
export function OrderNextStepButton({ orderId, next, label }: { orderId: string; next: OrderStatus; label: string }) {
  const [pending, startTransition] = useTransition();
  const later = useSettledToast(pending);
  return (
    <Button
      size="sm"
      variant={next === "confirmed" ? "primary" : "outline"}
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await updateOrderStatusAction({ orderId, status: next });
          if (!result.success) toast.error(result.error.message);
          // shown once the list shows the new status (see useSettledToast)
          else later(`Order ${result.data.orderNumber} marked ${ORDER_STATUS_LABELS[next].toLowerCase()}.`);
        })
      }
    >
      {pending ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : null}
      {label}
    </Button>
  );
}
