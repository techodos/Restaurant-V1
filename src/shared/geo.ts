/** Pure geo helpers: no I/O, isomorphic (used by both the browser picker and, if ever needed, server code). */

export interface GeoPoint {
  latitude: number;
  longitude: number;
}

const EARTH_RADIUS_KM = 6371;

/** Great-circle distance between two points, in kilometres. */
export function haversineKm(a: GeoPoint, b: GeoPoint): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

/**
 * Sorts locations that have coordinates by distance from `point`, nearest first. Locations without
 * both latitude and longitude are dropped (a branch missing geo data cannot be ranked; it still shows
 * up in a plain city-filtered list, just without a distance badge).
 */
export function sortByDistance<T extends { latitude: number | null; longitude: number | null }>(
  locations: T[],
  point: GeoPoint,
): Array<T & { distanceKm: number }> {
  return locations
    .filter((location): location is T & { latitude: number; longitude: number } => location.latitude !== null && location.longitude !== null)
    .map((location) => ({ ...location, distanceKm: haversineKm(point, { latitude: location.latitude, longitude: location.longitude }) }))
    .sort((a, b) => a.distanceKm - b.distanceKm);
}
