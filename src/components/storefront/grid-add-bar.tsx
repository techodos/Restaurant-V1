"use client";

import Link from "next/link";
import { Minus, Plus, ShoppingBag, MapPin, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useLocalCart } from "./local-cart";
import { useBranching } from "./branching";
import { flyToTray } from "@/components/motion/fly-to-tray";

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
 * The grid menu layout's add control. Not in the cart: a full-width "Add to Cart" button. In the cart: a
 * − n + stepper showing the cart's real quantity of this dish (its plain line: no variant, add-ons or note),
 * changed in place through `updateQuantity`; − at 1 removes it. Same tray, same cookie, same rules as the
 * floating + elsewhere (`addLine`). Dishes with options link to their page instead.
 */
export function GridAddBar({ restaurantSlug, item, orderType }: GridAddBarProps) {
  const { cart, addLine, updateQuantity } = useLocalCart();
  const line = cart.lines.find(
    (candidate) => candidate.menuItemId === item.id && candidate.variantId === null && candidate.addons.length === 0 && !candidate.specialInstructions,
  );
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
        className="mt-3 flex min-h-10 w-full items-center justify-center gap-2 rounded-[var(--radius-control)] bg-[var(--color-brand)] px-3 py-2 text-center text-[13px] font-semibold leading-snug text-[var(--color-brand-foreground)] disabled:opacity-45"
        disabled={noService}
      >
        <MapPin aria-hidden className="size-4 shrink-0" />
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
    if (!ok) {
      toast.error("Your cart is full", { description: "Check out or remove something before adding more." });
      return;
    }
    const plateImage = event.currentTarget.closest("[data-dish]")?.querySelector("img") ?? null;
    flyToTray(plateImage);
    toast.success(`${item.name} added to your order`);
  };

  if (!line) {
    return (
      <Button type="button" onClick={add} className="mt-3 h-10 w-full min-w-0 gap-2 px-3 text-[13px]">
        <ShoppingBag aria-hidden className="size-4" />
        Add to Cart
      </Button>
    );
  }

  return (
    <div
      role="group"
      aria-label={`${item.name} in your cart`}
      className="@container mt-3 flex h-10 w-full items-center justify-between rounded-[var(--radius-control)] bg-[color-mix(in_srgb,var(--color-brand)_10%,transparent)] text-[var(--color-brand)]"
    >
      <button
        type="button"
        aria-label={line.quantity === 1 ? `Remove ${item.name} from cart` : "Decrease quantity"}
        onClick={() => updateQuantity(line.id, line.quantity - 1)}
        className="grid size-10 place-items-center rounded-[var(--radius-control)] transition-colors hover:bg-[color-mix(in_srgb,var(--color-brand)_12%,transparent)]"
      >
        {line.quantity === 1 ? <Trash2 aria-hidden className="size-3.5" /> : <Minus aria-hidden className="size-3.5" />}
      </button>
      <span aria-live="polite" className="tabular whitespace-nowrap text-sm font-semibold">
        {line.quantity}<span className="hidden font-medium opacity-75 @[9.5rem]:inline"> in cart</span>
      </span>
      <button
        type="button"
        aria-label="Increase quantity"
        disabled={line.quantity >= 99}
        onClick={() => updateQuantity(line.id, line.quantity + 1)}
        className="grid size-10 place-items-center rounded-[var(--radius-control)] transition-colors hover:bg-[color-mix(in_srgb,var(--color-brand)_12%,transparent)] disabled:opacity-35"
      >
        <Plus aria-hidden className="size-3.5" />
      </button>
    </div>
  );
}
