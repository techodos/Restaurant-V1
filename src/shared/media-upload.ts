/**
 * Dish photos uploaded from the admin menu form. One rulebook for the browser (checks before sending, shrinks a
 * too-large phone photo) and the server (`services/menu-admin.ts#uploadMenuImage`, the real gate).
 * Raster photos only: no SVG (it can carry script) and no GIF (a dish photo is never animated).
 */
export const MENU_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/avif"] as const;

/** Server Actions accept 4 MB request bodies (next.config.ts `serverActions.bodySizeLimit`); stay just under it. */
export const MENU_IMAGE_MAX_BYTES = 4_000_000;

/** `accept` attribute for the file input. */
export const MENU_IMAGE_ACCEPT = MENU_IMAGE_TYPES.join(",");

export const MENU_IMAGE_HINT = "JPG, PNG, WEBP or AVIF · up to 4 MB";

export function isMenuImageType(type: string): boolean {
  return (MENU_IMAGE_TYPES as readonly string[]).includes(type);
}

/** Why this file cannot be a dish photo, or null when it can. */
export function menuImageProblem(file: { type: string; size: number }): string | null {
  if (!isMenuImageType(file.type)) return "Use a JPG, PNG, WEBP or AVIF photo.";
  if (file.size <= 0) return "This file is empty.";
  if (file.size > MENU_IMAGE_MAX_BYTES) return `Photos must be 4 MB or smaller (this one is ${formatBytes(file.size)}).`;
  return null;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1000) return `${bytes} B`;
  if (bytes < 1_000_000) return `${Math.round(bytes / 1000)} KB`;
  return `${(bytes / 1_000_000).toFixed(1)} MB`;
}
