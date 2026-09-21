import { describe, expect, it } from "vitest";
import type { Order } from "@/shared/contract/models";
import type {
  EmailMessage,
  EmailProvider,
  NotificationEventRecord,
  NotificationOrderContext,
  PushMessage,
  PushProvider,
} from "@/server/notifications/types";
import { NotificationService, type NotificationStore } from "@/server/services/notifications";
import type { EventOutcome } from "@/server/repositories/notifications";

/**
 * Many customers, many restaurants, several dispatchers at once (checkout hooks + cron
 * + the dev script all run the same code). The in-memory store claims rows the way the
 * SQL does (`for update skip locked`: a claimed row is invisible to the next claimer),
 * providers have latency, and every send is counted. The point: nothing is sent twice,
 * nothing is lost, nothing crosses restaurants, and one failing channel does not repeat
 * the other.
 */

const RESTAURANTS = ["r1", "r2", "r3"].map((id, index) => ({ id: `${id}-uuid`, name: `Restaurant ${index + 1}`, slug: `rest-${index + 1}` }));
const ORDERS_PER_RESTAURANT = 40;
const LATENCY_MS = 15;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

interface StoredEvent extends NotificationEventRecord {
  status: "pending" | "processing" | "done" | "dead";
}

function buildWorld() {
  const events: StoredEvent[] = [];
  const contexts = new Map<string, NotificationOrderContext>();
  let n = 0;
  for (const restaurant of RESTAURANTS) {
    for (let i = 0; i < ORDERS_PER_RESTAURANT; i++) {
      const orderId = `${restaurant.id}-order-${i}`;
      const customerId = `${restaurant.id}-customer-${i}`;
      const order = {
        id: orderId, restaurantId: restaurant.id, customerId, orderNumber: `ORD-${restaurant.slug}-${i}`, orderType: "delivery",
        status: "completed", customerName: `Customer ${i}`, customerEmail: `c${i}@${restaurant.slug}.example`, customerPhone: null,
        deliveryAddress: null, tableNumber: null, locationName: null, subtotal: "10.00", discountAmount: "0.00", deliveryFee: "0.00",
        taxAmount: "0.00", serviceFee: "0.00", tipAmount: "0.00", total: "10.00", estimatedReadyAt: null,
        items: [{ id: "i", orderId, menuItemId: null, variantId: null, itemName: "Pizza", variantName: null, quantity: 1, unitPrice: "10.00", addonsTotal: "0.00", lineTotal: "10.00", specialInstructions: null, addons: [] }],
      } as unknown as Order;
      contexts.set(orderId, {
        restaurant: {
          id: restaurant.id, name: restaurant.name, slug: restaurant.slug, logoUrl: null, primaryColor: null, email: null, phone: null,
          currencySymbol: "$", locale: "en", timezone: "UTC", reviewsEnabled: true, channels: { email: true, push: true },
        },
        order,
      });
      // confirmed (email), preparing (push), completed (email + push)
      for (const eventType of ["confirmed", "preparing", "completed"]) {
        events.push({
          id: `evt-${n++}`, restaurantId: restaurant.id, orderId, customerId, eventType, attempts: 0,
          emailState: null, pushState: null, status: "pending",
        });
      }
    }
  }
  return { events, contexts };
}

