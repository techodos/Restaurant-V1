import { existsSync } from "node:fs";
import path from "node:path";

/**
 * Storefront imagery comes from the database (media library / section config)
 * as public URLs. Seeded demo data references a photo library that is not part
 * of the repository, so unresolved paths fall back deterministically instead of
 * rendering a broken image:
 *
 *   exact file → category photo → branded placeholder (no image at all)
 *
 * Resolution happens on the server, so the client never has to handle a 404.
 */

const PUBLIC_DIR = path.join(process.cwd(), "public");

const CATEGORY_FALLBACKS: Record<string, string> = {
  pizza: "/images/menu/pizza.jpg",
  pasta: "/images/menu/pasta.jpg",
  grill: "/images/menu/grill.jpg",
  starters: "/images/menu/starters.jpg",
  desserts: "/images/menu/desserts.jpg",
  drinks: "/images/menu/drinks.jpg",
};

const fileCache = new Map<string, boolean>();

function fileExists(publicPath: string): boolean {
  const cached = fileCache.get(publicPath);
  if (cached !== undefined) return cached;
  const normalised = publicPath.split("?")[0] ?? publicPath;
  const resolved = path.join(PUBLIC_DIR, normalised.replace(/^\//, ""));
  const exists = resolved.startsWith(PUBLIC_DIR) && existsSync(resolved);
  fileCache.set(publicPath, exists);
  return exists;
}

/** True when the app should render a local file for this URL. */
export function hasPublicImage(url: string | null | undefined): boolean {
  if (!url) return false;
  if (/^https?:\/\//i.test(url)) return true; // remote (Supabase Storage / CDN)
  if (!url.startsWith("/")) return false;
  return fileExists(url);
}

/**
 * Best available image for a menu item: its own photo, then the photo of its
 * category, then `null` so the caller can render a designed placeholder.
 */
export function resolveMenuImage(
  itemImageUrl: string | null | undefined,
  categorySlug: string | null | undefined,
): string | null {
  if (hasPublicImage(itemImageUrl)) return itemImageUrl ?? null;
  const fallback = categorySlug ? CATEGORY_FALLBACKS[categorySlug] : undefined;
  return hasPublicImage(fallback) ? (fallback ?? null) : null;
}

/** Best available image for editorial content, or `null` for a placeholder. */
export function resolveImage(url: string | null | undefined): string | null {
  return hasPublicImage(url) ? (url ?? null) : null;
}
