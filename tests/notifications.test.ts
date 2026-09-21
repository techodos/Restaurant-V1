import { generateKeyPairSync } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Order } from "@/shared/contract/models";
import { restaurantFeaturesSchema } from "@/shared/contract/settings";
import { notificationChannelsEnabled } from "@/shared/notification-channels";
import { signOrderAccessToken, verifyOrderAccessToken, verifyCustomerSession, verifyStaffSession } from "@/server/auth/tokens";
import { createFcmProvider } from "@/server/integrations/fcm";
import { createResendProvider } from "@/server/integrations/resend";
import { CHANNEL_RULES, channelsFor, pushCopyFor } from "@/server/notifications/rules";
import { renderOrderCompletedEmail } from "@/server/notifications/templates/order-completed";
import { renderOrderConfirmationEmail } from "@/server/notifications/templates/order-confirmation";
import type {
  EmailMessage,
  EmailProvider,
  NotificationEventRecord,
  NotificationOrderContext,
  PushMessage,
  PushOutcome,
  PushProvider,
} from "@/server/notifications/types";
import { NotificationService, type NotificationStore } from "@/server/services/notifications";
import type { EventOutcome } from "@/server/repositories/notifications";

/**
 * Notification behaviour without a database: the dispatcher runs against an
 * in-memory store and fake providers, so every rule in the brief is checkable
 * here (who gets what, once, and never across restaurants).
 */

const RESTAURANT_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const RESTAURANT_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const SITE = "https://shop.example.com";

function makeContext(overrides: { restaurantId?: string; name?: string; slug?: string; order?: Partial<Order> } = {}): NotificationOrderContext {
  const restaurantId = overrides.restaurantId ?? RESTAURANT_A;
  const order = {
    id: `order-${restaurantId.slice(0, 4)}`,
    restaurantId,
    customerId: `customer-${restaurantId.slice(0, 4)}`,
    orderNumber: "ORD-2609-01001",
    orderType: "delivery",
    status: "pending",
    customerName: "Sana Malik",
    customerEmail: "sana@example.com",
    customerPhone: "+92 300 1112223",
    deliveryAddress: { line1: "12 Canal Road", area: "Gulberg", city: "Lahore" },
    tableNumber: null,
    locationName: null,
    subtotal: "2400.00",
    discountAmount: "0.00",
    deliveryFee: "150.00",
    taxAmount: "0.00",
    serviceFee: "0.00",
    tipAmount: "0.00",
    total: "2550.00",
    estimatedReadyAt: null,
    items: [
      {
        id: "i1", orderId: "o", menuItemId: null, variantId: null, itemName: "Margherita", variantName: "Large",
        quantity: 2, unitPrice: "1200.00", addonsTotal: "0.00", lineTotal: "2400.00", specialInstructions: null, addons: [],
      },
    ],
    ...overrides.order,
  } as Order;
  return {
    restaurant: {
      id: restaurantId,
      name: overrides.name ?? "Bella Napoli",
      slug: overrides.slug ?? "bella-napoli",
      logoUrl: null,
      primaryColor: "#c2410c",
      email: "hello@bella.example",
      phone: "+92 42 111 000",
      currencySymbol: "Rs",
      locale: "en",
      timezone: "Asia/Karachi",
      reviewsEnabled: true,
      channels: { email: true, push: true },
    },
    order,
  };
}

function makeEvent(eventType: string, overrides: Partial<NotificationEventRecord> = {}): NotificationEventRecord {
  return {
    id: `evt-${eventType}`,
    restaurantId: RESTAURANT_A,
    orderId: "order-aaaa",
    customerId: "customer-aaaa",
    eventType,
    attempts: 1,
    emailState: null,
    pushState: null,
    ...overrides,
  };
}

