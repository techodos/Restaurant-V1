import { describe, expect, it } from "vitest";
import { forwardOrderStatuses, nextOrderStep } from "@/shared/order-flow";
import { ORDER_STATUS_RANK } from "@/shared/contract/enums";

describe("nextOrderStep (admin one-click button)", () => {
  it("walks an order forward one step", () => {
    expect(nextOrderStep("pending", "delivery")?.status).toBe("confirmed");
    expect(nextOrderStep("confirmed", "pickup")?.status).toBe("preparing");
    expect(nextOrderStep("preparing", "dine_in")?.status).toBe("ready");
  });

  it("sends only delivery orders out for delivery", () => {
    expect(nextOrderStep("ready", "delivery")?.status).toBe("out_for_delivery");
    expect(nextOrderStep("ready", "pickup")?.status).toBe("completed");
    expect(nextOrderStep("ready", "dine_in")?.status).toBe("completed");
    expect(nextOrderStep("out_for_delivery", "delivery")?.status).toBe("completed");
  });

  it("offers nothing for finished orders and never moves backwards", () => {
    expect(nextOrderStep("completed", "delivery")).toBeNull();
    expect(nextOrderStep("cancelled", "pickup")).toBeNull();
    for (const status of ["pending", "confirmed", "preparing", "ready", "out_for_delivery"] as const) {
      for (const type of ["delivery", "pickup", "dine_in"] as const) {
        const next = nextOrderStep(status, type)!;
        expect(ORDER_STATUS_RANK[next.status]).toBeGreaterThan(ORDER_STATUS_RANK[status]);
      }
    }
  });
});

describe("forwardOrderStatuses", () => {
  it("never offers out for delivery on pickup or dine-in orders", () => {
    expect(forwardOrderStatuses("pending", "pickup")).toEqual(["confirmed", "preparing", "ready", "completed"]);
    expect(forwardOrderStatuses("ready", "dine_in")).toEqual(["completed"]);
    expect(forwardOrderStatuses("ready", "delivery")).toEqual(["out_for_delivery", "completed"]);
  });

  it("is forward-only, excludes cancellation, and is empty for finished orders", () => {
    expect(forwardOrderStatuses("preparing", "delivery")).toEqual(["ready", "out_for_delivery", "completed"]);
    expect(forwardOrderStatuses("completed", "delivery")).toEqual([]);
    expect(forwardOrderStatuses("cancelled", "pickup")).toEqual([]);
  });

  it("always contains the usual next step", () => {
    for (const status of ["pending", "confirmed", "preparing", "ready", "out_for_delivery"] as const) {
      for (const type of ["delivery", "pickup", "dine_in"] as const) {
        expect(forwardOrderStatuses(status, type)).toContain(nextOrderStep(status, type)!.status);
      }
    }
  });
});

