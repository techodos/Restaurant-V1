import { describe, expect, it } from "vitest";
import { resolveMenuSelection, type OrderableMenuItem, type SelectionInput } from "@/server/domain/menu-selection";
import type { MenuItem } from "@/shared/contract/models";

/**
 * `resolveMenuSelection` is the one implementation behind both the tray preview (in-memory menu) and the
 * order transaction (rows read inside it), so these rules are what decides what a customer is charged.
 * It mirrors the database-cart era's `resolveItemSelection` rule for rule. Pure; no database.
 */

const TZ = "Asia/Karachi";

function pizza(overrides: Partial<MenuItem> = {}): MenuItem {
  return {
    id: "item-pizza",
    restaurantId: "r1",
    categoryId: "cat-1",
    name: "Margherita",
    slug: "margherita",
    description: null,
    shortDescription: null,
    imageUrl: null,
    basePrice: "950.00",
    compareAtPrice: null,
    calories: null,
    spiceLevel: 0,
    prepTimeMinutes: 20,
    isActive: true,
    isAvailable: true,
    isFeatured: false,
    dietaryTags: [],
    allergens: [],
    sortOrder: 0,
    availability: {},
    variants: [
      { id: "v-small", menuItemId: "item-pizza", name: "Small", price: "950.00", priceMode: "absolute", isDefault: true, isAvailable: true, sortOrder: 0 },
      { id: "v-medium", menuItemId: "item-pizza", name: "Medium", price: "1250.00", priceMode: "absolute", isDefault: false, isAvailable: true, sortOrder: 1 },
      { id: "v-gone", menuItemId: "item-pizza", name: "Family", price: "2000.00", priceMode: "absolute", isDefault: false, isAvailable: false, sortOrder: 2 },
    ],
    addonGroups: [
      {
        id: "g-crust",
        menuItemId: "item-pizza",
        name: "Crust",
        description: null,
        isRequired: true,
        minSelect: 1,
        maxSelect: 1,
        sortOrder: 0,
        isActive: true,
        addons: [
          { id: "a-classic", addonGroupId: "g-crust", name: "Classic", description: null, price: "0.00", isDefault: true, isAvailable: true, maxQuantity: 1, sortOrder: 0 },
          { id: "a-stuffed", addonGroupId: "g-crust", name: "Stuffed", description: null, price: "250.00", isDefault: false, isAvailable: true, maxQuantity: 1, sortOrder: 1 },
        ],
      },
      {
        id: "g-extra",
        menuItemId: "item-pizza",
        name: "Extras",
        description: null,
        isRequired: false,
        minSelect: 0,
        maxSelect: 2,
        sortOrder: 1,
        isActive: true,
        addons: [
          { id: "a-cheese", addonGroupId: "g-extra", name: "Cheese", description: null, price: "200.00", isDefault: false, isAvailable: true, maxQuantity: 3, sortOrder: 0 },
          { id: "a-olive", addonGroupId: "g-extra", name: "Olives", description: null, price: "150.00", isDefault: false, isAvailable: true, maxQuantity: 1, sortOrder: 1 },
          { id: "a-chicken", addonGroupId: "g-extra", name: "Chicken", description: null, price: "300.00", isDefault: false, isAvailable: true, maxQuantity: 1, sortOrder: 2 },
          { id: "a-soldout", addonGroupId: "g-extra", name: "Truffle", description: null, price: "900.00", isDefault: false, isAvailable: false, maxQuantity: 1, sortOrder: 3 },
        ],
      },
    ],
    ...overrides,
  };
}

const entry = (item: MenuItem = pizza(), category: OrderableMenuItem["category"] = { isActive: true, availability: {} }): OrderableMenuItem => ({ item, category });

