import { beginGoogleSignIn } from "../actions";
import { instanceRestaurantSlug } from "@/web/instance";

/** Starts "Continue with Google": redirects to Google's consent screen. */
export async function GET(request: Request) {
  const restaurantSlug = instanceRestaurantSlug();
  const returnTo = new URL(request.url).searchParams.get("returnTo");
  await beginGoogleSignIn(restaurantSlug, returnTo); // throws NEXT_REDIRECT
}
