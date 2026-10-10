import { describe, expect, it } from "vitest";
import { pageShowsActivity } from "@/shared/admin-activity";

const root = "/r/bella-napoli/admin";

describe("admin order poll: which page refreshes for new orders / status changes", () => {
  it("dashboard, orders list and kitchen refresh when anything changed", () => {
    for (const path of [root, `${root}/`, `${root}/orders`, `${root}/kitchen`]) expect(pageShowsActivity(path, root, ["AB12-CD345"])).toBe(true);
  });

  it("an order's page refreshes only for that order", () => {
    expect(pageShowsActivity(`${root}/orders/AB12-CD345`, root, ["AB12-CD345"])).toBe(true);
    expect(pageShowsActivity(`${root}/orders/ZZZZ-YYYYY`, root, ["AB12-CD345"])).toBe(false);
  });

  it("never forms or other screens, and never when nothing changed", () => {
    for (const path of [`${root}/menu`, `${root}/menu/items/1`, `${root}/settings`, `${root}/staff`, `${root}/orders/activity`]) {
      expect(pageShowsActivity(path, root, ["AB12-CD345"])).toBe(false);
    }
    expect(pageShowsActivity(`${root}/orders`, root, [])).toBe(false);
  });
});
