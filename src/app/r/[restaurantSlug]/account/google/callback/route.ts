import { redirect } from "next/navigation";
import { handleGoogleCallback } from "../../actions";

interface Params {
  params: Promise<{ restaurantSlug: string }>;
}

/** Google redirects the browser back here with `code`/`state` after consent. */
export async function GET(request: Request, { params }: Params) {
  const { restaurantSlug } = await params;
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const base = `/r/${restaurantSlug}`;

  if (!code || !state) redirect(`${base}/account/sign-in?error=google`);

  let outcome: Awaited<ReturnType<typeof handleGoogleCallback>> | null = null;
  try {
    outcome = await handleGoogleCallback(restaurantSlug, code, state);
  } catch (err) {
    console.error("[google-callback]", err);
    redirect(`${base}/account/sign-in?error=google`);
  }

  const returnTo = outcome.returnTo ? `&returnTo=${encodeURIComponent(outcome.returnTo)}` : "";
  if (outcome.needsPhone && outcome.pendingToken) {
    redirect(`${base}/account/google-phone?token=${encodeURIComponent(outcome.pendingToken)}${returnTo}`);
  }
  redirect(outcome.returnTo ?? `${base}/account`);
}
