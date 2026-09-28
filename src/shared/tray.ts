import { ORDER_TYPES, type OrderType } from "./contract/enums";

/**
 * The tray (cart) as it travels in a cookie — the ONLY place a cart lives before an order is placed
 * (DECISIONS.md §28). Pure and dependency-free: the browser writes it (`document.cookie`, no request),
 * the server reads it (layout, checkout, place order) and prices it from the in-memory menu. Nothing
 * here is trusted for money: `createOrder` re-resolves every id against the live database.
 *
 * Wire format (URL/cookie-safe characters only, so no percent-encoding bloat):
 *   v1!<orderType>!<locationHex|_>!<couponB64|_>!<line>*<line>…
 *   line  = <itemHex>.<variantHex|_>.<qty>.<addons|_>.<noteB64|_>
 *   addons = <addonHex>~<qty>,<addonHex>~<qty>…
 * UUIDs are stored as 32 hex chars (hyphens dropped). A 4 KB cookie holds ~60 plain lines; the
 * browser refuses an add that would push it past TRAY_COOKIE_MAX_CHARS rather than silently lose it.
 */

export const TRAY_COOKIE_PREFIX = "rp_tray_";
/** Browsers cap a cookie (name + value) at 4096 bytes; leave room for the name and attributes. */
export const TRAY_COOKIE_MAX_CHARS = 3800;
export const TRAY_COOKIE_MAX_AGE = 60 * 60 * 24 * 30;
export const MAX_TRAY_LINES = 50;
export const MAX_LINE_QUANTITY = 99;
export const MAX_NOTE_LENGTH = 140;

export interface TrayAddon {
  addonId: string;
  quantity: number;
}

export interface TrayLine {
  menuItemId: string;
  variantId: string | null;
  quantity: number;
  addons: TrayAddon[];
  specialInstructions?: string;
}

export interface Tray {
  orderType: OrderType;
  locationId: string | null;
  couponCode: string | null;
  lines: TrayLine[];
}

/** Cookie names allow letters, digits and hyphens; slugs are already that shape. */
export function trayCookieName(restaurantSlug: string): string {
  return `${TRAY_COOKIE_PREFIX}${restaurantSlug.replace(/[^a-z0-9-]/gi, "")}`;
}

export function emptyTray(orderType: OrderType): Tray {
  return { orderType, locationId: null, couponCode: null, lines: [] };
}

const UUID_HEX = /^[0-9a-f]{32}$/;

function toHex(uuid: string): string {
  return uuid.replace(/-/g, "").toLowerCase();
}

function fromHex(hex: string): string | null {
  if (!UUID_HEX.test(hex)) return null;
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

// base64url over UTF-8, written without Buffer/btoa differences between browser and Node
function toB64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64(value: string): string | null {
  try {
    const binary = atob(value.replace(/-/g, "+").replace(/_/g, "/"));
    return new TextDecoder().decode(Uint8Array.from(binary, (char) => char.charCodeAt(0)));
  } catch {
    return null;
  }
}

function clampQuantity(value: number, max: number): number {
  return Math.min(Math.max(Math.trunc(value) || 1, 1), max);
}

export function encodeTray(tray: Tray): string {
  const lines = tray.lines.map((line) => {
    const addons = line.addons.length
      ? line.addons.map((addon) => `${toHex(addon.addonId)}~${clampQuantity(addon.quantity, 20)}`).join(",")
      : "_";
    const note = line.specialInstructions?.trim() ? toB64(line.specialInstructions.trim().slice(0, MAX_NOTE_LENGTH)) : "_";
    return [
      toHex(line.menuItemId),
      line.variantId ? toHex(line.variantId) : "_",
      clampQuantity(line.quantity, MAX_LINE_QUANTITY),
      addons,
      note,
    ].join(".");
  });
  return [
    "v1",
    tray.orderType,
    tray.locationId ? toHex(tray.locationId) : "_",
    tray.couponCode ? toB64(tray.couponCode.slice(0, 40)) : "_",
    lines.join("*"),
  ].join("!");
}

/**
 * Tolerant by design: the cookie is user-controlled, so anything malformed — a bad id, an unknown
 * order type, an old format — is dropped line by line (or the whole tray falls back to empty) instead
 * of throwing. Shape only; whether an id is really on the menu is the resolver's job.
 */
export function decodeTray(value: string | null | undefined, defaultOrderType: OrderType): Tray {
  if (!value) return emptyTray(defaultOrderType);
  const parts = value.split("!");
  if (parts.length !== 5 || parts[0] !== "v1") return emptyTray(defaultOrderType);
  const [, orderTypeRaw, locationRaw, couponRaw, linesRaw] = parts as [string, string, string, string, string];

  const orderType = (ORDER_TYPES as readonly string[]).includes(orderTypeRaw) ? (orderTypeRaw as OrderType) : defaultOrderType;
  const locationId = locationRaw === "_" ? null : fromHex(locationRaw);
  const couponCode = couponRaw === "_" ? null : (fromB64(couponRaw)?.trim().slice(0, 40) || null);

  const lines: TrayLine[] = [];
  for (const raw of linesRaw ? linesRaw.split("*") : []) {
    if (lines.length >= MAX_TRAY_LINES) break;
    const [itemHex, variantHex, qtyRaw, addonsRaw, noteRaw] = raw.split(".");
    const menuItemId = fromHex(itemHex ?? "");
    if (!menuItemId) continue;
    const variantId = variantHex === "_" || !variantHex ? null : fromHex(variantHex);
    if (variantHex && variantHex !== "_" && !variantId) continue;

    const addons: TrayAddon[] = [];
    if (addonsRaw && addonsRaw !== "_") {
      for (const entry of addonsRaw.split(",")) {
        const [addonHex, addonQty] = entry.split("~");
        const addonId = fromHex(addonHex ?? "");
        if (addonId) addons.push({ addonId, quantity: clampQuantity(Number(addonQty), 20) });
      }
    }
    const note = noteRaw && noteRaw !== "_" ? fromB64(noteRaw)?.slice(0, MAX_NOTE_LENGTH) : undefined;
    lines.push({
      menuItemId,
      variantId,
      quantity: clampQuantity(Number(qtyRaw), MAX_LINE_QUANTITY),
      addons,
      ...(note ? { specialInstructions: note } : {}),
    });
  }
  return { orderType, locationId, couponCode, lines };
}

export function trayItemCount(tray: Pick<Tray, "lines">): number {
  return tray.lines.reduce((total, line) => total + line.quantity, 0);
}

/** Whether the encoded tray still fits in one cookie. */
export function trayFitsCookie(tray: Tray): boolean {
  return tray.lines.length <= MAX_TRAY_LINES && encodeTray(tray).length <= TRAY_COOKIE_MAX_CHARS;
}

/** How one tray line is shown (name, options, estimated price) — computed from the current menu on the server, or captured by the add button. */
export interface TrayLineDisplay {
  name: string;
  slug: string | null;
  imageUrl: string | null;
  variantName: string | null;
  addonNames: string[];
  unitPrice: string;
  addonsTotal: string;
  /** why the line cannot be ordered right now, else null */
  problem: string | null;
}

/** The tray as the server hands it to the browser on a full page load: the cookie's lines plus how to show each. */
export interface InitialTray {
  /** the cookie value it was read from, so the browser can tell when another tab changed it */
  encoded: string;
  tray: Tray;
  /** `displays[i]` belongs to `tray.lines[i]` */
  displays: TrayLineDisplay[];
  /** the tray's promo code preview discount (subtotal only), or null when there is none / it no longer applies */
  couponDiscount: string | null;
}
