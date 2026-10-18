import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Order, Restaurant, RestaurantLocation } from "@/shared/contract/models";
import {
  WHATSAPP_MESSAGE_MAX,
  normalizeWhatsAppNumber,
  whatsappDigits,
  whatsappLink,
  whatsappNumberFor,
  whatsappOrderMessage,
} from "@/shared/whatsapp-order";
import { storefrontData } from "./helpers/storefront-data";

/**
 * WhatsApp checkout (phase 1), DB-free: number handling, the message built from a saved order, the checkout
 * options and the place-order rules (createOrder itself is mocked; its WhatsApp rules are in repositories/orders.ts).
 */

const { state } = vi.hoisted(() => ({
  state: {
    created: [] as unknown[],
    locations: [] as Partial<RestaurantLocation>[],
    source: "web" as "web" | "whatsapp",
    marked: [] as unknown[],
    swept: [] as unknown[],
    markResult: true,
  },
}));

vi.mock("@/server/repositories/orders", () => ({
  createOrder: vi.fn(async (input: unknown) => {
    state.created.push(input);
    return {
      order: { id: "o-1", orderNumber: "ABCD-EFGHJ", source: state.source, customerPhone: "+923001234567", paymentStatus: "pending" },
      requiresOnlinePayment: false,
      customer: { email: null },
      replayed: false,
    };
  }),
  getOrderForAccessGrant: vi.fn(),
  setOrderPaymentStatus: vi.fn(),
  markWhatsAppOrderSent: vi.fn(async (...args: unknown[]) => {
    state.marked.push(args);
    return state.markResult;
  }),
  cancelUnsentWhatsAppOrders: vi.fn(async (...args: unknown[]) => {
    state.swept.push(args);
    return 0;
  }),
}));
vi.mock("@/server/services/restaurants", () => ({ getLocations: async () => state.locations }));
vi.mock("@/server/services/cart", () => ({ assertTrayOrderable: () => undefined }));

const { getCheckoutOptions, placeOrder } = await import("@/server/services/checkout");
const { placeOrderSchema } = await import("@/server/validation/checkout");
const { checkoutModeSchema } = await import("@/server/validation/platform");
const { confirmWhatsAppSent } = await import("@/server/services/whatsapp-checkout");
const { whatsappStage, WHATSAPP_SEND_WINDOW_MINUTES, WHATSAPP_NOT_SENT_REASON, WHATSAPP_REPLACED_REASON } = await import("@/shared/whatsapp-order");

function restaurant(overrides: Partial<Restaurant> = {}): Restaurant {
  return { ...storefrontData().restaurant, ...overrides };
}

const order = (overrides: Partial<Order> = {}): Order =>
  ({
    orderNumber: "XKZS-Z4CE5",
    orderType: "delivery",
    customerName: "Ayesha Khan",
    customerPhone: "+923001234567",
    deliveryAddress: { line1: "House 14, Street 32", area: "Walton", city: "Lahore" },
    tableNumber: null,
    notes: "Please ring the bell",
    paymentMethod: "cash_on_delivery",
    currency: "PKR",
    subtotal: "6350.00",
    discountAmount: "0.00",
    deliveryFee: "150.00",
    taxAmount: "0.00",
    serviceFee: "0.00",
    tipAmount: "0.00",
    total: "6500.00",
    items: [
      {
        id: "1", orderId: "o", menuItemId: null, variantId: null, itemName: "Chicken Shish Taouk", variantName: null, quantity: 2,
        unitPrice: "1890.00", addonsTotal: "0.00", lineTotal: "3780.00", specialInstructions: null,
        addons: [{ id: "a", orderItemId: "1", menuAddonId: null, groupName: "Side", addonName: "Garlic potatoes", unitPrice: "0.00", quantity: 1 }],
      },
      {
        id: "2", orderId: "o", menuItemId: null, variantId: null, itemName: "Mezze Sharing Platter", variantName: "For 2", quantity: 1,
        unitPrice: "2450.00", addonsTotal: "120.00", lineTotal: "2570.00", specialInstructions: "extra bread",
        addons: [{ id: "b", orderItemId: "2", menuAddonId: null, groupName: "Dips", addonName: "Toum", unitPrice: "120.00", quantity: 1 }],
      },
    ],
    ...overrides,
  }) as Order;

const context = { restaurantName: "Smash Stop", currency: "PKR", currencySymbol: "Rs", locale: "en", orderUrl: "https://shop.test/order/XKZS-Z4CE5" };

beforeEach(() => {
  state.created = [];
  state.locations = [];
  state.source = "web";
  state.marked = [];
  state.swept = [];
  state.markResult = true;
});

