import { createHash, timingSafeEqual } from "node:crypto";
import { config } from "@/server/config";
import { jsonError } from "@/server/errors";
import { drainDueNotifications } from "@/server/services/notifications";

/**
 * Delivers queued notification events. Call it from a scheduler (Vercel Cron,
 * Supabase pg_cron / database webhook, GitHub Actions …) every minute or so:
 * it picks up status changes made outside the app (e.g. in SQL) and retries
 * anything that failed earlier.
 *
 *   curl -X POST https://your-site/api/internal/notifications/dispatch \
 *        -H "Authorization: Bearer <dispatch secret>"
 *
 * Disabled (503) until the dispatch secret is configured (see .env.example).
 */

export const dynamic = "force-dynamic";
// the drain loop stops starting new batches after 30 s; the batch in flight (20 events, emails paced at 2/s) needs up to ~20 s more
export const maxDuration = 60;

const digest = (value: string) => createHash("sha256").update(value).digest();

async function handle(request: Request): Promise<Response> {
  try {
    const secret = config.notifications.dispatchSecret;
    if (!secret) return Response.json({ success: false, error: { code: "DISABLED", message: "Not configured." } }, { status: 503 });

    const presented = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
    // compare digests so the check is constant-time regardless of length
    if (!timingSafeEqual(digest(presented), digest(secret))) {
      return Response.json({ success: false, error: { code: "UNAUTHORIZED", message: "Unauthorized." } }, { status: 401 });
    }

    // keeps going until nothing is due, so a backlog bigger than one batch is cleared in a single call
    const summary = await drainDueNotifications({ limit: 20, budgetMs: 30_000 });
    return Response.json({ success: true, data: summary });
  } catch (error) {
    const { body, status } = jsonError(error);
    return Response.json(body, { status });
  }
}

export const POST = handle;
// Vercel Cron issues GET requests.
export const GET = handle;
