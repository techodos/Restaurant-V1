/// <reference types="google.maps" />
'use client';

import { useEffect, useId, useRef, useState, useCallback } from 'react';
import { Loader2, LocateFixed, MapPin, Search } from 'lucide-react';
import { cn } from '@/shared/utils';

export interface ResolvedLocation {
  /** empty when the point could not be turned into an address (the coordinates are still real) */
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
const MAPS_READY_CALLBACK = '__locationPickerMapsReady';
let mapsLoader: Promise<typeof google> | null = null;
export function loadGoogleMaps(apiKey: string): Promise<typeof google> {
  if (!mapsLoader) {
    mapsLoader = new Promise<void>((resolve, reject) => {
      if (typeof window.google?.maps?.importLibrary === 'function')
        return resolve();
      (window as unknown as Record<string, () => void>)[MAPS_READY_CALLBACK] =
        () => resolve();
      const script = document.createElement('script');
      script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&libraries=places&loading=async&callback=${MAPS_READY_CALLBACK}`;
      script.async = true;
      script.onerror = () => {
        script.remove();
        reject(new Error('Could not load Google Maps.'));
      };
      document.head.appendChild(script);
    })
      .then(async () => {
        const maps = window.google.maps; // call as maps.importLibrary(...) — don't detach it from `maps`
        await Promise.all([
          maps.importLibrary('maps'),
          maps.importLibrary('marker'),
          // search is optional (see the effect below) — a places failure must not take the map down
          maps
            .importLibrary('places')
            .catch((placesError) =>
              console.warn(
                '[LocationPicker] places library failed to load:',
                placesError,
              ),
            ),
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
const BLOCKED_MESSAGE =
  'Location is blocked for this site. Tap the lock or settings icon next to the address bar, set Location to Allow, then tap Try again.';
// iOS (Location Services → Safari Websites) and desktop OSes can refuse the browser itself; the site's own
// permission then still reads "prompt", and the browser answers "denied" without ever asking.
const SYSTEM_BLOCKED_MESSAGE =
  "Your device isn't sharing location with this browser. Turn on Location Services for your browser in your device settings, then tap Try again.";

export function LocationPicker({
  apiKey,
  country,
  initialCenter,
  onResolve,
}: LocationPickerProps) {
  const mapDivRef = useRef<HTMLDivElement | null>(null);
  const mapFrameRef = useRef<HTMLDivElement | null>(null);
  const autocompleteContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markerRef = useRef<google.maps.Marker | null>(null);
  const autocompleteElRef =
    useRef<google.maps.places.PlaceAutocompleteElement | null>(null);
  // Guards against a stale reverse-geocode response (from an earlier drag/search/current-location call)
  // landing after a newer one and overwriting it — only the response matching the latest request id wins.
  const geocodeRequestIdRef = useRef(0);
  const geocodeAbortRef = useRef<AbortController | null>(null);
  // The checkout form mounts/unmounts this component every time the customer toggles between a saved
  // address and "new address" (or picks another saved address). Google's own async callbacks (geocode
  // results, marker drag, place selection) can still land after that unmount and touch DOM nodes React
  // has already torn down, which crashes with "NotFoundError: Failed to execute 'removeChild'" — this
  // flag stops that.
  const mountedRef = useRef(true);
  const inputId = useId();

  const [status, setStatus] = useState<
    'idle' | 'loading-script' | 'ready' | 'unavailable'
  >(apiKey ? 'loading-script' : 'unavailable');
  const [locating, setLocating] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // a location error the customer can act on (allow the site, switch device location on) and then retry
  const [locationProblem, setLocationProblem] = useState(false);
  const [resolved, setResolved] = useState<ResolvedLocation | null>(null);

  // Debounced so a fast marker drag (many `dragend`s in a row if the customer redrags) doesn't fire a
  // request per move — only the position it settles on for DEBOUNCE_MS gets looked up. Reverse geocoding
  // is via OpenStreetMap Nominatim (`/api/geocode/reverse`), not Google's Geocoding Service.
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reverseGeocode = useCallback((latitude: number, longitude: number) => {
    setError(null);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void doReverseGeocode(latitude, longitude);
    }, 400);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const doReverseGeocode = useCallback(
    async (latitude: number, longitude: number) => {
      const requestId = ++geocodeRequestIdRef.current;
      geocodeAbortRef.current?.abort();
      const controller = new AbortController();
      geocodeAbortRef.current = controller;
      setResolving(true);
      try {
        const response = await fetch(
          `/api/geocode/reverse?lat=${latitude}&lng=${longitude}`,
          { signal: controller.signal },
        );
        if (!mountedRef.current || requestId !== geocodeRequestIdRef.current)
          return; // superseded by a later pick
        if (!response.ok)
          throw new Error(`geocode proxy returned ${response.status}`);
        const body = (await response.json()) as {
          result: {
            formattedAddress: string;
            addressLine1: string;
            area: string;
            city: string;
            postalCode: string;
          } | null;
        };
        setResolving(false);
        if (!body.result) {
          // The point itself is right (GPS / search / pin): keep it. Callers merge field by field, so the
          // customer's typed area and city stay and the order still gets the exact delivery coordinates.
          setResolved(null);
          onResolve({
            formattedAddress: '',
            addressLine1: '',
            area: '',
            city: '',
            postalCode: '',
            latitude,
            longitude,
          });
          setError(
            "Pin placed, but we couldn't look up the street address for it. Please type your area and city below.",
          );
          return;
        }
        const next: ResolvedLocation = { ...body.result, latitude, longitude };
        setResolved(next);
        onResolve(next);
      } catch (geocodeError) {
        if ((geocodeError as Error).name === 'AbortError') return; // superseded by a later request, not a real failure
        if (!mountedRef.current || requestId !== geocodeRequestIdRef.current)
          return;
        console.warn('[LocationPicker] reverse geocode failed:', geocodeError);
        setResolving(false);
        setResolved(null);
        onResolve({
          formattedAddress: '',
          addressLine1: '',
          area: '',
          city: '',
          postalCode: '',
          latitude,
          longitude,
        });
        setError(
          "Pin placed, but we couldn't look up the street address for it. Please type your area and city below.",
        );
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    },
    [],
  );

  const placeMarker = useCallback(
    (latitude: number, longitude: number) => {
      if (!mountedRef.current) return;
      const map = mapRef.current;
      if (!map) return;
      const position = { lat: latitude, lng: longitude };
      map.panTo(position);
      map.setZoom(Math.max(map.getZoom() ?? 15, 16));
      if (!markerRef.current) {
        markerRef.current = new google.maps.Marker({
          map,
          position,
          draggable: true,
        });
        markerRef.current.addListener('dragend', () => {
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
          gestureHandling: 'greedy',
        });
        // `google.maps.places.Autocomplete` is deprecated (closed to new customers as of March 2025);
        // `PlaceAutocompleteElement` is Google's current recommended replacement — a custom element we
        // mount ourselves into `autocompleteContainerRef`, again as its only (non-React-managed) child.
        // Isolated in its own try/catch: search is a nice-to-have on top of the map/current-location/
        // drag-pin flow, not a dependency of it — a failure constructing this element (e.g. the API key's
        // project has "Places API (New)" not yet fully propagated) must not take the whole picker down
        // with it, and must be visible in the console instead of silently swallowed.
        try {
          const PlaceAutocompleteElement =
            maps.maps.places?.PlaceAutocompleteElement;
          if (autocompleteContainerRef.current && PlaceAutocompleteElement) {
            const element = new PlaceAutocompleteElement({
              includedRegionCodes: country ? [country.toLowerCase()] : null,
              placeholder: 'Search for your address',
              noInputIcon: true, // our own Search icon is overlaid instead (see the wrapping div below)
            });
            element.style.width = '100%';
            if (window.matchMedia('(pointer: coarse)').matches)
              element.style.fontSize = '16px'; // no iOS focus zoom
            // The widget themes itself from the OS (a black box on a light page in OS dark mode). Match the
            // page's scheme instead (light, or dark inside a .tone-night section) and let our container's
            // border/background show through.
            element.style.colorScheme =
              getComputedStyle(autocompleteContainerRef.current).colorScheme ||
              'light';
            element.style.backgroundColor = 'transparent';
            element.style.border = 'none';
            autocompleteContainerRef.current.replaceChildren(element);
            autocompleteElRef.current = element;
            element.addEventListener(
              'gmp-select',
              async (event: google.maps.places.PlacePredictionSelectEvent) => {
                if (!mountedRef.current) return;
                try {
                  const place = event.placePrediction.toPlace();
                  await place.fetchFields({ fields: ['location'] });
                  if (!mountedRef.current) return;
                  const location = place.location;
                  if (!location) {
                    setError('Please choose an address from the list.');
                    return;
                  }
                  // Reuses the same pan/marker/reverse-geocode pipeline as dragging the pin or "current
                  // location" (Nominatim via `/api/geocode/reverse`), so every entry point resolves an
                  // address the exact same way.
                  placeMarker(location.lat(), location.lng());
                } catch (fetchError) {
                  if (mountedRef.current)
                    setError(
                      'Could not load that address. Please try again or drag the pin.',
                    );
                  console.error(
                    '[LocationPicker] fetching the selected place failed:',
                    fetchError,
                  );
                }
              },
              { signal: listenerController.signal },
            );
          } else if (!PlaceAutocompleteElement) {
            console.warn(
              '[LocationPicker] google.maps.places.PlaceAutocompleteElement is unavailable — enable "Places API (New)" for this key. Address search is disabled; the map, current-location and draggable pin still work.',
            );
          }
        } catch (autocompleteError) {
          console.error(
            '[LocationPicker] could not set up address search; continuing without it:',
            autocompleteError,
          );
        }
        setStatus('ready');
      })
      .catch((mapsError) => {
        console.error(
          '[LocationPicker] Google Maps failed to load or initialise:',
          mapsError,
        );
        if (!cancelled) setStatus('unavailable');
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
      if (debounceRef.current) clearTimeout(debounceRef.current);
      geocodeAbortRef.current?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiKey]);

  /** The browser's own answer about location access, without prompting ("prompt" when it cannot tell). */
  async function locationPermission(): Promise<PermissionState> {
    try {
      return (await navigator.permissions.query({ name: 'geolocation' })).state;
    } catch {
      return 'prompt'; // Permissions API missing (older Safari): asking is the only way to find out
    }
  }

  function showLocationProblem(message: string) {
    setLocating(false);
    setLocationProblem(true);
    setError(message);
  }

  // After "blocked", retry by itself once the customer allows location: the permission's change event where
  // the browser fires it, and a re-check whenever they come back to the tab (from browser / phone settings).
  const stopWatchingRef = useRef<(() => void) | null>(null);
  function watchForPermission() {
    if (stopWatchingRef.current) return;
    const retryIfAllowed = async () => {
      if (!mountedRef.current || (await locationPermission()) !== 'granted')
        return;
      stopWatchingRef.current?.();
      locateCustomer();
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') void retryIfAllowed();
    };
    let permission: PermissionStatus | null = null;
    navigator.permissions
      ?.query({ name: 'geolocation' })
      .then((status) => {
        permission = status;
        status.onchange = () => void retryIfAllowed();
      })
      .catch(() => {});
    window.addEventListener('focus', onVisible);
    document.addEventListener('visibilitychange', onVisible);
    stopWatchingRef.current = () => {
      if (permission) permission.onchange = null;
      window.removeEventListener('focus', onVisible);
      document.removeEventListener('visibilitychange', onVisible);
      stopWatchingRef.current = null;
    };
  }
  useEffect(() => () => stopWatchingRef.current?.(), []);

  // Synchronous on purpose: getCurrentPosition must run inside the tap itself. Safari only shows its
  // "wants to use your location" prompt for a call made directly from the user gesture; awaiting anything
  // first (e.g. the Permissions API) loses the gesture and the request is denied without a prompt.
  function locateCustomer() {
    setError(null);
    setLocationProblem(false);
    if (!navigator.geolocation) {
      setError(
        'Your browser does not support location. Please search or enter the address manually.',
      );
      return;
    }
    // Browsers only share location with https pages (and localhost): e.g. a phone opening the site by
    // its LAN IP over http gets a silent "denied" that no setting can fix.
    if (!window.isSecureContext) {
      setError(
        'Location needs a secure (https) connection. Please search or enter the address manually.',
      );
      return;
    }
    setLocating(true);

    const succeed = (position: GeolocationPosition) => {
      if (!mountedRef.current) return;
      setLocating(false);
      placeMarker(position.coords.latitude, position.coords.longitude);
    };
    const fail = (geoError: GeolocationPositionError) => {
      if (!mountedRef.current) return;
      if (geoError.code === geoError.PERMISSION_DENIED) {
        // the site's own setting says which: blocked for this site, or the device refusing the browser
        void locationPermission().then((state) => {
          if (!mountedRef.current) return;
          showLocationProblem(
            state === 'denied' ? BLOCKED_MESSAGE : SYSTEM_BLOCKED_MESSAGE,
          );
          watchForPermission();
        });
      } else if (geoError.code === geoError.POSITION_UNAVAILABLE) {
        showLocationProblem(
          "We couldn't find your location. Turn on Location (GPS) in your device settings, then tap Try again.",
        );
      } else {
        showLocationProblem(
          'Finding your location took too long. Tap Try again, or search for your address above.',
        );
      }
    };
    // Precise GPS first; laptops and indoor phones often have no fix in time, so fall back to the
    // network-based position (Wi-Fi / cell) rather than giving up.
    navigator.geolocation.getCurrentPosition(
      succeed,
      (precise) => {
        if (precise.code === precise.PERMISSION_DENIED) return fail(precise);
        navigator.geolocation.getCurrentPosition(succeed, fail, {
          enableHighAccuracy: false,
          timeout: 15_000,
          maximumAge: 300_000,
        });
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 0 },
    );
  }

  // A drag that starts on the map belongs to the map: keep it from reaching a parent drag-to-dismiss sheet
  // (motion listens natively on the sheet, so a React handler would be too late).
  useEffect(() => {
    const frame = mapFrameRef.current;
    if (!frame) return;
    const keep = (event: Event) => event.stopPropagation();
    frame.addEventListener('pointerdown', keep);
    return () => frame.removeEventListener('pointerdown', keep);
  }, []);

  if (status === 'unavailable') return null;

  return (
    <div className='space-y-3 rounded-[var(--radius-card)] border border-[var(--color-hairline)] bg-[var(--color-surface)] p-4'>
      <div className='flex flex-wrap items-center gap-2'>
        <button
          type='button'
          onClick={locateCustomer}
          disabled={status !== 'ready' || locating}
          className='press flex h-10 items-center gap-1.5 rounded-[var(--radius-control)] border border-[var(--color-hairline)] bg-[var(--color-surface)] px-3.5 text-sm font-medium transition-colors hover:border-[color-mix(in_srgb,var(--color-ink)_30%,var(--color-hairline))] disabled:cursor-not-allowed disabled:opacity-60'
        >
          {locating ? (
            <Loader2 className='size-4 animate-spin' aria-hidden />
          ) : (
            <LocateFixed
              className='size-4 text-[var(--color-brand-accent)]'
              aria-hidden
            />
          )}
          Use current location
        </button>
        <div className='relative min-w-[14rem] flex-1'>
          <Search
            className='pointer-events-none absolute left-3 top-1/2 z-10 size-4 -translate-y-1/2 text-[var(--color-muted-ink)]'
            aria-hidden
          />
          {/* Bare container: Google's PlaceAutocompleteElement is mounted into this imperatively (see the
              effect above) and owns its own contents entirely — no JSX children are ever rendered here. */}
          <div
            id={inputId}
            ref={autocompleteContainerRef}
            aria-label='Search for your address'
            className={cn(
              'h-10 w-full rounded-[var(--radius-control)] border border-[var(--rule)] bg-[var(--color-surface)] pl-9 [&>*]:h-full [&>*]:w-full',
              status !== 'ready' && 'opacity-60',
            )}
          />
        </div>
      </div>

      <div
        ref={mapFrameRef}
        className='relative h-56 w-full overflow-hidden rounded-[var(--radius-brand)] bg-[var(--steel-2)]'
      >
        {/* Bare container: Google's Map takes ownership of this node's contents entirely (see the effect
            above) — no JSX children are ever rendered here, only this loading state as a sibling overlay. */}
        <div
          ref={mapDivRef}
          role='application'
          aria-label='Delivery location map. Drag the pin to correct your address.'
          className='h-full w-full'
        />
        {status === 'loading-script' ? (
          <div className='pointer-events-none absolute inset-0 grid place-items-center'>
            <Loader2
              className='size-5 animate-spin text-[var(--color-muted-ink)]'
              aria-hidden
            />
          </div>
        ) : null}
      </div>

      {resolving ? (
        <p className='flex items-center gap-1.5 text-xs text-[var(--color-muted-ink)]'>
          <Loader2 className='size-3.5 animate-spin' aria-hidden /> Looking up
          that address…
        </p>
      ) : resolved ? (
        <p className='flex items-start gap-1.5 text-xs text-[var(--color-muted-ink)]'>
          <MapPin
            className='mt-0.5 size-3.5 shrink-0 text-[var(--color-brand-accent)]'
            aria-hidden
          />
          {resolved.formattedAddress}
        </p>
      ) : error ? null : (
        <p className='text-xs text-[var(--color-muted-ink)]'>
          Use current location or search above, then drag the pin to fine-tune
          it.
        </p>
      )}
      {error ? (
        <div
          role='alert'
          className='flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-[var(--color-danger)]'
        >
          <p className='min-w-0 flex-1'>{error}</p>
          {locationProblem ? (
            <button
              type='button'
              onClick={locateCustomer}
              disabled={locating}
              className='shrink-0 font-semibold text-[var(--color-ink)] underline underline-offset-2 disabled:opacity-60'
            >
              Try again
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
