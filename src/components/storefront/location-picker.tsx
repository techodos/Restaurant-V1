/// <reference types="google.maps" />
"use client";

import { useEffect, useId, useRef, useState, useCallback } from "react";
import { Loader2, LocateFixed, MapPin, Search } from "lucide-react";
import { cn } from "@/shared/utils";

export interface ResolvedLocation {
  formattedAddress: string;
  addressLine1: string;
  area: string;
  city: string;
  postalCode: string;
  latitude: number;
  longitude: number;
}

interface LocationPickerProps {
  apiKey: string | null;
  /** Restricts search/geocoding to this country (ISO 3166-1 alpha-2, e.g. "PK"); improves match quality. */
  country?: string;
  /** Map is centred here until the customer picks a point. */
  initialCenter?: { latitude: number; longitude: number };
  onResolve: (location: ResolvedLocation) => void;
}

// One script tag for the whole page, however many pickers mount (checkout + the address book).
// `loading=async` (Google's own recommended query param, on top of the <script> tag's own `async`
// attribute) silences "loaded directly without loading=async" and lets the API defer non-critical work.
// Gotcha: with `loading=async` the script's `onload` is NOT "API ready" — at that point `google.maps` may
// lack `Map`/`Geocoder`/`Marker` ("e.maps.Map is not a constructor") or even `importLibrary` itself
// ("e is not a function"). Only Google's `callback` URL param signals readiness, and the classes then
// still come from `google.maps.importLibrary()`.
const MAPS_READY_CALLBACK = "__locationPickerMapsReady";
let mapsLoader: Promise<typeof google> | null = null;
export function loadGoogleMaps(apiKey: string): Promise<typeof google> {
  if (!mapsLoader) {
    mapsLoader = new Promise<void>((resolve, reject) => {
      if (typeof window.google?.maps?.importLibrary === "function") return resolve();
      (window as unknown as Record<string, () => void>)[MAPS_READY_CALLBACK] = () => resolve();
      const script = document.createElement("script");
      script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&libraries=places&loading=async&callback=${MAPS_READY_CALLBACK}`;
      script.async = true;
      script.onerror = () => {
        script.remove();
        reject(new Error("Could not load Google Maps."));
      };
      document.head.appendChild(script);
    })
      .then(async () => {
        const maps = window.google.maps; // call as maps.importLibrary(...) — don't detach it from `maps`
        await Promise.all([
          maps.importLibrary("maps"),
          maps.importLibrary("geocoding"),
          maps.importLibrary("marker"),
          // search is optional (see the effect below) — a places failure must not take the map down
          maps.importLibrary("places").catch((placesError) => console.warn("[LocationPicker] places library failed to load:", placesError)),
        ]);
        return window.google;
      })
      .catch((loadError) => {
        mapsLoader = null; // let the next mount retry instead of caching the failure for the session
        throw loadError;
      });
  }
  return mapsLoader;
}

/** Legacy `Geocoder` result shape (`address_components`/`long_name`) — reverse-geocoding (drag pin,
 * current location) still uses this API; it is not deprecated, only the `Autocomplete` search widget is. */
function componentsToAddress(
  components: google.maps.GeocoderAddressComponent[] | undefined,
): { streetLine: string; area: string; city: string; postalCode: string } {
  const find = (type: string) => components?.find((c) => c.types.includes(type))?.long_name ?? "";
  const streetNumber = find("street_number");
  const route = find("route");
  return {
    streetLine: [streetNumber, route].filter(Boolean).join(" "),
    area: find("sublocality") || find("sublocality_level_1") || find("neighborhood") || "",
    city: find("locality") || find("administrative_area_level_2") || "",
    postalCode: find("postal_code"),
  };
}

/**
 * Delivery-location picker: current-location button, Places search, and a draggable pin on a map.
 * Renders nothing (checkout keeps its plain text fields) when no Maps API key is configured.
 *
 * DOM ownership rule this component is built around: `mapDivRef` and `autocompleteContainerRef` are
 * handed to Google Maps (`new google.maps.Map(...)`, `new google.maps.places.PlaceAutocompleteElement(...)`),
 * which then mutates their contents directly and imperatively — so neither div may ever have React-
 * rendered children. Mixing the two (e.g. a React-rendered loading spinner living *inside* the div Maps
 * has taken over) is what previously crashed the whole checkout page: React's own bookkeeping of that
 * node's children goes stale the moment Maps touches it, and the next time React tries to update those
 * children itself, `removeChild` throws `NotFoundError` on a node Maps already moved or removed — which,
 * because it happens mid-commit, corrupts the fiber tree and cascades into an unrelated "Rendered more
 * hooks than during the previous render" on the very next render. Any loading/status UI for either
 * element is rendered as an absolutely-positioned *sibling* overlay instead, never a child.
 */
export function LocationPicker({ apiKey, country, initialCenter, onResolve }: LocationPickerProps) {
  const mapDivRef = useRef<HTMLDivElement | null>(null);
  const autocompleteContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markerRef = useRef<google.maps.Marker | null>(null);
  const geocoderRef = useRef<google.maps.Geocoder | null>(null);
  const autocompleteElRef = useRef<google.maps.places.PlaceAutocompleteElement | null>(null);
  // The checkout form mounts/unmounts this component every time the customer toggles between a saved
  // address and "new address" (or picks another saved address). Google's own async callbacks (geocode
  // results, marker drag, place selection) can still land after that unmount and touch DOM nodes React
  // has already torn down, which crashes with "NotFoundError: Failed to execute 'removeChild'" — this
  // flag stops that.
  const mountedRef = useRef(true);
  const inputId = useId();

  const [status, setStatus] = useState<"idle" | "loading-script" | "ready" | "unavailable">(
    apiKey ? "loading-script" : "unavailable",
  );
  const [locating, setLocating] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resolved, setResolved] = useState<ResolvedLocation | null>(null);

  const reverseGeocode = useCallback((latitude: number, longitude: number) => {
    const geocoder = geocoderRef.current;
    if (!geocoder) return;
    setResolving(true);
    setError(null);
    geocoder.geocode({ location: { lat: latitude, lng: longitude } }, (results, geoStatus) => {
      if (!mountedRef.current) return; // the picker was unmounted while the geocode request was in flight
      setResolving(false);
      if (geoStatus !== "OK" || !results?.[0]) {
        // REQUEST_DENIED = key/project problem (billing off, Geocoding API not enabled, key restrictions), not the user's point
        if (geoStatus !== "ZERO_RESULTS") console.warn(`[LocationPicker] reverse geocode failed: ${geoStatus}`);
        setError("Could not resolve an address for that point. You can still drag the pin or type it manually below.");
        return;
      }
      const best = results[0];
      const { streetLine, area, city, postalCode } = componentsToAddress(best.address_components);
      const next: ResolvedLocation = {
        formattedAddress: best.formatted_address,
        addressLine1: streetLine || best.formatted_address,
        area,
        city,
        postalCode,
        latitude,
        longitude,
      };
      setResolved(next);
      onResolve(next);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const placeMarker = useCallback(
    (latitude: number, longitude: number) => {
      if (!mountedRef.current) return;
      const map = mapRef.current;
      if (!map) return;
      const position = { lat: latitude, lng: longitude };
      map.panTo(position);
      map.setZoom(Math.max(map.getZoom() ?? 15, 16));
      if (!markerRef.current) {
        markerRef.current = new google.maps.Marker({ map, position, draggable: true });
        markerRef.current.addListener("dragend", () => {
          const pos = markerRef.current?.getPosition();
          if (pos) reverseGeocode(pos.lat(), pos.lng());
        });
      } else {
        markerRef.current.setPosition(position);
      }
      reverseGeocode(latitude, longitude);
    },
    [reverseGeocode],
  );

  useEffect(() => {
    if (!apiKey) return;
    let cancelled = false;
    const listenerController = new AbortController();
    loadGoogleMaps(apiKey)
      .then((maps) => {
        if (cancelled || !mapDivRef.current) return;
        const center = initialCenter
          ? { lat: initialCenter.latitude, lng: initialCenter.longitude }
          : { lat: 30.3753, lng: 69.3451 }; // Pakistan-ish default; the first geolocate/search recentres it
        // `mapDivRef.current` becomes Maps' own container from this point on: no React children, ever.
        mapRef.current = new maps.maps.Map(mapDivRef.current, {
          center,
          zoom: initialCenter ? 16 : 5,
          disableDefaultUI: true,
          zoomControl: true,
          gestureHandling: "greedy",
        });
        geocoderRef.current = new maps.maps.Geocoder();

        // `google.maps.places.Autocomplete` is deprecated (closed to new customers as of March 2025);
        // `PlaceAutocompleteElement` is Google's current recommended replacement — a custom element we
        // mount ourselves into `autocompleteContainerRef`, again as its only (non-React-managed) child.
        // Isolated in its own try/catch: search is a nice-to-have on top of the map/current-location/
        // drag-pin flow, not a dependency of it — a failure constructing this element (e.g. the API key's
        // project has "Places API (New)" not yet fully propagated) must not take the whole picker down
        // with it, and must be visible in the console instead of silently swallowed.
        try {
          const PlaceAutocompleteElement = maps.maps.places?.PlaceAutocompleteElement;
          if (autocompleteContainerRef.current && PlaceAutocompleteElement) {
            const element = new PlaceAutocompleteElement({
              includedRegionCodes: country ? [country.toLowerCase()] : null,
              placeholder: "Search for your address",
              noInputIcon: true, // our own Search icon is overlaid instead (see the wrapping div below)
            });
            element.style.width = "100%";
            // The widget themes itself from the OS (a black box on a light page in OS dark mode). Match the
            // page's scheme instead (light, or dark inside a .tone-night section) and let our container's
            // border/background show through.
            element.style.colorScheme = getComputedStyle(autocompleteContainerRef.current).colorScheme || "light";
            element.style.backgroundColor = "transparent";
            element.style.border = "none";
            autocompleteContainerRef.current.replaceChildren(element);
            autocompleteElRef.current = element;
            element.addEventListener(
              "gmp-select",
              async (event: google.maps.places.PlacePredictionSelectEvent) => {
                if (!mountedRef.current) return;
                try {
                  const place = event.placePrediction.toPlace();
                  await place.fetchFields({ fields: ["location"] });
                  if (!mountedRef.current) return;
                  const location = place.location;
                  if (!location) {
                    setError("Please choose an address from the list.");
                    return;
                  }
                  // Reuses the same pan/marker/reverse-geocode pipeline as dragging the pin or "current
                  // location" (via the still-current, non-deprecated Geocoder), so every entry point
                  // resolves an address the exact same way.
                  placeMarker(location.lat(), location.lng());
                } catch (fetchError) {
                  if (mountedRef.current) setError("Could not load that address. Please try again or drag the pin.");
                  console.error("[LocationPicker] fetching the selected place failed:", fetchError);
                }
              },
              { signal: listenerController.signal },
            );
          } else if (!PlaceAutocompleteElement) {
            console.warn(
              "[LocationPicker] google.maps.places.PlaceAutocompleteElement is unavailable — enable \"Places API (New)\" for this key. Address search is disabled; the map, current-location and draggable pin still work.",
            );
          }
        } catch (autocompleteError) {
          console.error("[LocationPicker] could not set up address search; continuing without it:", autocompleteError);
        }
        setStatus("ready");
      })
      .catch((mapsError) => {
        console.error("[LocationPicker] Google Maps failed to load or initialise:", mapsError);
        if (!cancelled) setStatus("unavailable");
      });
    return () => {
      cancelled = true;
      mountedRef.current = false;
      listenerController.abort();
      // Tear down every Maps object this instance created: an in-flight geocode/dragend/gmp-select
      // callback checks mountedRef before touching state, but the Maps objects themselves (marker,
      // autocomplete element) must also stop listening and release the DOM nodes React is about to remove.
      if (markerRef.current) {
        google.maps.event.clearInstanceListeners(markerRef.current);
        markerRef.current.setMap(null);
        markerRef.current = null;
      }
      autocompleteElRef.current?.remove();
      autocompleteElRef.current = null;
      mapRef.current = null;
      geocoderRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiKey]);

  function useCurrentLocation() {
    if (!navigator.geolocation) {
      setError("Your browser does not support location. Please search or enter the address manually.");
      return;
    }
    setLocating(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocating(false);
        placeMarker(position.coords.latitude, position.coords.longitude);
      },
      (geoError) => {
        setLocating(false);
        setError(
          geoError.code === geoError.PERMISSION_DENIED
            ? "Location permission was denied. You can search above or enter the address manually."
            : "Could not get your location. You can search above or enter the address manually.",
        );
      },
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  }

  if (status === "unavailable") return null;

  return (
    <div className="space-y-3 rounded-[var(--radius-card)] border border-[var(--color-hairline)] bg-[var(--color-surface)] p-4">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={useCurrentLocation}
          disabled={status !== "ready" || locating}
          className="press flex h-10 items-center gap-1.5 rounded-[var(--radius-control)] border border-[var(--color-hairline)] bg-[var(--color-surface)] px-3.5 text-sm font-medium transition-colors hover:border-[color-mix(in_srgb,var(--color-ink)_30%,var(--color-hairline))] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {locating ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <LocateFixed className="size-4 text-[var(--color-brand-accent)]" aria-hidden />}
          Use current location
        </button>
        <div className="relative min-w-[14rem] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 z-10 size-4 -translate-y-1/2 text-[var(--color-muted-ink)]" aria-hidden />
          {/* Bare container: Google's PlaceAutocompleteElement is mounted into this imperatively (see the
              effect above) and owns its own contents entirely — no JSX children are ever rendered here. */}
          <div
            id={inputId}
            ref={autocompleteContainerRef}
            aria-label="Search for your address"
            className={cn(
              "h-10 w-full rounded-[var(--radius-control)] border border-[var(--rule)] bg-[var(--color-surface)] pl-9 [&>*]:h-full [&>*]:w-full",
              status !== "ready" && "opacity-60",
            )}
          />
        </div>
      </div>

      <div className="relative h-56 w-full overflow-hidden rounded-[var(--radius-brand)] bg-[var(--steel-2)]">
        {/* Bare container: Google's Map takes ownership of this node's contents entirely (see the effect
            above) — no JSX children are ever rendered here, only this loading state as a sibling overlay. */}
        <div ref={mapDivRef} role="application" aria-label="Delivery location map. Drag the pin to correct your address." className="h-full w-full" />
        {status === "loading-script" ? (
          <div className="pointer-events-none absolute inset-0 grid place-items-center">
            <Loader2 className="size-5 animate-spin text-[var(--color-muted-ink)]" aria-hidden />
          </div>
        ) : null}
      </div>

      {resolving ? (
        <p className="flex items-center gap-1.5 text-xs text-[var(--color-muted-ink)]">
          <Loader2 className="size-3.5 animate-spin" aria-hidden /> Looking up that address…
        </p>
      ) : resolved ? (
        <p className="flex items-start gap-1.5 text-xs text-[var(--color-muted-ink)]">
          <MapPin className="mt-0.5 size-3.5 shrink-0 text-[var(--color-brand-accent)]" aria-hidden />
          {resolved.formattedAddress}
        </p>
      ) : (
        <p className="text-xs text-[var(--color-muted-ink)]">
          Use current location or search above, then drag the pin to fine-tune it.
        </p>
      )}
      {error ? <p className="text-xs text-[var(--color-danger)]">{error}</p> : null}
    </div>
  );
}

