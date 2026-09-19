import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addItemToCart, clearCart, getOrCreateCart, resolveItemSelection, updateCartItemQuantity } from "../src/lib/db/carts";
import { createOrder } from "../src/lib/db/orders";
import { getMenuItem } from "../src/lib/db/menu";
import { getOrderById, updateOrderStatus } from "../src/lib/db/orders";
import { ANON, BELLA, cartContext, newCartToken, testDatabase } from "./helpers/db";
import type { MenuItem } from "../src/lib/contract/models";

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

describe("cart item validation", () => {
  it("falls back to the default variant and applies the default add-ons", async () => {
    const token = newCartToken();
    const cart = await getOrCreateCart({ restaurantId, cartToken: token, currency: "PKR" }, cartContext(token));
    const line = await addItemToCart(
      { cartId: cart.id, restaurantId, timezone, input: { menuItemId: margherita.id, quantity: 1 } },
      cartContext(token),
    );
    expect(line.variantName).toBe('Small 9"');
    expect(line.unitPrice).toBe("950.00");
    expect(line.addonsTotal).toBe("0.00"); // house crust is free
    expect(line.addons.map((addon) => addon.addonName)).toEqual(["Classic Neapolitan"]);
    await clearCart(cart.id, cartContext(token));
  });

  it("rejects a variant that does not belong to the item", async () => {
    const token = newCartToken();
    const cart = await getOrCreateCart({ restaurantId, cartToken: token, currency: "PKR" }, cartContext(token));
    await expect(
      addItemToCart(
        { cartId: cart.id, restaurantId, timezone, input: { menuItemId: margherita.id, variantId: gulabJamun.variants[0]!.id } },
        cartContext(token),
      ),
    ).rejects.toThrowError(/option/i);
  });

  it("auto-satisfies a required group from its defaults, but still rejects unknown extras", async () => {
    const resolved = await testDatabase.read({}, (tx) =>
      resolveItemSelection(tx, restaurantId, timezone, {
        menuItemId: margherita.id,
        variantId: margherita.variants[0]!.id,
        quantity: 1,
        addons: [],
      }),
    );
    expect(resolved.addons).toHaveLength(1);
    expect(resolved.addons[0]?.name).toBe("Classic Neapolitan");
    expect(resolved.addonsTotal).toBe("0.00");

    const token = newCartToken();
    const cart = await getOrCreateCart({ restaurantId, cartToken: token, currency: "PKR" }, cartContext(token));
    await expect(
      addItemToCart(
        {
          cartId: cart.id,
          restaurantId,
          timezone,
          input: { menuItemId: margherita.id, quantity: 1, addons: [{ addonId: gulabJamun.id }] },
        },
        cartContext(token),
      ),
    ).rejects.toThrowError(/not available/i);
  });

  it("enforces max_select per add-on group", async () => {
    const token = newCartToken();
    const cart = await getOrCreateCart({ restaurantId, cartToken: token, currency: "PKR" }, cartContext(token));
    await expect(
      addItemToCart(
        {
          cartId: cart.id,
          restaurantId,
          timezone,
          input: {
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
          },
        },
        cartContext(token),
      ),
    ).rejects.toThrowError(/at most/i);
  });

  it("refuses items that are switched off, and prices the rest server-side", async () => {
    const token = newCartToken();
    const cart = await getOrCreateCart({ restaurantId, cartToken: token, currency: "PKR" }, cartContext(token));
    await expect(
      addItemToCart(
        { cartId: cart.id, restaurantId, timezone, input: { menuItemId: pannaCotta.id, quantity: 1 } },
        cartContext(token),
      ),
    ).rejects.toThrowError(/unavailable/i);

    const line = await addItemToCart(
      {
        cartId: cart.id,
        restaurantId,
        timezone,
        input: {
          menuItemId: margherita.id,
          variantId: margherita.variants[1]!.id, // Medium 12"
          quantity: 2,
          addons: [
            { addonId: addonId(margherita, "Choose your crust", "Stuffed crust") },
            { addonId: addonId(margherita, "Extra toppings", "Extra mozzarella") },
          ],
        },
      },
      cartContext(token),
    );
    // (1250 + 250 stuffed crust + 200 extra mozzarella) × 2 — all from the database
    expect(line.unitPrice).toBe("1250.00");
    expect(line.addonsTotal).toBe("450.00");
    expect(line.lineTotal).toBe("3400.00");

    await updateCartItemQuantity({ cartItemId: line.id, quantity: 1 }, cartContext(token));
    const refreshed = await getOrCreateCart({ restaurantId, cartToken: token, currency: "PKR" }, cartContext(token));
    expect(refreshed.items[0]?.lineTotal).toBe("1700.00");
    await clearCart(cart.id, cartContext(token));
  });
});

async function buildCart(token: string, options: { addGulabJamun?: boolean } = {}) {
  const cart = await getOrCreateCart({ restaurantId, cartToken: token, currency: "PKR" }, cartContext(token));
  await addItemToCart(
    {
      cartId: cart.id,
      restaurantId,
      timezone,
      input: {
        menuItemId: margherita.id,
        variantId: margherita.variants[1]!.id,
        quantity: 1,
        addons: [
          { addonId: addonId(margherita, "Choose your crust", "Classic Neapolitan") },
          { addonId: addonId(margherita, "Extra toppings", "Extra mozzarella") },
        ],
      },
    },
    cartContext(token),
  );
  if (options.addGulabJamun) {
    await addItemToCart(
      {
        cartId: cart.id,
        restaurantId,
        timezone,
        input: { menuItemId: gulabJamun.id, variantId: gulabJamun.variants[0]!.id, quantity: 2 },
      },
      cartContext(token),
    );
  }
  return cart;
}

