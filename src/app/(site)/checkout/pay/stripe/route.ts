import { after } from "next/server";
import { config } from "@/server/config";
import { logger } from "@/server/logger";
import { retrieveCheckoutSession } from "@/server/integrations/stripe";
import { confirmOnlinePayment } from "@/server/services/checkout";
import { dispatchDueNotifications } from "@/server/services/notifications";

/**
 * Stripe Checkout's `success_url`: `GET /r/<slug>/checkout/pay/stripe?session_id=cs_...`. Stripe
 * templates `session_id` into the URL itself — that alone is not proof of payment (a customer
 * could edit it), so this re-fetches the session from Stripe's API with our own secret key before
 * trusting it (same trust boundary as JazzCash's hash check, achieved differently). The webhook
 * (`/api/internal/payments/stripe/webhook`) is the more reliable confirmation path — a customer who
 * closes the tab mid-payment never lands here at all, but the webhook still fires; this route only
 * gives the customer an immediate "paid" screen when the redirect does complete.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ restaurantSlug: string }> }): Promise<Response> {
  const { restaurantSlug } = await params;
  const siteUrl = config.app.siteUrl;
  const trackingUrl = (orderNumber: string, status: "success" | "failed" | "error") =>
    Response.redirect(`${siteUrl}/r/${restaurantSlug}/order/${orderNumber}?payment=${status}`, 303);
  const noOrder = () => Response.redirect(`${siteUrl}/r/${restaurantSlug}/current-orders?payment=error`, 303);

  const stripe = config.payments.stripe;
  if (!stripe) {
    logger.error("payments", "Stripe return hit but Stripe is not configured", { restaurantSlug });
    return noOrder();
  }

  const sessionId = new URL(request.url).searchParams.get("session_id");
  if (!sessionId) return noOrder();

  try {
    const session = await retrieveCheckoutSession(stripe, sessionId);
    if (!session.orderId || !session.orderNumber || !session.restaurantId) return noOrder();

    await confirmOnlinePayment(session.restaurantId, session.orderNumber, session.orderId, {
      success: session.paid,
      transactionId: session.paymentIntentId,
      failureReason: session.paid ? null : "Stripe Checkout session did not complete.",
    });
    after(() => dispatchDueNotifications({ restaurantId: session.restaurantId! }, { restaurantId: session.restaurantId! }));
    return trackingUrl(session.orderNumber, session.paid ? "success" : "failed");
  } catch (error) {
    logger.error("payments", "Could not apply the Stripe return to the order", { restaurantSlug, error: error instanceof Error ? error.message : error });
    return noOrder();
  }
}
