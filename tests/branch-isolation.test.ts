import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { BELLA, MANAGER, CHEF, OWNER, testDatabase } from "./helpers/db";

/**
 * team_members.location_id (null = HQ/all-branch staff) is enforced through RLS
 * (db/migrations/0027_branch_scoping.sql), not app-layer filtering — same pattern as
 * restaurant_id isolation (tenant-isolation.test.ts). Seed fixtures: MANAGER is scoped
 * to Gulberg, CHEF to DHA, OWNER is HQ (sees both).
 */

let gulbergOrderId: string;
let dhaOrderId: string;

beforeAll(async () => {
  const gulberg = await testDatabase.write({ restaurantId: BELLA.restaurantId }, (db) =>
    db.queryOne<{ id: string }>(
      `insert into orders (restaurant_id, location_id, order_type, status, customer_name, customer_phone)
       values ($1, $2, 'pickup', 'pending', 'Branch Test Gulberg', '+920000000001') returning id`,
      [BELLA.restaurantId, BELLA.locationGulberg],
    ),
  );
  const dha = await testDatabase.write({ restaurantId: BELLA.restaurantId }, (db) =>
    db.queryOne<{ id: string }>(
      `insert into orders (restaurant_id, location_id, order_type, status, customer_name, customer_phone)
       values ($1, $2, 'pickup', 'pending', 'Branch Test DHA', '+920000000002') returning id`,
      [BELLA.restaurantId, BELLA.locationDha],
    ),
  );
  gulbergOrderId = gulberg!.id;
  dhaOrderId = dha!.id;
});

afterAll(async () => {
  await testDatabase.write({ restaurantId: BELLA.restaurantId }, (db) =>
    db.query("delete from orders where id = any($1::uuid[])", [[gulbergOrderId, dhaOrderId]]),
  );
  await testDatabase.end();
});

describe("branch-scoped staff (RLS)", () => {
  it("lets a branch-scoped manager see only their own branch's orders", async () => {
    const rows = await testDatabase.read(MANAGER, (db) =>
      db.query<{ id: string }>("select id from orders where id = any($1::uuid[])", [[gulbergOrderId, dhaOrderId]]),
    );
    expect(rows.map((row) => row.id)).toEqual([gulbergOrderId]);
  });

  it("lets a different branch's staff see only their own branch's order", async () => {
    const rows = await testDatabase.read(CHEF, (db) =>
      db.query<{ id: string }>("select id from orders where id = any($1::uuid[])", [[gulbergOrderId, dhaOrderId]]),
    );
    expect(rows.map((row) => row.id)).toEqual([dhaOrderId]);
  });

  it("lets HQ (unscoped) staff see every branch's orders", async () => {
    const rows = await testDatabase.read(OWNER, (db) =>
      db.query<{ id: string }>("select id from orders where id = any($1::uuid[])", [[gulbergOrderId, dhaOrderId]]),
    );
    expect(rows.map((row) => row.id).sort()).toEqual([dhaOrderId, gulbergOrderId].sort());
  });

  it("blocks a branch-scoped manager from updating another branch's order", async () => {
    const updated = await testDatabase.read(MANAGER, (db) =>
      db.query<{ id: string }>("update orders set notes = 'hijacked' where id = $1 returning id", [dhaOrderId]),
    );
    expect(updated).toHaveLength(0);
  });
});
