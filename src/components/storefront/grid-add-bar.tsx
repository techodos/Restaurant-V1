"use client";

import Link from "next/link";
import { Minus, Plus, MapPin, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/shared/utils";
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
  /** the product-card layout's form: worded "Add to Cart" / "Customize" buttons instead of the round "+" */
  wide?: boolean;
}

/**
 * The grid menu layout's add control, on the bottom-right corner of the dish PHOTO (dish-tile.tsx positions it,
 * so the card footer is only the price and every card's price lines up). Not in the cart: a round brand "+"
 * (aria-label "Add <dish> to cart"). In the cart: a compact brand pill `[trash|−] n [+]` showing the cart's
 * real quantity of this dish (its plain line: no variant, add-ons or note), changed in place through
 * `updateQuantity`; − at 1 removes it. Same tray, same cookie, same rules as the floating + elsewhere
 * (`addLine`). Dishes with options get a round OUTLINED "+" (solid = adds now, hollow = opens the dish to
 * choose first; the "From" label over the price says why). The branch / location gate keeps a worded pill
 * (it has to say what to do), as wide as its words and never wider than the photo.
 */
export function GridAddBar({ restaurantSlug, item, orderType, wide = false }: GridAddBarProps) {
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
        aria-label={hint}
        title={hint}
        aria-disabled={noService || undefined}
        onClick={() => (noService ? undefined : branching.resolveGate(orderType))}
        className="flex min-h-10 max-w-full items-center justify-center gap-2 whitespace-nowrap rounded-full bg-[var(--color-brand)] px-4 py-2 text-center text-[13px] font-semibold leading-snug text-[var(--color-brand-foreground)] shadow-[0_6px_18px_-4px_rgb(0_0_0/0.45)] disabled:opacity-45"
        disabled={noService}
      >
        <MapPin aria-hidden className="hidden size-4 shrink-0 min-[400px]:block" />
        {noService ? "Not available here" : gate === "need-branch" ? "Choose branch" : "Set location"}
      </button>
    );
  }

  if (item.requiresSelection) {
    if (wide) {
      return (
        <Link
          href={`/menu/${item.slug}${orderType ? `?orderType=${orderType}` : ""}`}
          scroll={false}
          aria-label={`Customize ${item.name}`}
          className="press inline-flex h-10 items-center justify-center gap-1.5 rounded-xl border-[1.5px] border-[var(--color-brand)] bg-[var(--color-surface)] px-4 text-[13px] font-bold text-[var(--color-brand)] transition-colors hover:bg-[color-mix(in_srgb,var(--color-brand)_8%,transparent)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand)]"
        >
          Customize
        </Link>
      );
    }
    return (
      <Link
        href={`/menu/${item.slug}${orderType ? `?orderType=${orderType}` : ""}`}
        scroll={false}
        aria-label={`Customize ${item.name}`}
        title="Choose options"
        className="relative before:absolute before:-inset-1 before:content-[''] grid size-10 shrink-0 place-items-center rounded-full border-[1.5px] border-[var(--color-brand)] bg-[var(--color-surface)] shadow-[0_6px_18px_-4px_rgb(0_0_0/0.45)] text-[var(--color-brand)] transition-colors hover:bg-[color-mix(in_srgb,var(--color-brand)_10%,transparent)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand)] sm:size-11"
      >
        <Plus aria-hidden className="size-5" />
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
  };

  if (!line && wide) {
    return (
      <button
        type="button"
        onClick={add}
        aria-label={`Add ${item.name} to cart`}
        className="press inline-flex h-10 items-center justify-center rounded-xl bg-[var(--color-brand)] px-5 text-[13px] font-bold text-[var(--color-brand-foreground)] shadow-[0_6px_14px_-6px_color-mix(in_srgb,var(--color-brand)_60%,transparent)] transition-[filter] hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand)]"
      >
        Add to Cart
      </button>
    );
  }

  if (!line) {
    return (
      <button
        type="button"
        onClick={add}
        aria-label={`Add ${item.name} to cart`}
        className="press relative before:absolute before:-inset-1 before:content-[''] grid size-10 shrink-0 place-items-center rounded-full bg-[var(--color-brand)] text-[var(--color-brand-foreground)] shadow-[0_6px_18px_-4px_rgb(0_0_0/0.45)] transition-colors hover:bg-[color-mix(in_srgb,var(--color-brand)_86%,black)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand)] sm:size-11"
      >
        <Plus aria-hidden className="size-5" />
      </button>
    );
  }

  return (
    <div
      role="group"
      aria-label={`${item.name} in your cart`}
      className={cn("flex h-10 shrink-0 items-center gap-0.5 rounded-full bg-[var(--color-brand)] p-1 text-[var(--color-brand-foreground)] shadow-[0_6px_18px_-4px_rgb(0_0_0/0.45)] sm:h-11", wide && "w-fit sm:h-10")}
    >
      <button
        type="button"
        aria-label={line.quantity === 1 ? `Remove ${item.name} from cart` : `Remove one ${item.name}`}
        onClick={() => updateQuantity(line.id, line.quantity - 1)}
        className="grid size-8 place-items-center rounded-full sm:size-9 bg-[color-mix(in_srgb,var(--color-brand-foreground)_12%,transparent)] transition-colors hover:bg-[color-mix(in_srgb,var(--color-brand-foreground)_22%,transparent)]"
      >
        {line.quantity === 1 ? <Trash2 aria-hidden className="size-4" /> : <Minus aria-hidden className="size-4" />}
      </button>
      <span aria-live="polite" className="tabular min-w-6 text-center text-[15px] font-semibold">
        {line.quantity}
      </span>
      <button
        type="button"
        aria-label={`Add one more ${item.name}`}
        disabled={line.quantity >= 99}
        onClick={() => updateQuantity(line.id, line.quantity + 1)}
        className="grid size-8 place-items-center rounded-full sm:size-9 bg-[var(--color-brand-foreground)] text-[var(--color-brand)] transition-opacity hover:opacity-90 disabled:opacity-40"
      >
        <Plus aria-hidden className="size-4" />
      </button>
    </div>
  );
}
