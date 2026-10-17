import { beginGoogleSignIn } from "../actions";

interface Params {
  params: Promise<{ restaurantSlug: string }>;
}

/** Starts "Continue with Google": redirects to Google's consent screen. */
export async function GET(request: Request, { params }: Params) {
  const { restaurantSlug } = await params;
  const returnTo = new URL(request.url).searchParams.get("returnTo");
  await beginGoogleSignIn(restaurantSlug, returnTo); // throws NEXT_REDIRECT
}
