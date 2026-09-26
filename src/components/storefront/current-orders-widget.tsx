"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { MapPin, X } from "lucide-react";

const DISMISS_KEY = "rp_track_bubble_dismissed";

/**
 * Floating "current orders" indicator (spec: lower-right, like a chat/help bubble). Rendered by the
 * restaurant layout on every page, so it follows the visitor while they keep browsing after placing
 * an order — same idea for a guest (cart-token orders) and a signed-in customer (all their active
 * orders), the count is computed once in the layout by `getMyOrders`. Hidden entirely with zero active
 * orders. Always opens the Current Orders screen, even with exactly one order, so the click target and
 * behaviour never change shape as an order finishes and the count drops to zero.
 *
 * A pulsing ring (`animate-ping`) signals "this is live" the way a map's live-location dot does, and a
 * "Track your order" bubble (dismissible, remembered in sessionStorage so it doesn't nag on every page
 * nav) points new visitors at it — the button alone doesn't say what it's for on first sight.
 */
export function CurrentOrdersWidget({ restaurantSlug, count }: { restaurantSlug: string; count: number }) {
  const [dismissed, setDismissed] = useState(true); // starts hidden; effect below reveals it once we can check storage

  useEffect(() => {
    if (count <= 0) return;
    try {
      setDismissed(sessionStorage.getItem(DISMISS_KEY) === "1");
    } catch {
      setDismissed(false);
    }
  }, [count]);

  if (count <= 0) return null;

  function dismiss() {
    setDismissed(true);
    try {
      sessionStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* private browsing / storage blocked — the bubble just reappears next page, harmless */
    }
  }

  return (
    <div className="fixed bottom-5 right-5 z-40 hidden flex-col items-end gap-3 md:flex">
      {!dismissed ? (
        <div className="flex items-center gap-2 rounded-2xl bg-[var(--color-surface)] py-2.5 pl-4 pr-2 shadow-lg ring-1 ring-[var(--color-hairline)]">
          <Link
            href={`/r/${restaurantSlug}/current-orders`}
            className="text-sm font-medium text-[var(--color-ink)] hover:underline"
          >
            Track your order
          </Link>
          <button
            type="button"
            onClick={dismiss}
            aria-label="Dismiss"
            className="grid size-6 shrink-0 place-items-center rounded-full text-[var(--color-muted-ink)] hover:bg-[color-mix(in_srgb,var(--color-ink)_8%,transparent)]"
          >
            <X className="size-3.5" aria-hidden />
          </button>
        </div>
      ) : null}

      <Link
        href={`/r/${restaurantSlug}/current-orders`}
        aria-label={`${count} current order${count === 1 ? "" : "s"} — track live`}
        className="relative flex size-14 items-center justify-center rounded-full bg-[var(--color-brand)] text-[var(--color-brand-foreground)] shadow-lg transition-transform hover:scale-105"
      >
        <span className="absolute inset-0 animate-ping rounded-full bg-[var(--color-brand)] opacity-60" aria-hidden />
        <MapPin className="relative size-6" aria-hidden />
        <span className="absolute -right-1 -top-1 grid min-w-5 place-items-center rounded-full bg-[var(--color-ink)] px-1 text-xs font-semibold text-[var(--color-surface)]">
          {count}
        </span>
      </Link>
    </div>
  );
}
