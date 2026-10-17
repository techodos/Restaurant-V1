import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/** Tailwind-aware class merge used by every shared UI primitive. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/** The restaurant admin's URL (sub starts with "/"). One deployment = one restaurant, so it has no slug in it. */
export function adminPath(sub = ""): string {
  return `/admin${sub}`;
}

/** True for `/admin` and anything below it (not `/administrator`, not `/super-admin`). */
export function isAdminPath(pathname: string | null | undefined): boolean {
  return /^\/admin(?:\/|$)/.test(pathname ?? "");
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
