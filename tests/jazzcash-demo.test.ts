import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEMO_CHECKOUT_PATH,
  buildDemoReturn,
  buildWalletCheckout,
  demoOutcome,
  validateDemoInput,
  verifyRequestSignature,
  verifyReturn,
} from "@/server/integrations/jazzcash";

/** DB-free: the JazzCash demo simulator (JAZZCASH_ENV=demo) — pure functions and the route that serves it. */

const demo = { merchantId: "DEMO", password: "demo", integritySalt: "jazzcash-demo-salt", env: "demo" as const };
let jazzcashConfig: typeof demo | null = demo;

vi.mock("@/server/config", () => ({
  config: {
    payments: {
      get jazzcash() {
        return jazzcashConfig;
      },
    },
  },
}));
vi.mock("@/server/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

const { POST } = await import("@/app/(site)/checkout/pay/jazzcash/demo/route");

function checkout() {
  return buildWalletCheckout(demo, {
    amount: "7018.00",
    orderId: "5fe06da1-0780-4e13-8f14-b73599a952be",
    orderNumber: "L5JY-APGUU",
    description: "Order L5JY-APGUU",
    returnUrl: "https://shop.test/checkout/pay/jazzcash",
  });
}

function post(fields: Record<string, string>): Promise<Response> {
  return POST(new Request("https://shop.test/checkout/pay/jazzcash/demo", { method: "POST", body: new URLSearchParams(fields) }));
}

/** The hidden fields of the auto-submitting return form the simulator renders. */
function returnedFields(html: string): Record<string, string> {
  const form = html.slice(html.indexOf('id="jc-return"'));
  const unescape = (v: string) => v.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
  return Object.fromEntries(Array.from(form.matchAll(/name="([^"]+)" value="([^"]*)"/g), (m) => [m[1]!, unescape(m[2]!)]));
}

describe("JazzCash demo simulator — logic", () => {
  it("sends checkout to the in-app simulator in demo mode", () => {
    expect(checkout().actionUrl).toBe(DEMO_CHECKOUT_PATH);
  });

  it("accepts only requests we signed", () => {
    const { fields } = checkout();
    expect(verifyRequestSignature(fields, demo.integritySalt)).toBe(true);
    expect(verifyRequestSignature({ ...fields, pp_Amount: "1" }, demo.integritySalt)).toBe(false);
    expect(verifyRequestSignature({ ...fields, pp_ReturnURL: "https://evil.test/" }, demo.integritySalt)).toBe(false);
  });

  it("maps JazzCash sandbox's test accounts to success, failure and pending", () => {
    const now = new Date();
    const outcome = (mobile: string, cnic = "345678", cancelled = false) => demoOutcome({ mobile, cnic, cancelled, expiry: undefined, now }).code;
    expect(outcome("03123456789")).toBe("000");
    expect(outcome("03123456780")).toBe("199");
    expect(outcome("03001234567")).toBe("157");
    expect(outcome("03123456789", "345678", true)).toBe("199");
  });

  it("fails an expired request", () => {
    expect(demoOutcome({ mobile: "03123456789", cnic: "345678", cancelled: false, expiry: "20200101000000", now: new Date() }).code).toBe("199");
  });

  it("validates what the customer types", () => {
    expect(validateDemoInput("03123456789", "345678")).toBeNull();
    expect(validateDemoInput("3123456789", "345678")).toMatch(/mobile/i);
    expect(validateDemoInput("03123456789", "34567")).toMatch(/CNIC/);
  });

  it("signs a return the real return route accepts and that carries the order back", () => {
    const { fields } = checkout();
    const result = verifyReturn(buildDemoReturn(fields, { code: "000", message: "ok" }, demo.integritySalt), demo.integritySalt);
    expect(result).toMatchObject({ valid: true, success: true, pending: false, orderNumber: "L5JY-APGUU", orderId: "5fe06da1-0780-4e13-8f14-b73599a952be" });
    expect(result.transactionId).toMatch(/^DEMO\d+$/);
  });
});

describe("JazzCash demo simulator — route", () => {
  beforeEach(() => {
    jazzcashConfig = demo;
  });

  it("shows the payment page for a signed checkout request", async () => {
    const response = await post(checkout().fields);
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain("Pay now");
    expect(html).toContain("Rs. 7,018.00");
    expect(html).toContain("DEMO MODE");
  });

  it("auto-posts a verified success to the return URL", async () => {
    const response = await post({ ...checkout().fields, demo_action: "pay", demo_mobile: "0312 345 6789", demo_cnic: "345678" });
    const html = await response.text();
    expect(html).toContain('action="https://shop.test/checkout/pay/jazzcash"');
    expect(verifyReturn(returnedFields(html), demo.integritySalt)).toMatchObject({ valid: true, success: true });
  });

  it("returns failure and pending results the same way", async () => {
    const failed = returnedFields(await (await post({ ...checkout().fields, demo_action: "pay", demo_mobile: "03123456780", demo_cnic: "345678" })).text());
    expect(verifyReturn(failed, demo.integritySalt)).toMatchObject({ valid: true, success: false, pending: false });
    const pending = returnedFields(await (await post({ ...checkout().fields, demo_action: "pay", demo_mobile: "03001234567", demo_cnic: "345678" })).text());
    expect(verifyReturn(pending, demo.integritySalt)).toMatchObject({ valid: true, pending: true });
    const cancelled = returnedFields(await (await post({ ...checkout().fields, demo_action: "cancel" })).text());
    expect(verifyReturn(cancelled, demo.integritySalt)).toMatchObject({ valid: true, success: false });
  });

  it("re-shows the page with an error for bad input, without returning anything", async () => {
    const html = await (await post({ ...checkout().fields, demo_action: "pay", demo_mobile: "123", demo_cnic: "345678" })).text();
    expect(html).toContain('role="alert"');
    expect(html).not.toContain('id="jc-return"');
  });

  it("refuses a tampered request", async () => {
    const response = await post({ ...checkout().fields, pp_Amount: "100", demo_action: "pay", demo_mobile: "03123456789", demo_cnic: "345678" });
    expect(response.status).toBe(400);
    expect(await response.text()).not.toContain('id="jc-return"');
  });

  it("does not exist unless demo mode is on", async () => {
    jazzcashConfig = null;
    expect((await post(checkout().fields)).status).toBe(404);
    jazzcashConfig = { ...demo, env: "sandbox" } as unknown as typeof demo;
    expect((await post(checkout().fields)).status).toBe(404);
  });
});
