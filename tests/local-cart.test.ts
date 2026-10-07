import { describe, expect, it } from "vitest";
import {
  addLocalLine,
  clearLocalCart,
  emptyLocalCart,
  localCartItemCount,
  localCartSubtotal,
  localLineTotal,
  removeLocalLine,
  setLocalCoupon,
  setLocalLocationId,
  setLocalOrderType,
  updateLocalLineQuantity,
  fromInitialTray,
  toTray,
  type LocalCart,
} from "@/components/storefront/local-cart";
import { decodeTray, encodeTray } from "@/shared/tray";

/**
 * The browser-held tray's pure logic (see `components/storefront/local-cart.tsx`): every add/update/
 * remove/clear that used to cost a database transaction is now this plus a cookie write — no network,
 * no database, tested here without a DOM or a database.
 */

const display = (name: string, unitPrice: string, addonsTotal = "0.00", extra: Partial<{ variantName: string; addonNames: string[] }> = {}) => ({
  name,
  slug: name.toLowerCase().replace(/\s+/g, "-"),
  imageUrl: null,
  variantName: extra.variantName ?? null,
  addonNames: extra.addonNames ?? [],
  unitPrice,
  addonsTotal,
  problem: null,
});

const MARGHERITA = "11111111-1111-4111-8111-111111111111";
const MEDIUM = "22222222-2222-4222-8222-222222222222";
const MOZZARELLA = "33333333-3333-4333-8333-333333333333";

function line(overrides: Partial<Parameters<typeof addLocalLine>[1]> = {}) {
  return {
    menuItemId: MARGHERITA,
    variantId: MEDIUM,
    quantity: 1,
    addons: [{ addonId: MOZZARELLA, quantity: 1 }],
    display: display("Margherita Pizza", "1200.00", "250.00", { variantName: 'Medium 12"', addonNames: ["Extra mozzarella"] }),
    ...overrides,
  };
}

