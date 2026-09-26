import { config } from "@/server/config";
import { logger } from "@/server/logger";
import { verifyWebhookSignature } from "@/server/integrations/stripe";
import { confirmOnlinePayment } from "@/server/services/checkout";
import { dispatchDueNotifications } from "@/server/services/notifications";

/**
 * Stripe's webhook: `POST /api/internal/payments/stripe/webhook`, configured in the Stripe
 * Dashboard (or `stripe listen --forward-to ... ` locally) with events `checkout.session.completed`
 * and `checkout.session.async_payment_failed`. This is the reliable confirmation path Stripe
 * recommends — the `success_url` redirect (`checkout/pay/stripe/route.ts`) only fires when the
 * customer's browser actually completes the redirect; this fires from Stripe's side regardless,
 * so a closed tab or dropped connection still gets the order marked paid. `confirmOnlinePayment`
 * is idempotent, so running both paths for the same order is safe.
 *
 * Never parse the body with `request.json()` first — the signature is computed over the exact raw
 * bytes Stripe sent; re-serializing loses that.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  const stripe = config.payments.stripe;
  if (!stripe?.webhookSecret) {
    return Response.json({ success: false, error: { code: "DISABLED", message: "Stripe webhook is not configured." } }, { status: 503 });
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) return Response.json({ success: false, error: { code: "VALIDATION_ERROR", message: "Missing signature." } }, { status: 400 });

  const rawBody = await request.text();
  const event = verifyWebhookSignature(rawBody, signature, stripe.webhookSecret);
  if (!event.valid) {
    logger.error("payments", "Stripe webhook signature verification failed");
    return Response.json({ success: false, error: { code: "UNAUTHORIZED", message: "Invalid signature." } }, { status: 400 });
  }

  const session = event.session;
  if (!session?.orderId || !session.orderNumber || !session.restaurantId) {
    return Response.json({ success: true, data: { ignored: true, type: event.type } });
  }

  try {
    await confirmOnlinePayment(session.restaurantId, session.orderNumber, session.orderId, {
      success: session.paid,
      transactionId: session.paymentIntentId,
      failureReason: session.paid ? null : "Stripe Checkout session did not complete.",
    });
    // Not deferred with `after()`: Stripe expects a 2xx only once processing is done, and there is
    // no response body it reads, so nothing is gained by deferring — unlike the customer-facing
    // return route, which must redirect the browser immediately.
    await dispatchDueNotifications({ restaurantId: session.restaurantId }, { restaurantId: session.restaurantId }).catch(() => {});
    return Response.json({ success: true, data: { received: true } });
  } catch (error) {
    logger.error("payments", "Could not apply the Stripe webhook to the order", { error: error instanceof Error ? error.message : error });
    // 500 so Stripe retries with backoff instead of considering the event delivered.
    return Response.json({ success: false, error: { code: "INTERNAL_ERROR", message: "Could not process the event." } }, { status: 500 });
  }
}
