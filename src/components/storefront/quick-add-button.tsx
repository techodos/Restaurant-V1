"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, Plus, SlidersHorizontal } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { addToCartAction } from "@/app/r/[restaurantSlug]/cart/actions";

interface QuickAddButtonProps {
  restaurantSlug: string;
  item: { id: string; name: string; slug: string; requiresSelection: boolean; isAvailable: boolean };
  orderType?: string | undefined;
}

/**
 * Adds a simple item straight to the cart. Items with variants or add-ons open
 * the detail page instead, because those choices are required by the engine.
 */
export function QuickAddButton({ restaurantSlug, item, orderType }: QuickAddButtonProps) {
  const [pending, startTransition] = useTransition();
  const [added, setAdded] = useState(false);
  const router = useRouter();

  if (!item.isAvailable) {
    return (
      <Button variant="outline" size="sm" disabled className="w-full">
        Unavailable today
      </Button>
    );
  }

  if (item.requiresSelection) {
    return (
      <Button asChild variant="outline" size="sm" className="w-full">
        <Link href={`/r/${restaurantSlug}/menu/${item.slug}`}>
          <SlidersHorizontal aria-hidden />
          Choose options
        </Link>
      </Button>
    );
  }

  return (
    <Button
      size="sm"
      data-testid={`quick-add-${item.slug}`}
      className="w-full"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await addToCartAction(restaurantSlug, {
            menuItemId: item.id,
            quantity: 1,
            addons: [],
            ...(orderType ? { orderType } : {}),
          });
          if (!result.success) {
            toast.error(result.error.message);
            return;
          }
          setAdded(true);
          toast.success(`${item.name} added to your cart`, { description: "View your cart to check out." });
          router.refresh();
        })
      }
    >
      {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Plus aria-hidden />}
      {pending ? "Adding…" : added ? "Added" : "Add to cart"}
    </Button>
  );
}
