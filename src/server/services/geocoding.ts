import { config } from "@/server/config";
import { logger } from "@/server/logger";

/**
 * Reverse geocoding via OpenStreetMap Nominatim, replacing Google's Geocoding Service (which requires
 * billing enabled). Google Maps itself (map display, marker, Places search) is unchanged — see
 * `components/storefront/location-picker.tsx`. Isolated here so a self-hosted Nominatim instance only
 * needs `NOMINATIM_BASE_URL` changed, not a code change.
 */
export interface ReverseGeocodeResult {
  formattedAddress: string;
  addressLine1: string;
  area: string;
  city: string;
  postalCode: string;
}

interface NominatimAddress {
  house_number?: string;
  road?: string;
  suburb?: string;
  neighbourhood?: string;
  quarter?: string;
  city?: string;
  town?: string;
  village?: string;
  county?: string;
  postcode?: string;
}

interface NominatimResponse {
  display_name?: string;
  address?: NominatimAddress;
  error?: string;
}

// Nominatim's usage policy caps the public instance at 1 request/second from one source. This process
// serves every customer's reverse-geocode call through the same outbound IP, so throttle them into a
// single-file queue rather than trusting the client to space out drag/search/current-location calls.
// ponytail: a module-level queue is a per-process limit, not a global one — fine for one deploy, a shared
// cache/queue (Redis) would be needed if this process is horizontally scaled.
let queue: Promise<unknown> = Promise.resolve();
let lastRequestAt = 0;
const MIN_INTERVAL_MS = 1100;

function throttled<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(async () => {
    const wait = MIN_INTERVAL_MS - (Date.now() - lastRequestAt);
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    lastRequestAt = Date.now();
    return task();
  });
  queue = run.catch(() => {}); // one failed request must not jam the queue for later callers
  return run;
}

// Nominatim's `address.city` for a cantonment area is the cantonment's own administrative name
// ("Lahore Cant", "Lahore Cantonment", "Rawalpindi Cantt"), not the city it belongs to — but that's
// the only field delivery-zone matching cares about (zones match free-text city strings against
// `restaurant1s.city`, e.g. "Lahore"), so a cantonment suffix left in place silently breaks matching
// for every customer who lives in one. Stripping the suffix recovers the parent city name in every
// case this project has seen; it never touches a city that isn't a cantonment.
const CANTONMENT_SUFFIX = /\s+cant(t|onment)?\.?$/i;
function normalizeCity(raw: string): string {
  return raw.replace(CANTONMENT_SUFFIX, "").trim();
}

function formatAddress(address: NominatimAddress | undefined, fallback: string): { addressLine1: string; area: string; city: string; postalCode: string } {
  const streetLine = [address?.house_number, address?.road].filter(Boolean).join(" ");
  return {
    addressLine1: streetLine || fallback,
    area: address?.suburb || address?.neighbourhood || address?.quarter || "",
    city: normalizeCity(address?.city || address?.town || address?.village || address?.county || ""),
    postalCode: address?.postcode || "",
  };
}

export async function reverseGeocode(latitude: number, longitude: number, signal?: AbortSignal): Promise<ReverseGeocodeResult | null> {
  return throttled(async () => {
    const url = new URL("/reverse", config.geocoding.baseUrl);
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("lat", String(latitude));
    url.searchParams.set("lon", String(longitude));
    url.searchParams.set("zoom", "18");
    url.searchParams.set("addressdetails", "1");

    const timeout = AbortSignal.timeout(8_000);
    const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;

    let response: Response;
    try {
      response = await fetch(url, {
        headers: { "User-Agent": config.geocoding.userAgent, "Accept-Language": "en" },
        signal: combined,
      });
    } catch (fetchError) {
      if (signal?.aborted) throw fetchError; // caller's own cancellation (stale request) — let it propagate
      logger.warn("geocoding", "reverse geocode request failed", fetchError);
      return null;
    }

    if (!response.ok) {
      // Nominatim returns 429 for rate limiting, 4xx for bad params — never surface raw status/body to the client
      logger.warn("geocoding", `reverse geocode returned ${response.status}`);
      return null;
    }

    const data = (await response.json()) as NominatimResponse;
    if (data.error || !data.display_name) return null;

    const { addressLine1, area, city, postalCode } = formatAddress(data.address, data.display_name);
    return { formattedAddress: data.display_name, addressLine1, area, city, postalCode };
  });
}
