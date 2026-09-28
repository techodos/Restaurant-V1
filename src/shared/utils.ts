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