describe("resolveMenuSelection", () => {
  it("falls back to the default variant and applies a required group's default add-on", () => {
    const resolved = resolveMenuSelection(entry(), { menuItemId: "item-pizza" }, TZ);
    expect(resolved.variant?.name).toBe("Small");
    expect(resolved.unitPrice).toBe("950.00");
    expect(resolved.addons.map((addon) => addon.name)).toEqual(["Classic"]);
    expect(resolved.addonsTotal).toBe("0.00");
  });

  it("prices a chosen variant and add-ons from the menu, never from the request", () => {
    const resolved = resolveMenuSelection(
      entry(),
      { menuItemId: "item-pizza", variantId: "v-medium", addons: [{ addonId: "a-stuffed" }, { addonId: "a-cheese", quantity: 2 }] },
      TZ,
    );
    expect(resolved.unitPrice).toBe("1250.00");
    // stuffed 250 + cheese 200 × 2
    expect(resolved.addonsTotal).toBe("650.00");
  });

  it("adds a delta variant to the base price", () => {
    const item = pizza({ variants: [{ id: "v-d", menuItemId: "item-pizza", name: "Large", price: "300.00", priceMode: "delta", isDefault: true, isAvailable: true, sortOrder: 0 }] });
    expect(resolveMenuSelection(entry(item), { menuItemId: "item-pizza" }, TZ).unitPrice).toBe("1250.00");
  });

  it("caps an add-on's quantity at its max and ignores a repeated add-on", () => {
    const resolved = resolveMenuSelection(
      entry(),
      { menuItemId: "item-pizza", addons: [{ addonId: "a-cheese", quantity: 9 }, { addonId: "a-cheese", quantity: 1 }] },
      TZ,
    );
    expect(resolved.addons.find((addon) => addon.addonId === "a-cheese")?.quantity).toBe(3);
  });

  it.each([
    ["an item missing from the menu", null, { menuItemId: "item-pizza" }, "ITEM_UNAVAILABLE"],
    ["a switched-off item", entry(pizza({ isAvailable: false })), { menuItemId: "item-pizza" }, "ITEM_UNAVAILABLE"],
    ["an item in an inactive category", entry(pizza(), { isActive: false, availability: {} }), { menuItemId: "item-pizza" }, "ITEM_UNAVAILABLE"],
    ["a variant of another item", entry(), { menuItemId: "item-pizza", variantId: "v-elsewhere" }, "VARIANT_INVALID"],
    ["an unavailable variant", entry(), { menuItemId: "item-pizza", variantId: "v-gone" }, "VARIANT_INVALID"],
    ["an unknown extra", entry(), { menuItemId: "item-pizza", addons: [{ addonId: "a-nope" }] }, "ADDON_INVALID"],
    ["a sold-out extra", entry(), { menuItemId: "item-pizza", addons: [{ addonId: "a-soldout" }] }, "ADDON_INVALID"],
    [
      "too many extras in a group",
      entry(),
      { menuItemId: "item-pizza", addons: [{ addonId: "a-cheese" }, { addonId: "a-olive" }, { addonId: "a-chicken" }] },
      "ADDON_LIMIT",
    ],
  ] as const)("refuses %s", (_label, menuEntry, input, code) => {
    expect(() => resolveMenuSelection(menuEntry, input as SelectionInput, TZ)).toThrowError(expect.objectContaining({ code }));
  });

  it("refuses a required group that has no default to fall back on", () => {
    const item = pizza();
    const noDefault = { ...item, addonGroups: item.addonGroups.map((group) => ({ ...group, addons: group.addons.map((addon) => ({ ...addon, isDefault: false })) })) };
    expect(() => resolveMenuSelection(entry(noDefault), { menuItemId: "item-pizza" }, TZ)).toThrowError(expect.objectContaining({ code: "ADDON_REQUIRED" }));
  });

  it("refuses an item outside its serving window", () => {
    // served Mondays only, checked on a Sunday in Karachi
    const item = pizza({ availability: { days: [1] } });
    const sunday = new Date("2026-09-27T12:00:00+05:00");
    expect(() => resolveMenuSelection(entry(item), { menuItemId: "item-pizza" }, TZ, sunday)).toThrowError(
      expect.objectContaining({ code: "ITEM_UNAVAILABLE" }),
    );
  });
});
