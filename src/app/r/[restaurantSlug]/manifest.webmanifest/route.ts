import { requireStorefront } from "@/web/storefront";

/**
 * Per-restaurant web app manifest, served at `/r/<slug>/manifest.webmanifest` (same generated-route
 * pattern as `firebase-messaging-sw.js/route.ts`, since it depends on the restaurant, not a static file).
 *
 * `display: "standalone"` is what lets "Add to Home Screen" open the storefront without Safari's
 * chrome on iOS 16.4+ — and that standalone mode is a hard requirement for iOS to deliver Web Push at
 * all (see push-opt-in.tsx). Without this manifest, "Add to Home Screen" still creates an icon, but
 * iOS treats it as a bookmark, not an installed app, and push never works. `scope`/`start_url` are
 * pinned to this restaurant so the icon always reopens its own storefront.
 */

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ restaurantSlug: string }> }): Promise<Response> {
  const { restaurantSlug } = await params;
  const { restaurant, theme } = await requireStorefront(restaurantSlug);
  const scope = `/r/${restaurantSlug}/`;

  const manifest = {
    name: restaurant.name,
    short_name: restaurant.name.length > 12 ? restaurant.name.slice(0, 12) : restaurant.name,
    description: restaurant.shortDescription || restaurant.description || `Order online from ${restaurant.name}.`,
    start_url: scope,
    scope,
    display: "standalone",
    background_color: theme.background,
    theme_color: theme.primary,
    icons: [{ src: new URL(`${scope}apple-icon`, request.url).toString(), sizes: "180x180", type: "image/png" }],
  };

  return Response.json(manifest, { headers: { "Cache-Control": "no-cache" } });
}
