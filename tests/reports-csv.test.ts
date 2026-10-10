import { describe, expect, it } from "vitest";
import { buildSalesCsv, csvText } from "@/shared/reports";

describe("sales CSV export", () => {
  it("a customer name that looks like a formula is exported as plain text", () => {
    for (const name of ["=HYPERLINK(\"http://x\")", "+1+cmd|' /C calc'!A0", "-2+3", "@SUM(A1)"]) {
      expect(csvText(name).startsWith("'")).toBe(true);
    }
    expect(csvText("Noor Ahmed")).toBe("Noor Ahmed");

    const csv = buildSalesCsv(
      [
        {
          orderNumber: "ABCD-EFGHJ", createdAt: "2026-10-09T10:00:00Z", status: "completed", orderType: "pickup",
          customerName: "=cmd|' /C calc'!A0", customerPhone: "+923001234567", itemCount: 2,
          subtotal: "100.00", discountAmount: "0.00", taxAmount: "0.00", total: "100.00", paymentMethod: "cash",
        },
      ] as never,
      { locale: "en", timezone: "Asia/Karachi" },
    );
    const row = csv.split("\r\n")[1]!;
    expect(row).toContain("'=cmd|' /C calc'!A0");
    expect(row).not.toMatch(/,=cmd/);
  });
});