describe("order creation", () => {
  it("creates a guest delivery order and records payment, delivery and status history", async () => {
    const token = newCartToken();
    const cart = await buildCart(token);

    const { order, paymentId } = await createOrder(
      {
        restaurantId,
        cartId: cart.id,
        orderType: "delivery",
        customer: { fullName: "Test Guest", phone: "+92 300 0000001", email: "guest@example.com" },
        address: { line1: "House 1, Street 1", area: "Gulberg III", city: "Lahore" },
        paymentMethod: "cash_on_delivery",
        actor: "Test Guest",
      },
      cartContext(token),
    );

    expect(order.orderNumber).toMatch(/^ORD-\d{4}-\d{5}$/);
    expect(order.status).toBe("pending");
    expect(order.subtotal).toBe("1450.00"); // 1250 pizza + 200 extra mozzarella
    expect(order.deliveryFee).toBe("100.00");
    expect(order.taxAmount).toBe("72.50");
    expect(order.total).toBe("1622.50");
    expect(order.deliveryAddress?.area).toBe("Gulberg III");
    expect(paymentId).not.toBe("");

    // guests read their order back through the cart token (no account needed)
    const details = await getOrderById(order.id, cartContext(token));
    expect(details?.items).toHaveLength(1);
    expect(details?.items?.[0]?.addons).toHaveLength(2);
    expect(details?.statusHistory?.map((event) => event.toStatus)).toEqual(["pending"]);
    expect(details?.delivery?.status).toBe("unassigned");
    expect(details?.payment?.status).toBe("pending");

    // the cart is closed and cannot be reused
    const reuse = await getOrCreateCart({ restaurantId, cartToken: token, currency: "PKR" }, cartContext(token));
    expect(reuse.id).not.toBe(cart.id);
  });

  it("applies a valid coupon, recalculates tax and increments usage", async () => {
    const token = newCartToken();
    const cart = await buildCart(token, { addGulabJamun: true });

    const owner = { userId: BELLA.userOwner, restaurantId: BELLA.restaurantId, actor: "Owner" };
    const before = await testDatabase.read(owner, (db) =>
      db.queryOne<{ used_count: number }>("select used_count from coupons where code = 'WELCOME10'"),
    );

    const { order } = await createOrder(
      {
        restaurantId,
        cartId: cart.id,
        orderType: "pickup",
        customer: { fullName: "Coupon Guest", phone: "+92 300 0000002" },
        paymentMethod: "cash",
        couponCode: "WELCOME10",
      },
      cartContext(token),
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
    const smallToken = newCartToken();
    const smallCart = await buildCart(smallToken);
    await expect(
      createOrder(
        {
          restaurantId,
          cartId: smallCart.id,
          orderType: "pickup",
          customer: { fullName: "Coupon Guest", phone: "+92 300 0000002" },
          paymentMethod: "cash",
          couponCode: "FLAT250", // requires 2,500 — this cart totals 1,450
        },
        cartContext(smallToken),
      ),
    ).rejects.toThrowError(/minimum/i);
  });

  it("rejects expired coupons, unavailable payment methods and unknown delivery areas", async () => {
    const expiredToken = newCartToken();
    const expiredCart = await buildCart(expiredToken);
    await expect(
      createOrder(
        {
          restaurantId,
          cartId: expiredCart.id,
          orderType: "pickup",
          customer: { fullName: "Guest", phone: "+92 300 0000003" },
          paymentMethod: "cash",
          couponCode: "RAMADAN15",
        },
        cartContext(expiredToken),
      ),
    ).rejects.toThrowError(/expired/i);

    const walletToken = newCartToken();
    const walletCart = await buildCart(walletToken);
    await expect(
      createOrder(
        {
          restaurantId,
          cartId: walletCart.id,
          orderType: "pickup",
          customer: { fullName: "Guest", phone: "+92 300 0000004" },
          paymentMethod: "wallet",
        },
        cartContext(walletToken),
      ),
    ).rejects.toThrowError(/payment method/i);

    const farToken = newCartToken();
    const farCart = await buildCart(farToken);
    await expect(
      createOrder(
        {
          restaurantId,
          cartId: farCart.id,
          orderType: "delivery",
          customer: { fullName: "Guest", phone: "+92 300 0000005" },
          address: { line1: "Somewhere", area: "Islamabad G-11", city: "Islamabad" },
          paymentMethod: "cash_on_delivery",
        },
        cartContext(farToken),
      ),
    ).rejects.toThrowError(/do not deliver/i);
  });

  it("refuses an empty cart", async () => {
    const token = newCartToken();
    const cart = await getOrCreateCart({ restaurantId, cartToken: token, currency: "PKR" }, cartContext(token));
    await expect(
      createOrder(
        {
          restaurantId,
          cartId: cart.id,
          orderType: "pickup",
          customer: { fullName: "Guest", phone: "+92 300 0000006" },
          paymentMethod: "cash",
        },
        cartContext(token),
      ),
    ).rejects.toThrowError(/empty/i);
  });
});

describe("order status machine", () => {
  async function placeSimpleOrder(label: string) {
    const token = newCartToken();
    const cart = await buildCart(token);
    const { order } = await createOrder(
      {
        restaurantId,
        cartId: cart.id,
        orderType: "pickup",
        customer: { fullName: `Status ${label}`, phone: `+92 300 10000${Math.floor(Math.random() * 90 + 10)}` },
        paymentMethod: "cash",
      },
      cartContext(token),
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
    expect(completed.statusHistory?.map((event) => event.toStatus)).toEqual([
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
