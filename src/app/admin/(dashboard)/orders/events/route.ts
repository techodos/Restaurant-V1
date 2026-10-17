import { jsonError } from "@/server/errors";
import { openOrderActivityStream, orderActivityStreamEnabled, type OrderActivityStream } from "@/server/services/order-events";
import { requirePermission } from "@/web/session";
import { getAdminBranchScope } from "@/web/admin";
import { instanceRestaurantSlug } from "@/web/instance";

/**
 * Server-Sent Events for the admin "new order" / "cancelled order" chime and activity banner:
 * `GET /admin/orders/events`. Replaces polling GET /admin/orders/activity every 3 s — the database
 * pushes one event per real order change (LISTEN/NOTIFY, migration 0042) instead of a staff tab
 * re-reading the table on a timer whether or not anything happened.
 *
 * Same SSE shape as the customer tracking route (`order/[orderNumber]/events`): a comment line every
 * 25 s keeps proxies from closing an idle connection; the browser reconnects on its own.
 *
 *   401/403  not permitted to view orders
 *   503      live updates are not configured (DATABASE_URL_LISTEN) — the client falls back to polling
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const HEARTBEAT_MS = 25_000;
const RETRY_MS = 5_000;

const HEADERS = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
  "X-Accel-Buffering": "no",
};

export async function GET(request: Request): Promise<Response> {
  try {
    if (!orderActivityStreamEnabled()) {
      return Response.json({ success: false, error: { code: "DISABLED", message: "Live updates are not configured." } }, { status: 503 });
    }
    const restaurantSlug = instanceRestaurantSlug();
    const actor = await requirePermission("orders.view", restaurantSlug);
    const ctx = { restaurantId: actor.restaurantId, userId: actor.userId, actor: actor.name };
    const { locationId } = await getAdminBranchScope(restaurantSlug);

    const encoder = new TextEncoder();
    let controller!: ReadableStreamDefaultController<Uint8Array>;
    let stream: OrderActivityStream | null = null;
    let heartbeat: ReturnType<typeof setInterval> | undefined;
    let finished = false;

    const cleanup = () => {
      if (finished) return;
      finished = true;
      clearInterval(heartbeat);
      stream?.close();
      try {
        controller.close();
      } catch {
        /* already closed by the client */
      }
    };
    const write = (chunk: string) => {
      if (finished) return;
      try {
        controller.enqueue(encoder.encode(chunk));
      } catch {
        cleanup();
      }
    };

    const body = new ReadableStream<Uint8Array>({
      start(c) {
        controller = c;
      },
      cancel() {
        finished = true;
        clearInterval(heartbeat);
        stream?.close();
      },
    });

    write(`retry: ${RETRY_MS}\n\n`);
    stream = await openOrderActivityStream(actor.restaurantId, locationId, ctx, {
      send: (event) => write(`event: activity\ndata: ${JSON.stringify(event)}\n\n`),
    });
    if (!finished) {
      heartbeat = setInterval(() => write(`: ping\n\n`), HEARTBEAT_MS);
      request.signal.addEventListener("abort", cleanup, { once: true });
    }
    return new Response(body, { headers: HEADERS });
  } catch (error) {
    const { body, status } = jsonError(error);
    return Response.json(body, { status });
  }
}
