"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label, Textarea } from "@/components/ui/input";
import { updateOrderStatusAction } from "@/app/r/[restaurantSlug]/admin/(dashboard)/orders/actions";
import { ORDER_STATUS_LABELS, ORDER_STATUS_RANK, TERMINAL_ORDER_STATUSES, type OrderStatus } from "@/shared/contract/enums";
import { useSettledToast } from "@/components/admin/use-settled-toast";

export function OrderStatusControl({ orderId, currentStatus }: { orderId: string; currentStatus: OrderStatus }) {
  const [pending, startTransition] = useTransition();
  const [pendingStatus, setPendingStatus] = useState<OrderStatus | null>(null);
  const later = useSettledToast(pending);
  const [cancelReason, setCancelReason] = useState("");
  const [showCancelForm, setShowCancelForm] = useState(false);

  if (TERMINAL_ORDER_STATUSES.includes(currentStatus)) {
    return (
      <p className="text-sm text-[var(--color-muted-ink)]">
        This order is {ORDER_STATUS_LABELS[currentStatus].toLowerCase()} — no further changes.
      </p>
    );
  }

  const nextStatuses = (Object.keys(ORDER_STATUS_RANK) as OrderStatus[]).filter(
    (status) => status !== "cancelled" && ORDER_STATUS_RANK[status] > ORDER_STATUS_RANK[currentStatus],
  );

  function submit(status: OrderStatus, options: { cancelReason?: string } = {}) {
    setPendingStatus(status);
    startTransition(async () => {
      const result = await updateOrderStatusAction({ orderId, status, cancelReason: options.cancelReason });
      setPendingStatus(null);
      if (!result.success) {
        toast.error(result.error.message);
        return;
      }
      // shown once the page shows the new status (useSettledToast); no client refresh: the action revalidates,
      // so its response already carries this page re-rendered (refreshing again was a second full render)
      later(`Order marked ${ORDER_STATUS_LABELS[status].toLowerCase()}.`);
      setShowCancelForm(false);
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {nextStatuses.map((status) => (
          <Button key={status} size="sm" onClick={() => submit(status)} disabled={pending}>
            {pending && pendingStatus === status ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
            Mark {ORDER_STATUS_LABELS[status]}
          </Button>
        ))}
        <Button size="sm" variant="danger" onClick={() => setShowCancelForm((value) => !value)} disabled={pending}>
          Cancel order
        </Button>
      </div>

      {showCancelForm ? (
        <div className="max-w-md space-y-2 rounded-[var(--radius-brand)] border border-[var(--color-hairline)] p-4">
          <Label htmlFor="cancelReason">Cancellation reason</Label>
          <Textarea
            id="cancelReason"
            value={cancelReason}
            onChange={(event) => setCancelReason(event.target.value)}
            placeholder="e.g. Customer requested cancellation"
          />
          <div className="flex gap-2">
            <Button size="sm" variant="danger" onClick={() => submit("cancelled", { cancelReason })} disabled={pending}>
              {pending && pendingStatus === "cancelled" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
              Confirm cancellation
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setShowCancelForm(false)} disabled={pending}>
              Dismiss
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
