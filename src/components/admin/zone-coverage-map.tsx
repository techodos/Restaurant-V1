"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, RotateCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { loadGoogleMaps } from "@/components/storefront/location-picker";
import { polygonProblem, type Polygon } from "@/shared/geo";

type LatLng = { latitude: number; longitude: number };

/**
 * The map behind a delivery zone (migration 0030): a RADIUS around the branch (preview only — the number
 * is typed beside it) or a POLYGON the admin draws: click the map to add a corner, drag a corner to move
 * it, drag a mid-edge handle to add one; Undo / Clear. Built on the core Maps JS `Polygon`/`Circle`
 * (editable), not the Drawing library. The map container is BARE — status/hints are sibling overlays — the
 * same DOM-ownership rule as LocationPicker (React children inside a Maps-owned node crash on removeChild).
 * The polygon is uncontrolled after mount: the map owns the path and reports every change.
 */
export function ZoneCoverageMap({
  apiKey,
  mode,
  branch,
  radiusKm,
  initialPolygon,
  onPolygonChange,
}: {
  apiKey: string;
  mode: "radius" | "polygon";
  branch: LatLng | null;
  radiusKm: number | null;
  initialPolygon: Polygon | null;
  onPolygonChange: (polygon: Polygon) => void;
}) {
  const mapDivRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const circleRef = useRef<google.maps.Circle | null>(null);
  const polygonRef = useRef<google.maps.Polygon | null>(null);
  const listenersRef = useRef<google.maps.MapsEventListener[]>([]);
  const onChangeRef = useRef(onPolygonChange);
  onChangeRef.current = onPolygonChange;
  const [status, setStatus] = useState<"loading" | "ready" | "unavailable">("loading");
  const [points, setPoints] = useState<Polygon>(initialPolygon ?? []);

  // load once, build the map + branch marker + the shape for this mode
  useEffect(() => {
    let alive = true;
    loadGoogleMaps(apiKey)
      .then(() => {
        if (!alive || !mapDivRef.current) return;
        const center = branch ?? centroid(initialPolygon) ?? { latitude: 31.5204, longitude: 74.3587 };
        const map = new google.maps.Map(mapDivRef.current, {
          center: { lat: center.latitude, lng: center.longitude },
          zoom: 13,
          streetViewControl: false,
          mapTypeControl: false,
          fullscreenControl: false,
          clickableIcons: false,
          // drawing = clicking: a quick second click must add a corner, not zoom the map
          disableDoubleClickZoom: mode === "polygon",
        });
        mapRef.current = map;
        // Maps needs a real colour string, not a CSS var: read the restaurant's brand token (web/theme.ts)
        // from the admin shell this map renders in; empty = Maps' own default
        const shapeColor = getComputedStyle(mapDivRef.current).getPropertyValue("--color-brand").trim() || undefined;
        if (branch) new google.maps.Marker({ map, position: { lat: branch.latitude, lng: branch.longitude }, title: "Branch" });

        if (mode === "radius") {
          circleRef.current = new google.maps.Circle({
            map,
            center: branch ? { lat: branch.latitude, lng: branch.longitude } : map.getCenter()!,
            radius: (radiusKm ?? 0) * 1000,
            strokeColor: shapeColor,
            strokeWeight: 2,
            fillColor: shapeColor,
            fillOpacity: 0.12,
            clickable: false,
          });
        } else {
          // the path is created HERE and handed to the polygon as a LIST OF ONE path. Two browser-test
          // findings: a Polygon built with empty `paths` has no live path (clicks never showed), and a bare
          // empty MVCArray is read as a list of paths (each click became a "path": a.forEach is not a function)
          const path = new google.maps.MVCArray<google.maps.LatLng>(
            (initialPolygon ?? []).map(([lat, lng]) => new google.maps.LatLng(lat, lng)),
          );
          const polygon = new google.maps.Polygon({
            map,
            paths: new google.maps.MVCArray([path]),
            editable: true,
            strokeColor: shapeColor,
            strokeWeight: 2,
            fillColor: shapeColor,
            fillOpacity: 0.15,
          });
          polygonRef.current = polygon;
          const report = () => {
            const next: Polygon = path.getArray().map((point) => [round(point.lat()), round(point.lng())]);
            setPoints(next);
            onChangeRef.current(next);
          };
          listenersRef.current.push(
            path.addListener("insert_at", report),
            path.addListener("set_at", report),
            path.addListener("remove_at", report),
            map.addListener("click", (event: google.maps.MapMouseEvent) => {
              if (event.latLng) path.push(event.latLng);
            }),
            // a click that lands ON the drawn shape (not on a corner/edge handle) adds a corner too —
            // the shape covers the map, so without this it would swallow the click
            polygon.addListener("click", (event: google.maps.PolyMouseEvent) => {
              if (event.latLng && event.vertex === undefined && event.edge === undefined && event.path === undefined) path.push(event.latLng);
            }),
          );
          if (initialPolygon?.length) {
            const bounds = new google.maps.LatLngBounds();
            initialPolygon.forEach(([lat, lng]) => bounds.extend({ lat, lng }));
            map.fitBounds(bounds, 40);
          }
        }
        setStatus("ready");
      })
      .catch((error) => {
        console.error("[ZoneCoverageMap] Google Maps failed to load:", error);
        if (alive) setStatus("unavailable");
      });
    return () => {
      alive = false;
      listenersRef.current.forEach((listener) => listener.remove());
      listenersRef.current = [];
      circleRef.current?.setMap(null);
      polygonRef.current?.setMap(null);
      circleRef.current = null;
      polygonRef.current = null;
      mapRef.current = null;
    };
    // the map is rebuilt only when the mode or the branch changes; radius updates below, polygon is uncontrolled
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiKey, mode, branch?.latitude, branch?.longitude]);

  // the radius typed beside the map: resize the circle and keep it in view
  useEffect(() => {
    const circle = circleRef.current;
    if (!circle || status !== "ready") return;
    circle.setRadius((radiusKm ?? 0) * 1000);
    const bounds = circle.getBounds();
    if (bounds && (radiusKm ?? 0) > 0) mapRef.current?.fitBounds(bounds, 30);
  }, [radiusKm, status]);

  const problem = mode === "polygon" && points.length > 0 ? polygonProblem(points) : null;

  return (
    <div className="space-y-2">
      <div className="relative h-72 overflow-hidden rounded-[var(--radius-card)] border border-[var(--rule)] bg-[var(--steel-2)]">
        <div ref={mapDivRef} className="absolute inset-0" />
        {status !== "ready" ? (
          <div className="pointer-events-none absolute inset-0 grid place-items-center text-sm text-[var(--color-muted-ink)]">
            {status === "loading" ? <Loader2 className="size-5 animate-spin" aria-hidden /> : "The map could not load. Check the Google Maps key."}
          </div>
        ) : null}
      </div>
      {mode === "polygon" ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className={problem ? "text-xs text-[var(--color-danger)]" : "text-xs text-[var(--color-muted-ink)]"}>
            {problem ??
              (points.length
                ? `${points.length} corners. Drag a corner to move it, or the small handle on an edge to add one.`
                : "Click on the map around the area this branch delivers to (at least 3 points).")}
          </p>
          <div className="flex gap-1.5">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={!points.length}
              onClick={() => {
                const path = polygonRef.current?.getPath();
                if (path && path.getLength()) path.removeAt(path.getLength() - 1);
              }}
            >
              <RotateCcw className="size-3.5" aria-hidden /> Undo
            </Button>
            <Button type="button" size="sm" variant="ghost" disabled={!points.length} onClick={() => polygonRef.current?.getPath().clear()}>
              <Trash2 className="size-3.5" aria-hidden /> Clear
            </Button>
          </div>
        </div>
      ) : !branch ? (
        <p className="text-xs text-[var(--color-danger)]">This branch has no map location yet — set it under Locations to use a radius.</p>
      ) : null}
    </div>
  );
}

const round = (value: number) => Math.round(value * 1e6) / 1e6; // ~0.1 m, keeps the stored JSON small

function centroid(polygon: Polygon | null): LatLng | null {
  if (!polygon?.length) return null;
  const sum = polygon.reduce((acc, [lat, lng]) => [acc[0] + lat, acc[1] + lng], [0, 0]);
  return { latitude: sum[0] / polygon.length, longitude: sum[1] / polygon.length };
}
