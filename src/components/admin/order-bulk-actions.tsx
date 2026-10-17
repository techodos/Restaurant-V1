"use client";

import { createContext, useContext, useState, useTransition, type ReactNode } from "react";
import { Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { bulkUpdateOrderStatusAction } from "@/app/admin/(dashboard)/orders/actions";
import type { OrderStatus } from "@/shared/contract/enums";
import { useSettledToast } from "@/components/admin/use-settled-toast";
import { markOwnOrderChanges } from "@/components/admin/order-sound-notifications";

/**
 * Orders list bulk action: tick orders, then move every one of them to ITS OWN next step (the same step its row
 * button offers) with one request — one SQL update and one re-render, instead of one queued action + full page render
 * per click. Only rows that have a next step get a checkbox; cancelling stays per order (it asks for a reason).
 */
export interface BulkOrder {
  id: string;
  orderNumber: string;
  next: { status: OrderStatus; label: string };
}

interface BulkState {
  orders: BulkOrder[];
  selected: ReadonlySet<string>;
  toggle: (id: string) => void;
  setAll: (on: boolean) => void;
  pending: boolean;
}

const BulkContext = createContext<BulkState | null>(null);

export function OrderBulkProvider({ orders, children }: { orders: BulkOrder[]; children: ReactNode }) {
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
  const [pending, startTransition] = useTransition();
  const later = useSettledToast(pending);
  // only ids still on this page with a next step (after the update the list re-renders and finished rows drop out)
  const selected = new Set(orders.filter((order) => picked.has(order.id)).map((order) => order.id));
  const chosen = orders.filter((order) => selected.has(order.id));
  const sameLabel = chosen.length > 0 && chosen.every((order) => order.next.label === chosen[0]!.next.label) ? chosen[0]!.next.label : null;

  const toggle = (id: string) =>
    setPicked((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const setAll = (on: boolean) => setPicked(on ? new Set(orders.map((order) => order.id)) : new Set());

  function apply() {
    const changes = chosen.map((order) => ({ orderId: order.id, status: order.next.status }));
    startTransition(async () => {
      const undo = markOwnOrderChanges(chosen.map((order) => ({ orderNumber: order.orderNumber, status: order.next.status })));
      const result = await bulkUpdateOrderStatusAction({ changes });
      if (!result.success) {
        undo();
        toast.error(result.error.message);
        return;
      }
      setPicked(new Set());
      const { updated, requested } = result.data;
      if (updated < requested) toast.warning(`${requested - updated} of ${requested} orders had already changed and were left as they are.`);
      if (updated > 0) later(`${updated} ${updated === 1 ? "order" : "orders"} updated.`);
    });
  }

  return (
    <BulkContext.Provider value={{ orders, selected, toggle, setAll, pending }}>
      {selected.size > 0 ? (
        <div
          role="region"
          aria-label="Selected orders"
          className="sticky top-2 z-10 mb-3 flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-control)] border border-[var(--color-hairline)] bg-[var(--color-surface)] px-4 py-2.5 shadow-sm"
        >
          <p className="text-sm font-medium" aria-live="polite">
            {selected.size} {selected.size === 1 ? "order" : "orders"} selected
          </p>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="ghost" onClick={() => setAll(false)} disabled={pending}>
              <X className="size-4" aria-hidden /> Clear
            </Button>
            <Button size="sm" onClick={apply} disabled={pending}>
              {pending ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : null}
              {sameLabel ? `${sameLabel} (${selected.size})` : `Move to next step (${selected.size})`}
            </Button>
          </div>
        </div>
      ) : null}
      {children}
    </BulkContext.Provider>
  );
}

const box = "size-4 cursor-pointer accent-[var(--color-brand)] disabled:cursor-default";

export function OrderSelectBox({ orderId, orderNumber }: { orderId: string; orderNumber: string }) {
  const state = useContext(BulkContext);
  if (!state) return null;
  // the padded label makes a ~40px touch target around the 16px box without moving the layout
  return (
    <label className="-m-3 inline-flex p-3">
      <input
        type="checkbox"
        className={box}
        checked={state.selected.has(orderId)}
        onChange={() => state.toggle(orderId)}
        disabled={state.pending}
        aria-label={`Select order ${orderNumber}`}
      />
    </label>
  );
}

export function OrderSelectAll() {
  const state = useContext(BulkContext);
  if (!state || state.orders.length === 0) return null;
  const all = state.selected.size === state.orders.length;
  return (
    <input
      type="checkbox"
      className={box}
      checked={all}
      ref={(el) => {
        if (el) el.indeterminate = state.selected.size > 0 && !all;
      }}
      onChange={() => state.setAll(!all)}
      disabled={state.pending}
      aria-label="Select all orders on this page"
    />
  );
}
