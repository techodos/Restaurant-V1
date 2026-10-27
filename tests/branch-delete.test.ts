import { afterAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { removeLocation } from "@/server/services/restaurants";
import { BELLA, testDatabase } from "./helpers/db";

/**
 * Deleting a branch (admin → Locations → Delete), found 2026-10-27: it set its staff's location_id to null — which
 * means RESTAURANT-WIDE access under RLS (0027) and the write guard (0029) — deleted every reservation at it
 * (cascade), and stripped the branch from its orders/reviews/deliveries. Now the service refuses a branch with
 * history (CONFLICT, "Deactivate it instead") and 0048 makes the database refuse it too. Real Postgres.
 */
const ctx = { restaurantId: BELLA.restaurantId };
const created: string[] = [];
const newBranch = async () => {
  const row = await testDatabase.write(ctx, (db) =>
    db.queryOne<{ id: string }>(
      `insert into restaurant1s (restaurant_id, name, slug, city, is_active) values ($1, 'Doomed', $2, 'Lahore', true) returning id`,
      [BELLA.restaurantId, `doomed-${randomUUID().slice(0, 8)}`],
    ),
  );
  created.push(row!.id);
  return row!.id;
};

afterAll(async () => {
  await testDatabase.write({}, async (db) => {
    await db.query(`delete from orders where customer_name = 'Branch Delete Test'`);
    await db.query(`delete from restaurant1s where id = any($1::uuid[])`, [created]);
  });
  await testDatabase.end();
});

describe("deleting a branch", () => {
  it("a branch with no history can still be deleted", async () => {
    const id = await newBranch();
    await removeLocation(id, ctx);
    const left = await testDatabase.write({}, (db) => db.queryOne<{ n: number }>(`select count(*)::int as n from restaurant1s where id = $1`, [id]));
    expect(left!.n).toBe(0);
  });

  it("a branch with orders is refused with a clear message, and keeps its orders", async () => {
    const id = await newBranch();
    await testDatabase.write(ctx, (db) =>
      db.query(
        `insert into orders (restaurant_id, location_id, order_type, status, customer_name, customer_phone)
         values ($1, $2, 'pickup', 'pending', 'Branch Delete Test', '+920000000099')`,
        [BELLA.restaurantId, id],
      ),
    );
    await expect(removeLocation(id, ctx)).rejects.toMatchObject({ code: "CONFLICT", message: expect.stringMatching(/Deactivate it instead/) });
    const orders = await testDatabase.write({}, (db) => db.queryOne<{ n: number }>(`select count(*)::int as n from orders where location_id = $1`, [id]));
    expect(orders!.n).toBe(1);
  });

  it("the database itself refuses it (0048): a direct delete cannot strip staff to restaurant-wide access", async () => {
    const id = await newBranch();
    await testDatabase.write({}, (db) => db.query(`update team_members set location_id = $1 where user_id = $2`, [id, BELLA.userManager]));
    try {
      await expect(testDatabase.write({}, (db) => db.query(`delete from restaurant1s where id = $1`, [id]))).rejects.toMatchObject({ code: "23503" });
      const manager = await testDatabase.write({}, (db) => db.queryOne<{ location_id: string | null }>(`select location_id from team_members where user_id = $1`, [BELLA.userManager]));
      expect(manager!.location_id).toBe(id); // still scoped to a branch, never null (= every branch)
    } finally {
      await testDatabase.write({}, (db) => db.query(`update team_members set location_id = $1 where user_id = $2`, [BELLA.locationGulberg, BELLA.userManager]));
    }
  });
});