function harness(options: {
  context?: NotificationOrderContext | null;
  contexts?: Record<string, NotificationOrderContext>;
  tokens?: string[];
  emailResult?: Awaited<ReturnType<EmailProvider["send"]>>;
  pushOutcomes?: (tokens: readonly string[]) => PushOutcome[];
  email?: boolean;
  push?: boolean;
} = {}) {
  const emails: EmailMessage[] = [];
  const pushes: { tokens: readonly string[]; message: PushMessage }[] = [];
  const saved: { eventId: string; outcome: EventOutcome }[] = [];
  const deactivated: { restaurantId: string; tokens: readonly string[] }[] = [];
  const tokenLookups: { restaurantId: string; customerId: string }[] = [];

  const emailProvider: EmailProvider = {
    name: "fake-email",
    async send(message) {
      emails.push(message);
      return options.emailResult ?? { ok: true, id: "email-1" };
    },
  };
  const pushProvider: PushProvider = {
    name: "fake-push",
    async send(tokens, message) {
      pushes.push({ tokens, message });
      return options.pushOutcomes ? options.pushOutcomes(tokens) : tokens.map((token) => ({ token, ok: true as const }));
    },
  };
  const store: NotificationStore = {
    claimDue: async () => [],
    loadContext: async (event) =>
      options.contexts ? options.contexts[event.restaurantId] ?? null : options.context === undefined ? makeContext() : options.context,
    activeTokens: async (restaurantId, customerId) => {
      tokenLookups.push({ restaurantId, customerId });
      return options.tokens ?? ["token-1"];
    },
    deactivateTokens: async (restaurantId, tokens) => {
      deactivated.push({ restaurantId, tokens });
    },
    saveOutcome: async (event, outcome) => {
      saved.push({ eventId: event.id, outcome });
    },
  };
  const service = new NotificationService({
    email: options.email === false ? null : emailProvider,
    push: options.push === false ? null : pushProvider,
    siteUrl: SITE,
    maxAgeHours: 24,
    store,
    signAccessToken: async (grant) => `signed.${grant.orderId}`,
  });
  return { service, emails, pushes, saved, deactivated, tokenLookups };
}

afterEach(() => vi.unstubAllGlobals());

describe("notification rules", () => {
  it("matches the agreed strategy exactly", () => {
    expect(CHANNEL_RULES).toEqual({
      placed: { email: false, push: false },
      pending: { email: false, push: false },
      confirmed: { email: true, push: false },
      preparing: { email: false, push: true },
      ready: { email: false, push: true },
      out_for_delivery: { email: false, push: true },
      completed: { email: true, push: true },
      cancelled: { email: false, push: true },
    });
    expect(channelsFor("something-new")).toEqual({ email: false, push: false });
  });

  it("uses the requested push wording", () => {
    const input = { orderNumber: "#1234", restaurantName: "Restaurant XYZ", orderType: "pickup" as const };
    expect(pushCopyFor("preparing", input)).toEqual({
      title: "Your order is being prepared",
      body: "Order #1234 is now being prepared by Restaurant XYZ.",
    });
    expect(pushCopyFor("ready", input)?.body).toBe("Order #1234 is ready for pickup.");
    expect(pushCopyFor("out_for_delivery", input)).toEqual({ title: "Your order is on the way", body: "Order #1234 is out for delivery." });
    expect(pushCopyFor("completed", input)).toEqual({
      title: "Order completed",
      body: "Your order #1234 has been completed. We hope you enjoyed your meal!",
    });
    expect(pushCopyFor("cancelled", input)).toEqual({ title: "Order cancelled", body: "Your order #1234 has been cancelled." });
    expect(pushCopyFor("placed", input)).toBeNull();
  });
});

