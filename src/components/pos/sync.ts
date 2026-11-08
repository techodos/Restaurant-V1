"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PosOp, PosOpResult } from "@/shared/pos";
import { posDb, type FailedOp } from "./offline-store";

/**
 * The till's outbox (SKILL.md §43): every order/payment is written to IndexedDB FIRST, then sent. Online it goes
 * at once; offline it waits and is replayed in order when the connection returns (the `online` event, a 15 s
 * timer, and every new op). Each op carries its own id, so a retry after a lost response is applied once.
 *
 *   - ok / replayed       -> removed from the queue
 *   - refused for good    -> moved to `failed` (shown, never retried)
 *   - network / 5xx       -> stays queued, retried later; nothing after it is sent first (order matters)
 *   - 401 (signed out)    -> stays queued; the till asks for a sign-in and sends after it
 */

export interface SyncState {
  online: boolean;
  pending: number;
  syncing: boolean;
  signedOut: boolean;
  failed: FailedOp[];
  lastSyncedAt: string | null;
  lastError: string | null;
}

export interface OpOutcome {
  op: PosOp;
  result: PosOpResult;
}

type ResultListener = (outcomes: OpOutcome[]) => void | Promise<void>;

const BATCH = 25;

async function postOps(ops: PosOp[]): Promise<{ status: number; results?: PosOpResult[]; stoppedAt?: string | null; error?: string }> {
  try {
    const response = await fetch("/pos/api/sync", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ops }),
      cache: "no-store",
    });
    const body = (await response.json().catch(() => null)) as
      | { success: true; data: { results: PosOpResult[]; stoppedAt: string | null } }
      | { success: false; error: { message: string } }
      | null;
    if (body?.success) return { status: response.status, results: body.data.results, stoppedAt: body.data.stoppedAt };
    return { status: response.status, error: body && !body.success ? body.error.message : `HTTP ${response.status}` };
  } catch {
    return { status: 0, error: "No connection" };
  }
}

export function usePosSync(onResults: ResultListener) {
  const [state, setState] = useState<SyncState>({
    online: true,
    pending: 0,
    syncing: false,
    signedOut: false,
    failed: [],
    lastSyncedAt: null,
    lastError: null,
  });
  const flushing = useRef<Promise<void> | null>(null);
  const listener = useRef(onResults);
  listener.current = onResults;

  const refreshCounts = useCallback(async () => {
    const db = posDb();
    const [pending, failed] = await Promise.all([db.queue.count(), db.failed.orderBy("at").reverse().toArray()]);
    setState((current) => ({ ...current, pending, failed }));
  }, []);

  const flushOnce = useCallback(async () => {
    const db = posDb();
    setState((current) => ({ ...current, syncing: true }));
    try {
      for (;;) {
        const queued = await db.queue.orderBy("seq").limit(BATCH).toArray();
        if (queued.length === 0) {
          setState((current) => ({ ...current, lastSyncedAt: new Date().toISOString(), lastError: null }));
          break;
        }
        let answer = await postOps(queued.map((entry) => entry.op));
        if (answer.status === 400 && queued.length > 1) {
          // the batch as a whole was refused (one malformed op): find it by sending the first one alone
          queued.splice(1);
          answer = await postOps([queued[0]!.op]);
        }
        if (answer.status === 400) {
          // this op can never be accepted as sent: park it so the ones behind it are not blocked forever
          const entry = queued[0]!;
          await db.transaction("rw", db.queue, db.failed, async () => {
            await db.queue.delete(entry.seq!);
            await db.failed.put({ id: entry.id, op: entry.op, error: { code: "VALIDATION_ERROR", message: answer.error ?? "Refused" }, at: new Date().toISOString() });
          });
          continue;
        }
        if (!answer.results) {
          const signedOut = answer.status === 401;
          setState((current) => ({ ...current, online: answer.status !== 0 && current.online, signedOut, lastError: answer.error ?? null }));
          await db.queue.where("seq").equals(queued[0]!.seq!).modify((entry) => {
            entry.attempts += 1;
            entry.lastError = answer.error ?? null;
          });
          break;
        }
        setState((current) => ({ ...current, online: true, signedOut: false }));
        const done = new Set<string>();
        await db.transaction("rw", db.queue, db.failed, async () => {
          for (const result of answer.results!) {
            const entry = queued.find((candidate) => candidate.op.id === result.id);
            if (!entry) continue;
            done.add(result.id);
            await db.queue.delete(entry.seq!);
            if (!result.ok && result.error) await db.failed.put({ id: entry.id, op: entry.op, error: result.error, at: new Date().toISOString() });
          }
        });
        await listener.current(answer.results.flatMap((result) => queued.filter((entry) => entry.op.id === result.id).map((entry) => ({ op: entry.op, result }))));
        // the server stopped on a transient failure: what is left stays queued, in order
        if (answer.stoppedAt || done.size < queued.length) break;
      }
    } finally {
      setState((current) => ({ ...current, syncing: false }));
      await refreshCounts();
    }
  }, [refreshCounts]);

  /** Sends what is queued; concurrent calls share one run. Resolves when that run ends. */
  const flush = useCallback((): Promise<void> => {
    if (!flushing.current) {
      flushing.current = flushOnce().finally(() => {
        flushing.current = null;
      });
    }
    return flushing.current;
  }, [flushOnce]);

  /** Queues an op (durable before anything is sent), then tries to send it. */
  const enqueue = useCallback(
    async (op: PosOp): Promise<void> => {
      await posDb().queue.add({ id: op.id, op, createdAt: new Date().toISOString(), attempts: 0, lastError: null });
      await refreshCounts();
      void flush();
    },
    [flush, refreshCounts],
  );

  const dismissFailed = useCallback(
    async (id: string) => {
      await posDb().failed.delete(id);
      await refreshCounts();
    },
    [refreshCounts],
  );

  useEffect(() => {
    const goOnline = () => {
      setState((current) => ({ ...current, online: true }));
      void flush();
    };
    const goOffline = () => setState((current) => ({ ...current, online: false }));
    setState((current) => ({ ...current, online: navigator.onLine }));
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    const timer = window.setInterval(() => void flush(), 15_000);
    void refreshCounts().then(() => flush());
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
      window.clearInterval(timer);
    };
  }, [flush, refreshCounts]);

  return { state, enqueue, flush, dismissFailed, refresh: refreshCounts };
}
