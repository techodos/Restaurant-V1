import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyWebhookSignature } from "@/server/integrations/stripe";

/** DB-free: webhook signature verification is the correctness-critical, unreachable-without-a-real-account part. */
describe("Stripe webhook signature", () => {
  const secret = "whsec_test_secret";

  function sign(rawBody: string, timestamp: number): string {
    const hmac = createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
    return `t=${timestamp},v1=${hmac}`;
  }

  function completedEventBody(overrides: Partial<{ paymentStatus: string; orderId: string; orderNumber: string; restaurantId: string }> = {}): string {
    return JSON.stringify({
      type: "checkout.session.completed",
      data: {
        object: {
          payment_status: overrides.paymentStatus ?? "paid",
          payment_intent: "pi_123",
          metadata: {
            orderId: overrides.orderId ?? "order-1",
            orderNumber: overrides.orderNumber ?? "ORD-1",
            restaurantId: overrides.restaurantId ?? "rest-1",
          },
        },
      },
    });
  }

  it("accepts a correctly signed event and extracts the session", () => {
    const body = completedEventBody();
    const header = sign(body, Math.floor(Date.now() / 1000));
    const result = verifyWebhookSignature(body, header, secret);
    expect(result.valid).toBe(true);
    expect(result.type).toBe("checkout.session.completed");
    expect(result.session).toEqual({
      paid: true,
      restaurantId: "rest-1",
      orderId: "order-1",
      orderNumber: "ORD-1",
      paymentIntentId: "pi_123",
    });
  });

  it("rejects a body that does not match the signature (tampered payload)", () => {
    const body = completedEventBody();
    const header = sign(body, Math.floor(Date.now() / 1000));
    const tamperedBody = completedEventBody({ paymentStatus: "unpaid" });
    const result = verifyWebhookSignature(tamperedBody, header, secret);
    expect(result.valid).toBe(false);
    expect(result.session).toBeNull();
  });

  it("rejects the wrong secret", () => {
    const body = completedEventBody();
    const header = sign(body, Math.floor(Date.now() / 1000));
    const result = verifyWebhookSignature(body, header, "whsec_wrong");
    expect(result.valid).toBe(false);
  });

  it("rejects a stale timestamp (replay protection)", () => {
    const body = completedEventBody();
    const staleTimestamp = Math.floor(Date.now() / 1000) - 3600; // 1h old, default tolerance is 300s
    const header = sign(body, staleTimestamp);
    const result = verifyWebhookSignature(body, header, secret);
    expect(result.valid).toBe(false);
  });

  it("ignores an event type it does not act on, but still reports it valid", () => {
    const body = JSON.stringify({ type: "payment_intent.created", data: { object: {} } });
    const header = sign(body, Math.floor(Date.now() / 1000));
    const result = verifyWebhookSignature(body, header, secret);
    expect(result.valid).toBe(true);
    expect(result.session).toBeNull();
  });
});
