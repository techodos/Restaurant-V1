import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * openCart: (1) looks the cart up AS the signed-in customer (a cart linked to a customer is invisible under RLS
 * to a lookup without their id, which made every add after the first look like "no cart" and collide with it),
 * (2) recovers when the token is held by a cart this visitor cannot read, by starting a fresh cart under a new
 * token. The repository is mocked.
 */
const { getOrCreateCart, getCartByToken } = vi.hoisted(() => ({ getOrCreateCart: vi.fn(), getCartByToken: vi.fn() }));
vi.mock("@/server/repositories/carts", () => ({
  getOrCreateCart,
  getCartByToken,
  hydrateCart: vi.fn(),
}));

import { openCart } from "@/server/services/cart";

const restaurant = { id: "r1", currency: "PKR" } as never;
const cartFor = (token: string) => ({ id: "c-" + token, sessionToken: token });

describe("openCart", () => {
  beforeEach(() => {
    getOrCreateCart.mockReset();
  });

  it("passes the signed-in customer into the lookup context", async () => {
    getOrCreateCart.mockResolvedValue(cartFor("tok"));
    await openCart(restaurant, "tok", { customerId: "cust-1" });
    const [params, ctx] = getOrCreateCart.mock.calls[0]!;
    expect(params).toMatchObject({ cartToken: "tok", customerId: "cust-1" });
    expect(ctx).toMatchObject({ restaurantId: "r1", cartToken: "tok", customerId: "cust-1" });
  });

  it("starts a fresh cart under a new token when the token is held by a cart this visitor cannot read", async () => {
    getOrCreateCart
      .mockRejectedValueOnce(Object.assign(new Error("taken"), { code: "CART_TOKEN_TAKEN" }))
      .mockImplementationOnce(async (params: { cartToken: string }) => cartFor(params.cartToken));
    const cart = await openCart(restaurant, "old-token", { customerId: null });
    expect(getOrCreateCart).toHaveBeenCalledTimes(2);
    expect(cart.sessionToken).not.toBe("old-token");
    expect(cart.sessionToken.length).toBeGreaterThanOrEqual(32);
  });

  it("does not swallow other errors", async () => {
    getOrCreateCart.mockRejectedValue(Object.assign(new Error("boom"), { code: "INTERNAL_ERROR" }));
    await expect(openCart(restaurant, "tok")).rejects.toMatchObject({ code: "INTERNAL_ERROR" });
    expect(getOrCreateCart).toHaveBeenCalledTimes(1);
  });
});
