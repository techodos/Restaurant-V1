import { redirect } from "next/navigation";
import { afterAuthPath } from "@/shared/return-to";
import { handleGoogleCallback } from "../../actions";
import { instanceRestaurantSlug } from "@/web/instance";

/** Google redirects the browser back here with `code`/`state` after consent. */
export async function GET(request: Request) {
  const restaurantSlug = instanceRestaurantSlug();
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const base = "/";

  if (!code || !state) redirect(`/account/sign-in?error=google`);

  let outcome: Awaited<ReturnType<typeof handleGoogleCallback>> | null = null;
  try {
    outcome = await handleGoogleCallback(restaurantSlug, code, state);
  } catch (err) {
    console.error("[google-callback]", err);
    redirect(`/account/sign-in?error=google`);
  }

  const returnTo = outcome.returnTo ? `&returnTo=${encodeURIComponent(outcome.returnTo)}` : "";
  if (outcome.needsPhone && outcome.pendingToken) {
    redirect(`/account/google-phone?token=${encodeURIComponent(outcome.pendingToken)}${returnTo}`);
  }
  // back where they started, else the storefront home (never the /account screen)
  redirect(afterAuthPath(outcome.returnTo));
}
