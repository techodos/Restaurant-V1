/**
 * Small in-process, time-limited caches for hot read-mostly lookups that are NOT part of the storefront
 * snapshot (the admin's staff membership and restaurant/theme). Every admin request used to re-read
 * them from the database (~10 round trips, ~3 s on the hosted pooler) before doing any real work.
 *
 * - Per process: another instance sees a change only when its entry expires (`ttlMs`), so keep TTLs
 *   short and call `clear()` from the service that writes the data (same process sees it at once).
 * - Single-flight: concurrent callers for the same key share one load; a failed load is not cached.
 * - Lives on globalThis for the same reason as the storefront cache: Next bundles route segments,
 *   server actions and the startup hook separately, and dev reloads re-evaluate modules — a
 *   module-level Map would give each copy its own cache and `clear()` would miss the others.
 * - Values are shared between requests: never mutate what `get` returns.
 * No SQL here (architecture test): callers pass the loader.
 */
interface Entry<V> {
  value: Promise<V>;
  expiresAt: number;
}

export interface TtlCache<V> {
  /** The cached value for `key`, or `load()`'s result (cached for the TTL). */
  get(key: string, load: () => Promise<V>): Promise<V>;
  /** Replaces `key` with a value just read fresh (so the next cached read starts from it). */
  set(key: string, value: V): void;
  /** Drops every entry — call after a write to the underlying data. */
  clear(): void;
}

const REGISTRY = Symbol.for("restaurant-platform.ttl-caches");
type Registry = Map<string, Map<string, Entry<unknown>>>;

function store<V>(name: string): Map<string, Entry<V>> {
  const holder = globalThis as unknown as { [REGISTRY]?: Registry };
  const registry = (holder[REGISTRY] ??= new Map());
  let entries = registry.get(name);
  if (!entries) {
    entries = new Map();
    registry.set(name, entries);
  }
  return entries as Map<string, Entry<V>>;
}

export function ttlCache<V>(name: string, ttlMs: number, maxEntries = 500): TtlCache<V> {
  const remember = (key: string, value: Promise<V>) => {
    const entries = store<V>(name);
    if (entries.size >= maxEntries) entries.delete(entries.keys().next().value as string); // oldest first
    entries.set(key, { value, expiresAt: Date.now() + ttlMs });
  };
  return {
    get(key, load) {
      const entries = store<V>(name);
      const hit = entries.get(key);
      if (hit && hit.expiresAt > Date.now()) return hit.value;
      const value = load();
      remember(key, value);
      // a failed load must not be served from the cache for the rest of the TTL
      value.catch(() => {
        if (store<V>(name).get(key)?.value === value) store<V>(name).delete(key);
      });
      return value;
    },
    set(key, value) {
      remember(key, Promise.resolve(value));
    },
    clear() {
      store<V>(name).clear();
    },
  };
}