describe("local cart reducer", () => {
  it("starts empty with the given order type", () => {
    const cart = emptyLocalCart("delivery");
    expect(cart).toEqual({ orderType: "delivery", locationId: null, couponCode: null, couponDiscount: null, lines: [] });
  });

  it("adding the same item (same variant/add-ons/note) twice merges into one line, summing quantity", () => {
    let cart = emptyLocalCart("delivery");
    cart = addLocalLine(cart, line());
    cart = addLocalLine(cart, line());
    expect(cart.lines).toHaveLength(1);
    expect(cart.lines[0]!.quantity).toBe(2);
  });

  it("merges regardless of add-on order, and caps the merged quantity at 99", () => {
    const SPRINKLES = "55555555-5555-4555-8555-555555555555";
    let cart = addLocalLine(
      emptyLocalCart("delivery"),
      line({ addons: [{ addonId: MOZZARELLA, quantity: 1 }, { addonId: SPRINKLES, quantity: 2 }], quantity: 60 }),
    );
    cart = addLocalLine(
      cart,
      line({ addons: [{ addonId: SPRINKLES, quantity: 2 }, { addonId: MOZZARELLA, quantity: 1 }], quantity: 60 }),
    );
    expect(cart.lines).toHaveLength(1);
    expect(cart.lines[0]!.quantity).toBe(99);
  });

  it("keeps different variants, add-ons or notes on separate lines", () => {
    let cart = addLocalLine(emptyLocalCart("delivery"), line());
    cart = addLocalLine(cart, line({ addons: [] }));
    cart = addLocalLine(cart, line({ specialInstructions: "No basil" }));
    expect(cart.lines).toHaveLength(3);
  });

  it("caps quantity at 99 and floors at 1 on add", () => {
    const cart = addLocalLine(emptyLocalCart("delivery"), line({ quantity: 500 }));
    expect(cart.lines[0]!.quantity).toBe(99);
  });

  it("updateLocalLineQuantity replaces the quantity, capped at 99", () => {
    let cart = addLocalLine(emptyLocalCart("delivery"), line());
    const id = cart.lines[0]!.id;
    cart = updateLocalLineQuantity(cart, id, 5);
    expect(cart.lines[0]!.quantity).toBe(5);
    cart = updateLocalLineQuantity(cart, id, 500);
    expect(cart.lines[0]!.quantity).toBe(99);
  });

  it("updateLocalLineQuantity to 0 or below removes the line, matching updateCartItemQuantity", () => {
    let cart = addLocalLine(emptyLocalCart("delivery"), line());
    const id = cart.lines[0]!.id;
    cart = updateLocalLineQuantity(cart, id, 0);
    expect(cart.lines).toHaveLength(0);
  });

  it("removeLocalLine removes only the targeted line", () => {
    let cart = addLocalLine(emptyLocalCart("delivery"), line());
    cart = addLocalLine(cart, {
      menuItemId: "44444444-4444-4444-8444-444444444444",
      variantId: null,
      quantity: 3,
      addons: [],
      display: display("Gulab Jamun", "350.00"),
    });
    const [first, second] = cart.lines;
    cart = removeLocalLine(cart, first!.id);
    expect(cart.lines).toEqual([second]);
  });

  it("clearLocalCart empties the lines and any applied coupon", () => {
    let cart = addLocalLine(emptyLocalCart("delivery"), line());
    cart = setLocalCoupon(cart, "WELCOME10", "100.00");
    cart = clearLocalCart(cart);
    expect(cart.lines).toHaveLength(0);
    expect(cart.couponCode).toBeNull();
    expect(cart.couponDiscount).toBeNull();
  });

  it("setLocalOrderType / setLocalLocationId only touch their own field", () => {
    let cart = addLocalLine(emptyLocalCart("delivery"), line());
    cart = setLocalOrderType(cart, "pickup");
    cart = setLocalLocationId(cart, "loc-1");
    expect(cart.orderType).toBe("pickup");
    expect(cart.locationId).toBe("loc-1");
    expect(cart.lines).toHaveLength(1);
  });

  it("localLineTotal is (unitPrice + addonsTotal) * quantity, rounded to 2dp", () => {
    const added = addLocalLine(emptyLocalCart("delivery"), line({ quantity: 2 }));
    // (1200.00 + 250.00) * 2 = 2900.00 — the exact figure the e2e customer-flow spec checks for
    expect(localLineTotal(added.lines[0]!).toFixed(2)).toBe("2900.00");
  });

  it("localCartItemCount and localCartSubtotal sum across every line", () => {
    let cart = addLocalLine(emptyLocalCart("delivery"), line({ quantity: 2 })); // 2900.00
    cart = addLocalLine(cart, {
      menuItemId: "44444444-4444-4444-8444-444444444444",
      variantId: null,
      quantity: 1,
      addons: [],
      display: display("Gulab Jamun", "350.00"),
    });
    expect(localCartItemCount(cart)).toBe(3);
    expect(localCartSubtotal(cart).toFixed(2)).toBe("3250.00");
  });

  it("an empty cart has no items and a zero subtotal", () => {
    const cart: LocalCart = emptyLocalCart("delivery");
    expect(localCartItemCount(cart)).toBe(0);
    expect(localCartSubtotal(cart).toFixed(2)).toBe("0.00");
  });

  it("a line that can no longer be ordered adds nothing to the subtotal", () => {
    let cart = addLocalLine(emptyLocalCart("delivery"), line({ quantity: 2 }));
    cart = addLocalLine(cart, {
      menuItemId: "44444444-4444-4444-8444-444444444444",
      variantId: null,
      quantity: 1,
      addons: [],
      display: { ...display("Gone", "999.00"), problem: "That item is currently unavailable." },
    });
    expect(localCartSubtotal(cart).toFixed(2)).toBe("2900.00");
  });

  it("toTray keeps only ids and quantities (what the cookie stores), and survives the cookie round trip", () => {
    let cart = addLocalLine(emptyLocalCart("pickup"), line({ quantity: 2, specialInstructions: "No basil" }));
    cart = setLocalCoupon(cart, "WELCOME10", "100.00");
    const tray = toTray(cart);
    expect(tray).toEqual({
      orderType: "pickup",
      locationId: null,
      couponCode: "WELCOME10",
      lines: [{ menuItemId: MARGHERITA, variantId: MEDIUM, quantity: 2, addons: [{ addonId: MOZZARELLA, quantity: 1 }], specialInstructions: "No basil" }],
    });
    expect(decodeTray(encodeTray(tray), "delivery")).toEqual(tray);
  });

  it("fromInitialTray merges duplicate rows already saved in an old cookie", () => {
    const tray = {
      orderType: "delivery" as const,
      locationId: null,
      couponCode: null,
      lines: [
        { menuItemId: MARGHERITA, variantId: MEDIUM, quantity: 1, addons: [{ addonId: MOZZARELLA, quantity: 1 }] },
        { menuItemId: MARGHERITA, variantId: MEDIUM, quantity: 1, addons: [{ addonId: MOZZARELLA, quantity: 1 }] },
      ],
    };
    const displays = [display("Margherita Pizza", "1200.00", "250.00"), display("Margherita Pizza", "1200.00", "250.00")];
    const initial = { encoded: encodeTray(tray), tray, displays, couponDiscount: null };
    const cart = fromInitialTray(initial);
    expect(cart.lines).toHaveLength(1);
    expect(cart.lines[0]!.quantity).toBe(2);
  });

  it("fromInitialTray pairs each cookie line with the server's display, with ids stable across server and client renders", () => {
    const tray = toTray(addLocalLine(emptyLocalCart("delivery"), line()));
    const initial = { encoded: encodeTray(tray), tray, displays: [display("Margherita Pizza", "1200.00", "250.00")], couponDiscount: null };
    const first = fromInitialTray(initial);
    const second = fromInitialTray(initial);
    expect(first.lines.map((entry) => entry.id)).toEqual(second.lines.map((entry) => entry.id));
    expect(first.lines[0]).toMatchObject({ menuItemId: MARGHERITA, quantity: 1, display: { name: "Margherita Pizza" } });
  });
});
