/**
 * Next.js startup hook: runs once when a server instance starts, before it
 * answers requests, in `next dev` and `next start` alike. It loads the storefront
 * snapshot so every storefront read afterwards is served from memory.
 *
 * The runtime check must stay a literal comparison in a block: Next.js
 * substitutes it at compile time and drops the branch from the Edge bundle.
 * Without that, the Edge compile follows the import into `pg` and fails. It is
 * Next's own marker, not application configuration, which is why this is the one
 * place outside `server/config` allowed to read it (see tests/architecture.test.ts).
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startStorefrontCacheOrExit } = await import("@/server/cache/startup");
    await startStorefrontCacheOrExit();
  }
}
