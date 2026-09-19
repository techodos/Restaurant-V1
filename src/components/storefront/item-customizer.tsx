"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Decimal from "decimal.js";
import { Loader2, Minus, Plus, ShoppingBag } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FieldError, FieldHint, Label, Textarea } from "@/components/ui/input";
import { addToCartAction } from "@/app/r/[restaurantSlug]/cart/actions";
import { formatMoney } from "@/lib/money";
import type { MenuItem } from "@/lib/contract/models";
import { cn } from "@/lib/utils";

interface ItemCustomizerProps {
  restaurantSlug: string;
  item: MenuItem;
  currencySymbol: string;
  locale: string;
  orderType?: string | undefined;
}

type GroupState = Record<string, string[]>;

/**
 * Item customisation. Variant/add-on rules are enforced by the server
 * (resolveItemSelection); this component mirrors them for immediate feedback and
 * shows a live, Decimal-based estimate that is replaced by the server's numbers
 * the moment the item lands in the cart.
 */
export function ItemCustomizer({ restaurantSlug, item, currencySymbol, locale, orderType }: ItemCustomizerProps) {
  const variationGroups = item.variants.length > 0 ? 1 : 0;
  const [variantId, setVariantId] = useState<string | null>(
    item.variants.find((variant) => variant.isDefault)?.id ?? item.variants[0]?.id ?? null,
  );
  const [selection, setSelection] = useState<GroupState>(() => {
    const initial: GroupState = {};
    for (const group of item.addonGroups) {
      const defaults = group.addons.filter((addon) => addon.isDefault).map((addon) => addon.id);
      initial[group.id] = group.minSelect > 0 && defaults.length ? defaults.slice(0, group.minSelect) : [];
    }
    return initial;
  });
  const [quantity, setQuantity] = useState(1);
  const [notes, setNotes] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const variant = item.variants.find((candidate) => candidate.id === variantId) ?? null;

  const unitPrice = useMemo(() => {
    const base = new Decimal(item.basePrice);
    if (!variant) return base;
    return variant.priceMode === "delta" ? base.plus(variant.price) : new Decimal(variant.price);
  }, [item.basePrice, variant]);

  const addonsTotal = useMemo(
    () =>
      item.addonGroups.reduce((total, group) => {
        const chosen = selection[group.id] ?? [];
        return total.plus(
          group.addons
            .filter((addon) => chosen.includes(addon.id))
            .reduce((subtotal, addon) => subtotal.plus(addon.price), new Decimal(0)),
        );
      }, new Decimal(0)),
    [item.addonGroups, selection],
  );

  const lineTotal = unitPrice.plus(addonsTotal).times(quantity);

  function toggleAddon(groupId: string, addonId: string, maxSelect: number) {
    setSelection((current) => {
      const chosen = current[groupId] ?? [];
      if (chosen.includes(addonId)) {
        return { ...current, [groupId]: chosen.filter((id) => id !== addonId) };
      }
      if (maxSelect === 1) return { ...current, [groupId]: [addonId] };
      if (chosen.length >= maxSelect) return current;
      return { ...current, [groupId]: [...chosen, addonId] };
    });
  }

  function validate(): boolean {
    const nextErrors: Record<string, string> = {};
    if (item.variants.length > 0 && !variantId) nextErrors.variant = "Please choose an option.";
    for (const group of item.addonGroups) {
      const chosen = selection[group.id]?.length ?? 0;
      if (chosen < group.minSelect) nextErrors[group.id] = `Choose at least ${group.minSelect} for ${group.name}.`;
      if (chosen > group.maxSelect) nextErrors[group.id] = `Choose at most ${group.maxSelect} for ${group.name}.`;
    }
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  function addToCart() {
    if (!item.isAvailable) {
      toast.error("That item is not available right now.");
      return;
    }
    if (!validate()) {
      toast.error("Please review the highlighted options.");
      return;
    }

    startTransition(async () => {
      const result = await addToCartAction(restaurantSlug, {
        menuItemId: item.id,
        variantId,
        quantity,
        addons: item.addonGroups.flatMap((group) =>
          (selection[group.id] ?? []).map((addonId) => ({ addonId, quantity: 1 })),
        ),
        ...(notes.trim() ? { specialInstructions: notes.trim() } : {}),
        ...(orderType ? { orderType } : {}),
      });

      if (!result.success) {
        toast.error(result.error.message);
        return;
      }
      toast.success(`${quantity} × ${item.name} added`, { description: "Open your cart to check out." });
      setNotes("");
      setQuantity(1);
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      {variationGroups > 0 ? (
        <fieldset className="space-y-3">
          <legend className="text-sm font-semibold">
            Choose your option <span className="text-[var(--color-muted-ink)]">(required)</span>
          </legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {item.variants.map((option) => (
              <label
                key={option.id}
                className={cn(
                  "flex cursor-pointer items-center justify-between gap-3 rounded-[var(--radius-brand)] border p-3 text-sm transition-colors",
                  variantId === option.id
                    ? "border-[var(--color-brand)] bg-[color-mix(in_srgb,var(--color-brand)_6%,transparent)]"
                    : "border-[var(--color-hairline)] hover:border-[var(--color-brand)]",
                  !option.isAvailable && "cursor-not-allowed opacity-50",
                )}
              >
                <span className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="variant"
                    value={option.id}
                    checked={variantId === option.id}
                    disabled={!option.isAvailable}
                    onChange={() => setVariantId(option.id)}
                    className="size-4 accent-[var(--color-brand)]"
                  />
                  <span>{option.name}</span>
                  {option.isDefault ? <Badge variant="soft">Popular</Badge> : null}
                </span>
                <span className="text-[var(--color-muted-ink)]">
                  {formatMoney(
                    option.priceMode === "delta" ? new Decimal(item.basePrice).plus(option.price).toFixed(2) : option.price,
                    { currency: currencySymbol, locale },
                  )}
                </span>
              </label>
            ))}
          </div>
          <FieldError>{errors.variant}</FieldError>
        </fieldset>
      ) : null}

      {item.addonGroups.map((group) => {
        const chosen = selection[group.id] ?? [];
        const limitReached = chosen.length >= group.maxSelect;
        return (
          <fieldset key={group.id} className="space-y-3">
            <legend className="text-sm font-semibold">
              {group.name}
              <span className="ml-2 font-normal text-[var(--color-muted-ink)]">
                {group.minSelect > 0 ? `choose ${group.minSelect}` : "optional"}
                {group.maxSelect > 1 ? ` · up to ${group.maxSelect}` : ""}
              </span>
            </legend>
            {group.description ? <FieldHint>{group.description}</FieldHint> : null}
            <div className="grid gap-2 sm:grid-cols-2">
              {group.addons.map((addon) => {
                const checked = chosen.includes(addon.id);
                return (
                  <label
                    key={addon.id}
                    className={cn(
                      "flex cursor-pointer items-center justify-between gap-3 rounded-[var(--radius-brand)] border p-3 text-sm transition-colors",
                      checked
                        ? "border-[var(--color-brand)] bg-[color-mix(in_srgb,var(--color-brand)_6%,transparent)]"
                        : "border-[var(--color-hairline)] hover:border-[var(--color-brand)]",
                      !addon.isAvailable && "cursor-not-allowed opacity-50",
                      !checked && limitReached && group.maxSelect > 1 && "cursor-not-allowed opacity-60",
                    )}
                  >
                    <span className="flex items-center gap-2">
                      <input
                        type={group.maxSelect === 1 ? "radio" : "checkbox"}
                        name={group.id}
                        checked={checked}
                        disabled={!addon.isAvailable || (!checked && limitReached && group.maxSelect > 1)}
                        onChange={() => toggleAddon(group.id, addon.id, group.maxSelect)}
                        className="size-4 accent-[var(--color-brand)]"
                      />
                      <span>
                        {addon.name}
                        {addon.description ? (
                          <span className="block text-xs text-[var(--color-muted-ink)]">{addon.description}</span>
                        ) : null}
                      </span>
                    </span>
                    <span className="whitespace-nowrap text-[var(--color-muted-ink)]">
                      {new Decimal(addon.price).isZero()
                        ? "Free"
                        : `+ ${formatMoney(addon.price, { currency: currencySymbol, locale })}`}
                    </span>
                  </label>
                );
              })}
            </div>
            <FieldError>{errors[group.id]}</FieldError>
          </fieldset>
        );
      })}

      <div className="space-y-2">
        <Label htmlFor="item-notes">Special instructions</Label>
        <Textarea
          id="item-notes"
          rows={2}
          maxLength={280}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          placeholder="No onions, extra crispy, allergy notes…"
        />
        <FieldHint>We pass this straight to the kitchen.</FieldHint>
      </div>

      <div className="sticky bottom-0 -mx-4 border-t border-[var(--color-hairline)] bg-[var(--color-surface)]/95 px-4 py-4 backdrop-blur sm:mx-0 sm:rounded-[var(--radius-brand)] sm:border">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center rounded-[var(--radius-brand)] border border-[var(--color-hairline)]">
            <button
              type="button"
              aria-label="Decrease quantity"
              data-testid="quantity-decrease"
              className="grid size-11 place-items-center disabled:opacity-40"
              onClick={() => setQuantity((value) => Math.max(1, value - 1))}
              disabled={quantity <= 1}
            >
              <Minus className="size-4" aria-hidden />
            </button>
            <span aria-live="polite" className="w-10 text-center text-sm font-medium">
              {quantity}
            </span>
            <button
              type="button"
              aria-label="Increase quantity"
              data-testid="quantity-increase"
              className="grid size-11 place-items-center disabled:opacity-40"
              onClick={() => setQuantity((value) => Math.min(99, value + 1))}
              disabled={quantity >= 99}
            >
              <Plus className="size-4" aria-hidden />
            </button>
          </div>

          <Button
            size="lg"
            data-testid="add-to-cart"
            onClick={addToCart}
            disabled={pending || !item.isAvailable}
            className="flex-1 sm:flex-none"
          >
            {pending ? <Loader2 className="animate-spin" aria-hidden /> : <ShoppingBag aria-hidden />}
            <span>
              {item.isAvailable ? "Add to cart" : "Unavailable"}
              <span className="ml-2 font-semibold">{formatMoney(lineTotal.toFixed(2), { currency: currencySymbol, locale })}</span>
            </span>
          </Button>
        </div>
        <FieldHint>Prices are confirmed by the kitchen system when your order is placed.</FieldHint>
      </div>
    </div>
  );
}
