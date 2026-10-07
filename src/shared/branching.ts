/**
 * Multi-branch ordering (`restaurants.features.BranchingFeature`): the shapes shared by the server
 * (which decides which branches serve a destination) and the browser (which remembers the destination
 * and the chosen branch). Pure and isomorphic.
 *
 * Two pieces of state, both browser cookies, neither trusted for money:
 *   - the DESTINATION (where the food goes) in `rp_dest_<slug>`, defined here;
 *   - the BRANCH in the tray cookie's `locationId` (shared/tray.ts), as it already was.
 * The order transaction re-checks both: zones are read for the tray's branch only and an item switched
 * off at that branch is refused (repositories/orders.ts#createOrder).
 */

/** Where the customer wants the order delivered. Coordinates are optional (typed-in addresses). */
export interface DeliveryDestination {
  /** what the menu bar shows: "DHA Phase 5, Lahore" */
  label: string;
  line1: string;
  area: string;
  city: string;
  postalCode: string;
  latitude: number | null;
  longitude: number | null;
  /** the saved address it came from, so checkout preselects it */
  addressId: string | null;
}

/** A branch as the storefront lists it, nearest first when the destination has coordinates. */
export interface BranchOption {
  id: string;
  name: string;
  address: string;
  city: string | null;
  /** straight-line distance from the destination; null when either side has no coordinates */
  distanceKm: number | null;
}

/** What the layout hands the browser on every page load (computed from the snapshot, no database). */
export interface BranchingState {
  destination: DeliveryDestination | null;
  /** branches whose delivery zones cover the destination, nearest first; empty without a destination */
  delivery: BranchOption[];
  /** every active branch (pickup / dine-in choose among these), nearest first when a destination is known */
  all: BranchOption[];
  /** branch id -> ids of the items switched off there */
  unavailable: Record<string, string[]>;
  /** cities with an active branch that has an active delivery zone ("we deliver in Lahore and Islamabad") */
  deliveryCities: string[];
}

const DESTINATION_COOKIE_PREFIX = "rp_dest_";
export const DESTINATION_COOKIE_MAX_AGE = 60 * 60 * 24 * 60; // 60 days

export function destinationCookieName(slug: string): string {
  return `${DESTINATION_COOKIE_PREFIX}${slug.replace(/[^a-zA-Z0-9_-]/g, "")}`;
}

const text = (value: unknown, max: number): string => (typeof value === "string" ? value.trim().slice(0, max) : "");
const coordinate = (value: unknown, limit: number): number | null =>
  typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= limit ? value : null;

/** Normalises anything destination-shaped; null when it names no place at all. */
export function normaliseDestination(input: unknown): DeliveryDestination | null {
  if (!input || typeof input !== "object") return null;
  const raw = input as Record<string, unknown>;
  const line1 = text(raw.line1, 200);
  const area = text(raw.area, 120);
  const city = text(raw.city, 120);
  const postalCode = text(raw.postalCode, 20);
  if (!area && !city && !postalCode) return null;
  const latitude = coordinate(raw.latitude, 90);
  const longitude = coordinate(raw.longitude, 180);
  return {
    label: text(raw.label, 120) || [area, city].filter(Boolean).join(", ") || postalCode,
    line1,
    area,
    city,
    postalCode,
    // a point is both numbers or neither
    latitude: latitude !== null && longitude !== null ? latitude : null,
    longitude: latitude !== null && longitude !== null ? longitude : null,
    addressId: text(raw.addressId, 64) || null,
  };
}

export function encodeDestination(destination: DeliveryDestination): string {
  return encodeURIComponent(JSON.stringify(destination));
}

/** Tolerant: a missing, tampered or old-format cookie is simply "no destination yet". */
export function decodeDestination(value: string | null | undefined): DeliveryDestination | null {
  if (!value) return null;
  try {
    return normaliseDestination(JSON.parse(decodeURIComponent(value)));
  } catch {
    return null;
  }
}

/** The branches a customer may order from for this order type. */
export function branchesFor(state: Pick<BranchingState, "delivery" | "all">, orderType: string): BranchOption[] {
  return orderType === "delivery" ? state.delivery : state.all;
}

/** "2.4 km" / "850 m"; empty when the distance is unknown. */
export function formatDistance(distanceKm: number | null): string {
  if (distanceKm === null) return "";
  return distanceKm < 1 ? `${Math.max(50, Math.round(distanceKm * 20) * 50)} m` : `${distanceKm.toFixed(1)} km`;
}
