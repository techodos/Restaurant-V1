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
  /**
   * Per delivery city, the area names its zones list (sorted, de-duplicated, the city's own name left out),
   * for the location sheet's area dropdown. A city whose zones only use a radius or a drawn shape has no
   * names here; the sheet then lets the customer type an area.
   */
  deliveryAreas: { city: string; areas: string[] }[];
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

/** Same city, ignoring case and spacing; an unknown city on either side is never "the same". */
export function sameCity(a: string | null | undefined, b: string | null | undefined): boolean {
  const left = (a ?? "").trim().toLowerCase();
  return left !== "" && left === (b ?? "").trim().toLowerCase();
}

/**
 * Pickup / dine-in from a branch in another city (owner decision 2026-10-27): with a location chosen, only that city's
 * branches; with none, every branch (checkout then has the customer confirm which branch, and where, before
 * placing it). A branch with no city on record is never hidden (nothing to compare). `createOrder` applies the
 * same rule (`customerCity`), so the menu, checkout and the order agree.
 */
export function inCustomerCity(branch: Pick<BranchOption, "city">, customerCity: string | null | undefined): boolean {
  return !customerCity?.trim() || !branch.city?.trim() || sameCity(branch.city, customerCity);
}

/** The branches a customer may order from for this order type. */
export function branchesFor(state: Pick<BranchingState, "delivery" | "all" | "destination">, orderType: string): BranchOption[] {
  if (orderType === "delivery") return state.delivery;
  return state.all.filter((branch) => inCustomerCity(branch, state.destination?.city));
}

/** Cities that have a branch, in list order ("our branches are in Lahore and Islamabad"). */
export function branchCities(state: Pick<BranchingState, "all">): string[] {
  const seen = new Map<string, string>();
  for (const branch of state.all) {
    const city = branch.city?.trim();
    if (city && !seen.has(city.toLowerCase())) seen.set(city.toLowerCase(), city);
  }
  return [...seen.values()];
}

/** "Lahore", "Lahore and Islamabad", "Lahore, Islamabad and Karachi" */
export function listCities(cities: readonly string[]): string {
  return cities.length <= 1 ? (cities[0] ?? "") : `${cities.slice(0, -1).join(", ")} and ${cities[cities.length - 1]}`;
}

/** "2.4 km" / "850 m"; empty when the distance is unknown. */
export function formatDistance(distanceKm: number | null): string {
  if (distanceKm === null) return "";
  return distanceKm < 1 ? `${Math.max(50, Math.round(distanceKm * 20) * 50)} m` : `${distanceKm.toFixed(1)} km`;
}

/**
 * The branch an order belongs to. Multi-branch ordering on: the one the customer chose (the tray's).
 * Off (single-branch mode): always the restaurant's primary branch, so a branch id left in the cookie
 * (picked while the flag was on, or edited by hand) can never move the order to another kitchen or its
 * delivery zones. No locations at all: null, and `createOrder` records the serving zone's branch.
 */
export function orderBranchId(branchingEnabled: boolean, trayLocationId: string | null, primaryLocationId: string | null): string | null {
  return branchingEnabled ? trayLocationId : primaryLocationId;
}
