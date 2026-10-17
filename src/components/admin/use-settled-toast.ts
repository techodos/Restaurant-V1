"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";

/**
 * Collapses successes that land in the same `group` within BATCH_WINDOW_MS into one toast — e.g. three quick
 * "Payment marked paid" row clicks on the Payments list becoming "3 payments marked paid." instead of three popups.
 * Mixed outcomes in the same group ("2 paid, 1 refunded") fall back to "N payments updated." Reuses sonner's own
 * queue: re-using the same toast `id` updates that toast in place and resets its dismiss timer, so no extra toast
 * stack or custom scheduler is needed.
 */
const BATCH_WINDOW_MS = 600;
const batches = new Map<string, { timer: ReturnType<typeof setTimeout>; label: string; mixed: boolean; count: number; plural: string }>();

/** Pure so it can be unit-tested without sonner or a DOM: what should the batch's toast say right now? */
export function composeBatchMessage(
  soloMessage: string,
  entry: { count: number; mixed: boolean; label: string; plural: string },
): string {
  if (entry.count === 1) return soloMessage;
  return entry.mixed ? `${entry.count} ${entry.plural} updated.` : `${entry.count} ${entry.plural} ${entry.label}.`;
}

function showBatched(message: string, batch: { group: string; label: string; plural: string }) {
  let entry = batches.get(batch.group);
  if (entry) clearTimeout(entry.timer);
  else entry = { timer: undefined as unknown as ReturnType<typeof setTimeout>, label: batch.label, mixed: false, count: 0, plural: batch.plural };
  entry.count += 1;
  if (entry.count > 1 && entry.label !== batch.label) entry.mixed = true;
  entry.timer = setTimeout(() => batches.delete(batch.group), BATCH_WINDOW_MS);
  batches.set(batch.group, entry);
  toast.success(composeBatchMessage(message, entry), { id: batch.group });
}

/**
 * A success toast that appears when the screen has actually changed. An admin action that revalidates (order /
 * payment / reservation status, review moderation) resolves as soon as the write is done, but its transition stays
 * pending until Next has applied the re-rendered page from the same response — seconds later on the hosted
 * database. Toasting on the result said "Order confirmed" while the button still spun and the row still read
 * Pending. Queue the message with `later(...)`; it shows when `pending` turns false. If the control is already gone
 * (the row left the current filter, e.g. "Pending", in that same update) it shows at once.
 * Errors still toast at once.
 *
 * Pass `batch` to consolidate rapid repeats of the same kind of row action (see showBatched above); omit it for a
 * one-off action where every message is already its own standalone toast.
 */
export function useSettledToast(pending: boolean): (message: string, batch?: { group: string; label: string; plural: string }) => void {
  const queued = useRef<{ message: string; batch?: { group: string; label: string; plural: string } } | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (queued.current) {
        const q = queued.current;
        if (q.batch) showBatched(q.message, q.batch);
        else toast.success(q.message);
      }
      queued.current = null;
    };
  }, []);
  useEffect(() => {
    if (!pending && queued.current) {
      const q = queued.current;
      queued.current = null;
      if (q.batch) showBatched(q.message, q.batch);
      else toast.success(q.message);
    }
  }, [pending]);
  return (message, batch) => {
    if (!mounted.current) {
      if (batch) showBatched(message, batch);
      else toast.success(message);
    } else queued.current = { message, batch };
  };
}