describe("WhatsApp numbers", () => {
  it("normalises what staff type into wa.me digits", () => {
    expect(whatsappDigits("+92 300-123 4567")).toBe("923001234567");
    expect(whatsappDigits("0300 1234567")).toBe("923001234567"); // local Pakistani mobile → country code
    expect(whatsappDigits("12")).toBeNull();
    expect(whatsappDigits("")).toBeNull();
    expect(normalizeWhatsAppNumber("0300 1234567")).toBe("+923001234567");
    expect(normalizeWhatsAppNumber("  ")).toBe(""); // clears
    expect(normalizeWhatsAppNumber("call me")).toBeNull(); // refused
  });

  it("prefers the branch's number, falls back to the restaurant's", () => {
    expect(whatsappNumberFor("+923001111111", "+923002222222")).toBe("+923002222222");
    expect(whatsappNumberFor("+923001111111", null)).toBe("+923001111111");
    expect(whatsappNumberFor("+923001111111", "bad")).toBe("+923001111111");
    expect(whatsappNumberFor(null, null)).toBeNull();
  });

  it("validates the admin / super-admin fields the same way", () => {
    expect(checkoutModeSchema.parse({ checkoutMode: "whatsapp", whatsapp: "0300 1234567" })).toEqual({ checkoutMode: "whatsapp", whatsapp: "+923001234567" });
    expect(checkoutModeSchema.safeParse({ checkoutMode: "whatsapp", whatsapp: "nope" }).success).toBe(false);
    expect(checkoutModeSchema.safeParse({ checkoutMode: "telegram" }).success).toBe(false);
  });
});

describe("the WhatsApp order message", () => {
  it("carries the order number, items with options, totals, customer, address, note and order link", () => {
    const text = whatsappOrderMessage(order(), context);
    expect(text).toContain("New order #XKZS-Z4CE5 — Smash Stop");
    expect(text).toContain("2× Chicken Shish Taouk (Garlic potatoes)");
    expect(text).toContain('1× Mezze Sharing Platter (For 2, Toum)');
    expect(text).toContain('"extra bread"');
    expect(text).toContain("Delivery:");
    expect(text).toMatch(/Total: .*6,500.* · Cash on delivery/);
    expect(text).toContain("Ayesha Khan · +923001234567");
    expect(text).toContain("House 14, Street 32, Walton, Lahore");
    expect(text).toContain("Note: Please ring the bell");
    expect(text).toContain("Order details: https://shop.test/order/XKZS-Z4CE5");
  });

  it("cuts long item lists, never the totals, address or link", () => {
    const many = Array.from({ length: 80 }, (_, i) => ({ ...order().items![0]!, id: `x${i}`, itemName: `Very long dish name number ${i} with extras` }));
    const text = whatsappOrderMessage(order({ items: many }), context);
    expect(text.length).toBeLessThanOrEqual(WHATSAPP_MESSAGE_MAX);
    expect(text).toMatch(/\+\d+ more item\(s\) — see order details/);
    expect(text).toContain("Total:");
    expect(text).toContain("Order details: https://shop.test/order/XKZS-Z4CE5");
  });

  it("builds a wa.me link with the message encoded, or null without a usable number", () => {
    const link = whatsappLink("+92 300 1234567", "Hi & bye");
    expect(link).toBe("https://wa.me/923001234567?text=Hi%20%26%20bye");
    expect(whatsappLink(null, "x")).toBeNull();
  });
});

