import { config } from "@/server/config";
import { startStorefrontCache } from "./index";

/**
 * Startup policy for the storefront cache, called from the Next.js startup hook.
 *
 * If the first load fails the instance must not come up. Next.js itself only
 * logs a rejected `register()` and keeps a listening process whose every request
 * is a 500 that never recovers — indistinguishable, to a process supervisor,
 * from a healthy one. So in production the process exits non-zero (the cache has
 * already logged why) and the supervisor restarts it or fails the deploy. In
 * development the error propagates instead, so the dev server stays up while
 * `.env.local` or the database is fixed.
 */
export async function startStorefrontCacheOrExit(): Promise<void> {
  try {
    await startStorefrontCache();
  } catch (error) {
    if (config.app.isProduction) process.exit(1);
    throw error;
  }
}
