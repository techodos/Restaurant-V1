import { errors } from "./errors";

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
