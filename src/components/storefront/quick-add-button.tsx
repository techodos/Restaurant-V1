"use client";

import Link from "next/link";
import { MapPin, Minus, Plus, Trash2 } from "lucide-react";
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
/**
 * Home-page tiles with multi-branch ordering: no add control until the customer's branch is known (the
 * header's branch pill), then the normal one — never for a dish switched off at that branch.
 */
export function BranchReadyQuickAdd(props: QuickAddButtonProps) {
  const branching = useBranching();
  if (!branching.canOrder(props.orderType) || branching.isOffHere(props.item.id)) return null;
  return <QuickAddButton {...props} />;
}

export function QuickAddButton({ restaurantSlug, item, orderType, compact = false }: QuickAddButtonProps) {
  const size = compact ? "size-9 [&_svg]:size-4" : "size-11 [&_svg]:size-5";
  const { cart, addLine, removeLine, updateQuantity } = useLocalCart();
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

  // requiresSelection is false: no variant, and no addon group forces a default (see
  // resolveMenuSelection) — the item's base price is the whole line. addLine merges into the same plain
  // line (sameLine) and refuses when the cookie would overflow, so "+" reuses it as-is.
  const addOne = () =>
    addLine({
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
  const cartFull = () => toast.error("Your cart is full", { description: "Check out or remove something before adding more." });

  // the plain line this button adds; a line with a note or add-ons (from the dish sheet) is its own row
  const line = cart.lines.find(
    (candidate) => candidate.menuItemId === item.id && candidate.variantId === null && candidate.addons.length === 0 && !candidate.specialInstructions,
  );

  if (line) {
    const hit = compact ? "h-9 w-8 [&_svg]:size-4" : "h-11 w-10 [&_svg]:size-[18px]";
    const atMax = line.quantity >= 99;
    return (
      <div
        role="group"
        aria-label={`${item.name} in your cart`}
        data-testid={`quick-qty-${item.slug}`}
        className="flex items-center rounded-full bg-[var(--brand-primary,var(--color-brand))] text-[var(--brand-primary-foreground,#fff)] shadow-[0_8px_20px_-8px_rgb(0_0_0/0.45)]"
      >
        {/* at 1 the left button removes the line; above 1 it takes one away */}
        <button
          type="button"
          aria-label={line.quantity > 1 ? `Remove one ${item.name}` : `Remove ${item.name} from cart`}
          onClick={() => (line.quantity > 1 ? updateQuantity(line.id, line.quantity - 1) : removeLine(line.id))}
          className={cn(hit, "press grid place-items-center rounded-full pl-1 transition-colors duration-150 hover:bg-white/10 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-current")}
        >
          {line.quantity > 1 ? <Minus aria-hidden strokeWidth={2.25} /> : <Trash2 aria-hidden strokeWidth={2} />}
        </button>
        <span aria-live="polite" className={cn("tabular min-w-5 text-center font-semibold", compact ? "text-[13px]" : "text-[15px]")}>
          {line.quantity}
        </span>
        <button
          type="button"
          aria-label={`Add one more ${item.name}`}
          disabled={atMax}
          onClick={() => {
            if (!addOne()) cartFull();
          }}
          className={cn(hit, "press grid place-items-center rounded-full pr-1 transition-colors duration-150 hover:bg-white/10 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-current disabled:cursor-not-allowed disabled:opacity-45")}
        >
          <span aria-hidden className={cn("grid place-items-center rounded-full bg-white/20", compact ? "size-6" : "size-7")}>
            <Plus strokeWidth={2.25} />
          </span>
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      data-testid={`quick-add-${item.slug}`}
      aria-label={`Add ${item.name} to your order`}
      className={cn(ROUND, size, IDLE)}
      onClick={(event) => {
        const plateImage = event.currentTarget.closest("[data-dish]")?.querySelector("img") ?? null;
        if (!addOne()) return cartFull();
        flyToTray(plateImage);
        toast.success(`${item.name} added to your order`);
      }}
    >
      <Plus aria-hidden />
    </button>
  );
}
