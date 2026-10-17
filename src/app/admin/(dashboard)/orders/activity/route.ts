import { jsonError } from "@/server/errors";
import { getOrderActivitySince } from "@/server/services/orders";
import { requirePermission } from "@/web/session";
import { getAdminBranchScope } from "@/web/admin";

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
    // the staff check proves this session is a member of THIS slug's restaurant, so its id is
    // actor.restaurantId — this poll runs every 7 s per open admin tab and used to re-read the
    // restaurant row each time just to learn that id
    const actor = await requirePermission("orders.view", restaurantSlug);
    const ctx = { restaurantId: actor.restaurantId, userId: actor.userId, actor: actor.name };

    const since = new URL(request.url).searchParams.get("since");
    const sinceIso = since && !Number.isNaN(Date.parse(since)) ? since : new Date(Date.now() - 10_000).toISOString();

    // chimes for the branch in scope only (a branch member's own; owner/admin: the header's choice)
    const { locationId } = await getAdminBranchScope(restaurantSlug);
    // `now` comes from the same database read as `events` (listOrderActivitySince's statement_timestamp()),
    // never the app server's own clock — see that function's doc comment for the race it closes.
    const { events, now } = await getOrderActivitySince(actor.restaurantId, sinceIso, ctx, locationId);
    return Response.json({ success: true, data: { now, events } });
  } catch (error) {
    const { body, status } = jsonError(error);
    return Response.json(body, { status });
  }
}