describe("order confirmation email", () => {
  it("is not sent when the order is placed, only when it is confirmed", async () => {
    const h = harness();
    const status = await h.service.processEvent(makeEvent("placed"));
    expect(status).toBe("done");
    expect(h.emails).toHaveLength(0);
    expect(h.pushes).toHaveLength(0);
    expect(h.saved[0]!.outcome).toMatchObject({ status: "done", emailState: "skipped", pushState: "skipped" });
  });

  it("is sent once when the order is confirmed, with order details and a tracking link, and no push", async () => {
    const h = harness();
    const status = await h.service.processEvent(makeEvent("confirmed"));

    expect(status).toBe("done");
    expect(h.emails).toHaveLength(1);
    expect(h.pushes).toHaveLength(0);
    const mail = h.emails[0]!;
    expect(mail.to).toBe("sana@example.com");
    expect(mail.fromName).toBe("Bella Napoli");
    expect(mail.replyTo).toBe("hello@bella.example");
    expect(mail.subject).toContain("ORD-2609-01001");
    expect(mail.html).toContain("2 &times; Margherita");
    expect(mail.html).toContain("RS 2,550.00");
    expect(mail.html).toContain("12 Canal Road");
    expect(mail.html).toContain(`${SITE}/r/bella-napoli/order/ORD-2609-01001?t=signed.order-aaaa`);
    expect(mail.idempotencyKey).toBe("order-order-aaaa-confirmed-email");
    expect(h.saved[0]!.outcome).toMatchObject({ status: "done", emailState: "sent", pushState: "skipped" });
  });

  it("is skipped when the customer left no email", async () => {
    const h = harness({ context: makeContext({ order: { customerEmail: null } }) });
    await h.service.processEvent(makeEvent("confirmed"));
    expect(h.emails).toHaveLength(0);
    expect(h.saved[0]!.outcome).toMatchObject({ status: "done", emailState: "skipped" });
  });

  it("does not fail the order flow when the provider is down: the event is retried later", async () => {
    const h = harness({ emailResult: { ok: false, retryable: true, error: "resend 503" } });
    const status = await h.service.processEvent(makeEvent("confirmed", { attempts: 1 }));

    expect(status).toBe("pending");
    const outcome = h.saved[0]!.outcome;
    expect(outcome.emailState).toBeNull();
    expect(outcome.nextAttemptAt!.getTime()).toBeGreaterThan(Date.now());
    expect(outcome.lastError).toContain("resend 503");
  });

  it("gives up after the maximum number of attempts", async () => {
    const h = harness({ emailResult: { ok: false, retryable: true, error: "timeout" } });
    const status = await h.service.processEvent(makeEvent("confirmed", { attempts: 5 }));
    expect(status).toBe("dead");
    expect(h.saved[0]!.outcome).toMatchObject({ status: "dead", emailState: "failed" });
  });

  it("does not retry a permanent rejection", async () => {
    const h = harness({ emailResult: { ok: false, retryable: false, error: "resend 422 invalid to" } });
    const status = await h.service.processEvent(makeEvent("confirmed"));
    expect(status).toBe("done");
    expect(h.saved[0]!.outcome).toMatchObject({ emailState: "failed" });
  });

  it("is never sent twice: a retry skips a channel that already succeeded", async () => {
    const h = harness();
    await h.service.processEvent(makeEvent("confirmed", { emailState: "sent", attempts: 2 }));
    expect(h.emails).toHaveLength(0);
  });

  it("is skipped, not failed, when no email provider is configured", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const h = harness({ email: false });
    const status = await h.service.processEvent(makeEvent("confirmed"));
    expect(status).toBe("done");
    expect(h.saved[0]!.outcome).toMatchObject({ emailState: "skipped" });
    warn.mockRestore();
  });
});

