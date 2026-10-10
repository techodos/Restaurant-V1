"use client";

import { useState } from "react";

/** Last value set per id, with the server value it replaced. Module scope: survives client navigation. */
const remembered = new Map<string, { server: string; value: unknown }>();

/**
 * Local state for a switch whose server action does NOT revalidate the page (re-rendering the whole page
 * into each answer made clicks slow). Starts from, and follows, the server's value when it changes; a value
 * set here is also remembered under `id`, so a back/forward visit that replays the router's cached (older)
 * props still shows what was saved. Fresh server props always win over the remembered value.
 */
export function useSyncedState<T>(id: string, server: T): [T, (update: T | ((current: T) => T)) => void] {
  const serverKey = JSON.stringify(server);
  const [state, setState] = useState(() => {
    const entry = remembered.get(id);
    return { serverKey, value: entry?.server === serverKey ? (entry.value as T) : server };
  });
  if (state.serverKey !== serverKey) {
    // the server sent a different value (scope change, another admin, a later visit): it wins
    remembered.delete(id);
    setState({ serverKey, value: server });
  }

  function set(update: T | ((current: T) => T)) {
    setState((current) => {
      const value = typeof update === "function" ? (update as (current: T) => T)(current.value) : update;
      remembered.set(id, { server: current.serverKey, value });
      return { ...current, value };
    });
  }

  return [state.value, set];
}
