"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";

/**
 * A success toast that appears when the screen has actually changed. An admin action that revalidates (order /
 * payment / reservation status, review moderation) resolves as soon as the write is done, but its transition stays
 * pending until Next has applied the re-rendered page from the same response — seconds later on the hosted
 * database. Toasting on the result said "Order confirmed" while the button still spun and the row still read
 * Pending. Queue the message with `later(...)`; it shows when `pending` turns false. If the control is already gone
 * (the row left the current filter, e.g. "Pending", in that same update) it shows at once.
 * Errors still toast at once.
 */
export function useSettledToast(pending: boolean): (message: string) => void {
  const queued = useRef<string | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (queued.current) toast.success(queued.current);
      queued.current = null;
    };
  }, []);
  useEffect(() => {
    if (!pending && queued.current) {
      toast.success(queued.current);
      queued.current = null;
    }
  }, [pending]);
  return (message) => {
    if (!mounted.current) toast.success(message);
    else queued.current = message;
  };
}
