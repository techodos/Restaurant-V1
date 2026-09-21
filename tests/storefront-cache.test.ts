import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StorefrontCache, StorefrontCacheTimeoutError } from "@/server/cache/storefront-cache";
import { buildStorefrontSnapshot } from "@/server/cache/storefront-snapshot";
import type { StorefrontSnapshot } from "@/server/cache/types";
import { storefrontData } from "./helpers/storefront-data";

/** Pure cache behaviour: no database, no Next.js. The loader is a stub. */

vi.mock("@/server/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

function snapshot(name: string): StorefrontSnapshot {
  const data = storefrontData();
  data.restaurant = { ...data.restaurant, name };
  return buildStorefrontSnapshot(data, { loadedAt: new Date(), loadDurationMs: 1 });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const nameOf = (cache: StorefrontCache) => cache.get()?.context.restaurant.name;

function makeCache(load: () => Promise<StorefrontSnapshot>, overrides: { refreshIntervalMs?: number; loadTimeoutMs?: number } = {}) {
  return new StorefrontCache({ load, refreshIntervalMs: 60_000, loadTimeoutMs: 5_000, ...overrides });
}

const caches: StorefrontCache[] = [];
function track(cache: StorefrontCache) {
  caches.push(cache);
  return cache;
}

afterEach(() => {
  for (const cache of caches.splice(0)) cache.stop();
  vi.useRealTimers();
});

describe("StorefrontCache — initial load", () => {
  it("starts empty, then serves the loaded snapshot and reports ready", async () => {
    const load = vi.fn(async () => snapshot("v1"));
    const cache = track(makeCache(load));

    expect(cache.isReady()).toBe(false);
    expect(cache.get()).toBeUndefined();

    await cache.start();

    expect(cache.isReady()).toBe(true);
    expect(nameOf(cache)).toBe("v1");
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("start() is idempotent: a second call does not load again", async () => {
    const load = vi.fn(async () => snapshot("v1"));
    const cache = track(makeCache(load));
    await Promise.all([cache.start(), cache.start()]);
    await cache.start();
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("rejects startup when the first load fails and stays not-ready with no timer running", async () => {
    vi.useFakeTimers();
    const load = vi.fn(async () => {
      throw new Error("db down");
    });
    const cache = track(makeCache(load));

    await expect(cache.start()).rejects.toThrow("db down");
    expect(cache.isReady()).toBe(false);

    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(load).toHaveBeenCalledTimes(1); // nothing was scheduled
  });

  it("rejects startup when the first load exceeds the timeout", async () => {
    vi.useFakeTimers();
    const cache = track(makeCache(() => new Promise<StorefrontSnapshot>(() => undefined), { loadTimeoutMs: 2_000 }));

    const started = cache.start();
    const assertion = expect(started).rejects.toBeInstanceOf(StorefrontCacheTimeoutError);
    await vi.advanceTimersByTimeAsync(2_000);
    await assertion;
    expect(cache.isReady()).toBe(false);
  });

  it("ignores the result of a load that finished after its timeout", async () => {
    vi.useFakeTimers();
    const late = deferred<StorefrontSnapshot>();
    const cache = track(makeCache(() => late.promise, { loadTimeoutMs: 1_000 }));

    const started = cache.start();
    const assertion = expect(started).rejects.toBeInstanceOf(StorefrontCacheTimeoutError);
    await vi.advanceTimersByTimeAsync(1_000);
    await assertion;

    late.resolve(snapshot("too-late"));
    await vi.advanceTimersByTimeAsync(0);
    expect(cache.get()).toBeUndefined();
  });
});

describe("StorefrontCache — refresh", () => {
  it("replaces the old snapshot with the new one", async () => {
    let version = 0;
    const cache = track(makeCache(async () => snapshot(`v${++version}`)));
    await cache.start();
    const first = cache.get();

    await cache.refresh();

    expect(nameOf(cache)).toBe("v2");
    expect(cache.get()).not.toBe(first);
  });

  it("keeps serving the old snapshot until the new one is complete (atomic swap)", async () => {
    const second = deferred<StorefrontSnapshot>();
    const loads = [Promise.resolve(snapshot("v1")), second.promise];
    const cache = track(makeCache(() => loads.shift()!));
    await cache.start();
    const old = cache.get();

    const refreshing = cache.refresh();
    await Promise.resolve();

    expect(cache.isReady()).toBe(true);
    expect(cache.get()).toBe(old); // never cleared, never half-built
    expect(nameOf(cache)).toBe("v1");

    second.resolve(snapshot("v2"));
    await refreshing;
    expect(nameOf(cache)).toBe("v2");
  });

  it("keeps the old snapshot when a refresh fails, and the next refresh can still succeed", async () => {
    const outcomes: Array<() => Promise<StorefrontSnapshot>> = [
      async () => snapshot("v1"),
      async () => {
        throw new Error("boom");
      },
      async () => snapshot("v3"),
    ];
    const cache = track(makeCache(() => outcomes.shift()!()));
    await cache.start();
    const old = cache.get();

    await expect(cache.refresh()).rejects.toThrow("boom");
    expect(cache.get()).toBe(old);
    expect(cache.isReady()).toBe(true);

    await cache.refresh();
    expect(nameOf(cache)).toBe("v3");
  });

  it("keeps the old snapshot when a refresh times out", async () => {
    vi.useFakeTimers();
    const outcomes: Array<() => Promise<StorefrontSnapshot>> = [
      async () => snapshot("v1"),
      () => new Promise<StorefrontSnapshot>(() => undefined),
    ];
    const cache = track(makeCache(() => outcomes.shift()!(), { loadTimeoutMs: 1_000 }));
    await cache.start();

    const refreshing = cache.refresh();
    const assertion = expect(refreshing).rejects.toBeInstanceOf(StorefrontCacheTimeoutError);
    await vi.advanceTimersByTimeAsync(1_000);
    await assertion;
    expect(nameOf(cache)).toBe("v1");
  });

  it("never runs two loads at once: concurrent refresh() calls share one load", async () => {
    const gate = deferred<StorefrontSnapshot>();
    let running = 0;
    let peak = 0;
    const load = vi.fn(async () => {
      running += 1;
      peak = Math.max(peak, running);
      try {
        return await gate.promise;
      } finally {
        running -= 1;
      }
    });
    const cache = track(makeCache(load));

    const calls = [cache.refresh(), cache.refresh(), cache.refresh()];
    gate.resolve(snapshot("shared"));
    await Promise.all(calls);

    expect(load).toHaveBeenCalledTimes(1);
    expect(peak).toBe(1);
    expect(nameOf(cache)).toBe("shared");
  });

  it("a refresh() during the initial load shares it instead of starting a second load", async () => {
    const gate = deferred<StorefrontSnapshot>();
    const load = vi.fn(() => gate.promise);
    const cache = track(makeCache(load));

    const started = cache.start();
    const refreshed = cache.refresh();
    gate.resolve(snapshot("v1"));
    await Promise.all([started, refreshed]);

    expect(load).toHaveBeenCalledTimes(1);
  });

  it("invalidate() during a running load queues exactly one follow-up load that starts afterwards", async () => {
    const first = deferred<StorefrontSnapshot>();
    const outcomes = [first.promise, Promise.resolve(snapshot("after-write"))];
    let running = 0;
    let peak = 0;
    const load = vi.fn(() => {
      running += 1;
      peak = Math.max(peak, running);
      return outcomes.shift()!.finally(() => {
        running -= 1;
      });
    });
    const cache = track(makeCache(load));

    const initial = cache.refresh();
    cache.invalidate();
    cache.invalidate();
    cache.invalidate();
    first.resolve(snapshot("before-write"));
    await initial;
    await vi.waitFor(() => expect(nameOf(cache)).toBe("after-write"));

    expect(load).toHaveBeenCalledTimes(2);
    expect(peak).toBe(1);
  });

  it("invalidate() on an idle cache refreshes in the background and never rejects", async () => {
    const load = vi.fn(async () => {
      throw new Error("still down");
    });
    const cache = track(makeCache(load));
    expect(() => cache.invalidate()).not.toThrow();
    await vi.waitFor(() => expect(load).toHaveBeenCalledTimes(1));
  });
});

describe("StorefrontCache — scheduled refresh", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it("refreshes every interval after startup", async () => {
    let version = 0;
    const load = vi.fn(async () => snapshot(`v${++version}`));
    const cache = track(makeCache(load, { refreshIntervalMs: 10_000 }));
    await cache.start();
    expect(load).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(10_000);
    expect(load).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(load).toHaveBeenCalledTimes(3);
    expect(nameOf(cache)).toBe("v3");
  });

  it("does not overlap: a slow refresh delays the next one instead of doubling up", async () => {
    const slow = deferred<StorefrontSnapshot>();
    let running = 0;
    let peak = 0;
    let calls = 0;
    const load = vi.fn(async () => {
      calls += 1;
      running += 1;
      peak = Math.max(peak, running);
      try {
        return calls === 2 ? await slow.promise : snapshot(`v${calls}`);
      } finally {
        running -= 1;
      }
    });
    const cache = track(makeCache(load, { refreshIntervalMs: 1_000, loadTimeoutMs: 600_000 }));
    await cache.start();

    await vi.advanceTimersByTimeAsync(1_000); // second load starts and hangs
    await vi.advanceTimersByTimeAsync(30_000); // many intervals elapse while it hangs
    expect(load).toHaveBeenCalledTimes(2);

    slow.resolve(snapshot("v2"));
    await vi.advanceTimersByTimeAsync(1_000);
    expect(load).toHaveBeenCalledTimes(3);
    expect(peak).toBe(1);
  });

  it("keeps the last good snapshot and keeps trying when scheduled refreshes fail", async () => {
    const outcomes: Array<() => Promise<StorefrontSnapshot>> = [
      async () => snapshot("v1"),
      async () => {
        throw new Error("blip");
      },
      async () => snapshot("v3"),
    ];
    const cache = track(makeCache(() => outcomes.shift()!(), { refreshIntervalMs: 5_000 }));
    await cache.start();

    await vi.advanceTimersByTimeAsync(5_000);
    expect(nameOf(cache)).toBe("v1");
    await vi.advanceTimersByTimeAsync(5_000);
    expect(nameOf(cache)).toBe("v3");
  });

  it("stop() ends the schedule", async () => {
    const load = vi.fn(async () => snapshot("v1"));
    const cache = track(makeCache(load, { refreshIntervalMs: 1_000 }));
    await cache.start();
    cache.stop();

    await vi.advanceTimersByTimeAsync(10_000);
    expect(load).toHaveBeenCalledTimes(1);
    expect(nameOf(cache)).toBe("v1");
  });
});
