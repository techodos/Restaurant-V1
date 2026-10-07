-- =============================================================================
-- 0030 — Delivery zones by map: a radius around the branch, or a drawn polygon
-- =============================================================================
-- Until now a zone was only a list of area NAMES matched as text ("Bahria Town", "DHA"), which cannot
-- tell two places with the same name apart or follow a real boundary. A zone may now instead cover:
--   * radius_km — everything within that straight-line distance of its branch's coordinates, or
--   * polygon   — the area drawn on a map: a JSON array of [latitude, longitude] points (3..200).
-- At most one of the two per zone; neither = the old area-name zone, unchanged. The customer's map pin
-- is checked against it (repositories/deliveries.ts#servingZones); the city stays a hard boundary.
-- Additive: existing zones and code that does not know these columns keep working.

alter table delivery_zones
  add column radius_km numeric(6,2),
  add column polygon jsonb;

alter table delivery_zones
  add constraint delivery_zones_one_geometry check (radius_km is null or polygon is null),
  add constraint delivery_zones_radius_range check (radius_km is null or (radius_km > 0 and radius_km <= 100)),
  add constraint delivery_zones_polygon_shape check (
    polygon is null
    or (jsonb_typeof(polygon) = 'array' and jsonb_array_length(polygon) between 3 and 200)
  );
