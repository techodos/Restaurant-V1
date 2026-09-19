"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { OrderStatusBadge } from "./order-status-badge";
import type { OrderStatus } from "@/lib/contract/enums";

/**
 * Order tracking stays honest without websockets: while the order is still in
 * progress the page re-fetches from the server on an interval, and the customer
 * can always refresh manually.
 */
export function OrderLiveStatus({ status, updatedAt }: { status: OrderStatus; updatedAt: string }) {
  const router = useRouter();
  const [manual, setManual] = useState(false);
  const live = status !== "completed" && status !== "cancelled";

  useEffect(() => {
    if (!live) return;
    const timer = setInterval(() => router.refresh(), 30_000);
    return () => clearInterval(timer);
  }, [live, router]);

  return (
    <div className="flex flex-wrap items-center gap-3">
      <OrderStatusBadge status={status} />
      <span className="text-xs text-[var(--color-muted-ink)]">
        Updated {new Date(updatedAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
      </span>
      <button
        type="button"
        className="inline-flex items-center gap-1.5 text-xs text-[var(--color-muted-ink)] hover:text-[var(--color-brand)]"
        onClick={() => {
          setManual(true);
          router.refresh();
          setTimeout(() => setManual(false), 1200);
        }}
        disabled={manual}
      >
        <RefreshCw className={manual ? "size-3.5 animate-spin" : "size-3.5"} aria-hidden />
        Refresh
      </button>
      {live ? <span className="text-xs text-[var(--color-muted-ink)]">Auto-updates every 30 seconds</span> : null}
    </div>
  );
}
