"use client";

import { Plus, Trash2, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FieldError, Input } from "@/components/ui/input";
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

  const row = "grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_2.5rem] items-center gap-2 sm:grid-cols-[minmax(0,1fr)_7.5rem_8.5rem_2.5rem] sm:gap-3";

  return (
    <div className="space-y-3">
      {slabs.length > 0 ? (
        <div className="overflow-hidden rounded-xl ring-1 ring-[var(--admin-line,var(--color-hairline))]">
          <div className={`${row} hidden bg-[color-mix(in_srgb,var(--color-ink)_2.5%,var(--color-surface))] px-3 py-2 text-[11.5px] font-semibold uppercase tracking-[0.08em] text-[var(--color-muted-ink)] sm:grid`}>
            <span>Range</span>
            <span>Up to</span>
            <span>Fee</span>
            <span className="sr-only">Remove</span>
          </div>
          <ol className="divide-y divide-[var(--admin-line,var(--color-hairline))]">
            {slabs.map((slab, index) => {
              const from = index === 0 ? 0 : slabs[index - 1]!.maxKm;
              return (
                <li key={index} className={`${row} bg-[var(--color-surface)] px-3 py-2.5`}>
                  <span className="col-span-3 sm:col-span-1" title={slabRangeLabel(slabs, index)}>
                    <span className="tabular inline-flex items-center rounded-full bg-[color-mix(in_srgb,var(--color-brand)_9%,var(--color-surface))] px-2.5 py-1 text-[12.5px] font-semibold text-[var(--color-brand)]">
                      {from}–{slab.maxKm} km
                    </span>
                    <span className="sr-only">{slabRangeLabel(slabs, index)}</span>
                  </span>
                  <span className="relative">
                    <Input
                      id={`slab-max-${index}`}
                      aria-label={`Range ${index + 1}: up to (km)`}
                      type="number"
                      min={0.1}
                      step={0.1}
                      value={slab.maxKm}
                      aria-invalid={outOfOrder === index}
                      onChange={(event) => update(index, { maxKm: Number(event.target.value) })}
                      className="h-10 pr-10"
                    />
                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[12.5px] text-[var(--color-muted-ink)]">km</span>
                  </span>
                  <span className="relative">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[12.5px] text-[var(--color-muted-ink)] sm:hidden">Fee</span>
                    <Input
                      id={`slab-fee-${index}`}
                      aria-label={`Range ${index + 1}: fee`}
                      type="number"
                      min={0}
                      step={1}
                      value={slab.fee}
                      onChange={(event) => update(index, { fee: Number(event.target.value) })}
                      className="h-10 pl-11 sm:pl-3.5"
                    />
                  </span>
                  <Button type="button" size="icon" variant="ghost" onClick={() => remove(index)} aria-label={`Remove range ${index + 1}`}>
                    <Trash2 className="size-4" aria-hidden />
                  </Button>
                </li>
              );
            })}
          </ol>
        </div>
      ) : null}
      {outOfOrder >= 0 ? (
        <p className="flex items-center gap-1.5 text-xs text-[var(--color-danger)]">
          <TriangleAlert className="size-3.5 shrink-0" aria-hidden />
          Each range&apos;s distance must be greater than the one before it.
        </p>
      ) : null}
      <FieldError>{error}</FieldError>
      <Button type="button" variant="outline" size="sm" onClick={add}>
        <Plus className="size-4" aria-hidden /> Add range
      </Button>
      {slabs.length > 0 ? (
        <p className="text-xs leading-relaxed text-[var(--color-muted-ink)]">
          Beyond {slabs.at(-1)!.maxKm} km, this branch will not deliver. Needs a map pin on this branch (Locations), and the
          customer placing a pin at checkout — a typed address with no pin keeps using the matching delivery zone&apos;s own fee.
        </p>
      ) : (
        <p className="text-xs text-[var(--color-muted-ink)]">Not configured: zones keep charging their own flat fee.</p>
      )}
    </div>
  );
}
