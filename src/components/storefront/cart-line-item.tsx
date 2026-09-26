"use client";

import { useTransition } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Loader2, Minus, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { updateCartItemAction, removeCartItemAction } from "@/app/r/[restaurantSlug]/cart/actions";
import { formatMoney } from "@/shared/money";
import type { CartItem } from "@/shared/contract/models";
import { cn } from "@/shared/utils";

interface CartLineItemProps {
  restaurantSlug: string;
  item: CartItem;
  image: string | null;
  currencySymbol: string;
  locale: string;
}

/** One line in the tray: quantity edits and removal both go through server actions. */
export function CartLineItem({ restaurantSlug, item, image, currencySymbol, locale }: CartLineItemProps) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function run(work: () => Promise<{ success: boolean; error?: { message: string } }>) {
    startTransition(async () => {
      const result = await work();
      if (!result.success) {
        toast.error(result.error?.message ?? "Could not update your cart.");
        return;
      }
      router.refresh();
    });
  }

  const setQuantity = (quantity: number) =>
    run(() => updateCartItemAction(restaurantSlug, { cartItemId: item.id, quantity }));

  return (
    <li className={cn("grid grid-cols-[4.5rem_minmax(0,1fr)] gap-4 py-5 transition-opacity duration-200 sm:grid-cols-[5.5rem_minmax(0,1fr)]", pending && "opacity-60")}>
      <div className="plate">
        {image ? (
          <Image src={image} alt="" fill sizes="88px" className="object-cover" />
        ) : (
          <span className="grid h-full place-items-center font-[family-name:var(--font-display)] text-2xl text-[var(--color-muted-ink)]" aria-hidden>
            {item.itemName.slice(0, 1)}
          </span>
        )}
      </div>

      <div className="min-w-0">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-[15px] font-semibold">
              {item.slug ? (
                <Link href={`/r/${restaurantSlug}/menu/${item.slug}`} scroll={false} className="hover:text-[var(--color-brand)]">
                  {item.itemName}
                </Link>
              ) : (
                item.itemName
              )}
            </p>
            {item.variantName || item.addons.length ? (
              <p className="mt-0.5 text-[13px] leading-snug text-[var(--color-muted-ink)]">
                {[
                  item.variantName,
                  ...item.addons.map((addon) => `${addon.addonName}${addon.quantity > 1 ? ` ×${addon.quantity}` : ""}`),
                ]
                  .filter(Boolean)
                  .join(", ")}
              </p>
            ) : null}
            {item.specialInstructions ? (
              <p className="mt-1 text-xs italic text-[var(--color-muted-ink)]">&ldquo;{item.specialInstructions}&rdquo;</p>
            ) : null}
          </div>
          <p className="tabular whitespace-nowrap text-[15px] font-semibold">
            {formatMoney(item.lineTotal, { currency: currencySymbol, locale })}
          </p>
        </div>

        <div className="mt-3 flex items-center justify-between gap-3">
          <div className="flex h-9 items-center rounded-full border border-[var(--rule-strong)]">
            <button
              type="button"
              aria-label={item.quantity === 1 ? `Remove ${item.itemName}` : `Decrease quantity of ${item.itemName}`}
              className="press grid size-9 place-items-center disabled:opacity-40"
              onClick={() => setQuantity(item.quantity - 1)}
              disabled={pending}
            >
              <Minus className="size-3.5" aria-hidden />
            </button>
            <span aria-live="polite" className="tabular w-7 text-center text-sm font-semibold">
              {pending ? <Loader2 className="mx-auto size-3.5 animate-spin" aria-hidden /> : <span key={item.quantity} className="animate-tick inline-block">{item.quantity}</span>}
            </span>
            <button
              type="button"
              aria-label={`Increase quantity of ${item.itemName}`}
              data-testid="cart-line-increase"
              className="press grid size-9 place-items-center disabled:opacity-40"
              onClick={() => setQuantity(item.quantity + 1)}
              disabled={pending || item.quantity >= 99}
            >
              <Plus className="size-3.5" aria-hidden />
            </button>
          </div>

          <button
            type="button"
            className="press inline-flex items-center gap-1 text-[13px] text-[var(--color-muted-ink)] transition-colors hover:text-[var(--color-danger)] disabled:opacity-40"
            onClick={() => run(() => removeCartItemAction(restaurantSlug, { cartItemId: item.id }))}
            disabled={pending}
          >
            <X className="size-3.5" aria-hidden />
            Remove
          </button>
        </div>
      </div>
    </li>
  );
}