describe("checkout options and placing an order", () => {
  it("offers only cash methods in WhatsApp mode, whatever the owner's Payments settings", () => {
    const base = restaurant();
    const r = restaurant({
      checkoutMode: "whatsapp",
      settings: { ...base.settings, payments: { ...base.settings.payments, enabledMethods: ["card_online", "bank_transfer"] } },
    });
    expect(getCheckoutOptions(r, "delivery").paymentMethods).toEqual(["cash_on_delivery"]);
    expect(getCheckoutOptions(r, "pickup").paymentMethods).toEqual(["cash"]);
  });

  it("the place-order schema no longer requires an email (WhatsApp checkout)", () => {
    const parsed = placeOrderSchema.safeParse({ orderType: "pickup", fullName: "Ayesha Khan", phone: "+923001234567", paymentMethod: "cash" });
    expect(parsed.success).toBe(true);
  });

  const input = { orderType: "pickup" as const, fullName: "Ayesha Khan", phone: "+923001234567", paymentMethod: "cash" as const, email: "" };
  const tray = { lines: [{ menuItemId: "m", quantity: 1 }], orderType: "pickup", locationId: null } as never;

  it("refuses a WhatsApp checkout with no number BEFORE any order is written", async () => {
    await expect(placeOrder(restaurant({ checkoutMode: "whatsapp", whatsapp: null }), tray, input, {})).rejects.toMatchObject({ code: "ORDERING_DISABLED" });
    expect(state.created).toHaveLength(0);
  });

  it("places a WhatsApp order without email and tells the browser to hand it to WhatsApp", async () => {
    state.source = "whatsapp";
    const result = await placeOrder(restaurant({ checkoutMode: "whatsapp", whatsapp: "+923001234567" }), tray, input, {});
    expect(result).toEqual({ orderNumber: "ABCD-EFGHJ", requiresOnlinePayment: false, whatsapp: true });
    expect(state.created).toHaveLength(1);
  });

  it("a branch's own WhatsApp is enough when the restaurant has none", async () => {
    state.source = "whatsapp";
    state.locations = [{ id: "b-1", whatsapp: "+923009999999" }];
    const branchTray = { lines: [{ menuItemId: "m", quantity: 1 }], orderType: "pickup", locationId: "b-1" } as never;
    await expect(placeOrder(restaurant({ checkoutMode: "whatsapp", whatsapp: null }), branchTray, input, {})).resolves.toMatchObject({ whatsapp: true });
  });

  it("the standard checkout still requires an email", async () => {
    await expect(placeOrder(restaurant({ checkoutMode: "standard" }), tray, input, {})).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(state.created).toHaveLength(0);
  });
});

describe("WhatsApp order lifecycle (no API: the customer reports sending)", () => {
  const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();
  const wa = (overrides: Partial<Order> & { cancelReason?: string | null } = {}) =>
    ({ id: "o-1", source: "whatsapp", status: "pending", whatsappSentAt: null, createdAt: minutesAgo(5), ...overrides }) as Order & { cancelReason?: string | null };

  it("is awaiting inside the window, not sent after it, sent once confirmed", () => {
    expect(whatsappStage(wa())).toBe("awaiting");
    expect(whatsappStage(wa({ createdAt: minutesAgo(WHATSAPP_SEND_WINDOW_MINUTES + 1) }))).toBe("not_sent");
    expect(whatsappStage(wa({ whatsappSentAt: minutesAgo(1) }))).toBe("sent");
    expect(whatsappStage({ ...wa(), source: "web" })).toBeNull();
  });

  it("counts as sent when staff already moved it on, even without the customer's confirmation", () => {
    expect(whatsappStage(wa({ status: "preparing" }))).toBe("sent");
  });

  it("tells our own expiry/replacement apart from a real cancellation", () => {
    expect(whatsappStage(wa({ status: "cancelled", cancelReason: WHATSAPP_NOT_SENT_REASON }))).toBe("not_sent");
    expect(whatsappStage(wa({ status: "cancelled", cancelReason: WHATSAPP_REPLACED_REASON }))).toBe("not_sent");
    expect(whatsappStage(wa({ status: "cancelled", whatsappSentAt: minutesAgo(3), cancelReason: "Out of stock" }))).toBe("cancelled");
  });

  it("records the customer's confirmation once, inside the window only", async () => {
    await confirmWhatsAppSent(restaurant(), wa());
    expect(state.marked).toHaveLength(1);
    await confirmWhatsAppSent(restaurant(), wa({ whatsappSentAt: minutesAgo(1) })); // already sent: no second write
    expect(state.marked).toHaveLength(1);
    await expect(confirmWhatsAppSent(restaurant(), wa({ createdAt: minutesAgo(45) }))).rejects.toMatchObject({ code: "CONFLICT" });
    state.markResult = false; // lapsed between render and click: the guarded update matched nothing
    await expect(confirmWhatsAppSent(restaurant(), wa())).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("a new WhatsApp order replaces the same customer's older unsent ones", async () => {
    state.source = "whatsapp";
    const tray = { lines: [{ menuItemId: "m", quantity: 1 }], orderType: "pickup", locationId: null } as never;
    await placeOrder(restaurant({ checkoutMode: "whatsapp", whatsapp: "+923001234567" }), tray,
      { orderType: "pickup", fullName: "Ayesha Khan", phone: "+923001234567", paymentMethod: "cash", email: "" }, {});
    expect(state.swept).toHaveLength(1);
    expect(state.swept[0]).toEqual([
      expect.any(String),
      expect.objectContaining({ phone: "+923001234567", keepOrderId: "o-1", windowMinutes: WHATSAPP_SEND_WINDOW_MINUTES }),
    ]);
  });
});

