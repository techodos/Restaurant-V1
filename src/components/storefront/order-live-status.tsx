"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { cn } from "@/shared/utils";
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
          <span className="size-1.5 rounded-full bg-[var(--color-success)]" aria-hidden />
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
      className="mt-6 rounded-[var(--radius-card)] bg-[var(--steel-2)] px-4 py-3 text-sm"
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

const STATUS_LINES: Partial<Record<OrderStatusEvent["toStatus"], string>> = {
  pending: "The restaurant has your order and will confirm it shortly.",
  confirmed: "Confirmed. It is in the kitchen's queue.",
  preparing: "The kitchen is cooking your order now.",
  ready: "Ready and waiting on the pass.",
  out_for_delivery: "On its way to you.",
  completed: "Delivered. Enjoy your meal.",
  cancelled: "This order was cancelled.",
};

const SHORT_LABELS: Partial<Record<OrderStatusEvent["toStatus"], string>> = {
  pending: "Received",
  out_for_delivery: "On the way",
};

/**
 * The ticket on the pass: the current status as a headline that changes place when the live state
 * moves, and the stations rail below it, filling with a weighted spring (small overshoot) instead of
 * jumping. Same live state as the timeline; nothing here fetches or decides a status.
 */
export function OrderPass() {
  const { state, history, orderType } = useLiveOrder();
  const reduce = useReducedMotion();
  const steps = useMemo(() => buildOrderTimeline(withLiveStatus(history, state), { orderType }), [history, state, orderType]);
  const cancelled = state.status === "cancelled";
  const currentIndex = Math.max(
    0,
    steps.findIndex((step) => step.state === "current" || step.state === "cancelled"),
  );
  const doneIndex = steps.every((step) => step.state === "done") ? steps.length - 1 : currentIndex;
  const progress = steps.length > 1 ? doneIndex / (steps.length - 1) : 1;
  const current = steps[doneIndex];

  return (
    <section aria-label="Order status" className="py-6 md:py-8">
      <div aria-live="polite" className="relative min-h-[4.5rem] overflow-hidden md:min-h-[5.5rem]">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.div
            key={state.status}
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 24, filter: "blur(6px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: -24, filter: "blur(6px)" }}
            transition={{ duration: 0.45, ease: [0.23, 1, 0.32, 1] }}
          >
            <p
              className={cn(
                "display-hero",
                cancelled && "text-[var(--color-danger)]",
              )}
            >
              {current ? (SHORT_LABELS[current.status] ?? current.label) : state.status}
            </p>
            <p className="mt-3 text-[15px] text-[var(--color-muted-ink)]">{STATUS_LINES[state.status] ?? ""}</p>
          </motion.div>
        </AnimatePresence>
      </div>

      <ol className="relative mt-6 grid" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}>
        {/* the track and its fill run between the first and last station centres */}
        <span
          aria-hidden
          className="absolute top-[7px] h-[2px] rounded-full bg-[var(--rule-strong)]"
          style={{ left: `${50 / steps.length}%`, right: `${50 / steps.length}%` }}
        >
          <motion.span
            className={cn("absolute inset-0 origin-left rounded-full", cancelled ? "bg-[var(--color-danger)]" : "bg-[var(--color-brand-accent)]")}
            initial={false}
            animate={{ scaleX: progress }}
            transition={reduce ? { duration: 0 } : { type: "spring", duration: 0.9, bounce: 0.22 }}
          />
        </span>
        {steps.map((step, index) => {
          const reached = index <= doneIndex;
          const isCurrent = index === doneIndex && !steps.every((entry) => entry.state === "done");
          return (
            <li key={step.status} className="relative flex flex-col items-center text-center">
              <span
                aria-hidden
                className={cn(
                  "relative z-10 grid size-4 place-items-center rounded-full border-2 transition-colors duration-300",
                  reached
                    ? cancelled && index === doneIndex
                      ? "border-[var(--color-danger)] bg-[var(--color-danger)]"
                      : "border-[var(--color-brand-accent)] bg-[var(--color-brand-accent)]"
                    : "border-[var(--rule-strong)] bg-[var(--color-canvas)]",
                )}
              >
                {isCurrent && !cancelled ? (
                  <span className="absolute inset-[-5px] animate-ping rounded-full border-2 border-[var(--color-brand-accent)] opacity-60" />
                ) : null}
              </span>
              <span
                className={cn(
                  "mt-3 px-1 text-[11px] leading-tight sm:text-[13px]",
                  isCurrent ? "font-semibold text-[var(--color-ink)]" : reached ? "text-[var(--color-ink)]" : "text-[var(--color-muted-ink)]",
                  !isCurrent && "max-sm:hidden",
                )}
              >
                {SHORT_LABELS[step.status] ?? step.label}
              </span>
              {step.at ? (
                <span className="tabular mt-0.5 hidden text-[11px] text-[var(--color-muted-ink)] sm:block">
                  {new Date(step.at).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
                </span>
              ) : null}
              <span className="sr-only">{step.state === "done" ? "done" : step.state === "current" ? "in progress" : step.state}</span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
