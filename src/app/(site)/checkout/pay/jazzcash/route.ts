import { after } from "next/server";
import { config } from "@/server/config";
import { logger } from "@/server/logger";
import { verifyReturn } from "@/server/integrations/jazzcash";
import { confirmOnlinePayment } from "@/server/services/checkout";
import { dispatchDueNotifications } from "@/server/services/notifications";
import { requireRestaurant } from "@/server/services/restaurants";
import { instanceRestaurantSlug } from "@/web/instance";

/**
 * JazzCash's `pp_ReturnURL`: `POST /checkout/pay/jazzcash`. JazzCash redirects the
 * customer's browser here with the transaction result as form fields (never trust them without
 * `verifyReturn`'s hash check — see integrations/jazzcash.ts). Always ends in a redirect to the
 * order tracking page; there is no error response JazzCash's redirect could usefully show.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  const restaurantSlug = instanceRestaurantSlug();
  const siteUrl = config.app.siteUrl;
  const trackingUrl = (orderNumber: string, status: "success" | "failed" | "pending" | "error") =>
    Response.redirect(`${siteUrl}/order/${orderNumber}?payment=${status}`, 303);
  const failedNoOrder = () => Response.redirect(`${siteUrl}/current-orders?payment=error`, 303);

  const jazzcash = config.payments.jazzcash;
  if (!jazzcash) {
    logger.error("payments", "JazzCash return hit but JazzCash is not configured", { restaurantSlug });
    return failedNoOrder();
  }

  let fields: Record<string, string>;
  try {
    const form = await request.formData();
    fields = Object.fromEntries(Array.from(form.entries(), ([key, value]) => [key, String(value)]));
  } catch {
    return failedNoOrder();
  }

  const result = verifyReturn(fields, jazzcash.integritySalt);
  if (!result.valid || !result.orderId || !result.orderNumber) {
    // A bad hash means the payload cannot be trusted — never act on it (and never leak which part failed).
    logger.error("payments", "JazzCash return failed hash verification", {
      restaurantSlug,
      responseCode: result.responseCode,
      responseMessage: result.responseMessage,
    });
    return failedNoOrder();
  }

  if (result.pending) {
    // Not paid and not failed: leave the payment Pending (staff can still mark it, and a later success
    // resolves it) rather than telling the customer it failed.
    logger.info("payments", "JazzCash return reports the payment as pending", {
      restaurantSlug,
      orderNumber: result.orderNumber,
      responseCode: result.responseCode,
    });
    return trackingUrl(result.orderNumber, "pending");
  }

  try {
    const restaurant = await requireRestaurant(restaurantSlug);
    await confirmOnlinePayment(restaurant.id, result.orderNumber, result.orderId, {
      success: result.success,
      transactionId: result.transactionId,
      failureReason: result.success ? null : result.responseMessage ?? `JazzCash ${result.responseCode}`,
    });
    // Never send email/push from order code itself; only commit and dispatch after the response
    // (section 5 rule 9) — a no-op today since payment_status alone queues no event (section 7's
    // trigger fires on `orders.status`), kept for when a payment-driven event source is added.
    after(() => dispatchDueNotifications({ restaurantId: restaurant.id }, { restaurantId: restaurant.id }));
    return trackingUrl(result.orderNumber, result.success ? "success" : "failed");
  } catch (error) {
    logger.error("payments", "Could not apply the JazzCash return to the order", { restaurantSlug, error: error instanceof Error ? error.message : error });
    return trackingUrl(result.orderNumber, "error");
  }
}