describe("push notifications", () => {
  for (const status of ["preparing", "ready", "out_for_delivery", "cancelled"] as const) {
    it(`${status}: push only, no email`, async () => {
      const h = harness();
      await h.service.processEvent(makeEvent(status));
      expect(h.emails).toHaveLength(0);
      expect(h.pushes).toHaveLength(1);
      expect(h.pushes[0]!.message.data).toMatchObject({ status, restaurantId: RESTAURANT_A, orderNumber: "ORD-2609-01001" });
      expect(h.saved[0]!.outcome).toMatchObject({ status: "done", emailState: "skipped", pushState: "sent" });
    });
  }

  it("confirmed sends the email but no push", async () => {
    const h = harness();
    await h.service.processEvent(makeEvent("confirmed"));
    expect(h.emails).toHaveLength(1);
    expect(h.pushes).toHaveLength(0);
    expect(h.saved[0]!.outcome).toMatchObject({ status: "done", emailState: "sent", pushState: "skipped" });
  });

  it("sends to every device of the customer, looked up under the order's own restaurant", async () => {
    const h = harness({ tokens: ["phone", "laptop"] });
    await h.service.processEvent(makeEvent("preparing"));
    expect(h.pushes[0]!.tokens).toEqual(["phone", "laptop"]);
    expect(h.tokenLookups).toEqual([{ restaurantId: RESTAURANT_A, customerId: "customer-aaaa" }]);
  });

  it("skips (does not fail) when the customer has no registered device", async () => {
    const h = harness({ tokens: [] });
    await h.service.processEvent(makeEvent("preparing"));
    expect(h.pushes).toHaveLength(0);
    expect(h.saved[0]!.outcome).toMatchObject({ status: "done", pushState: "skipped" });
  });

  it("deactivates tokens FCM reports as unregistered and still counts the delivery", async () => {
    const h = harness({
      tokens: ["good", "stale"],
      pushOutcomes: (tokens) =>
        tokens.map((token) =>
          token === "stale"
            ? { token, ok: false as const, invalidToken: true, retryable: false, error: "UNREGISTERED" }
            : { token, ok: true as const },
        ),
    });
    await h.service.processEvent(makeEvent("ready"));
    expect(h.deactivated).toEqual([{ restaurantId: RESTAURANT_A, tokens: ["stale"] }]);
    expect(h.saved[0]!.outcome).toMatchObject({ pushState: "sent", status: "done" });
  });

  it("retries a transient FCM failure without touching the order", async () => {
    const h = harness({
      pushOutcomes: (tokens) => tokens.map((token) => ({ token, ok: false as const, invalidToken: false, retryable: true, error: "fcm 503" })),
    });
    const status = await h.service.processEvent(makeEvent("preparing"));
    expect(status).toBe("pending");
    expect(h.saved[0]!.outcome.pushState).toBeNull();
  });
});

describe("completed order", () => {
  it("sends the push AND a completion email with the review call to action", async () => {
    const h = harness({ context: makeContext({ order: { status: "completed" } }) });
    await h.service.processEvent(makeEvent("completed"));

    expect(h.pushes).toHaveLength(1);
    expect(h.pushes[0]!.message.title).toBe("Order completed");
    expect(h.emails).toHaveLength(1);
    const mail = h.emails[0]!;
    expect(mail.html).toContain("Rate Your Order");
    expect(mail.html).toContain(`${SITE}/r/bella-napoli/reviews?order=ORD-2609-01001&amp;t=signed.order-aaaa`);
    expect(mail.text).toContain("/reviews?order=ORD-2609-01001&t=signed.order-aaaa");
    expect(mail.html).toContain("RS 2,550.00");
    expect(h.saved[0]!.outcome).toMatchObject({ status: "done", emailState: "sent", pushState: "sent" });
  });

  it("does not resend the completion email or push when the event is retried after success", async () => {
    const h = harness({ context: makeContext({ order: { status: "completed" } }) });
    await h.service.processEvent(makeEvent("completed", { emailState: "sent", pushState: "sent", attempts: 2 }));
    expect(h.emails).toHaveLength(0);
    expect(h.pushes).toHaveLength(0);
  });

  it("omits the review button when the restaurant switched reviews off", async () => {
    const context = makeContext({ order: { status: "completed" } });
    context.restaurant.reviewsEnabled = false;
    const h = harness({ context });
    await h.service.processEvent(makeEvent("completed"));
    expect(h.emails[0]!.html).not.toContain("Rate Your Order");
  });

  it("a cancelled order never gets the completion email", async () => {
    const h = harness({ context: makeContext({ order: { status: "cancelled" } }) });
    await h.service.processEvent(makeEvent("cancelled"));
    expect(h.emails).toHaveLength(0);
  });
});

