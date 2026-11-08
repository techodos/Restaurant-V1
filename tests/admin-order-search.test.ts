import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Admin Orders lookup (SKILL.md section 17): an old order is found by its number from any tab, the search tolerates
 * "#", phone formats and LIKE wildcards, and the type / payment / date filters reach the query only as known values.
 * The database is faked: it records the statement.
 */
const { db } = vi.hoisted(() => ({ db: { statements: [] as { sql: string; params: readonly unknown[] }[] } }));

vi.mock("@/server/db/registry", () => {
  const client = {
    query: async (sql: string, params: readonly unknown[] = []) => {
      db.statements.push({ sql, params });
      return [];
    },
    queryOne: async () => null,
    queryCount: async () => 0,
  };
  const transaction = async (_ctx: unknown, handler: (tx: typeof client) => Promise<unknown>) => handler(client);
  return { getDb: () => ({ read: transaction, write: transaction }) };
});

import { listOrders, orderSearchTerms } from "@/server/repositories/orders";
import { adminOrderFilterSearch, hasAdminOrderFilters, parseAdminOrderFilters } from "@/shared/order-filters";

const RESTAURANT = "11111111-1111-4111-8111-111111111111";
const ctx = { restaurantId: RESTAURANT, userId: "u1" };

beforeEach(() => {
  db.statements = [];
});

describe("orderSearchTerms", () => {
  it("drops a leading # and surrounding spaces", () => {
    expect(orderSearchTerms("  #SB7D-WNF3H ")).toEqual({ text: "SB7D-WNF3H", digits: null });
    expect(orderSearchTerms("SB7D-WNF3H")?.text).toBe("SB7D-WNF3H");
    expect(orderSearchTerms("   ")).toBeNull();
    expect(orderSearchTerms(undefined)).toBeNull();
  });

  it("matches a phone number however it was typed or stored (no 0 / 92 trunk prefix)", () => {
    expect(orderSearchTerms("0300 1234567")?.digits).toBe("3001234567");
    expect(orderSearchTerms("+92 300 1234567")?.digits).toBe("3001234567");
    expect(orderSearchTerms("(0300) 123-4567")?.digits).toBe("3001234567");
    expect(orderSearchTerms("Ali")?.digits).toBeNull();
    expect(orderSearchTerms("123")?.digits).toBeNull(); // too short to mean a phone number
  });
});

describe("listOrders search", () => {
  it("looks at order number, name, phone and email, with % and _ taken literally", async () => {
    await listOrders(RESTAURANT, { status: "all", search: "#50%_off" }, ctx);
    const { sql, params } = db.statements[0]!;
    expect(sql).toMatch(/o\.order_number ilike \$2 or o\.customer_name ilike \$2 or o\.customer_phone ilike \$2 or o\.customer_email ilike \$2/);
    expect(params[1]).toBe("%50\\%\\_off%");
    expect(sql).not.toMatch(/o\.status (in|=)/); // "all": every status, however old
  });

  it("adds a digits-only phone match when the search is a phone number", async () => {
    await listOrders(RESTAURANT, { status: "all", search: "0300-1234567" }, ctx);
    const { sql, params } = db.statements[0]!;
    expect(sql).toMatch(/regexp_replace\(coalesce\(o\.customer_phone, ''\), '\[\^0-9\]', '', 'g'\) like \$3/);
    expect(params[2]).toBe("%3001234567%");
  });

  it("applies type, payment and a date range in the restaurant's time zone", async () => {
    await listOrders(
      RESTAURANT,
      { status: "all", ...parseAdminOrderFilters({ type: "delivery", pay: "paid", from: "2026-09-01", to: "2026-09-30" }), timezone: "Asia/Karachi" },
      ctx,
    );
    const { sql, params } = db.statements[0]!;
    expect(sql).toMatch(/o\.order_type = \$2::order_type/);
    expect(sql).toMatch(/o\.payment_status = \$3::payment_status/);
    expect(params).toEqual(expect.arrayContaining(["delivery", "paid", "Asia/Karachi", "2026-09-01", "2026-09-30"]));
  });
});

describe("parseAdminOrderFilters", () => {
  it("keeps known values and drops everything else", () => {
    expect(parseAdminOrderFilters({ type: "pickup", pay: "refunded", from: "2026-01-05", to: "2026-01-31" })).toEqual({
      orderType: "pickup", paymentStatus: "refunded", dateFrom: "2026-01-05", dateTo: "2026-01-31",
    });
    expect(parseAdminOrderFilters({ type: "drone", pay: "paid'; drop table orders;--", from: "2026-02-31", to: "yesterday" })).toEqual({});
    expect(parseAdminOrderFilters({ type: "", pay: "", from: "", to: "" })).toEqual({});
  });

  it("swaps a reversed range and round-trips to URL parameters", () => {
    const filters = parseAdminOrderFilters({ from: "2026-03-10", to: "2026-03-01" });
    expect(filters).toEqual({ dateFrom: "2026-03-01", dateTo: "2026-03-10" });
    expect(hasAdminOrderFilters(filters)).toBe(true);
    expect(hasAdminOrderFilters({})).toBe(false);
    expect(adminOrderFilterSearch(filters)).toEqual([["from", "2026-03-01"], ["to", "2026-03-10"]]);
  });
});
