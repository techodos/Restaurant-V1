import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Cart } from "@/shared/contract/models";

/**
 * Cart mutations report the cart's new size so the header badge (a cookie hint,
 * not a database read) can be kept current without reloading the cart.
 * The carts repository is mocked, so no database is needed.
 */

const repo = vi.hoisted(() => ({
  updateCartItemQuantity: vi.fn(),
  removeCartItem: vi.fn(),
  clearCart: vi.fn(),
}));

vi.mock("@/server/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/server/repositories/carts", async (original) => ({
  ...(await original<object>()),
  updateCartItemQuantity: repo.updateCartItemQuantity,
  removeCartItem: repo.removeCartItem,
  clearCart: repo.clearCart,
}));

import { emptyCart, removeFromCart, updateCartItem } from "@/server/services/cart";

const LINE_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const LINE_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

// two lines: 2 x A and 3 x B = 5 items
const cart = {
  id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  restaurantId: "11111111-1111-1111-1111-111111111111",
  sessionToken: "token",
  itemCount: 5,
  items: [
    { id: LINE_A, quantity: 2 },
    { id: LINE_B, quantity: 3 },
  ],
} as unknown as Cart;

describe("cart mutations report the new item count", () => {
  beforeEach(() => {
    Object.values(repo).forEach((mock) => mock.mockReset().mockResolvedValue(undefined));
  });

  it("update: replaces the line's quantity", async () => {
    expect(await updateCartItem(cart, { cartItemId: LINE_A, quantity: 4 })).toEqual({ itemCount: 7 });
    expect(await updateCartItem(cart, { cartItemId: LINE_B, quantity: 1 })).toEqual({ itemCount: 3 });
  });

  it("update to 0 removes the line", async () => {
    expect(await updateCartItem(cart, { cartItemId: LINE_B, quantity: 0 })).toEqual({ itemCount: 2 });
  });

  it("update is capped at 99 per line, like the repository", async () => {
    expect(await updateCartItem(cart, { cartItemId: LINE_A, quantity: 500 })).toEqual({ itemCount: 5 - 2 + 99 });
  });

  it("remove: subtracts the line's quantity", async () => {
    expect(await removeFromCart(cart, LINE_B)).toEqual({ itemCount: 2 });
    expect(repo.removeCartItem).toHaveBeenCalledWith(LINE_B, expect.anything());
  });

  it("empty: zero", async () => {
    expect(await emptyCart(cart)).toEqual({ itemCount: 0 });
    expect(repo.clearCart).toHaveBeenCalledWith(cart.id, expect.anything());
  });

  it("refuses lines that are not in the cart, without touching the database", async () => {
    const stranger = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
    await expect(updateCartItem(cart, { cartItemId: stranger, quantity: 1 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(removeFromCart(cart, stranger)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(repo.updateCartItemQuantity).not.toHaveBeenCalled();
    expect(repo.removeCartItem).not.toHaveBeenCalled();
  });

  it("never reports a negative count, even if the cart snapshot was inconsistent", async () => {
    const inconsistent = { ...cart, itemCount: 1 } as Cart;
    expect(await removeFromCart(inconsistent, LINE_B)).toEqual({ itemCount: 0 });
  });
});
