"use client";

import { Plus, Trash2, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label } from "@/components/ui/input";
import { type DeliverySlab } from "@/shared/delivery-pricing";

/** 0–1 km, 1–3 km, …: each row's own lower bound is the row above's `maxKm` (0 for the first) — shown,
 * never stored (the stored shape is just the ascending list of upper bounds + fees). */
function slabRangeLabel(slabs: DeliverySlab[], index: number): string {
  const from = index === 0 ? 0 : slabs[index - 1]!.maxKm;
  return `Above ${from} km, up to and including ${slabs[index]!.maxKm} km`;
}

/**
 * Distance-based delivery pricing for one branch: add/remove/edit fixed-fee ranges, client-side
 * order/positivity checks mirroring `deliveryPricingSchema` (the server re-validates regardless — this is
 * just fast feedback). Used on the Delivery Zones admin page, one editor per branch in scope.
 */
export function DeliveryPricingEditor({
  slabs,
  onChange,
  error,
}: {
  slabs: DeliverySlab[];
  onChange: (slabs: DeliverySlab[]) => void;
  error?: string;
}) {
  const update = (index: number, patch: Partial<DeliverySlab>) =>
    onChange(slabs.map((slab, i) => (i === index ? { ...slab, ...patch } : slab)));
  const remove = (index: number) => onChange(slabs.filter((_, i) => i !== index));
  const add = () => {
    const previousMax = slabs.at(-1)?.maxKm ?? 0;
    onChange([...slabs, { maxKm: previousMax + 2, fee: 0 }]);
  };
  // the only thing this UI can get wrong that the schema would reject: a distance not greater than the one before it
  const outOfOrder = slabs.findIndex((slab, index) => index > 0 && slab.maxKm <= slabs[index - 1]!.maxKm);

  return (
    <div className="space-y-2">
      {slabs.map((slab, index) => (
        <div key={index} className="flex flex-wrap items-end gap-2.5 rounded-lg border border-[var(--color-hairline)] bg-[var(--color-surface)] p-2.5">
          <div className="w-28">
            <Label htmlFor={`slab-max-${index}`} className="text-xs">
              Up to (km)
            </Label>
            <Input
              id={`slab-max-${index}`}
              type="number"
              min={0.1}
              step={0.1}
              value={slab.maxKm}
              aria-invalid={outOfOrder === index}
              onChange={(event) => update(index, { maxKm: Number(event.target.value) })}
              className="h-9"
            />
          </div>
          <div className="w-32">
            <Label htmlFor={`slab-fee-${index}`} className="text-xs">
              Fee
            </Label>
            <Input
              id={`slab-fee-${index}`}
              type="number"
              min={0}
              step={1}
              value={slab.fee}
              onChange={(event) => update(index, { fee: Number(event.target.value) })}
              className="h-9"
            />
          </div>
          <p className="min-w-0 flex-1 pb-2 text-xs text-[var(--color-muted-ink)]">{slabRangeLabel(slabs, index)}</p>
          <Button type="button" size="icon" variant="ghost" onClick={() => remove(index)} aria-label="Remove this range">
            <Trash2 className="size-4" aria-hidden />
          </Button>
        </div>
      ))}
      {outOfOrder >= 0 ? (
        <p className="flex items-center gap-1.5 text-xs text-[var(--color-danger)]">
          <TriangleAlert className="size-3.5 shrink-0" aria-hidden />
          Each range's distance must be greater than the one before it.
        </p>
      ) : null}
      <FieldError>{error}</FieldError>
      <Button type="button" variant="outline" size="sm" onClick={add}>
        <Plus className="size-4" aria-hidden /> Add range
      </Button>
      {slabs.length > 0 ? (
        <p className="text-xs text-[var(--color-muted-ink)]">
          Beyond {slabs.at(-1)!.maxKm} km, this branch will not deliver. Needs a map pin on this branch (Locations), and the
          customer placing a pin at checkout — a typed address with no pin keeps using the matching delivery zone's own fee.
        </p>
      ) : (
        <p className="text-xs text-[var(--color-muted-ink)]">Not configured: zones below keep charging their own flat fee, as today.</p>
      )}
    </div>
  );
}
