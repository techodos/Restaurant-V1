import { afterAll, describe, expect, it } from "vitest";
import { ANON, BELLA, OWNER, SAKURA, SAKURA_OWNER, testDatabase } from "./helpers/db";

afterAll(async () => {
  await testDatabase.end();
});

describe("row level security", () => {
  it("never exposes one restaurant's orders to another tenant's staff", async () => {
    const sakuraView = await testDatabase.read(SAKURA_OWNER, (db) =>
      db.query<{ id: string; restaurant_id: string }>("select id, restaurant_id from orders"),
    );
    expect(sakuraView.every((row) => row.restaurant_id === SAKURA.restaurantId)).toBe(true);

    const bellaView = await testDatabase.read(OWNER, (db) =>
      db.query<{ restaurant_id: string }>("select restaurant_id from orders"),
    );
    expect(bellaView.length).toBeGreaterThan(0);
    expect(bellaView.every((row) => row.restaurant_id === BELLA.restaurantId)).toBe(true);
  });

  it("hides customer records from anonymous storefront visitors", async () => {
    const rows = await testDatabase.read(ANON, (db) => db.query("select id from customers"));
    expect(rows).toHaveLength(0);
  });

  it("hides orders and payments from anonymous visitors", async () => {
    const orders = await testDatabase.read(ANON, (db) => db.query("select id from orders"));
    const payments = await testDatabase.read(ANON, (db) => db.query("select id from payments"));
    expect(orders).toHaveLength(0);
    expect(payments).toHaveLength(0);
  });

  it("exposes only published menu data publicly", async () => {
    const items = await testDatabase.read(ANON, (db) =>
      db.query<{ restaurant_id: string; is_active: boolean }>("select restaurant_id, is_active from menu_items"),
    );
    expect(items.length).toBeGreaterThan(0);
    expect(items.every((row) => row.is_active)).toBe(true);
  });

  it("shows only approved reviews on the storefront", async () => {
    const reviews = await testDatabase.read(ANON, (db) =>
      db.query<{ status: string }>("select status from reviews where restaurant_id = $1", [BELLA.restaurantId]),
    );
    expect(reviews.length).toBeGreaterThan(0);
    expect(reviews.every((row) => row.status === "approved")).toBe(true);
  });

  it("blocks anonymous inserts into orders (orders are created server-side only)", async () => {
    await expect(
      testDatabase.read(ANON, (db) =>
        db.query(
          `insert into orders (restaurant_id, order_type, customer_name, customer_phone)
           values ($1, 'pickup', 'Anon', '+920000000000')`,
          [BELLA.restaurantId],
        ),
      ),
    ).rejects.toThrow();
  });

  it("blocks a tenant from modifying another restaurant record", async () => {
    const changed = await testDatabase.read(SAKURA_OWNER, (db) =>
      db.query<{ id: string }>(`update restaurants set name = 'Hijacked' where id = $1 returning id`, [
        BELLA.restaurantId,
      ]),
    );
    expect(changed).toHaveLength(0);

    const actual = await testDatabase.read({}, (db) =>
      db.queryOne<{ name: string }>("select name from restaurants where id = $1", [BELLA.restaurantId]),
    );
    expect(actual?.name).toBe("Bella Napoli");
  });

  it("scopes private tenancy data while leaving public storefront data readable", async () => {
    const ownLocations = await testDatabase.read(OWNER, (db) =>
      db.query<{ restaurant_id: string }>("select restaurant_id from restaurant_locations where restaurant_id = $1", [
        BELLA.restaurantId,
      ]),
    );
    expect(ownLocations.length).toBeGreaterThanOrEqual(2);

    // Delivery zones and locations are public storefront data, but a tenant must
    // never see the other restaurant's customers, orders or payments.
    for (const table of ["customers", "orders", "payments", "deliveries"]) {
      const foreign = await testDatabase.read(SAKURA_OWNER, (db) =>
        db.query<{ restaurant_id: string }>(`select restaurant_id from ${table} where restaurant_id = $1`, [
          BELLA.restaurantId,
        ]),
      );
      expect(foreign, `${table} leaked across tenants`).toHaveLength(0);
    }
  });
});

describe("guest cart isolation", () => {
  it("keeps guest carts scoped to their opaque token", async () => {
    const restaurantId = BELLA.restaurantId;
    const created = await testDatabase.write({ restaurantId }, (db) =>
      db.queryOne<{ id: string; session_token: string }>(
        `insert into carts (restaurant_id, session_token, currency)
         values ($1, 'iso-token-a', 'PKR') returning id, session_token`,
        [restaurantId],
      ),
    );
    expect(created).not.toBeNull();

    const withToken = await testDatabase.read({ cartToken: "iso-token-a" }, (db) =>
      db.query<{ id: string }>("select id from carts where session_token = 'iso-token-a'"),
    );
    const withOtherToken = await testDatabase.read({ cartToken: "iso-token-b" }, (db) =>
      db.query<{ id: string }>("select id from carts where session_token = 'iso-token-a'"),
    );

    expect(withToken).toHaveLength(1);
    expect(withOtherToken).toHaveLength(0);

    await testDatabase.write({ restaurantId }, (db) => db.query("delete from carts where id = $1", [created!.id]));
  });
});
