"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Decimal from "decimal.js";
import { Loader2, Minus, Plus, ShoppingBag } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { FieldError, FieldHint, Label, Textarea } from "@/components/ui/input";
import { addToCartAction } from "@/app/r/[restaurantSlug]/cart/actions";
import { formatMoney } from "@/shared/money";
import type { MenuItem } from "@/shared/contract/models";
import { cn } from "@/shared/utils";
import { flyToTray } from "@/components/motion/fly-to-tray";
import { CLOSE_ROUTE_SHEET_EVENT } from "@/components/motion/route-sheet";

interface ItemCustomizerProps {
  restaurantSlug: string;
  item: MenuItem;
  currencySymbol: string;
  locale: string;
  orderType?: string | undefined;
  /** rendered inside the dish sheet: a successful add lands in the tray and closes the sheet */
  inSheet?: boolean;
}

type GroupState = Record<string, string[]>;

/**
 * Item customisation. Variant/add-on rules are enforced by the server
 * (resolveItemSelection); this component mirrors them for immediate feedback and
 * shows a live, Decimal-based estimate that is replaced by the server's numbers
 * the moment the item lands in the cart.
 */
export function ItemCustomizer({ restaurantSlug, item, currencySymbol, locale, orderType, inSheet }: ItemCustomizerProps) {
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
      flyToTray(document.querySelector<HTMLImageElement>(`img[data-dish-image="${item.slug}"]`));
      toast.success(`${quantity} × ${item.name} is in your tray`);
      setNotes("");
      setQuantity(1);
      router.refresh();
      if (inSheet) window.dispatchEvent(new CustomEvent(CLOSE_ROUTE_SHEET_EVENT));
    });
  }

  // chosen options are solid; unchosen ones stay quiet dashed outlines until picked
  const optionClass = (checked: boolean, disabled: boolean) =>
    cn(
      "flex min-h-14 cursor-pointer items-center justify-between gap-3 rounded-[var(--radius-card)] border px-4 py-3 text-sm transition-[border-color,background-color,box-shadow] duration-200 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--color-brand)]",
      checked
        ? "border-solid border-[var(--color-ink)] bg-[var(--color-surface)] shadow-[inset_0_0_0_1px_var(--color-ink)]"
        : "border-dashed border-[var(--rule-strong)] hover:border-solid hover:border-[var(--color-muted-ink)]",
      disabled && "cursor-not-allowed opacity-45",
    );

  return (
    <div className="space-y-9">
      {variationGroups > 0 ? (
        <fieldset className="space-y-3">
          <legend className="mb-1 flex w-full items-baseline justify-between text-[15px] font-semibold">
            Choose a size
            <span className="text-xs font-medium text-[var(--color-muted-ink)]">Required</span>
          </legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {item.variants.map((option) => (
              <label key={option.id} className={optionClass(variantId === option.id, !option.isAvailable)}>
                <span className="flex items-center gap-3">
                  <input
                    type="radio"
                    name="variant"
                    value={option.id}
                    checked={variantId === option.id}
                    disabled={!option.isAvailable}
                    onChange={() => setVariantId(option.id)}
                    className="size-4"
                  />
                  <span className="font-medium">{option.name}</span>
                  {option.isDefault ? <span className="text-xs text-[var(--color-muted-ink)]">Most ordered</span> : null}
                </span>
                <span className="tabular text-[var(--color-muted-ink)]">
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
            <legend className="mb-1 flex w-full items-baseline justify-between text-[15px] font-semibold">
              {group.name}
              <span className="text-xs font-medium text-[var(--color-muted-ink)]">
                {group.minSelect > 0 ? `Choose ${group.minSelect}` : "Optional"}
                {group.maxSelect > 1 ? (
                  <span className="tabular">
                    {" "}
                    · {chosen.length} of {group.maxSelect}
                  </span>
                ) : null}
              </span>
            </legend>
            {group.description ? <FieldHint>{group.description}</FieldHint> : null}
            <div className="grid gap-2 sm:grid-cols-2">
              {group.addons.map((addon) => {
                const checked = chosen.includes(addon.id);
                const blocked = !addon.isAvailable || (!checked && limitReached && group.maxSelect > 1);
                return (
                  <label key={addon.id} className={optionClass(checked, blocked)}>
                    <span className="flex items-center gap-3">
                      <input
                        type={group.maxSelect === 1 ? "radio" : "checkbox"}
                        name={group.id}
                        checked={checked}
                        disabled={blocked}
                        onChange={() => toggleAddon(group.id, addon.id, group.maxSelect)}
                        className="size-4"
                      />
                      <span>
                        <span className="font-medium">{addon.name}</span>
                        {addon.description ? (
                          <span className="block text-xs text-[var(--color-muted-ink)]">{addon.description}</span>
                        ) : null}
                      </span>
                    </span>
                    <span className="tabular whitespace-nowrap text-[var(--color-muted-ink)]">
                      {new Decimal(addon.price).isZero()
                        ? "Included"
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
        <Label htmlFor="item-notes">Note for the kitchen</Label>
        <Textarea
          id="item-notes"
          rows={2}
          maxLength={280}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          placeholder="No onions, extra crispy, allergy notes"
        />
        <FieldHint>Passed straight to the kitchen with this dish.</FieldHint>
      </div>

      <div
        className={cn(
          "sticky bottom-0 z-20 -mx-5 border-t border-[var(--rule)] bg-[color-mix(in_srgb,var(--color-surface)_94%,transparent)] px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur-xl md:-mx-7 md:px-7",
          !inSheet && "sm:bottom-4 sm:mx-0 sm:rounded-[var(--radius-card)] sm:border sm:px-4 sm:shadow-[var(--shadow-raised)]",
        )}
      >
        <div className="flex items-center gap-3">
          <div className="flex h-12 items-center rounded-full border border-[var(--rule-strong)]">
            <button
              type="button"
              aria-label="Decrease quantity"
              data-testid="quantity-decrease"
              className="press grid size-11 place-items-center disabled:opacity-35 sm:size-12"
              onClick={() => setQuantity((value) => Math.max(1, value - 1))}
              disabled={quantity <= 1}
            >
              <Minus className="size-4" aria-hidden />
            </button>
            <span aria-live="polite" key={quantity} className="tabular animate-tick w-6 text-center text-[15px] font-semibold">
              {quantity}
            </span>
            <button
              type="button"
              aria-label="Increase quantity"
              data-testid="quantity-increase"
              className="press grid size-11 place-items-center disabled:opacity-35 sm:size-12"
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
            className="h-12 min-w-0 flex-1 justify-between gap-2 rounded-full px-4 sm:px-5"
          >
            <span className="flex items-center gap-2">
              {pending ? <Loader2 className="animate-spin" aria-hidden /> : <ShoppingBag aria-hidden />}
              {item.isAvailable ? (
                pending ? (
                  "Adding"
                ) : (
                  <>
                    <span className="sm:hidden">Add</span>
                    <span className="hidden sm:inline">Add to tray</span>
                  </>
                )
              ) : (
                "Unavailable"
              )}
            </span>
            <span className="tabular font-semibold">{formatMoney(lineTotal.toFixed(2), { currency: currencySymbol, locale })}</span>
          </Button>
        </div>
        <p className="mt-2 text-center text-[11px] text-[var(--color-muted-ink)]">Prices are confirmed when your order is placed.</p>
      </div>
    </div>
  );
}
