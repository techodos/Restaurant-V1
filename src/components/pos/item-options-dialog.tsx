"use client";

import { useMemo, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Minus, Plus, X } from "lucide-react";
import type { MenuItem } from "@/shared/contract/models";
import { dec } from "@/shared/money";
import { buildLine, type TicketLine } from "./ticket";
import { rs } from "./format";

/** Variant + add-ons for an item that needs them, then "Add". Rules (required groups, limits) are the server's own resolver's. */
export function ItemOptionsDialog({
  item,
  timezone,
  onAdd,
  onClose,
}: {
  item: MenuItem;
  timezone: string;
  onAdd: (line: TicketLine) => void;
  onClose: () => void;
}) {
  const variants = useMemo(() => item.variants.filter((variant) => variant.isAvailable).sort((a, b) => a.sortOrder - b.sortOrder), [item]);
  const groups = useMemo(() => item.addonGroups.filter((group) => group.isActive !== false && group.addons.some((addon) => addon.isAvailable)), [item]);
  const [variantId, setVariantId] = useState<string | null>((variants.find((variant) => variant.isDefault) ?? variants[0])?.id ?? null);
  const [chosen, setChosen] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(groups.flatMap((group) => group.addons.filter((addon) => addon.isDefault).map((addon) => [addon.id, true]))),
  );
  const [quantity, setQuantity] = useState(1);

  const selection = { variantId, addons: Object.keys(chosen).filter((id) => chosen[id]).map((addonId) => ({ addonId, quantity: 1 })), quantity };
  let line: TicketLine | null = null;
  let problem: string | null = null;
  try {
    line = buildLine(item, selection, timezone);
  } catch (error) {
    problem = error instanceof Error ? error.message : "Choose the options.";
  }

  function toggle(groupId: string, addonId: string) {
    const group = groups.find((candidate) => candidate.id === groupId)!;
    setChosen((current) => {
      const next = { ...current };
      if (group.maxSelect === 1) for (const addon of group.addons) next[addon.id] = false;
      next[addonId] = !current[addonId];
      return next;
    });
  }

  return (
    <Dialog.Root open onOpenChange={(open) => (open ? undefined : onClose())}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <Dialog.Content className="pos-portal fixed inset-x-0 bottom-0 z-50 flex max-h-[88dvh] min-h-0 flex-col rounded-t-[16px] bg-[var(--pos-surface)] sm:inset-auto sm:left-1/2 sm:top-1/2 sm:w-[min(32rem,calc(100vw-2rem))] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-[14px]">
          <div className="flex items-start justify-between gap-3 border-b border-[var(--pos-line)] px-5 py-4">
            <div>
              <Dialog.Title className="text-[17px] font-semibold">{item.name}</Dialog.Title>
              <Dialog.Description className="text-[13px] text-[var(--pos-muted)]">Choose the options, then add to the ticket.</Dialog.Description>
            </div>
            <Dialog.Close className="grid size-10 place-items-center rounded-full hover:bg-[var(--pos-canvas)]" aria-label="Close">
              <X className="size-5" aria-hidden />
            </Dialog.Close>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            {variants.length > 0 ? (
              <fieldset className="mb-5">
                <legend className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-[var(--pos-muted)]">Size / option</legend>
                <div className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-2">
                  {variants.map((variant) => (
                    <label
                      key={variant.id}
                      className={`flex min-h-12 cursor-pointer items-center justify-between gap-2 rounded-[var(--pos-radius)] border px-3 text-[14px] ${variantId === variant.id ? "border-[var(--pos-green)] bg-[var(--pos-green-tint)]" : "border-[var(--pos-line)]"}`}
                    >
                      <span className="flex items-center gap-2">
                        <input type="radio" name="variant" className="size-4" checked={variantId === variant.id} onChange={() => setVariantId(variant.id)} />
                        {variant.name}
                      </span>
                      <span className="tabular-nums text-[var(--pos-muted)]">
                        {variant.priceMode === "delta" ? (dec(variant.price).isZero() ? "" : `+${rs(variant.price)}`) : rs(variant.price)}
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
            ) : null}
            {groups.map((group) => (
              <fieldset key={group.id} className="mb-5">
                <legend className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-[var(--pos-muted)]">
                  {group.name}
                  {group.minSelect > 0 ? " · required" : ""}
                  {group.maxSelect > 1 ? ` · up to ${group.maxSelect}` : ""}
                </legend>
                <div className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-2">
                  {group.addons
                    .filter((addon) => addon.isAvailable)
                    .map((addon) => (
                      <label
                        key={addon.id}
                        className={`flex min-h-12 cursor-pointer items-center justify-between gap-2 rounded-[var(--pos-radius)] border px-3 text-[14px] ${chosen[addon.id] ? "border-[var(--pos-green)] bg-[var(--pos-green-tint)]" : "border-[var(--pos-line)]"}`}
                      >
                        <span className="flex items-center gap-2">
                          <input type={group.maxSelect === 1 ? "radio" : "checkbox"} className="size-4" checked={Boolean(chosen[addon.id])} onChange={() => toggle(group.id, addon.id)} />
                          {addon.name}
                        </span>
                        {dec(addon.price).greaterThan(0) ? <span className="tabular-nums text-[var(--pos-muted)]">+{rs(addon.price)}</span> : null}
                      </label>
                    ))}
                </div>
              </fieldset>
            ))}
          </div>
          <div className="flex flex-col gap-3 border-t border-[var(--pos-line)] px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] min-[420px]:flex-row min-[420px]:items-center">
            <div className="flex items-center justify-center gap-2">
              <button type="button" aria-label="One less" className="grid size-11 place-items-center rounded-[var(--pos-radius)] border border-[var(--pos-line-strong)]" onClick={() => setQuantity((value) => Math.max(1, value - 1))}>
                <Minus className="size-4" aria-hidden />
              </button>
              <span className="w-8 text-center text-[16px] font-semibold tabular-nums" aria-live="polite">{quantity}</span>
              <button type="button" aria-label="One more" className="grid size-11 place-items-center rounded-[var(--pos-radius)] border border-[var(--pos-line-strong)]" onClick={() => setQuantity((value) => Math.min(99, value + 1))}>
                <Plus className="size-4" aria-hidden />
              </button>
            </div>
            <button
              type="button"
              disabled={!line}
              onClick={() => line && onAdd(line)}
              className="min-h-12 flex-1 rounded-[var(--pos-radius)] bg-[var(--pos-green)] px-4 text-[15px] font-semibold text-white disabled:opacity-50"
            >
              {line ? `Add · ${rs(dec(line.unitPrice).plus(dec(line.addonsTotal)).times(quantity).toFixed(2))}` : (problem ?? "Choose the options")}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
