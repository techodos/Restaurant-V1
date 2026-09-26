import { createHmac, timingSafeEqual } from "node:crypto";
import { toMinorUnits } from "@/shared/money";

/**
 * Stripe Checkout (hosted payment page) over its plain REST API — no `stripe` SDK dependency,
 * same convention as `integrations/resend.ts` ("no SDK, no extra dependency"). Stripe's API takes
 * `application/x-www-form-urlencoded`, including bracketed keys for nested objects/arrays
 * (`line_items[0][price_data][unit_amount]`), which `toFormBody` builds from a plain object.
 *
 * Flow: `createCheckoutSession` returns a hosted-page URL the browser is redirected to (a plain
 * GET redirect, unlike JazzCash's POST form). Stripe later redirects the browser back to
 * `success_url`/`cancel_url` with `?session_id=...` — that id is *not* proof of payment by itself
 * (a customer can edit a URL), so the return route re-fetches the session from Stripe's API with
 * our own secret key before trusting it. `verifyWebhookSignature` is the second, more reliable
 * path Stripe recommends as the actual source of truth (a customer closing the tab before the
 * redirect completes never reaches success_url at all, but the webhook still fires).
 */

const API_BASE = "https://api.stripe.com/v1";
const TIMEOUT_MS = 10_000;

export interface StripeOptions {
  secretKey: string;
}

export interface StripeCheckoutInput {
  amount: string;
  currency: string;
  restaurantId: string;
  orderId: string;
  orderNumber: string;
  description: string;
  customerEmail?: string | null;
  successUrl: string;
  cancelUrl: string;
}

export interface StripeCheckoutSession {
  id: string;
  url: string;
}

/** Encodes a plain object into Stripe's bracketed form-encoding, e.g. `{a: {b: 1}}` -> `a[b]=1`. */
function toFormBody(params: Record<string, unknown>, prefix = ""): string[] {
  const pairs: string[] = [];
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    const fullKey = prefix ? `${prefix}[${key}]` : key;
    if (Array.isArray(value)) {
      value.forEach((item, index) => {
        if (item !== null && typeof item === "object") pairs.push(...toFormBody(item as Record<string, unknown>, `${fullKey}[${index}]`));
        else pairs.push(`${encodeURIComponent(`${fullKey}[${index}]`)}=${encodeURIComponent(String(item))}`);
      });
    } else if (typeof value === "object") {
      pairs.push(...toFormBody(value as Record<string, unknown>, fullKey));
    } else {
      pairs.push(`${encodeURIComponent(fullKey)}=${encodeURIComponent(String(value))}`);
    }
  }
  return pairs;
}