function harness(options: { failFirstPush?: boolean } = {}) {
  const { events, contexts } = buildWorld();
  const emailsByKey = new Map<string, { count: number; to: string; html: string }>();
  const pushesByKey = new Map<string, number>();
  const failedPushOnce = new Set<string>();
  let claims = 0;

  const email: EmailProvider = {
    name: "fake-email",
    async send(message: EmailMessage) {
      await sleep(LATENCY_MS);
      const seen = emailsByKey.get(message.idempotencyKey);
      emailsByKey.set(message.idempotencyKey, { count: (seen?.count ?? 0) + 1, to: message.to, html: message.html });
      return { ok: true as const, id: "x" };
    },
  };
  const push: PushProvider = {
    name: "fake-push",
    async send(tokens: readonly string[], message: PushMessage) {
      await sleep(LATENCY_MS);
      const key = `${message.data.orderId}-${message.data.status}`;
      if (options.failFirstPush && !failedPushOnce.has(key)) {
        failedPushOnce.add(key);
        return tokens.map((token) => ({ token, ok: false as const, invalidToken: false, retryable: true, error: "fcm 503" }));
      }
      pushesByKey.set(key, (pushesByKey.get(key) ?? 0) + 1);
      return tokens.map((token) => ({ token, ok: true as const }));
    },
  };

  const store: NotificationStore = {
    // synchronous body = atomic, like skip locked: two callers can never receive the same row
    claimDue: async (opts) => {
      await sleep(2);
      claims += 1;
      const taken: StoredEvent[] = [];
      for (const event of events) {
        if (taken.length >= opts.limit) break;
        if (event.status !== "pending") continue;
        if (opts.restaurantId && event.restaurantId !== opts.restaurantId) continue;
        event.status = "processing";
        event.attempts += 1;
        taken.push(event);
      }
      return taken.map((event) => ({ ...event }));
    },
    loadContext: async (event) => {
      await sleep(2);
      return contexts.get(event.orderId) ?? null;
    },
    activeTokens: async (_restaurantId, customerId) => [`token-${customerId}`],
    deactivateTokens: async () => undefined,
    saveOutcome: async (event: NotificationEventRecord, outcome: EventOutcome) => {
      await sleep(2);
      const stored = events.find((candidate) => candidate.id === event.id)!;
      stored.status = outcome.status;
      stored.emailState = outcome.emailState;
      stored.pushState = outcome.pushState;
    },
  };

  const service = new NotificationService({
    email, push, siteUrl: "https://shop.example.com", maxAgeHours: 24, store, signAccessToken: async (grant) => `signed.${grant.orderId}`,
  });
  return { service, events, emailsByKey, pushesByKey, claims: () => claims };
}

/** Runs dispatchers the way production does: several at once, some scoped to a restaurant, some global. */
async function drain(service: NotificationService, events: StoredEvent[]) {
  const runners: Promise<unknown>[] = [];
  for (let round = 0; round < 12; round++) {
    for (const restaurant of RESTAURANTS) {
      runners.push(service.dispatchDue({ limit: 20, restaurantId: restaurant.id }, { restaurantId: restaurant.id })); // checkout hook
    }
    runners.push(service.dispatchDue({ limit: 50 })); // cron route
  }
  await Promise.all(runners);
  // retries (what the next cron tick does)
  for (let pass = 0; pass < 5 && events.some((event) => event.status === "pending"); pass++) {
    await Promise.all([service.dispatchDue({ limit: 50 }), service.dispatchDue({ limit: 50 })]);
  }
}

describe("notifications under load (many customers, many restaurants, concurrent dispatchers)", () => {
  it("delivers every email and push exactly once, to the right customer, with no cross-restaurant leaks", async () => {
    const h = harness();
    const started = performance.now();
    await drain(h.service, h.events);
    const elapsed = performance.now() - started;

    expect(h.events.every((event) => event.status === "done")).toBe(true);

    // 120 orders: `confirmed` and `completed` email each, `preparing` and `completed` push each
    const orders = RESTAURANTS.length * ORDERS_PER_RESTAURANT;
    expect(h.emailsByKey.size).toBe(orders * 2);
    expect(h.pushesByKey.size).toBe(orders * 2);
    expect([...h.emailsByKey.values()].every((sent) => sent.count === 1)).toBe(true);
    expect([...h.pushesByKey.values()].every((count) => count === 1)).toBe(true);

    for (const [key, sent] of h.emailsByKey) {
      const [, orderId] = /^order-(.+)-(confirmed|completed)-email$/.exec(key)!;
      const context = h.events.find((event) => event.orderId === orderId)!;
      const restaurant = RESTAURANTS.find((r) => r.id === context.restaurantId)!;
      expect(sent.to.endsWith(`@${restaurant.slug}.example`)).toBe(true);
      expect(sent.html).toContain(restaurant.name);
      for (const other of RESTAURANTS.filter((r) => r !== restaurant)) expect(sent.html).not.toContain(other.name);
    }

    // eslint-disable-next-line no-console
    console.log(`[load] ${h.events.length} events, ${h.claims()} claims in ${elapsed.toFixed(0)} ms (${((h.events.length / elapsed) * 1000).toFixed(0)} events/s)`);
  }, 30_000);

  it("a push provider outage retries the push without resending the email that already succeeded", async () => {
    const h = harness({ failFirstPush: true });
    await drain(h.service, h.events);

    expect(h.events.every((event) => event.status === "done")).toBe(true);
    expect([...h.emailsByKey.values()].every((sent) => sent.count === 1)).toBe(true);
    expect([...h.pushesByKey.values()].every((count) => count === 1)).toBe(true);
    expect(h.pushesByKey.size).toBe(RESTAURANTS.length * ORDERS_PER_RESTAURANT * 2);
  }, 30_000);
});
