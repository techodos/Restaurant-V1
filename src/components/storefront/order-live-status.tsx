"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { OrderStatusBadge } from "./order-status-badge";
import { OrderTimeline } from "./order-timeline";
import { useOrderEvents, type LiveConnection } from "./use-order-events";
import { TERMINAL_ORDER_STATUSES } from "@/shared/contract/enums";
import type { OrderStatusEvent } from "@/shared/contract/models";
import { nextLiveState, withLiveStatus, type LiveOrderState } from "@/shared/order-live";
import { buildOrderTimeline } from "@/shared/order-timeline";

/**
 * Live order tracking. The server renders the page from the database once; this
 * provider then keeps the status current through Server-Sent Events (see
 * use-order-events.ts) — no interval, no polling. A change is shown at once from the
 * event itself; the page is then re-rendered a single time so the parts that come
 * from other tables (ETA, history timestamps, review link) catch up.
 * Push notifications (FCM) and email (Resend) are separate and unrelated.
 */

interface LiveOrderContextValue {
  state: LiveOrderState;
  history: OrderStatusEvent[];
  orderType: "delivery" | "pickup" | "dine_in";
  connection: LiveConnection;
  refresh: () => void;
}

const LiveOrderContext = createContext<LiveOrderContextValue | null>(null);

function useLiveOrder(): LiveOrderContextValue {
  const value = useContext(LiveOrderContext);
  if (!value) throw new Error("Live order components must be rendered inside <OrderLiveProvider>.");
  return value;
}

// several fields can change in one transaction; render once for the burst
const REFRESH_DEBOUNCE_MS = 300;

export function OrderLiveProvider({
  restaurantSlug,
  orderNumber,
  accessToken,
  initial,
  history,
  orderType,
  children,
}: {
  restaurantSlug: string;
  orderNumber: string;
  /** signed link token, when the page was opened from an email */
  accessToken?: string;
  initial: LiveOrderState;
  history: OrderStatusEvent[];
  orderType: "delivery" | "pickup" | "dine_in";
  children: ReactNode;
}) {
  const router = useRouter();
  const [state, setState] = useState(initial);
  const stateRef = useRef(state);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const commit = useCallback((next: LiveOrderState) => {
    stateRef.current = next;
    setState(next);
  }, []);

  const refresh = useCallback(() => router.refresh(), [router]);
  const eventsUrl = `/r/${encodeURIComponent(restaurantSlug)}/order/${encodeURIComponent(orderNumber)}/events${
    accessToken ? `?t=${encodeURIComponent(accessToken)}` : ""
  }`;

  // A server re-render brings fresh props: adopt them unless the live state is already newer.
  useEffect(() => {
    const merged = nextLiveState(stateRef.current, initial);
    if (merged.changed) commit(merged.state);
  }, [initial.status, initial.paymentStatus, initial.estimatedReadyAt, initial.updatedAt]); // eslint-disable-line react-hooks/exhaustive-deps

  const onState = useCallback(
    (incoming: LiveOrderState) => {
      const merged = nextLiveState(stateRef.current, incoming);
      if (!merged.changed) return; // duplicate, stale, or nothing this page shows
      commit(merged.state);
      clearTimeout(refreshTimer.current);
      refreshTimer.current = setTimeout(() => router.refresh(), REFRESH_DEBOUNCE_MS);
    },
    [commit, router],
  );

  useEffect(() => () => clearTimeout(refreshTimer.current), []);

  const finished = TERMINAL_ORDER_STATUSES.includes(state.status);
  const connection = useOrderEvents({ url: eventsUrl, enabled: !finished, onState });

  const value = useMemo(
    () => ({ state, history, orderType, connection, refresh }),
    [state, history, orderType, connection, refresh],
  );
  return <LiveOrderContext.Provider value={value}>{children}</LiveOrderContext.Provider>;
}

/** Status badge, last-change time, connection hint and a manual refresh (always available). */
export function OrderLiveStatus() {
  const { state, connection, refresh } = useLiveOrder();
  const [manual, setManual] = useState(false);
  const finished = TERMINAL_ORDER_STATUSES.includes(state.status);

  return (
    <div className="flex flex-wrap items-center gap-3">
      <OrderStatusBadge status={state.status} />
      <span className="text-xs text-[var(--color-muted-ink)]">
        Updated {new Date(state.updatedAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
      </span>
      <button
        type="button"
        className="inline-flex items-center gap-1.5 text-xs text-[var(--color-muted-ink)] hover:text-[var(--color-brand)]"
        onClick={() => {
          setManual(true);
          refresh();
          setTimeout(() => setManual(false), 1200);
        }}
        disabled={manual}
      >
        <RefreshCw className={manual ? "size-3.5 animate-spin" : "size-3.5"} aria-hidden />
        Refresh
      </button>
      {!finished && connection === "live" ? (
        <span className="inline-flex items-center gap-1.5 text-xs text-[var(--color-muted-ink)]" role="status">
          <span className="size-1.5 rounded-full bg-emerald-500" aria-hidden />
          Live
        </span>
      ) : null}
      {!finished && connection === "reconnecting" ? (
        <span className="text-xs text-[var(--color-muted-ink)]" role="status">
          Reconnecting…
        </span>
      ) : null}
    </div>
  );
}

/** "Received, confirmation coming" note; disappears by itself once the restaurant confirms (or cancels) the order. */
export function OrderReceivedNotice() {
  const { state } = useLiveOrder();
  if (state.status !== "pending") return null;
  return (
    <p
      className="mt-6 rounded-[var(--radius-brand)] border border-[var(--color-hairline)] bg-[var(--color-surface)] px-4 py-3 text-sm"
      role="status"
    >
      Your order has been received. You will get a confirmation message soon.
    </p>
  );
}

/** The progress timeline, moved by the live status without waiting for a page reload. */
export function LiveOrderTimeline() {
  const { state, history, orderType } = useLiveOrder();
  const steps = useMemo(() => buildOrderTimeline(withLiveStatus(history, state), { orderType }), [history, state, orderType]);
  return <OrderTimeline steps={steps} />;
}
