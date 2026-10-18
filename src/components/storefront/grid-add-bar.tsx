"use client";

import Link from "next/link";
import { ChevronRight, Minus, Plus, MapPin, Trash2 } from "lucide-react";
import { toast } from "sonner";
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
 * The grid menu layout's add control, right of the price in the card footer. Not in the cart: a brand
 * "+ Add" pill. In the cart: a brand pill `[trash|−] n [+]` showing the cart's real quantity of this dish
 * (its plain line: no variant, add-ons or note), changed in place through `updateQuantity`; − at 1 removes
 * it. Same tray, same cookie, same rules as the floating + elsewhere (`addLine`). Dishes with options get
 * an outlined "Customize" link to their page.
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
        className="flex min-h-10 w-full items-center justify-center gap-2 rounded-full bg-[var(--color-brand)] px-3 py-2 text-center text-[13px] font-semibold leading-snug text-[var(--color-brand-foreground)] disabled:opacity-45"
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
        aria-label={`Customize ${item.name}`}
        className="ml-auto flex h-11 shrink-0 items-center gap-1.5 rounded-full border-[1.5px] border-[var(--color-brand)] bg-[var(--color-surface)] pl-4 pr-3 text-sm font-medium text-[var(--color-brand)] transition-colors hover:bg-[color-mix(in_srgb,var(--color-brand)_8%,transparent)]"
      >
        Customize
        <ChevronRight aria-hidden className="size-4" />
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
      <button
        type="button"
        onClick={add}
        aria-label={`Add ${item.name} to cart`}
        className="ml-auto flex h-11 shrink-0 items-center gap-1.5 rounded-full bg-[var(--color-brand)] pl-3.5 pr-5 text-sm font-medium text-[var(--color-brand-foreground)] shadow-[0_6px_16px_-6px_color-mix(in_srgb,var(--color-brand)_55%,transparent)] transition-colors hover:bg-[color-mix(in_srgb,var(--color-brand)_86%,black)]"
      >
        <Plus aria-hidden className="size-4" />
        Add
      </button>
    );
  }

  return (
    <div
      role="group"
      aria-label={`${item.name} in your cart`}
      className="ml-auto flex h-11 shrink-0 items-center gap-1 rounded-full bg-[var(--color-brand)] p-1 text-[var(--color-brand-foreground)] shadow-[0_6px_16px_-6px_color-mix(in_srgb,var(--color-brand)_55%,transparent)]"
    >
      <button
        type="button"
        aria-label={line.quantity === 1 ? `Remove ${item.name} from cart` : `Remove one ${item.name}`}
        onClick={() => updateQuantity(line.id, line.quantity - 1)}
        className="grid size-9 place-items-center rounded-full bg-[color-mix(in_srgb,var(--color-brand-foreground)_12%,transparent)] transition-colors hover:bg-[color-mix(in_srgb,var(--color-brand-foreground)_22%,transparent)]"
      >
        {line.quantity === 1 ? <Trash2 aria-hidden className="size-4" /> : <Minus aria-hidden className="size-4" />}
      </button>
      <span aria-live="polite" className="tabular min-w-7 text-center text-[15px] font-semibold">
        {line.quantity}
      </span>
      <button
        type="button"
        aria-label={`Add one more ${item.name}`}
        disabled={line.quantity >= 99}
        onClick={() => updateQuantity(line.id, line.quantity + 1)}
        className="grid size-9 place-items-center rounded-full bg-[var(--color-brand-foreground)] text-[var(--color-brand)] transition-opacity hover:opacity-90 disabled:opacity-40"
      >
        <Plus aria-hidden className="size-4" />
      </button>
    </div>
  );
}
