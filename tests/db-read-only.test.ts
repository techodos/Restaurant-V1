import { afterAll, describe, expect, it } from "vitest";
import { Database } from "@/server/db/database";
import { BELLA, testDatabase } from "./helpers/db";

/**
 * `Database.read` runs `begin read only` and does not wait for its commit (one round trip less per read; see
 * server/db/database.ts). Guard both halves: nothing can be written through it, and the deferred commit still hands
 * every connection back to the pool.
 */
afterAll(async () => {
  await testDatabase.end();
});

const CTX = { restaurantId: BELLA.restaurantId };

describe("Database.read", () => {
  it("refuses a write: reads are read-only transactions", async () => {
    await expect(
      testDatabase.read(CTX, (db) => db.query("update restaurants set name = name where id = $1", [BELLA.restaurantId])),
    ).rejects.toThrow(/read-only transaction/);
  });

  it("returns before its commit yet never leaks a connection: 200 reads through a 2-connection pool", async () => {
    const small = new Database(
      process.env.DATABASE_URL ?? "postgresql://app_runtime:app_runtime@localhost:5432/restaurant_platform_test",
      undefined,
      { poolMax: 2 },
    );
    try {
      const results = await Promise.all(
        Array.from({ length: 200 }, (_, i) => small.read(CTX, (db) => db.queryOne<{ n: number }>("select $1::int as n", [i]))),
      );
      expect(results.map((row) => row?.n)).toEqual(Array.from({ length: 200 }, (_, i) => i));
      // a failing read rolls back and still releases its connection
      await expect(small.read(CTX, (db) => db.query("select 1/0"))).rejects.toThrow();
      expect((await small.read(CTX, (db) => db.queryOne<{ ok: boolean }>("select true as ok")))?.ok).toBe(true);
    } finally {
      await small.end();
    }
  });

  it("each read sees its own request context (set_config is transaction-local, so nothing leaks across pooled reads)", async () => {
    const seen = await Promise.all(
      ["a", "b", "c", "d"].map((actor) =>
        testDatabase.read({ ...CTX, actor }, (db) => db.queryOne<{ actor: string }>("select current_setting('app.actor') as actor")),
      ),
    );
    expect(seen.map((row) => row?.actor)).toEqual(["a", "b", "c", "d"]);
    expect((await testDatabase.read(CTX, (db) => db.queryOne<{ actor: string }>("select current_setting('app.actor') as actor")))?.actor).toBe(
      "system",
    );
  });
});
