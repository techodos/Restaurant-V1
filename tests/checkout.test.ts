import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createOrder, type CreateOrderLine } from "@/server/repositories/orders";
import { getMenuItem, loadOrderableItems } from "@/server/repositories/menu";
import { getOrderById, updateOrderStatus } from "@/server/repositories/orders";
import { resolveMenuSelection, type SelectionInput } from "@/server/domain/menu-selection";
import { ANON, BELLA, BELLA_OPEN_NOW, OWNER, testDatabase } from "./helpers/db";
import type { MenuItem } from "@/shared/contract/models";

/**
 * Order placement against a real (local test) database. There is no cart row any more: the tray is a
 * browser cookie and `createOrder` receives its lines directly, re-resolving every one of them from the
 * live menu inside the single order transaction.
 */

const restaurantId = BELLA.restaurantId;
const timezone = "Asia/Karachi";

let margherita: MenuItem;
let gulabJamun: MenuItem;
let pannaCotta: MenuItem;

beforeAll(async () => {
  const [first, second, third] = await Promise.all([
    getMenuItem(restaurantId, { slug: "margherita-pizza" }, ANON, { includeUnavailable: true }),
    getMenuItem(restaurantId, { slug: "gulab-jamun" }, ANON, { includeUnavailable: true }),
    getMenuItem(restaurantId, { slug: "panna-cotta-ai-frutti" }, ANON, { includeUnavailable: true }),
  ]);
  if (!first || !second || !third) throw new Error("seed menu items missing — run npm run db:seed");
  margherita = first;
  gulabJamun = second;
  pannaCotta = third;
});

afterAll(async () => {
  await testDatabase.end();
});

function addonId(item: MenuItem, groupName: string, addonName: string): string {
  const group = item.addonGroups.find((candidate) => candidate.name === groupName);
  const addon = group?.addons.find((candidate) => candidate.name === addonName);
  if (!addon) throw new Error(`add-on ${addonName} not found in ${groupName}`);
  return addon.id;
}

/** The order transaction's own view of a line: rows read by `loadOrderableItems`, rules by `resolveMenuSelection`. */
async function resolveLine(input: SelectionInput) {
  const menu = await testDatabase.read({}, (tx) => loadOrderableItems(tx, restaurantId, [input.menuItemId]));
  return resolveMenuSelection(menu.get(input.menuItemId), input, timezone);
}

describe("line validation against the live menu", () => {
  it("falls back to the default variant and applies the default add-ons", async () => {
    const line = await resolveLine({ menuItemId: margherita.id, quantity: 1 });
    expect(line.variant?.name).toBe('Small 9"');
    expect(line.unitPrice).toBe("950.00");
    expect(line.addonsTotal).toBe("0.00"); // house crust is free
    expect(line.addons.map((addon) => addon.name)).toEqual(["Classic Neapolitan"]);
  });

  it("rejects a variant that does not belong to the item", async () => {
    await expect(resolveLine({ menuItemId: margherita.id, variantId: gulabJamun.variants[0]!.id })).rejects.toThrowError(/option/i);
  });

  it("auto-satisfies a required group from its defaults, but still rejects unknown extras", async () => {
    const resolved = await resolveLine({ menuItemId: margherita.id, variantId: margherita.variants[0]!.id, quantity: 1, addons: [] });
    expect(resolved.addons).toHaveLength(1);
    expect(resolved.addons[0]?.name).toBe("Classic Neapolitan");
    expect(resolved.addonsTotal).toBe("0.00");

    await expect(resolveLine({ menuItemId: margherita.id, quantity: 1, addons: [{ addonId: gulabJamun.id }] })).rejects.toThrowError(
      /not available/i,
    );
  });

  it("enforces max_select per add-on group", async () => {
    await expect(
      resolveLine({
        menuItemId: margherita.id,
        variantId: margherita.variants[0]!.id,
        quantity: 1,
        addons: [
          { addonId: addonId(margherita, "Extra toppings", "Extra mozzarella") },
          { addonId: addonId(margherita, "Extra toppings", "Grilled chicken") },
          { addonId: addonId(margherita, "Extra toppings", "Black olives") },
          { addonId: addonId(margherita, "Extra toppings", "Mushrooms") },
          { addonId: addonId(margherita, "Extra toppings", "Jalapeños") },
        ],
      }),
    ).rejects.toThrowError(/at most/i);
  });

  it("refuses items that are switched off, and prices the rest server-side", async () => {
    await expect(resolveLine({ menuItemId: pannaCotta.id, quantity: 1 })).rejects.toThrowError(/unavailable/i);

    const line = await resolveLine({
      menuItemId: margherita.id,
      variantId: margherita.variants[1]!.id, // Medium 12"
      quantity: 2,
      addons: [
        { addonId: addonId(margherita, "Choose your crust", "Stuffed crust") },
        { addonId: addonId(margherita, "Extra toppings", "Extra mozzarella") },
      ],
    });
    // 1250 + (250 stuffed crust + 200 extra mozzarella) — all from the database
    expect(line.unitPrice).toBe("1250.00");
    expect(line.addonsTotal).toBe("450.00");
  });
});