describe("per-restaurant notification switches (restaurants.features)", () => {
  it("defaults to everything on when the keys are missing", () => {
    const features = restaurantFeaturesSchema.parse({});
    expect(features.notifications).toBe(true);
    expect(notificationChannelsEnabled(features)).toEqual({ email: true, push: true });
  });

  it("reads the master switch and the channel flags", () => {
    const parse = (value: unknown) => notificationChannelsEnabled(restaurantFeaturesSchema.parse(value));
    expect(parse({ notifications: false, notificationChannels: { emailNotify: true, pushNotify: true } })).toEqual({ email: false, push: false });
    expect(parse({ notifications: true, notificationChannels: { emailNotify: true, pushNotify: false } })).toEqual({ email: true, push: false });
    expect(parse({ notifications: true, notificationChannels: { emailNotify: false, pushNotify: true } })).toEqual({ email: false, push: true });
    expect(parse({ notifications: true, notificationChannels: { pushNotify: false } })).toEqual({ email: true, push: false });
  });

  it("sends no email when emailNotify is off, but still sends the push", async () => {
    const context = makeContext({ order: { status: "completed" } });
    context.restaurant.channels = { email: false, push: true };
    const h = harness({ context });
    await h.service.processEvent(makeEvent("completed"));
    expect(h.emails).toHaveLength(0);
    expect(h.pushes).toHaveLength(1);
    expect(h.saved[0]!.outcome).toMatchObject({ status: "done", emailState: "skipped", pushState: "sent" });
  });

  it("sends no push when pushNotify is off, but still sends the email", async () => {
    const context = makeContext({ order: { status: "completed" } });
    context.restaurant.channels = { email: true, push: false };
    const h = harness({ context });
    await h.service.processEvent(makeEvent("completed"));
    expect(h.emails).toHaveLength(1);
    expect(h.pushes).toHaveLength(0);
    expect(h.tokenLookups).toHaveLength(0);
    expect(h.saved[0]!.outcome).toMatchObject({ status: "done", emailState: "sent", pushState: "skipped" });
  });

  it("sends nothing when notifications are switched off for the restaurant", async () => {
    const context = makeContext({ order: { status: "completed" } });
    context.restaurant.channels = notificationChannelsEnabled(restaurantFeaturesSchema.parse({ notifications: false }));
    const h = harness({ context });
    const status = await h.service.processEvent(makeEvent("completed"));
    expect(status).toBe("done");
    expect(h.emails).toHaveLength(0);
    expect(h.pushes).toHaveLength(0);
    expect(h.saved[0]!.outcome).toMatchObject({ emailState: "skipped", pushState: "skipped" });
  });

  it("one restaurant's switches do not affect another", async () => {
    const off = makeContext({ restaurantId: RESTAURANT_A });
    off.restaurant.channels = { email: false, push: false };
    const on = makeContext({ restaurantId: RESTAURANT_B, name: "Sakura House", slug: "sakura", order: { orderNumber: "ORD-2609-09009" } });
    const h = harness({ contexts: { [RESTAURANT_A]: off, [RESTAURANT_B]: on } });
    await h.service.processEvent(makeEvent("confirmed", { id: "a", restaurantId: RESTAURANT_A }));
    await h.service.processEvent(makeEvent("confirmed", { id: "b", restaurantId: RESTAURANT_B, orderId: "order-bbbb" }));
    expect(h.emails).toHaveLength(1);
    expect(h.emails[0]!.html).toContain("Sakura House");
  });
});

