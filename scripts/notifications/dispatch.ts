/**
 * Delivers queued order notifications (emails + push) from the command line.
 *
 *   npm run notifications:dispatch             one pass, then exit
 *   npm run notifications:dispatch -- --loop   every NOTIFICATIONS_DISPATCH_INTERVAL_MS until Ctrl+C
 *                                               (local development; default/current: 5 s)
 *
 * In production a scheduler calls POST /api/internal/notifications/dispatch instead.
 */
import { loadEnv } from "../db/env";
import { closeDatabases } from "../../src/server/db/registry";
import { config } from "../../src/server/config";
import { dispatchDueNotifications } from "../../src/server/services/notifications";

loadEnv();

const loop = process.argv.includes("--loop");
const INTERVAL_MS = config.notifications.dispatchIntervalMs;

async function pass(): Promise<void> {
  const summary = await dispatchDueNotifications({ limit: 50 });
  if (summary.claimed > 0 || !loop) {
    console.log(
      `[dispatch] claimed ${summary.claimed} · delivered ${summary.done} · retrying ${summary.retrying} · gave up ${summary.dead}`,
    );
  }
}

if (loop) {
  console.log(`[dispatch] watching for notifications every ${INTERVAL_MS / 1000}s — Ctrl+C to stop`);
  let stopping = false;
  process.on("SIGINT", () => {
    stopping = true;
  });
  while (!stopping) {
    await pass();
    await new Promise((resolve) => setTimeout(resolve, INTERVAL_MS));
  }
} else {
  await pass();
}
await closeDatabases();
