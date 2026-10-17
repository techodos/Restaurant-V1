"use client";

import Link from "next/link";
import { Minus, Plus, ShoppingBag, MapPin } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useLocalCart } from "./local-cart";
import { useBranching } from "./branching";
import { flyToTray } from "@/components/motion/fly-to-tray";
import { useState } from "react";

interface GridAddBarProps {
  restaurantSlug: string;
  item: {
    id: string;
    name: string;
    slug: string;
    requiresSelection: boolean;
    isAvailable: boolean;
    basePrice: string;
    imageUrl: string | null;
  };
  orderType?: string | undefined;
}

/**
 * The grid menu layout's add control: a quantity stepper next to an explicit "Add to Cart" button,
 * instead of the rest of the site's floating + that adds straight away. The stepper only picks how many
 * to add next — it does not reflect what is already in the cart — and "Add to Cart" commits that count
 * through the same `addLine` the floating control uses, so it is the same tray, same cookie, same rules.
 */
export function GridAddBar({ restaurantSlug, item, orderType }: GridAddBarProps) {
  const [qty, setQty] = useState(1);
  const { addLine } = useLocalCart();
  const branching = useBranching();

  if (!item.isAvailable) return null;

  const gate = branching.gate(orderType);
  if (gate !== "ok") {
    const noService = gate === "no-service";
    const hint = noService
      ? "Delivery is not available at this location"
      : gate === "need-branch"
        ? `Choose a branch to order ${item.name}`
        : `Choose your delivery location to order ${item.name}`;
    return (
      <button
        type="button"
        aria-disabled={noService || undefined}
        onClick={() => (noService ? undefined : branching.resolveGate(orderType))}
        className="mt-3 flex h-10 w-full items-center justify-center gap-2 rounded-[var(--radius-control)] bg-[var(--color-brand)] text-sm font-semibold text-[var(--color-brand-foreground)] disabled:opacity-45"
        disabled={noService}
      >
        <MapPin aria-hidden className="size-4" />
        {hint}
      </button>
    );
  }

  if (item.requiresSelection) {
    return (
      <Link
        href={`/menu/${item.slug}${orderType ? `?orderType=${orderType}` : ""}`}
        scroll={false}
        className="mt-3 flex h-10 w-full items-center justify-center gap-2 rounded-[var(--radius-control)] bg-[var(--color-brand)] text-sm font-semibold text-[var(--color-brand-foreground)] transition-colors hover:bg-[color-mix(in_srgb,var(--color-brand)_86%,black)]"
      >
        <ShoppingBag aria-hidden className="size-4" />
        Choose options
      </Link>
    );
  }

  const add = (event: React.MouseEvent<HTMLButtonElement>) => {
    const ok = addLine({
      menuItemId: item.id,
      variantId: null,
      quantity: qty,
      addons: [],
      display: {
        name: item.name,
        slug: item.slug,
        imageUrl: item.imageUrl,
        variantName: null,
        addonNames: [],
        unitPrice: item.basePrice,
        addonsTotal: "0.00",
        problem: null,
      },
    });
    if (!ok) {
      toast.error("Your cart is full", { description: "Check out or remove something before adding more." });
      return;
    }
    const plateImage = event.currentTarget.closest("[data-dish]")?.querySelector("img") ?? null;
    flyToTray(plateImage);
    toast.success(`${qty} × ${item.name} added to your order`);
    setQty(1);
  };

  return (
    <div className="mt-3 flex items-center gap-2">
      <div
        role="group"
        aria-label={`Quantity for ${item.name}`}
        className="flex h-10 shrink-0 items-center rounded-[var(--radius-control)] border border-[var(--color-hairline)]"
      >
        <button
          type="button"
          aria-label="Decrease quantity"
          disabled={qty <= 1}
          onClick={() => setQty((value) => Math.max(1, value - 1))}
          className="grid size-9 place-items-center text-[var(--color-ink)] disabled:opacity-35"
        >
          <Minus aria-hidden className="size-3.5" />
        </button>
        <span aria-live="polite" className="tabular w-5 text-center text-sm font-semibold">
          {qty}
        </span>
        <button
          type="button"
          aria-label="Increase quantity"
          disabled={qty >= 99}
          onClick={() => setQty((value) => Math.min(99, value + 1))}
          className="grid size-9 place-items-center text-[var(--color-ink)] disabled:opacity-35"
        >
          <Plus aria-hidden className="size-3.5" />
        </button>
      </div>
      <Button type="button" onClick={add} className="h-10 flex-1 gap-2 px-3 text-[13px]">
        <ShoppingBag aria-hidden className="size-4" />
        Add to Cart
      </Button>
    </div>
  );
}
