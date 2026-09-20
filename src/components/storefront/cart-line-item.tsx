"use client";

import { useTransition } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Loader2, Minus, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { updateCartItemAction, removeCartItemAction } from "@/app/r/[restaurantSlug]/cart/actions";
import { formatMoney } from "@/shared/money";
import type { CartItem } from "@/shared/contract/models";

interface CartLineItemProps {
  restaurantSlug: string;
  item: CartItem;
  image: string | null;
  currencySymbol: string;
  locale: string;
}

/** One cart row: quantity edits and removal both go through server actions. */
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
    <li className="flex gap-4 border-b border-[var(--color-hairline)] py-5 last:border-b-0">
      <div className="relative size-20 shrink-0 overflow-hidden rounded-[var(--radius-brand)] bg-[color-mix(in_srgb,var(--color-ink)_6%,transparent)] sm:size-24">
        {image ? (
          <Image src={image} alt="" fill sizes="96px" className="object-cover" />
        ) : (
          <span className="grid h-full place-items-center text-xl font-semibold text-[var(--color-muted-ink)]" aria-hidden>
            {item.itemName.slice(0, 1)}
          </span>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate font-medium">
              {item.slug ? (
                <Link href={`/r/${restaurantSlug}/menu/${item.slug}`} className="hover:text-[var(--color-brand)]">
                  {item.itemName}
                </Link>
              ) : (
                item.itemName
              )}
            </p>
            {item.variantName ? <p className="text-sm text-[var(--color-muted-ink)]">{item.variantName}</p> : null}
            {item.addons.length ? (
              <ul className="mt-1 text-xs text-[var(--color-muted-ink)]">
                {item.addons.map((addon) => (
                  <li key={addon.id}>
                    + {addon.addonName}
                    {addon.quantity > 1 ? ` ×${addon.quantity}` : ""}
                  </li>
                ))}
              </ul>
            ) : null}
            {item.specialInstructions ? (
              <p className="mt-1 text-xs italic text-[var(--color-muted-ink)]">“{item.specialInstructions}”</p>
            ) : null}
          </div>
          <p className="whitespace-nowrap font-semibold">
            {formatMoney(item.lineTotal, { currency: currencySymbol, locale })}
          </p>
        </div>

        <div className="mt-3 flex items-center gap-3">
          <div className="flex items-center rounded-[var(--radius-brand)] border border-[var(--color-hairline)]">
            <button
              type="button"
              aria-label={`Decrease quantity of ${item.itemName}`}
              className="grid size-9 place-items-center disabled:opacity-40"
              onClick={() => setQuantity(item.quantity - 1)}
              disabled={pending}
            >
              <Minus className="size-3.5" aria-hidden />
            </button>
            <span aria-live="polite" className="w-8 text-center text-sm font-medium">
              {pending ? <Loader2 className="mx-auto size-3.5 animate-spin" aria-hidden /> : item.quantity}
            </span>
            <button
              type="button"
              aria-label={`Increase quantity of ${item.itemName}`}
              data-testid="cart-line-increase"
              className="grid size-9 place-items-center disabled:opacity-40"
              onClick={() => setQuantity(item.quantity + 1)}
              disabled={pending || item.quantity >= 99}
            >
              <Plus className="size-3.5" aria-hidden />
            </button>
          </div>

          <button
            type="button"
            className="inline-flex items-center gap-1.5 text-sm text-[var(--color-muted-ink)] hover:text-red-600 disabled:opacity-40"
            onClick={() => run(() => removeCartItemAction(restaurantSlug, { cartItemId: item.id }))}
            disabled={pending}
          >
            <Trash2 className="size-4" aria-hidden />
            Remove
          </button>
        </div>
      </div>
    </li>
  );
}
