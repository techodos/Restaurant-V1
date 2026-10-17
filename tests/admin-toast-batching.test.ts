import { describe, expect, it } from "vitest";
import { composeBatchMessage } from "@/components/admin/use-settled-toast";

describe("row-action toast batching: rapid payment/order/reservation/review clicks consolidate", () => {
  it("a single action keeps its own message", () => {
    expect(composeBatchMessage("Payment for AB12 marked paid.", { count: 1, mixed: false, label: "paid", plural: "payments" })).toBe(
      "Payment for AB12 marked paid.",
    );
  });

  it("several of the same outcome consolidate by label", () => {
    expect(composeBatchMessage("Payment for AB12 marked paid.", { count: 3, mixed: false, label: "paid", plural: "payments" })).toBe(
      "3 payments paid.",
    );
  });

  it("mixed outcomes fall back to a generic count instead of a misleading label", () => {
    expect(composeBatchMessage("Payment for AB12 marked paid.", { count: 4, mixed: true, label: "refunded", plural: "payments" })).toBe(
      "4 payments updated.",
    );
  });
});
