import { jsonError } from "@/server/errors";
import { openOrderStream, orderEventsEnabled, type OrderStream } from "@/server/services/order-events";
import { requireRestaurant } from "@/server/services/restaurants";
import { getVisitorContext } from "@/web/session";

/**
 * Server-Sent Events for one order: `GET /r/<slug>/order/<number>/events[?t=<email link token>]`.
 *
 * The first event is the current state; after that the database pushes each change
 * (LISTEN/NOTIFY, see server/db/listener.ts). Nothing here polls. A comment line every
 * 25 s only keeps proxies from closing an idle connection.
 *
 *   401/404  the visitor may not see this order (browsers do not retry these)
 *   503      live updates are not configured (DATABASE_URL_LISTEN)
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const HEARTBEAT_MS = 25_000;
// how long the browser waits before it reconnects after a dropped connection
const RETRY_MS = 5_000;

const HEADERS = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
  // stop reverse proxies (nginx) from buffering the stream
  "X-Accel-Buffering": "no",
};

export async function GET(
  request: Request,
  { params }: { params: Promise<{ restaurantSlug: string; orderNumber: string }> },
): Promise<Response> {
  try {
    if (!orderEventsEnabled()) {
      return Response.json({ success: false, error: { code: "DISABLED", message: "Live updates are not configured." } }, { status: 503 });
    }
    const { restaurantSlug, orderNumber } = await params;
    const accessToken = new URL(request.url).searchParams.get("t");
    const restaurant = await requireRestaurant(restaurantSlug);
    const visitor = await getVisitorContext(restaurant.id);

    const encoder = new TextEncoder();
    let controller!: ReadableStreamDefaultController<Uint8Array>;
    let stream: OrderStream | null = null;
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
    stream = await openOrderStream(restaurant.id, decodeURIComponent(orderNumber), visitor, accessToken, {
      send: (state) => write(`event: status\ndata: ${JSON.stringify(state)}\n\n`),
      end: cleanup,
    });
    if (!stream) {
      finished = true;
      return Response.json({ success: false, error: { code: "NOT_FOUND", message: "Order not found." } }, { status: 404 });
    }
    // an order that was already finished ended the stream at its first event: nothing left to keep alive
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