describe("multi-restaurant isolation", () => {
  it("a notification only ever carries its own restaurant's data", async () => {
    const contexts = {
      [RESTAURANT_A]: makeContext({ restaurantId: RESTAURANT_A, name: "Bella Napoli", slug: "bella-napoli" }),
      [RESTAURANT_B]: makeContext({
        restaurantId: RESTAURANT_B,
        name: "Sakura House",
        slug: "sakura",
        order: { customerEmail: "kenji@example.com", customerName: "Kenji", orderNumber: "ORD-2609-09009" },
      }),
    };
    const h = harness({ contexts });
    await h.service.processEvent(makeEvent("confirmed", { id: "a", restaurantId: RESTAURANT_A }));
    await h.service.processEvent(makeEvent("confirmed", { id: "b", restaurantId: RESTAURANT_B, orderId: "order-bbbb" }));

    const [a, b] = h.emails;
    expect(a!.html).toContain("Bella Napoli");
    expect(a!.html).not.toContain("Sakura");
    expect(a!.to).toBe("sana@example.com");
    expect(b!.html).toContain("Sakura House");
    expect(b!.html).not.toContain("Bella Napoli");
    expect(b!.html).toContain("/r/sakura/order/ORD-2609-09009");
    expect(b!.to).toBe("kenji@example.com");
  });

  it("drops an event whose order does not belong to the event's restaurant", async () => {
    const h = harness({ context: makeContext({ restaurantId: RESTAURANT_B }) });
    const status = await h.service.processEvent(makeEvent("confirmed", { restaurantId: RESTAURANT_A }));
    expect(status).toBe("dead");
    expect(h.emails).toHaveLength(0);
    expect(h.pushes).toHaveLength(0);
  });

  it("drops an event whose order no longer exists", async () => {
    const h = harness({ context: null });
    expect(await h.service.processEvent(makeEvent("preparing"))).toBe("dead");
    expect(h.pushes).toHaveLength(0);
  });
});

describe("email templates", () => {
  const baseInput = () => {
    const { restaurant, order } = makeContext();
    return { restaurant, order, orderUrl: `${SITE}/r/bella-napoli/order/X` };
  };

  it("escapes customer-controlled text", () => {
    const input = baseInput();
    input.order.customerName = "<script>alert(1)</script> Eve";
    input.order.items![0]!.itemName = `Pizza "<b>"`;
    const { html } = renderOrderConfirmationEmail(input);
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<b>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("ignores unsafe brand colours and logo URLs", () => {
    const input = baseInput();
    input.restaurant.primaryColor = "red;background:url(javascript:alert(1))";
    input.restaurant.logoUrl = "javascript:alert(1)";
    const { html } = renderOrderConfirmationEmail(input);
    expect(html).not.toContain("javascript:");
    expect(html).toContain("#b45309");
  });

  it("is responsive (viewport meta, fluid 600px container) and has a plain-text alternative", () => {
    const mail = renderOrderCompletedEmail({ ...baseInput(), reviewUrl: `${SITE}/r/bella-napoli/reviews?order=X` });
    expect(mail.html).toContain('name="viewport"');
    expect(mail.html).toContain("max-width:600px");
    expect(mail.text).toContain("Rate your order:");
  });
});

describe("order access tokens", () => {
  it("round-trips and names exactly one order", async () => {
    const token = await signOrderAccessToken({ orderId: "o-1", restaurantId: RESTAURANT_A });
    expect(await verifyOrderAccessToken(token)).toEqual({ orderId: "o-1", restaurantId: RESTAURANT_A });
  });

  it("rejects tampered, missing and foreign tokens", async () => {
    const token = await signOrderAccessToken({ orderId: "o-1", restaurantId: RESTAURANT_A });
    expect(await verifyOrderAccessToken(`${token}x`)).toBeNull();
    expect(await verifyOrderAccessToken("")).toBeNull();
    expect(await verifyOrderAccessToken(undefined)).toBeNull();
  });

  it("can never be used as a staff or customer session", async () => {
    const token = await signOrderAccessToken({ orderId: "o-1", restaurantId: RESTAURANT_A });
    expect(await verifyStaffSession(token)).toBeNull();
    expect(await verifyCustomerSession(token)).toBeNull();
  });
});

describe("Resend provider", () => {
  function stubFetch(status: number, body: unknown) {
    const calls: { url: string; init: RequestInit }[] = [];
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response(JSON.stringify(body), { status });
    });
    return calls;
  }
  const message: EmailMessage = {
    to: "sana@example.com",
    fromName: 'Bella "Napoli" <x>',
    replyTo: "hello@bella.example",
    subject: "Hi",
    html: "<p>Hi</p>",
    text: "Hi",
    idempotencyKey: "order-1-placed-email",
  };

  it("posts with the bearer key and idempotency key, using the restaurant as sender name", async () => {
    const calls = stubFetch(200, { id: "re_123" });
    const provider = createResendProvider({ apiKey: "re_secret", fromAddress: "orders@platform.example" });
    expect(await provider.send(message)).toEqual({ ok: true, id: "re_123" });

    const headers = calls[0]!.init.headers as Record<string, string>;
    expect(calls[0]!.url).toBe("https://api.resend.com/emails");
    expect(headers.Authorization).toBe("Bearer re_secret");
    expect(headers["Idempotency-Key"]).toBe("order-1-placed-email");
    const payload = JSON.parse(String(calls[0]!.init.body));
    expect(payload.from).toBe('"Bella Napoli x" <orders@platform.example>');
    expect(payload.reply_to).toBe("hello@bella.example");
  });

  it("classifies failures: 429/5xx retryable, other 4xx permanent", async () => {
    const provider = createResendProvider({ apiKey: "k", fromAddress: "a@b.co" });
    stubFetch(429, { message: "slow down" });
    expect(await provider.send(message)).toMatchObject({ ok: false, retryable: true });
    stubFetch(422, { message: "bad address" });
    expect(await provider.send(message)).toMatchObject({ ok: false, retryable: false });
  });

  it("treats a network error as retryable", async () => {
    vi.stubGlobal("fetch", async () => {
      throw new Error("ECONNRESET");
    });
    const provider = createResendProvider({ apiKey: "k", fromAddress: "a@b.co" });
    expect(await provider.send(message)).toMatchObject({ ok: false, retryable: true });
  });
});

