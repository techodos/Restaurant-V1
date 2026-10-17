import { config } from "@/server/config";
import { errors } from "@/server/errors";

/**
 * The one restaurant this deployment serves (NEXT_PUBLIC_DEFAULT_RESTAURANT, validated in server/config). Pages,
 * route handlers and server actions read it here: URLs are root-level (/menu, /checkout, /admin) and never name a
 * restaurant, so nothing a visitor sends can point a request at another restaurant's data. The slug stays the
 * key the services look the restaurant up by.
 */
export function instanceRestaurantSlug(): string {
  return config.app.defaultRestaurantSlug;
}

/**
 * Server Actions still receive a restaurant slug from the browser (their signatures predate one-deployment-one-
 * restaurant). Anything but this deployment's restaurant is refused as "not found" — a crafted request can never
 * aim an action at another restaurant that happens to share the database.
 */
export function assertInstanceRestaurant(slug: string): string {
  if (slug !== instanceRestaurantSlug()) throw errors.notFound("Restaurant");
  return slug;
}
