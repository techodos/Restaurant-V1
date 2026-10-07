"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, MapPin, Plus } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/shared/utils";
import { useLocalCart } from "./local-cart";
import { useBranching } from "./branching";
import { flyToTray } from "@/components/motion/fly-to-tray";

interface QuickAddButtonProps {
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
  /** smaller control for menu rows */
  compact?: boolean;
}

const ROUND =
  "press grid place-items-center rounded-full border border-black/5 shadow-[0_8px_20px_-8px_rgb(0_0_0/0.45)] transition-[background-color,color,transform] duration-200 hover:scale-105";
const IDLE = "bg-[var(--brand-surface,#fff)] text-[var(--brand-foreground,#1a1a1a)]";

/**
 * A dish's add control. A simple dish goes straight into the tray (a browser cookie) — its photo flies
 * there instantly, no request at all; a dish with required choices opens its sheet instead, where a
 * chosen variant/add-ons need the same validation the sheet already mirrors.
 */
export function QuickAddButton({ restaurantSlug, item, orderType, compact = false }: QuickAddButtonProps) {
  const size = compact ? "size-9 [&_svg]:size-4" : "size-11 [&_svg]:size-5";
  const { addLine } = useLocalCart();
  const [added, setAdded] = useState(false);
  const branching = useBranching();

  if (!item.isAvailable) return null;

  // Multi-branch ordering: nothing can be added until a branch that serves the customer is known.
  // The control stays in place and leads to the step that is missing; with no branch serving the
  // address it is switched off (the menu's bar explains why and offers "Change location").
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
        aria-label={hint}
        title={hint}
        aria-disabled={noService || undefined}
        onClick={() => (noService ? undefined : branching.resolveGate(orderType))}
        className={cn(ROUND, size, IDLE, noService ? "cursor-not-allowed opacity-45 hover:scale-100" : "opacity-80")}
      >
        {noService ? <Plus aria-hidden /> : <MapPin aria-hidden />}
      </button>
    );
  }

  if (item.requiresSelection) {
    return (
      <Link
        href={`/r/${restaurantSlug}/menu/${item.slug}${orderType ? `?orderType=${orderType}` : ""}`}
        scroll={false}
        aria-label={`Choose options for ${item.name}`}
        className={cn(ROUND, size, IDLE)}
      >
        <Plus aria-hidden />
      </Link>
    );
  }

  return (
    <button
      type="button"
      data-testid={`quick-add-${item.slug}`}
      aria-label={added ? `${item.name} added to your order` : `Add ${item.name} to your order`}
      className={cn(
        ROUND,
        size,
        added ? "bg-[var(--brand-primary,var(--color-brand))] text-[var(--brand-primary-foreground,#fff)]" : IDLE,
      )}
      onClick={(event) => {
        const plateImage = event.currentTarget.closest("[data-dish]")?.querySelector("img") ?? null;
        // requiresSelection is false: no variant, and no addon group forces a default (see
        // resolveMenuSelection) — the item's base price is the whole line.
        const added = addLine({
          menuItemId: item.id,
          variantId: null,
          quantity: 1,
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
        if (!added) {
          toast.error("Your cart is full", { description: "Check out or remove something before adding more." });
          return;
        }
        flyToTray(plateImage);
        setAdded(true);
        window.setTimeout(() => setAdded(false), 1600);
        toast.success(`${item.name} added to your order`);
      }}
    >
      {added ? <Check aria-hidden /> : <Plus aria-hidden />}
    </button>
  );
}
