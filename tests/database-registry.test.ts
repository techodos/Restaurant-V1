import { afterEach, describe, expect, it } from "vitest";
import { DatabaseManager, type DatabaseDirectory } from "@/server/db/registry";

/**
 * The per-restaurant database seam: a directory maps restaurant → database
 * config, the manager owns one Database per distinct config key. No connection
 * is opened here (pg pools connect lazily).
 */

const shared = { key: "default", runtimeUrl: "postgresql://u:p@localhost:5999/shared" };

const directory: DatabaseDirectory = {
  resolve: (restaurantId) =>
    restaurantId === "restaurant-a" ? { key: "db-a", runtimeUrl: "postgresql://u:p@localhost:5999/a" } : shared,
};

let manager: DatabaseManager | null = null;

afterEach(async () => {
  await manager?.closeAll();
  manager = null;
});

describe("DatabaseManager", () => {
  it("reuses one Database per config key", () => {
    manager = new DatabaseManager(directory);
    expect(manager.forRestaurant("restaurant-b")).toBe(manager.forRestaurant("restaurant-c"));
    expect(manager.forRestaurant("restaurant-b")).toBe(manager.forRestaurant(null));
    expect(manager.forRestaurant(undefined)).toBe(manager.forRestaurant(null));
  });

  it("routes a restaurant with its own database configuration to a separate Database", () => {
    manager = new DatabaseManager(directory);
    const dedicated = manager.forRestaurant("restaurant-a");
    expect(dedicated).toBe(manager.forRestaurant("restaurant-a"));
    expect(dedicated).not.toBe(manager.forRestaurant("restaurant-b"));
  });

  it("asks the directory for a null restaurant on platform-level lookups", () => {
    const seen: (string | null)[] = [];
    manager = new DatabaseManager({
      resolve: (restaurantId) => {
        seen.push(restaurantId);
        return shared;
      },
    });
    manager.forRestaurant(undefined);
    manager.forRestaurant("restaurant-a");
    expect(seen).toEqual([null, "restaurant-a"]);
  });
});
