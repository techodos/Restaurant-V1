import { createHash } from "node:crypto";
import { errors } from "./errors";
import { logger } from "./logger";
import { hitRateLimit } from "./repositories/rate-limits";

/**
 * Best-effort in-process rate limiter for public write endpoints (checkout,
 * reservations, reviews, coupon attempts). Serverless instances each keep their
 * own bucket, which still stops the common abuse patterns; swap the store for
 * Redis/Upstash in a multi-instance deployment.
 */
interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();
const MAX_TRACKED_KEYS = 5_000;

export interface RateLimitOptions {
  /** logical action, e.g. "checkout" */
  key: string;
  /** identifier of the caller, e.g. ip or phone */
  identifier: string;
  limit: number;
  windowMs: number;
}

export function checkRateLimit({ key, identifier, limit, windowMs }: RateLimitOptions): void {
  const now = Date.now();
  const bucketKey = `${key}:${identifier}`;

  if (buckets.size > MAX_TRACKED_KEYS) {
    for (const [existingKey, bucket] of buckets) {
      if (bucket.resetAt < now) buckets.delete(existingKey);
    }
    // still full (many distinct callers inside one window): drop the oldest so memory stays bounded
    for (const existingKey of buckets.keys()) {
      if (buckets.size <= MAX_TRACKED_KEYS) break;
      buckets.delete(existingKey);
    }
  }

  const bucket = buckets.get(bucketKey);
  if (!bucket || bucket.resetAt < now) {
    buckets.set(bucketKey, { count: 1, resetAt: now + windowMs });
    return;
  }
  bucket.count += 1;
  if (bucket.count > limit) {
    throw errors.rateLimited();
  }
}

/** Test helper. */
export function resetRateLimits(): void {
  buckets.clear();
}

/**
 * `checkRateLimit` plus a counter shared by every app instance (rate_limits, 0045). For the abuse-sensitive
 * auth paths (sign-in, sign-up, OTP, password reset), where per-instance buckets would let an attacker multiply
 * their attempts by the number of instances. The in-process bucket runs first (free); the database is only asked
 * while it still allows the call. If the shared store is unreachable (migration not applied, database down) the
 * call is allowed on the in-process limit alone and a warning is logged: availability of sign-in wins over a
 * limiter outage, and the per-row OTP/password protections still hold.
 */
export async function checkSharedRateLimit(options: RateLimitOptions): Promise<void> {
  checkRateLimit(options);
  const bucket = createHash("sha256").update(`${options.key}:${options.identifier}`).digest("hex");
  let hits: number;
  try {
    hits = await hitRateLimit(bucket, options.windowMs);
  } catch (error) {
    logger.warn("rate-limit", "shared rate limit unavailable; using the in-process limit only", error instanceof Error ? error.message : String(error));
    return;
  }
  if (hits > options.limit) throw errors.rateLimited();
}