/** A tray: the lines a browser's cookie would carry. */
function buildLines(options: { addGulabJamun?: boolean } = {}): CreateOrderLine[] {
  const lines: CreateOrderLine[] = [
    {
      menuItemId: margherita.id,
      variantId: margherita.variants[1]!.id,
      quantity: 1,
      addons: [
        { addonId: addonId(margherita, "Choose your crust", "Classic Neapolitan"), quantity: 1 },
        { addonId: addonId(margherita, "Extra toppings", "Extra mozzarella"), quantity: 1 },
      ],
    },
  ];
  if (options.addGulabJamun) {
    lines.push({ menuItemId: gulabJamun.id, variantId: gulabJamun.variants[0]!.id, quantity: 2, addons: [] });
  }
  return lines;
}

describe("order creation", () => {
  it("creates a guest delivery order and records payment, delivery and status history", async () => {
    const { order, paymentId } = await createOrder(
      {
        restaurantId,
        now: BELLA_OPEN_NOW,
        lines: buildLines(),
        orderType: "delivery",
        customer: { fullName: "Test Guest", phone: "+92 300 0000001", email: "guest@example.com" },
        address: { line1: "House 1, Street 1", area: "Gulberg III", city: "Lahore" },
        paymentMethod: "cash_on_delivery",
        actor: "Test Guest",
      },
      ANON,
    );

    expect(order.orderNumber).toMatch(/^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{5}$/); // 0026: random XXXX-XXXXX code
    expect(order.status).toBe("pending");
    expect(order.subtotal).toBe("1450.00"); // 1250 pizza + 200 extra mozzarella
    expect(order.deliveryFee).toBe("100.00");
    expect(order.taxAmount).toBe("72.50");
    expect(order.total).toBe("1622.50");
    expect(order.deliveryAddress?.area).toBe("Gulberg III");
    expect(paymentId).not.toBe("");

    const details = await getOrderById(order.id, OWNER);
    expect(details?.items).toHaveLength(1);
    expect(details?.items?.[0]?.addons).toHaveLength(2);
    expect(details?.statusHistory?.map((event) => event.toStatus)).toEqual(["pending"]);
    expect(details?.delivery?.status).toBe("unassigned");
    expect(details?.payment?.status).toBe("pending");
  });

  it("applies a valid coupon, recalculates tax and increments usage", async () => {
    // a fresh phone each run: WELCOME10 allows one use per customer, so a fixed number only passed on a fresh seed
    const couponPhone = `+92 301 ${String(Date.now()).slice(-7)}`;

    const owner = { userId: BELLA.userOwner, restaurantId: BELLA.restaurantId, actor: "Owner" };
    const before = await testDatabase.read(owner, (db) =>
      db.queryOne<{ used_count: number }>("select used_count from coupons where code = 'WELCOME10'"),
    );

    const { order } = await createOrder(
      {
        restaurantId,
        now: BELLA_OPEN_NOW,
        lines: buildLines({ addGulabJamun: true }),
        orderType: "pickup",
        customer: { fullName: "Coupon Guest", phone: couponPhone },
        paymentMethod: "cash",
        couponCode: "WELCOME10",
      },
      ANON,
    );

    // 1250 + 200 (pizza) + 2 × 350 (gulab jamun) = 2150
    expect(order.subtotal).toBe("2150.00");
    expect(order.discountAmount).toBe("215.00"); // 10% of 2150
    expect(order.taxAmount).toBe("96.75"); // 5% of 1935
    expect(order.total).toBe("2031.75");
    expect(order.couponCode).toBe("WELCOME10");

    const after = await testDatabase.read(owner, (db) =>
      db.queryOne<{ used_count: number }>("select used_count from coupons where code = 'WELCOME10'"),
    );
    expect((after?.used_count ?? 0)).toBe((before?.used_count ?? 0) + 1);

    // a promo whose minimum is not met is refused before any order row is written
    await expect(
      createOrder(
        {
          restaurantId,
          now: BELLA_OPEN_NOW,
          lines: buildLines(),
          orderType: "pickup",
          customer: { fullName: "Coupon Guest", phone: couponPhone },
          paymentMethod: "cash",
          couponCode: "FLAT250", // requires 2,500 — this cart totals 1,450
        },
        ANON,
      ),
    ).rejects.toThrowError(/minimum/i);
  });

  it("rejects expired coupons, unavailable payment methods and unknown delivery areas", async () => {
    await expect(
      createOrder(
        {
          restaurantId,
          now: BELLA_OPEN_NOW,
          lines: buildLines(),
          orderType: "pickup",
          customer: { fullName: "Guest", phone: "+92 300 0000003" },
          paymentMethod: "cash",
          couponCode: "RAMADAN15",
        },
        ANON,
      ),
    ).rejects.toThrowError(/expired/i);

    await expect(
      createOrder(
        {
          restaurantId,
          now: BELLA_OPEN_NOW,
          lines: buildLines(),
          orderType: "pickup",
          customer: { fullName: "Guest", phone: "+92 300 0000004" },
          paymentMethod: "wallet",
        },
        ANON,
      ),
    ).rejects.toThrowError(/payment method/i);

    await expect(
      createOrder(
        {
          restaurantId,
          now: BELLA_OPEN_NOW,
          lines: buildLines(),
          orderType: "delivery",
          customer: { fullName: "Guest", phone: "+92 300 0000005" },
          address: { line1: "Somewhere", area: "Islamabad G-11", city: "Islamabad" },
          paymentMethod: "cash_on_delivery",
        },
        ANON,
      ),
    ).rejects.toThrowError(/not deliver/i);
  });

  it("refuses an empty tray", async () => {
    await expect(
      createOrder(
        {
          restaurantId,
          now: BELLA_OPEN_NOW,
          lines: [],
          orderType: "pickup",
          customer: { fullName: "Guest", phone: "+92 300 0000006" },
          paymentMethod: "cash",
        },
        ANON,
      ),
    ).rejects.toThrowError(/empty/i);
  });
});

