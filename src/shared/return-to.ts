/**
 * Where to send a customer after sign-in / sign-up / Google. Only a path inside this restaurant's own
 * storefront is accepted (no absolute, protocol-relative or cross-tenant URL, so no open redirect), and
 * never the sign-in / sign-up / google-phone pages themselves (landing back on "please sign in" while
 * signed in is a loop). Pure: used by the auth pages, the forms and the Google callback alike.
 */
export function safeReturnTo(slug: string, returnTo: string | null | undefined): string | null {
  if (!returnTo) return null;
  if (!returnTo.startsWith(`/r/${slug}/`) && returnTo !== `/r/${slug}`) return null;
  if (returnTo.startsWith("//") || returnTo.includes("://") || returnTo.includes("\\")) return null;
  if (/^\/r\/[^/]+\/account\/(sign-in|sign-up|google-phone)\/?(\?.*)?$/.test(returnTo)) return null;
  return returnTo;
}

/** The sign-in page URL that brings the customer back to `returnTo` afterwards. */
export function signInHref(slug: string, returnTo?: string | null, page: "sign-in" | "sign-up" = "sign-in"): string {
  const safe = safeReturnTo(slug, returnTo);
  return `/r/${slug}/account/${page}${safe ? `?returnTo=${encodeURIComponent(safe)}` : ""}`;
}
