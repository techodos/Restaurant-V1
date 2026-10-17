/**
 * Where to send a customer after sign-in / sign-up / Google. Only a same-origin storefront path is accepted: it
 * must start with a single "/" and carry no scheme, backslash, whitespace or control character (browsers drop
 * tabs/newlines while parsing, so "/\t/evil.example" would become the protocol-relative "//evil.example" — an open
 * redirect); never the admin, super admin or API (a customer flow has no business landing there); and never the
 * sign-in / sign-up / google-phone pages themselves (landing back on "please sign in" while signed in is a loop).
 * Pure: used by the auth pages, the forms and the Google callback alike.
 */
export function safeReturnTo(returnTo: string | null | undefined): string | null {
  if (!returnTo) return null;
  if (!returnTo.startsWith("/") || returnTo.startsWith("//")) return null;
  if (returnTo.includes("://") || returnTo.includes("\\") || /[\s\u0000-\u001F\u007F]/.test(returnTo)) return null;
  if (/^\/(admin|super-admin|api)(?:[/?#]|$)/.test(returnTo)) return null;
  if (/^\/account\/(sign-in|sign-up|google-phone)\/?(\?.*)?$/.test(returnTo)) return null;
  return returnTo;
}

/**
 * Where a customer lands once signed in (password, verified code, Google, Google phone step): the page
 * they came from, else the storefront home. Never the `/account` page — there is nothing to do there
 * right after signing in. `returnTo` must already be sanitised.
 */
export function afterAuthPath(returnTo: string | null | undefined): string {
  return returnTo || "/";
}

/** The sign-in page URL that brings the customer back to `returnTo` afterwards. */
export function signInHref(returnTo?: string | null, page: "sign-in" | "sign-up" = "sign-in"): string {
  const safe = safeReturnTo(returnTo);
  return `/account/${page}${safe ? `?returnTo=${encodeURIComponent(safe)}` : ""}`;
}
