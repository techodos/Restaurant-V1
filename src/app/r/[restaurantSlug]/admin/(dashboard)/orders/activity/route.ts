import { jsonError } from "@/server/errors";
import { getOrderActivitySince } from "@/server/services/orders";
import { getAdminRestaurant } from "@/web/admin";
import { requirePermission } from "@/web/session";

/**
 * Polled by the admin's order-sound notifications (OrderActivityWatcher): `GET .../orders/activity?since=<ISO>`.
 * Returns rows touched after `since` plus the server's own clock (`now`), so the browser advances its
 * cursor from the server's time, never its own (clock skew would otherwise replay or skip events).
 */
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ restaurantSlug: string }> },
): Promise<Response> {
  try {
    const { restaurantSlug } = await params;
    const actor = await requirePermission("orders.view", restaurantSlug);
    const restaurant = await getAdminRestaurant(restaurantSlug);
    const ctx = { restaurantId: actor.restaurantId, userId: actor.userId, actor: actor.name };

    const since = new URL(request.url).searchParams.get("since");
    const sinceIso = since && !Number.isNaN(Date.parse(since)) ? since : new Date(Date.now() - 10_000).toISOString();

    const events = await getOrderActivitySince(restaurant.id, sinceIso, ctx);
    return Response.json({ success: true, data: { now: new Date().toISOString(), events } });
  } catch (error) {
    const { body, status } = jsonError(error);
    return Response.json(body, { status });
  }
}
