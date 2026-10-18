"use client";

import { useId, useState, useTransition } from "react";
import { ChevronDown, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label, Textarea } from "@/components/ui/input";
import { updateOrderStatusAction } from "@/app/admin/(dashboard)/orders/actions";
import { ORDER_STATUS_LABELS, TERMINAL_ORDER_STATUSES, type OrderStatus, type OrderType } from "@/shared/contract/enums";
import { forwardOrderStatuses, nextOrderStep } from "@/shared/order-flow";
import { useSettledToast } from "@/components/admin/use-settled-toast";
import { markOwnOrderChanges } from "@/components/admin/order-sound-notifications";
import { cn } from "@/shared/utils";

/**
 * Moves an order forward (or cancels it). Only statuses valid for the order type are offered
 * (`forwardOrderStatuses`: no "Out for delivery" on pickup/dine-in).
 * - `layout="full"` (order page): every forward move as a button, plus Cancel.
 * - `layout="ticket"` (kitchen board): the usual next step as one full-width button (`nextOrderStep`); skipping
 *   ahead and cancelling sit behind "More", so a busy line sees one obvious action per ticket.
 */
export function OrderStatusControl({
  orderId,
  orderNumber,
  currentStatus,
  orderType,
  layout = "full",
}: {
  orderId: string;
  orderNumber: string;
  currentStatus: OrderStatus;
  orderType: OrderType;
  layout?: "full" | "ticket";
}) {
  const [pending, startTransition] = useTransition();
  const [pendingStatus, setPendingStatus] = useState<OrderStatus | null>(null);
  const later = useSettledToast(pending);
  const [cancelReason, setCancelReason] = useState("");
  const [showCancelForm, setShowCancelForm] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const reasonId = useId();
  const moreId = useId();

  if (TERMINAL_ORDER_STATUSES.includes(currentStatus)) {
    return (
      <p className="text-sm text-[var(--color-muted-ink)]">
        This order is {ORDER_STATUS_LABELS[currentStatus].toLowerCase()} — no further changes.
      </p>
    );
  }

  const forward = forwardOrderStatuses(currentStatus, orderType);
  const next = nextOrderStep(currentStatus, orderType);

  function submit(status: OrderStatus, options: { cancelReason?: string } = {}) {
    setPendingStatus(status);
    startTransition(async () => {
      const undo = markOwnOrderChanges([{ orderNumber, status }]);
      const result = await updateOrderStatusAction({ orderId, status, cancelReason: options.cancelReason });
      setPendingStatus(null);
      if (!result.success) {
        undo();
        toast.error(result.error.message);
        return;
      }
      // shown once the page shows the new status (useSettledToast); no client refresh: the action revalidates,
      // so its response already carries this page re-rendered (refreshing again was a second full render).
      // Rapid clicks across rows/controls consolidate into one "N orders marked X." toast.
      const label = ORDER_STATUS_LABELS[status].toLowerCase();
      later(`Order marked ${label}.`, { group: "order-status", label, plural: "orders" });
      setShowCancelForm(false);
      setShowMore(false);
    });
  }

  const spinner = (status: OrderStatus) =>
    pending && pendingStatus === status ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null;

  const cancelForm = showCancelForm ? (
    <div className="space-y-2 rounded-[var(--radius-brand)] border border-[var(--color-hairline)] bg-[var(--color-surface)] p-3">
      <Label htmlFor={reasonId}>Cancellation reason</Label>
      <Textarea
        id={reasonId}
        value={cancelReason}
        onChange={(event) => setCancelReason(event.target.value)}
        placeholder="e.g. Customer requested cancellation"
      />
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="danger" onClick={() => submit("cancelled", { cancelReason })} disabled={pending}>
          {spinner("cancelled")}
          Confirm cancellation
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setShowCancelForm(false)} disabled={pending}>
          Keep order
        </Button>
      </div>
    </div>
  ) : null;

  if (layout === "ticket") {
    const skipAhead = forward.filter((status) => status !== next?.status);
    return (
      <div className="space-y-2">
        <div className="flex gap-2">
          {next ? (
            <Button className="h-11 flex-1 text-[14px]" onClick={() => submit(next.status)} disabled={pending}>
              {spinner(next.status)}
              {next.label}
            </Button>
          ) : null}
          <Button
            variant="outline"
            className="h-11 px-3.5"
            aria-expanded={showMore}
            aria-controls={moreId}
            onClick={() => setShowMore((value) => !value)}
            disabled={pending}
          >
            More
            <ChevronDown className={cn("transition-transform duration-200 motion-reduce:transition-none", showMore && "rotate-180")} aria-hidden />
          </Button>
        </div>
        {showMore ? (
          <div id={moreId} className="space-y-2 rounded-[var(--radius-brand)] bg-[var(--color-canvas-muted)] p-2.5">
            {skipAhead.length ? (
              <div className="flex flex-wrap gap-1.5">
                {skipAhead.map((status) => (
                  <Button key={status} size="sm" variant="outline" className="h-8 bg-[var(--color-surface)] px-3" onClick={() => submit(status)} disabled={pending}>
                    {spinner(status)}
                    Mark {ORDER_STATUS_LABELS[status].toLowerCase()}
                  </Button>
                ))}
              </div>
            ) : null}
            {showCancelForm ? (
              cancelForm
            ) : (
              <Button
                size="sm"
                variant="ghost"
                className="h-8 px-3 text-[var(--color-danger)] hover:bg-[color-mix(in_srgb,var(--color-danger)_9%,transparent)]"
                onClick={() => setShowCancelForm(true)}
                disabled={pending}
              >
                Cancel order…
              </Button>
            )}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {forward.map((status) => (
          <Button key={status} size="sm" variant={status === next?.status ? "primary" : "outline"} onClick={() => submit(status)} disabled={pending}>
            {spinner(status)}
            Mark {ORDER_STATUS_LABELS[status]}
          </Button>
        ))}
        <Button size="sm" variant="danger" onClick={() => setShowCancelForm((value) => !value)} disabled={pending}>
          Cancel order
        </Button>
      </div>
      {cancelForm ? <div className="max-w-md">{cancelForm}</div> : null}
    </div>
  );
}
