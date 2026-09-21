"use client";

import { useEffect, useRef, useState } from "react";
import { TERMINAL_ORDER_STATUSES } from "@/shared/contract/enums";
import { parseLiveOrderState, type LiveOrderState } from "@/shared/order-live";

/**
 * Follows ONE order through Server-Sent Events (GET .../order/<n>/events). Nothing is
 * polled: the server pushes the current state when the stream opens and every change
 * after that. The browser reconnects by itself after a drop and the server sends the
 * current state again on every (re)connect, so a change missed while offline is
 * caught up without any extra request from here.
 *
 * Every failure degrades to "not live": the page keeps working with its Refresh button.
 */

export type LiveConnection = "connecting" | "live" | "reconnecting" | "unavailable";

interface Options {
  /** absolute path of the events route, including `?t=` when the page was opened from an email */
  url: string;
  /** false closes (and never opens) the stream, e.g. once the order is finished */
  enabled: boolean;
  onState: (state: LiveOrderState) => void;
}

// short blips should not flash a warning
const DISCONNECT_GRACE_MS = 4_000;
// A stream that keeps failing without ever delivering anything is abandoned for this page view.
const MAX_CONSECUTIVE_FAILURES = 5;

export function useOrderEvents({ url, enabled, onState }: Options): LiveConnection {
  const [connection, setConnection] = useState<LiveConnection>("connecting");
  // latest callback without reopening the stream when the parent re-renders
  const handler = useRef(onState);
  handler.current = onState;

  useEffect(() => {
    if (!enabled) return;
    setConnection("connecting");

    let failures = 0;
    let downTimer: ReturnType<typeof setTimeout> | undefined;
    const source = new EventSource(url);

    source.addEventListener("open", () => {
      clearTimeout(downTimer);
      setConnection("live");
    });

    source.addEventListener("status", (event) => {
      failures = 0;
      clearTimeout(downTimer);
      setConnection("live");
      let state: LiveOrderState | null = null;
      try {
        state = parseLiveOrderState(JSON.parse((event as MessageEvent<string>).data));
      } catch {
        return;
      }
      if (!state) return;
      handler.current(state);
      // nothing can follow a final status; close before the browser tries to reconnect
      if (TERMINAL_ORDER_STATUSES.includes(state.status)) source.close();
    });

    source.addEventListener("error", () => {
      if (source.readyState === EventSource.CLOSED) {
        // the server refused (not allowed / not configured): browsers do not retry these, neither do we
        clearTimeout(downTimer);
        setConnection("unavailable");
        return;
      }
      failures += 1;
      if (failures >= MAX_CONSECUTIVE_FAILURES) {
        source.close();
        clearTimeout(downTimer);
        setConnection("unavailable");
        return;
      }
      // the browser is already reconnecting (server sends `retry: 5000`)
      clearTimeout(downTimer);
      downTimer = setTimeout(() => setConnection("reconnecting"), DISCONNECT_GRACE_MS);
    });

    return () => {
      clearTimeout(downTimer);
      source.close();
    };
  }, [url, enabled]);

  return connection;
}
