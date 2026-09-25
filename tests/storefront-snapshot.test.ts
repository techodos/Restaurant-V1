import { describe, expect, it, vi } from "vitest";
import {
  readDeliveryZones,
  readHomePage,
  readLocations,
  readMenuCategories,
  readMenuItem,
  readMenuItems,
  readPageBySlug,
  readPublicReviews,
} from "@/server/cache/storefront-queries";
import { buildStorefrontSnapshot, SnapshotValidationError, snapshotStats } from "@/server/cache/storefront-snapshot";
import { menuRecord, storefrontData } from "./helpers/storefront-data";

vi.mock("@/server/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

const build = (overrides = {}) =>
  buildStorefrontSnapshot(storefrontData(overrides), { loadedAt: new Date("2026-03-01T00:00:00Z"), loadDurationMs: 12 });

describe("snapshot build", () => {
  it("assembles the storefront context the way the database path does", () => {
    const { context } = build();
    expect(context.restaurant.slug).toBe("bella-napoli");
    expect(context.locations.map((location) => location.id)).toEqual(["loc-1"]); // inactive location excluded
    expect(context.primaryLocation?.id).toBe("loc-1");
    expect(context.theme.primary).toBeTruthy();
  });

  it("falls back to a synthetic published website when the restaurant has none", () => {
    const { context } = build({ website: null });
    expect(context.website.id).toBe("");
    expect(context.website.status).toBe("published");
  });

  it("counts active items per category and leaves the plain category list count-free", () => {
    const snapshot = build();
    expect(snapshot.categoriesWithCounts.map((category) => [category.slug, category.itemCount])).toEqual([
      ["pizza", 2],
      ["drinks", 2],
    ]);
    expect(snapshot.categories.every((category) => category.itemCount === undefined)).toBe(true);
  });

  it("reports what it loaded", () => {
    expect(snapshotStats(build())).toEqual({ items: 4, categories: 2, locations: 2, deliveryZones: 2, pages: 2, reviews: 3 });
  });

  it("is immutable: the active snapshot cannot be mutated by a reader", () => {
    const snapshot = build();
    expect(() => {
      (snapshot.menu[0]!.item as { name: string }).name = "Hacked";
    }).toThrow(TypeError);
    expect(() => {
      (snapshot.context.restaurant as { name: string }).name = "Hacked";
    }).toThrow(TypeError);
    expect(() => (snapshot.menu as unknown[]).push({})).toThrow(TypeError);
  });

  it("rejects an inconsistent load instead of building a half-valid snapshot", () => {
    const data = storefrontData();
    data.website = { ...data.website!, restaurantId: "someone-else" };
    expect(() => buildStorefrontSnapshot(data, { loadedAt: new Date(), loadDurationMs: 0 })).toThrow(SnapshotValidationError);

    const duplicated = storefrontData();
    duplicated.menu = [duplicated.menu[0]!, duplicated.menu[0]!];
    expect(() => buildStorefrontSnapshot(duplicated, { loadedAt: new Date(), loadDurationMs: 0 })).toThrow(/duplicate menu item/);
  });
});

describe("lookup indexes", () => {
  const snapshot = build();

  it("finds an item by slug without scanning", () => {
    expect(snapshot.index.itemsBySlug.get("diavola")?.item.id).toBe("i-diavola");
    expect(readMenuItem(snapshot, "diavola")?.name).toBe("Diavola");
    expect(readMenuItem(snapshot, "missing")).toBeNull();
  });

  it("finds a category by slug", () => {
    expect(snapshot.index.categoriesBySlug.get("drinks")?.id).toBe("cat-drinks");
    expect(snapshot.index.categoriesBySlug.get("nope")).toBeUndefined();
  });

  it("keeps the first item when two share a slug", () => {
    const data = storefrontData();
    data.menu = [menuRecord("a", "Same Name"), menuRecord("b", "Same Name")];
    const built = buildStorefrontSnapshot(data, { loadedAt: new Date(), loadDurationMs: 0 });
    expect(built.index.itemsBySlug.get("same-name")?.item.id).toBe("a");
    expect(built.menu).toHaveLength(2);
  });
});

describe("menu reads mirror the database query semantics", () => {
  const snapshot = build();
  const names = (items: { name: string }[]) => items.map((item) => item.name);

  it("defaults to menu order (category order, item order)", () => {
    expect(names(readMenuItems(snapshot))).toEqual(["Margherita", "Diavola", "Cola", "Fanta"]);
  });

  it("filters by category slug, featured, availability, ids, slugs and exclusions", () => {
    expect(names(readMenuItems(snapshot, { categorySlug: "drinks" }))).toEqual(["Cola", "Fanta"]);
    expect(names(readMenuItems(snapshot, { featuredOnly: true }))).toEqual(["Margherita"]);
    expect(names(readMenuItems(snapshot, { availableOnly: true }))).toEqual(["Margherita", "Diavola", "Cola"]);
    expect(names(readMenuItems(snapshot, { ids: ["i-cola"] }))).toEqual(["Cola"]);
    expect(names(readMenuItems(snapshot, { slugs: ["fanta", "cola"] }))).toEqual(["Cola", "Fanta"]);
    expect(names(readMenuItems(snapshot, { excludeIds: ["i-cola", "i-fanta"] }))).toEqual(["Margherita", "Diavola"]);
    expect(names(readMenuItems(snapshot, { dietaryTags: ["spicy"] }))).toEqual(["Diavola"]);
  });

  it("treats empty id/slug lists as no filter, like the SQL builder", () => {
    expect(readMenuItems(snapshot, { slugs: [], ids: [], excludeIds: [] })).toHaveLength(4);
  });

  it("searches name, description and category name case-insensitively", () => {
    expect(names(readMenuItems(snapshot, { search: "  MARGH " }))).toEqual(["Margherita"]);
    expect(names(readMenuItems(snapshot, { search: "basil" }))).toEqual(["Margherita"]);
    expect(names(readMenuItems(snapshot, { search: "drinks" }))).toEqual(["Cola", "Fanta"]);
    expect(readMenuItems(snapshot, { search: "sushi" })).toEqual([]);
  });

  it("orders by price, name and popularity", () => {
    expect(names(readMenuItems(snapshot, { orderBy: "price_asc" }))).toEqual(["Fanta", "Cola", "Margherita", "Diavola"]);
    expect(names(readMenuItems(snapshot, { orderBy: "price_desc" }))).toEqual(["Diavola", "Margherita", "Cola", "Fanta"]);
    expect(names(readMenuItems(snapshot, { orderBy: "name" }))).toEqual(["Cola", "Diavola", "Fanta", "Margherita"]);
    expect(names(readMenuItems(snapshot, { orderBy: "popularity" }))).toEqual(["Diavola", "Margherita", "Cola", "Fanta"]);
  });

  it("applies limit and offset with the repository's clamping", () => {
    expect(names(readMenuItems(snapshot, { limit: 2 }))).toEqual(["Margherita", "Diavola"]);
    expect(names(readMenuItems(snapshot, { limit: 2, offset: 2 }))).toEqual(["Cola", "Fanta"]);
    expect(readMenuItems(snapshot, { limit: 0 })).toHaveLength(1); // clamped to a minimum of 1
  });

  it("returns a fresh array each time, so callers may sort or slice it", () => {
    const first = readMenuItems(snapshot);
    first.reverse();
    expect(names(readMenuItems(snapshot))[0]).toBe("Margherita");
    expect(() => readMenuCategories(snapshot).pop()).not.toThrow();
    expect(readMenuCategories(snapshot, { withCounts: true })[0]?.itemCount).toBe(2);
    expect(readMenuCategories(snapshot)[0]?.itemCount).toBeUndefined();
  });
});

describe("other reads", () => {
  const snapshot = build();

  it("filters locations and delivery zones like the repository options", () => {
    expect(readLocations(snapshot)).toHaveLength(2);
    expect(readLocations(snapshot, { activeOnly: true }).map((location) => location.id)).toEqual(["loc-1"]);
    expect(readDeliveryZones(snapshot)).toHaveLength(2);
    expect(readDeliveryZones(snapshot, { activeOnly: true }).map((zone) => zone.id)).toEqual(["z-1"]);
    expect(readDeliveryZones(snapshot, { locationId: "loc-2" })).toEqual([]);
  });

  it("serves the home page and limited, featured-first reviews", () => {
    expect(readHomePage(snapshot)?.id).toBe("p-home");
    expect(readHomePage(build({ pages: [] }))).toBeNull();
    expect(readPageBySlug(snapshot, "about")?.id).toBe("p-about");
    expect(readPageBySlug(snapshot, "home")).toBeNull(); // the home page is served by the restaurant root
    expect(readPageBySlug(snapshot, "missing")).toBeNull();
    expect(readPublicReviews(snapshot, { limit: 2 }).map((review) => review.id)).toEqual(["r-1", "r-2"]);
    expect(readPublicReviews(snapshot, { featuredOnly: true }).map((review) => review.id)).toEqual(["r-1"]);
    expect(readPublicReviews(snapshot)).toHaveLength(3);
  });
});