describe("FCM provider", () => {
  const { privateKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
    publicKeyEncoding: { type: "spki", format: "pem" },
  });

  it("authenticates with the service account, sends per token, and flags unregistered tokens", async () => {
    const calls: { url: string; body: string }[] = [];
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      const body = String(init.body);
      calls.push({ url, body });
      if (url.includes("oauth2.googleapis.com")) {
        return new Response(JSON.stringify({ access_token: "ya29.test", expires_in: 3600 }), { status: 200 });
      }
      if (body.includes('"token":"dead"')) {
        return new Response(
          JSON.stringify({ error: { status: "NOT_FOUND", message: "Requested entity was not found.", details: [{ errorCode: "UNREGISTERED" }] } }),
          { status: 404 },
        );
      }
      return new Response(JSON.stringify({ name: "projects/p/messages/1" }), { status: 200 });
    });

    const provider = createFcmProvider({ projectId: "demo-project", clientEmail: "svc@demo.iam.gserviceaccount.com", privateKey });
    const outcomes = await provider.send(["alive", "dead"], {
      title: "Your order is ready",
      body: "Order ORD-1 is ready",
      link: "https://shop.example.com/r/x/order/ORD-1",
      data: { orderNumber: "ORD-1" },
    });

    expect(outcomes).toEqual([
      { token: "alive", ok: true },
      expect.objectContaining({ token: "dead", ok: false, invalidToken: true, retryable: false }),
    ]);
    const send = calls.find((call) => call.url.includes("fcm.googleapis.com/v1/projects/demo-project/messages:send"))!;
    const sent = JSON.parse(send.body).message;
    expect(sent.notification).toEqual({ title: "Your order is ready", body: "Order ORD-1 is ready" });
    expect(sent.webpush.fcm_options.link).toBe("https://shop.example.com/r/x/order/ORD-1");
    // the OAuth token endpoint is hit once and cached for both sends
    expect(calls.filter((call) => call.url.includes("oauth2.googleapis.com"))).toHaveLength(1);
  });

  it("treats a 503 as retryable, not as a dead token", async () => {
    vi.stubGlobal("fetch", async (url: string) =>
      url.includes("oauth2")
        ? new Response(JSON.stringify({ access_token: "t", expires_in: 3600 }), { status: 200 })
        : new Response(JSON.stringify({ error: { status: "UNAVAILABLE", message: "try later" } }), { status: 503 }),
    );
    const provider = createFcmProvider({ projectId: "p", clientEmail: "svc@p.iam.gserviceaccount.com", privateKey });
    const [outcome] = await provider.send(["t1"], { title: "t", body: "b", link: "https://x.test", data: {} });
    expect(outcome).toMatchObject({ ok: false, invalidToken: false, retryable: true });
  });
});
