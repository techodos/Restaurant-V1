"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label, Textarea } from "@/components/ui/input";
import { cancelOrderAction } from "@/app/r/[restaurantSlug]/(site)/order/actions";

interface CancelOrderButtonProps {
  restaurantSlug: string;
  orderNumber: string;
  accessToken?: string;
}

/**
 * Self-service cancellation from the order page. Eligibility was already decided server-side by
 * the caller (only rendered when `canCustomerCancelOrder` said yes) — this component just collects
 * an optional reason and confirms before submitting; `cancelOrderAction` re-checks eligibility for
 * real, since the order's status can have moved on since the page rendered.
 */
export function CancelOrderButton({ restaurantSlug, orderNumber, accessToken }: CancelOrderButtonProps) {
  const router = useRouter();
  const [step, setStep] = useState<"idle" | "confirm">("idle");
  const [reason, setReason] = useState("");
  const [working, setWorking] = useState(false);

  async function cancel() {
    setWorking(true);
    try {
      const result = await cancelOrderAction(restaurantSlug, orderNumber, accessToken, { reason });
      if (!result.success) {
        toast.error("Could not cancel this order", { description: result.error.message });
        return;
      }
      toast.success("Order cancelled");
      setStep("idle");
      router.refresh();
    } finally {
      setWorking(false);
    }
  }

  if (step === "confirm") {
    return (
      <div className="space-y-3 rounded-[var(--radius-panel)] border border-[var(--rule)] p-4">
        <p className="text-sm font-medium">Cancel this order?</p>
        <p className="text-[13px] text-[var(--color-muted-ink)]">This cannot be undone.</p>
        <div>
          <Label htmlFor="cancelReason" className="text-xs">Reason (optional)</Label>
          <Textarea
            id="cancelReason"
            rows={2}
            maxLength={500}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Changed my mind, ordered by mistake…"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="danger" size="sm" disabled={working} onClick={() => void cancel()}>
            {working ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
            Yes, cancel order
          </Button>
          <Button type="button" variant="ghost" size="sm" disabled={working} onClick={() => setStep("idle")}>
            Keep order
          </Button>
        </div>
      </div>
    );
  }

  return (
    <Button type="button" variant="outline" className="w-full text-[var(--color-danger,#b42318)]" onClick={() => setStep("confirm")}>
      <X className="size-4" aria-hidden />
      Cancel order
    </Button>
  );
}
