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

/** A drawn delivery area: [latitude, longitude] points in order (closing edge implied). */
export type Polygon = [number, number][];

const validPoint = (point: unknown): point is [number, number] =>
  Array.isArray(point) &&
  point.length === 2 &&
  typeof point[0] === "number" &&
  typeof point[1] === "number" &&
  Math.abs(point[0]) <= 90 &&
  Math.abs(point[1]) <= 180;

/** Tolerant reader for stored JSON: a well-formed polygon, or null (never throws). */
export function toPolygon(value: unknown): Polygon | null {
  return Array.isArray(value) && value.length >= 3 && value.every(validPoint) ? (value as Polygon) : null;
}

/**
 * Is `point` inside `polygon`? Ray casting on latitude/longitude — accurate at delivery-zone scale (a few
 * km; no zone crosses a pole or the antimeridian). A point exactly ON an edge counts as inside, so a
 * customer on the boundary road is not refused by floating-point luck.
 */
export function pointInPolygon(point: GeoPoint, polygon: Polygon): boolean {
  const y = point.latitude;
  const x = point.longitude;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [yi, xi] = polygon[i]!;
    const [yj, xj] = polygon[j]!;
    if (onSegment(x, y, xi, yi, xj, yj)) return true;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function onSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): boolean {
  const cross = (px - ax) * (by - ay) - (py - ay) * (bx - ax);
  if (Math.abs(cross) > 1e-12) return false;
  return Math.min(ax, bx) - 1e-12 <= px && px <= Math.max(ax, bx) + 1e-12 && Math.min(ay, by) - 1e-12 <= py && py <= Math.max(ay, by) + 1e-12;
}

/** Why a drawn polygon cannot be saved, or null when it is fine (admin + server validation). */
export function polygonProblem(polygon: Polygon): string | null {
  if (polygon.length < 3) return "Draw at least 3 points.";
  if (polygon.length > 200) return "Use at most 200 points.";
  if (!polygon.every(validPoint)) return "Some points are not valid coordinates.";
  // edges must not cross: a figure-eight has no clear "inside"
  const n = polygon.length;
  for (let i = 0; i < n; i += 1) {
    for (let j = i + 1; j < n; j += 1) {
      if (j === i + 1 || (i === 0 && j === n - 1)) continue; // neighbours share a point
      if (segmentsCross(polygon[i]!, polygon[(i + 1) % n]!, polygon[j]!, polygon[(j + 1) % n]!)) {
        return "The outline crosses itself. Move or remove a point so the edges do not cross.";
      }
    }
  }
  // (after the crossing check: a symmetric figure-eight's signed area cancels to 0)
  // shoelace area in degrees²: ~0 means all points on one line (no area to deliver to)
  let twiceArea = 0;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    twiceArea += polygon[j]![1] * polygon[i]![0] - polygon[i]![1] * polygon[j]![0];
  }
  if (Math.abs(twiceArea) < 1e-9) return "The area is empty — spread the points out.";
  const span = Math.max(...polygon.map((p) => haversineKm({ latitude: p[0], longitude: p[1] }, { latitude: polygon[0]![0], longitude: polygon[0]![1] })));
  if (span > 150) return "The area is too large for a delivery zone (over 150 km across).";
  return null;
}

function segmentsCross(a: [number, number], b: [number, number], c: [number, number], d: [number, number]): boolean {
  const orient = (p: [number, number], q: [number, number], r: [number, number]) =>
    Math.sign((q[1] - p[1]) * (r[0] - p[0]) - (q[0] - p[0]) * (r[1] - p[1]));
  const o1 = orient(a, b, c);
  const o2 = orient(a, b, d);
  const o3 = orient(c, d, a);
  const o4 = orient(c, d, b);
  return o1 !== o2 && o3 !== o4 && o1 !== 0 && o2 !== 0 && o3 !== 0 && o4 !== 0;
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
