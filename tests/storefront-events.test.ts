import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/**
 * The `storefront_changed` channel over real Postgres LISTEN/NOTIFY (the local test database): a change broadcast by
 * one process reaches the others, and a process ignores its own broadcast.
 */
const LISTEN_URL = process.env.DATABASE_URL_SERVICE ?? process.env.DATABASE_URL ?? "";

let events: typeof import("@/server/repositories/storefront-events");
let closeDatabases: () => Promise<void>;

beforeAll(async () => {
  vi.stubEnv("DATABASE_URL_LISTEN", LISTEN_URL);
  vi.resetModules();
  events = await import("@/server/repositories/storefront-events");
  ({ closeDatabases } = await import("@/server/db/registry"));
});

afterAll(async () => {
  await closeDatabases();
  vi.unstubAllEnvs();
});

describe("storefront change feed", () => {
  it("delivers another process's change and ignores this process's own", async () => {
    const heardByA = vi.fn();
    const stop = await events.listenStorefrontChanged("process-a", heardByA);
    try {
      await events.broadcastStorefrontChanged("process-a"); // A's own write: A already reloaded
      await events.broadcastStorefrontChanged("process-b"); // B's write: A must reload
      await vi.waitFor(() => expect(heardByA).toHaveBeenCalledTimes(1), { timeout: 5_000 });
      await new Promise((resolve) => setTimeout(resolve, 300));
      expect(heardByA).toHaveBeenCalledTimes(1);
    } finally {
      stop();
    }
  });
});
