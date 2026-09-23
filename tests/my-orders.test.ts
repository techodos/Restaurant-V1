import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Order } from "@/shared/contract/models";
import type { OrderStatus } from "@/shared/contract/enums";
import { ACTIVE_ORDER_STATUSES } from "@/shared/contract/enums";

const listVisitorOrders = vi.hoisted(() => vi.fn());
vi.mock("@/server/repositories/orders", () => ({
  getOrderByNumber: vi.fn(),
  getOrderForAccessGrant: vi.fn(),
  listVisitorOrders,
}));

import { getMyOrders } from "@/server/services/orders";

const order = (id: string, status: OrderStatus): Order => ({ id, status, orderNumber: `ORD-${id}` }) as Order;

beforeEach(() => listVisitorOrders.mockReset());

describe("active order statuses", () => {
  it("are exactly the non-terminal statuses of the project", () => {
    expect([...ACTIVE_ORDER_STATUSES]).toEqual(["pending", "confirmed", "preparing", "ready", "out_for_delivery"]);
  });
});

describe("getMyOrders", () => {
  it("signed-in customer: splits current orders from history", async () => {
    listVisitorOrders.mockResolvedValue({
      orders: [order("1", "preparing"), order("2", "completed"), order("3", "cancelled"), order("4", "out_for_delivery")],
      history: true,
    });
    const result = await getMyOrders("r", { customerId: "c1", cartToken: "t" });
    expect(result.signedIn).toBe(true);
    expect(result.current.map((o) => o.id)).toEqual(["1", "4"]);
    expect(result.previous.map((o) => o.id)).toEqual(["2", "3"]);
  });

  it("guest: only current orders, and never history even if the query returned some", async () => {
    listVisitorOrders.mockResolvedValue({ orders: [order("1", "pending"), order("2", "completed")], history: false });
    const result = await getMyOrders("r", { cartToken: "guest-token" });
    expect(result.signedIn).toBe(false);
    expect(result.current.map((o) => o.id)).toEqual(["1"]);
    expect(result.previous).toEqual([]);
  });

  it("guest without an order: empty state, no history", async () => {
    listVisitorOrders.mockResolvedValue({ orders: [], history: false });
    expect(await getMyOrders("r", { cartToken: "guest-token" })).toEqual({ signedIn: false, current: [], previous: [] });
  });

  it("asks the repository with the visitor's own identity only", async () => {
    listVisitorOrders.mockResolvedValue({ orders: [], history: false });
    const visitor = { customerId: null, cartToken: "mine" };
    await getMyOrders("restaurant-1", visitor);
    expect(listVisitorOrders).toHaveBeenCalledWith("restaurant-1", visitor);
  });
});