describe("order status machine", () => {
  async function placeSimpleOrder(label: string) {
    const { order } = await createOrder(
      {
        restaurantId,
        now: BELLA_OPEN_NOW,
        lines: buildLines(),
        orderType: "pickup",
        customer: { fullName: `Status ${label}`, phone: `+92 300 10000${Math.floor(Math.random() * 90 + 10)}` },
        paymentMethod: "cash",
      },
      ANON,
    );
    return order;
  }

  it("walks the documented flow and records every step", async () => {
    const order = await placeSimpleOrder("walk");
    const owner = { userId: BELLA.userOwner, restaurantId: BELLA.restaurantId, actor: "Imran Chaudhry" };

    await updateOrderStatus(order.id, "confirmed", owner);
    await updateOrderStatus(order.id, "preparing", owner);
    await updateOrderStatus(order.id, "ready", owner);
    const completed = await updateOrderStatus(order.id, "completed", owner);

    expect(completed.status).toBe("completed");
    expect(completed.orderNumber).toBe(order.orderNumber);
    // the status change reports only id/number/status; the history is read like any page reads it
    const reread = await getOrderById(order.id, owner);
    expect(reread?.statusHistory?.map((event) => event.toStatus)).toEqual([
      "pending", "confirmed", "preparing", "ready", "completed",
    ]);
  });

  it("allows cancellation from any non-terminal state but locks terminal states", async () => {
    const cancellable = await placeSimpleOrder("cancel");
    const owner = { userId: BELLA.userOwner, restaurantId: BELLA.restaurantId, actor: "Owner" };
    const cancelled = await updateOrderStatus(cancellable.id, "cancelled", owner, { cancelReason: "Customer changed mind" });
    expect(cancelled.status).toBe("cancelled");
    await expect(updateOrderStatus(cancellable.id, "preparing", owner)).rejects.toThrowError(/transition/i);

    const done = await placeSimpleOrder("done");
    await updateOrderStatus(done.id, "completed", owner);
    await expect(updateOrderStatus(done.id, "cancelled", owner)).rejects.toThrowError(/transition/i);
  });
});
