import { getAdminRestaurantContext } from "@/server/services/restaurants";
import { instanceRestaurantSlug } from "@/web/instance";

/**
 * The till as an installable app (Chrome/Edge "Install", Android "Add to Home screen"): opens /pos standalone,
 * landscape-friendly, scoped to /pos so storefront links open in the browser. Same generated-route pattern as the
 * storefront manifest. Icon: the restaurant's generated touch icon (app/(site)/apple-touch-icon.png).
 */
export async function GET(): Promise<Response> {
  let name = "POS";
  try {
    name = `${(await getAdminRestaurantContext(instanceRestaurantSlug())).restaurant.name} POS`;
  } catch {
    // offline install / restaurant unreadable: a generic name is fine
  }
  return Response.json(
    {
      name,
      short_name: "POS",
      id: "/pos",
      start_url: "/pos",
      scope: "/pos",
      display: "standalone",
      orientation: "any",
      background_color: "#f2f0eb",
      theme_color: "#f2f0eb",
      icons: [{ src: "/apple-touch-icon.png", sizes: "180x180", type: "image/png", purpose: "any" }],
    },
    { headers: { "Content-Type": "application/manifest+json", "Cache-Control": "public, max-age=3600" } },
  );
}
