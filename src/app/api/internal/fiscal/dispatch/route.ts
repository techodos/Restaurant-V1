import { createHash, timingSafeEqual } from "node:crypto";
import { config } from "@/server/config";
import { jsonError } from "@/server/errors";
import { drainFiscalQueue } from "@/server/services/fiscal";

/**
 * The scheduled retry job of the POS fiscal queue (PRA/FBR): sends every invoice still pending, and every failed
 * one whose retry time has come (1, 5, 15, then every 60 minutes). Call it every minute or so:
 *
 *   curl -X POST https://your-site/api/internal/fiscal/dispatch -H "Authorization: Bearer <fiscal dispatch secret>"
 *
 * Secret: config.fiscal.dispatchSecret (its own, else the notifications dispatch secret; see .env.example). 503 until set.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const digest = (value: string) => createHash("sha256").update(value).digest();

async function handle(request: Request): Promise<Response> {
  try {
    const secret = config.fiscal.dispatchSecret;
    if (!secret) return Response.json({ success: false, error: { code: "DISABLED", message: "Not configured." } }, { status: 503 });

    const presented = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
    if (!timingSafeEqual(digest(presented), digest(secret))) {
      return Response.json({ success: false, error: { code: "UNAUTHORIZED", message: "Unauthorized." } }, { status: 401 });
    }

    const summary = await drainFiscalQueue(30_000);
    return Response.json({ success: true, data: summary });
  } catch (error) {
    const { body, status } = jsonError(error);
    return Response.json(body, { status });
  }
}

export const POST = handle;
// Vercel Cron issues GET requests.
export const GET = handle;
