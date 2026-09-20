import { redirect } from "next/navigation";
import { config } from "@/server/config";

/**
 * The platform root has no content of its own: each restaurant lives at
 * /r/[restaurantSlug]. Custom domains will resolve to a slug in middleware;
 * until then the default restaurant answers here.
 */
export default function RootPage() {
  const slug = config.app.defaultRestaurantSlug;
  redirect(`/r/${slug}`);
}
