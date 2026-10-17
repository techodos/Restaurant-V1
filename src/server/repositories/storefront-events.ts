import { config } from "@/server/config";
import { listenToChannel } from "@/server/db/listener";
import { getDb } from "@/server/db/registry";

/**
 * Cross-process storefront invalidation. Each `next start` process keeps its own snapshot (server/cache), so an admin
 * write handled by ONE process used to leave every other process serving the old menu, photos and settings until its
 * own scheduled refresh. Now the writing process also sends a NOTIFY on `storefront_changed`; every process listening
 * (DATABASE_URL_LISTEN, the same session-mode connection live order tracking uses) reloads. The payload is the
 * sender's process id so it can ignore its own message (it already reloaded).
 *
 * Without DATABASE_URL_LISTEN nothing is sent or heard and each process still converges on its scheduled refresh
 * (STOREFRONT_CACHE_REFRESH_INTERVAL_MS), exactly as before.
 */
const CHANNEL = "storefront_changed";

export function storefrontChangeFeedConfigured(): boolean {
  return config.orderEvents.listenUrl !== null;
}

/** Tells the other processes the storefront data changed. One statement; NOTIFY is delivered at commit. */
export async function broadcastStorefrontChanged(origin: string): Promise<void> {
  if (!storefrontChangeFeedConfigured()) return;
  await getDb().write({}, (tx) => tx.query("select pg_notify($1, $2)", [CHANNEL, origin]));
}

/**
 * Calls `onChanged` whenever ANOTHER process reports a change, and after the feed reconnects (a notification sent
 * while it was down was missed, so assume a change). Resolves once listening.
 */
export function listenStorefrontChanged(origin: string, onChanged: () => void): Promise<() => void> {
  const url = config.orderEvents.listenUrl;
  if (!url) return Promise.resolve(() => undefined);
  return listenToChannel(url, CHANNEL, {
    onNotify(payload) {
      if (payload !== origin) onChanged();
    },
    onReset: onChanged,
  });
}
