import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/** Tailwind-aware class merge used by every shared UI primitive. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/** A restaurant's admin URL: every restaurant has its own admin at /r/<slug>/admin (sub starts with "/"). */
export function adminPath(restaurantSlug: string, sub = ""): string {
  return `/r/${restaurantSlug}/admin${sub}`;
}

/** The restaurant slug of a `/r/<slug>/admin...` path, else null (the inverse of `adminPath`). */
export function adminSlugFromPath(pathname: string | null | undefined): string | null {
  const match = /^\/r\/([^/]+)\/admin(?:\/|$)/.exec(pathname ?? "");
  if (!match?.[1]) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
}

/**
 * JSON for a `<script>` body (JSON-LD). JSON.stringify leaves `<` as is, and the payload carries text visitors
 * typed (review author/title/comment), so `</script><script>…` would end the block and run as markup (stored
 * XSS). Escaping `<` as a unicode escape keeps the same text for any JSON parser; U+2028/U+2029 likewise for old JS parsers.
 */
export function scriptSafeJson(data: unknown): string {
  return JSON.stringify(data)
    .replace(/</g, "\\u003c")
    .replace(new RegExp("[\\u2028\\u2029]", "g"), (separator) => `\\u${separator.charCodeAt(0).toString(16)}`);
}
