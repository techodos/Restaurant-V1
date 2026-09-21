import { logger } from "@/server/logger";
import { snapshotStats } from "./storefront-snapshot";
import type { SnapshotLoader, StorefrontSnapshot } from "./types";

/**
 * Process-local holder of the one storefront snapshot: load, atomic swap,
 * single-flight refresh and the refresh timer. It knows nothing about SQL, the
 * database or Next.js — it is given a `load` function.
 *
 *   old snapshot ── serves reads ──────────────┐
 *   load() ─► complete, validated new snapshot ─┴─► reference swap ─► new snapshot
 *
 * A failed load never touches the current snapshot.
 */

export interface StorefrontCacheOptions {
  /** builds a complete, validated snapshot or throws */
  load: SnapshotLoader;
  /** delay between the end of one scheduled refresh and the start of the next */
  refreshIntervalMs: number;
  /** a single load may take at most this long; the first one failing fails startup */
  loadTimeoutMs: number;
}

type LoadReason = "startup" | "scheduled" | "manual" | "invalidated";

export class StorefrontCacheTimeoutError extends Error {
  constructor(readonly timeoutMs: number) {
    super(`storefront snapshot load exceeded ${timeoutMs}ms`);
    this.name = "StorefrontCacheTimeoutError";
  }
}

export class StorefrontCache {
  private snapshot: StorefrontSnapshot | undefined;
  private inflight: Promise<void> | undefined;
  private starting: Promise<void> | undefined;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private refreshQueued = false;
  private stopped = false;

  constructor(private readonly options: StorefrontCacheOptions) {}

  /** The current snapshot, or `undefined` before the first successful load. */
  get(): StorefrontSnapshot | undefined {
    return this.snapshot;
  }

  isReady(): boolean {
    return this.snapshot !== undefined;
  }

  /**
   * Loads the initial snapshot and starts the refresh timer. Rejects (and leaves
   * no timer behind) when the first load fails or times out; calling it again
   * after success returns the same completed promise, so it is safe to call from
   * a hook that may run more than once.
   */
  start(): Promise<void> {
    this.starting ??= this.initialize().catch((error) => {
      this.starting = undefined;
      throw error;
    });
    return this.starting;
  }

  /**
   * Reloads the snapshot. Concurrent callers share the load already running, so
   * there is never more than one full load at a time. Rejects when the load
   * fails; the previous snapshot stays active either way.
   *
   * A load that is already running may have read the database before a write the
   * caller just made — after writing, prefer `invalidate()`.
   */
  refresh(): Promise<void> {
    return this.load("manual");
  }

  /**
   * "The data changed": guarantees a load that starts after this call, without
   * dropping the current snapshot. Fire-and-forget; failures are logged and the
   * old snapshot keeps serving. Future admin writes call this after committing.
   */
  invalidate(): void {
    if (this.inflight) {
      this.refreshQueued = true;
      return;
    }
    this.load("invalidated").catch(() => undefined);
  }

  /** Stops the refresh timer (tests, graceful shutdown). The snapshot stays readable; `start()` may run again. */
  stop(): void {
    this.stopped = true;
    this.refreshQueued = false;
    this.starting = undefined;
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
  }

  private async initialize(): Promise<void> {
    this.stopped = false;
    logger.info("cache", "storefront cache initialization started", {
      refreshIntervalMs: this.options.refreshIntervalMs,
      loadTimeoutMs: this.options.loadTimeoutMs,
    });
    await this.load("startup");
    this.scheduleNextRefresh();
  }

  /** Single-flight: the running load, or a new one. */
  private load(reason: LoadReason): Promise<void> {
    if (this.inflight) return this.inflight;

    const running = this.runLoad(reason).finally(() => {
      this.inflight = undefined;
      if (this.refreshQueued && !this.stopped) {
        this.refreshQueued = false;
        this.load("invalidated").catch(() => undefined);
      }
    });
    this.inflight = running;
    return running;
  }

  private async runLoad(reason: LoadReason): Promise<void> {
    const startedAt = Date.now();
    const label = reason === "startup" ? "initialization" : "refresh";
    if (reason !== "startup") logger.info("cache", `storefront cache ${label} started`, { reason });

    try {
      const next = await withTimeout(this.options.load(), this.options.loadTimeoutMs);
      const previous = this.snapshot;
      this.snapshot = next; // the atomic swap: readers see the old or the new snapshot, never a mix
      logger.info("cache", `storefront cache ${label} completed`, {
        reason,
        durationMs: Date.now() - startedAt,
        loadedAt: next.loadedAt,
        replaced: previous !== undefined,
        ...snapshotStats(next),
      });
    } catch (error) {
      logger.error("cache", `storefront cache ${label} failed`, {
        reason,
        durationMs: Date.now() - startedAt,
        keepingPreviousSnapshot: this.snapshot !== undefined,
        error: describeError(error),
      });
      throw error;
    }
  }

  /** Chained timeouts, not `setInterval`: the next wait starts only after the previous load ended. */
  private scheduleNextRefresh(): void {
    if (this.stopped) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.load("scheduled")
        .catch(() => undefined)
        .finally(() => this.scheduleNextRefresh());
    }, this.options.refreshIntervalMs);
    this.timer.unref?.();
  }
}

function withTimeout<T>(work: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new StorefrontCacheTimeoutError(timeoutMs)), timeoutMs);
    // A load that outlives its timeout is abandoned: its late result is ignored here.
    work.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/** Message and code only: no stack, no connection details. */
function describeError(error: unknown): { name: string; message: string; code?: string } {
  if (error instanceof Error) {
    const code = (error as { code?: unknown }).code;
    return { name: error.name, message: error.message, ...(typeof code === "string" ? { code } : {}) };
  }
  return { name: "NonError", message: String(error) };
}