async function stripeRequest<T>(
  options: StripeOptions,
  method: "GET" | "POST",
  path: string,
  body?: Record<string, unknown>,
  idempotencyKey?: string,
): Promise<T> {
  const headers: Record<string, string> = { Authorization: `Bearer ${options.secretKey}` };
  if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;
  let response: Response;
  try {
    if (method === "GET") {
      response = await fetch(`${API_BASE}${path}`, { method, headers, signal: AbortSignal.timeout(TIMEOUT_MS) });
    } else {
      headers["Content-Type"] = "application/x-www-form-urlencoded";
      response = await fetch(`${API_BASE}${path}`, {
        method,
        headers,
        body: toFormBody(body ?? {}).join("&"),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    }
  } catch (error) {
    throw new Error(`stripe network error: ${error instanceof Error ? error.message : "request failed"}`);
  }
  const payload = (await response.json().catch(() => null)) as (T & { error?: { message?: string } }) | null;
  if (!response.ok || !payload) {
    throw new Error(`stripe ${response.status}: ${payload?.error?.message ?? "request failed"}`);
  }
  return payload;
}

export async function createCheckoutSession(options: StripeOptions, input: StripeCheckoutInput): Promise<StripeCheckoutSession> {
  const session = await stripeRequest<StripeCheckoutSession>(
    options,
    "POST",
    "/checkout/sessions",
    {
      mode: "payment",
      success_url: `${input.successUrl}?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: input.cancelUrl,
      customer_email: input.customerEmail || undefined,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: input.currency.toLowerCase(),
            unit_amount: toMinorUnits(input.amount, 2),
            product_data: { name: input.description.slice(0, 250) },
          },
        },
      ],
      metadata: { orderId: input.orderId, orderNumber: input.orderNumber, restaurantId: input.restaurantId },
      payment_intent_data: { metadata: { orderId: input.orderId, orderNumber: input.orderNumber, restaurantId: input.restaurantId } },
    },
    `checkout-${input.orderId}`,
  );
  return session;
}

export interface StripeSessionStatus {
  paid: boolean;
  restaurantId: string | null;
  orderId: string | null;
  orderNumber: string | null;
  paymentIntentId: string | null;
}

/** Re-fetches the session from Stripe's API — the actual trust boundary, not the `session_id` URL param. */
export async function retrieveCheckoutSession(options: StripeOptions, sessionId: string): Promise<StripeSessionStatus> {
  const session = await stripeRequest<{
    payment_status: string;
    metadata: Record<string, string> | null;
    payment_intent: string | { id: string } | null;
  }>(options, "GET", `/checkout/sessions/${encodeURIComponent(sessionId)}`);
  const paymentIntent = session.payment_intent;
  return {
    paid: session.payment_status === "paid",
    restaurantId: session.metadata?.restaurantId ?? null,
    orderId: session.metadata?.orderId ?? null,
    orderNumber: session.metadata?.orderNumber ?? null,
    paymentIntentId: typeof paymentIntent === "string" ? paymentIntent : paymentIntent?.id ?? null,
  };
}

export interface StripeWebhookEvent {
  valid: boolean;
  type: string | null;
  session: StripeSessionStatus | null;
}

/**
 * Verifies Stripe's `Stripe-Signature` header over the RAW request body (must be the exact bytes
 * Stripe sent — do not `JSON.parse` and re-serialize first) and extracts the checkout session from
 * a `checkout.session.completed`/`checkout.session.async_payment_failed` event. Stripe's documented
 * scheme: `t=<unix ts>,v1=<hex hmac-sha256 of "ts.rawBody">[,v1=... for key rotation]`.
 */
export function verifyWebhookSignature(rawBody: string, signatureHeader: string, webhookSecret: string, toleranceSeconds = 300): StripeWebhookEvent {
  const parts = Object.fromEntries(
    signatureHeader.split(",").map((part) => {
      const [key, ...rest] = part.split("=");
      return [key, rest.join("=")];
    }),
  );
  const timestamp = parts.t;
  const signatures = signatureHeader
    .split(",")
    .filter((part) => part.startsWith("v1="))
    .map((part) => part.slice(3));
  if (!timestamp || signatures.length === 0) return { valid: false, type: null, session: null };

  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(age) || age > toleranceSeconds) return { valid: false, type: null, session: null };

  const expected = createHmac("sha256", webhookSecret).update(`${timestamp}.${rawBody}`).digest("hex");
  const expectedBuf = Buffer.from(expected, "hex");
  const valid = signatures.some((signature) => {
    const candidate = Buffer.from(signature, "hex");
    return candidate.length === expectedBuf.length && timingSafeEqual(candidate, expectedBuf);
  });
  if (!valid) return { valid: false, type: null, session: null };

  let event: { type?: string; data?: { object?: Record<string, unknown> } };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return { valid: true, type: null, session: null };
  }
  const object = event.data?.object;
  if (!object || (event.type !== "checkout.session.completed" && event.type !== "checkout.session.async_payment_failed")) {
    return { valid: true, type: event.type ?? null, session: null };
  }
  const metadata = (object.metadata as Record<string, string> | undefined) ?? {};
  const paymentIntent = object.payment_intent as string | { id: string } | null | undefined;
  return {
    valid: true,
    type: event.type,
    session: {
      paid: object.payment_status === "paid",
      restaurantId: metadata.restaurantId ?? null,
      orderId: metadata.orderId ?? null,
      orderNumber: metadata.orderNumber ?? null,
      paymentIntentId: typeof paymentIntent === "string" ? paymentIntent : paymentIntent?.id ?? null,
    },
  };
}
