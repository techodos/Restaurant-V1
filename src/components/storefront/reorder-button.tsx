"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { reorderAction } from "@/app/r/[restaurantSlug]/(site)/order/actions";
import { useLocalCart } from "./local-cart";

interface ReorderButtonProps {
  restaurantSlug: string;
  orderNumber: string;
  accessToken?: string;
}

/**
 * Puts a finished order's lines back into the tray (the browser cookie), repriced from the current
 * menu — never a copy of the old order's prices. An item that is no longer orderable is skipped
 * (deleted, disabled, out of its availability window); the visitor is told which by name and still
 * lands on /cart with whatever could be added, rather than the whole reorder failing over one item.
 */
export function ReorderButton({ restaurantSlug, orderNumber, accessToken }: ReorderButtonProps) {
  const router = useRouter();
  const { addLines } = useLocalCart();
  const [working, setWorking] = useState(false);

  async function reorder() {
    setWorking(true);
    try {
      const result = await reorderAction(restaurantSlug, orderNumber, accessToken);
      if (!result.success) {
        toast.error("Could not reorder", { description: result.error.message });
        return;
      }
      const added = addLines(
        result.data.lines.map(({ line, display }) => ({
          menuItemId: line.menuItemId,
          variantId: line.variantId,
          quantity: line.quantity,
          addons: line.addons,
          ...(line.specialInstructions ? { specialInstructions: line.specialInstructions } : {}),
          display,
        })),
      );
      if (added === 0) {
        toast.error(result.data.lines.length ? "Your tray is full." : "None of these items are available right now.");
        return;
      }
      if (result.data.skippedItemNames.length) {
        toast(`${result.data.skippedItemNames.length} item(s) could not be added`, {
          description: result.data.skippedItemNames.join(", ") + " — no longer available.",
        });
      } else {
        toast.success("Added to your cart");
      }
      router.push(`/r/${restaurantSlug}/cart`);
    } finally {
      setWorking(false);
    }
  }

  return (
    <Button type="button" variant="outline" className="mt-4 w-full" onClick={reorder} disabled={working}>
      <RefreshCw className="size-4" aria-hidden />
      {working ? "Adding to cart…" : "Reorder"}
    </Button>
  );
}
