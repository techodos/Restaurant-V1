"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Check, Loader2, MapPin, Navigation, Store } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/shared/utils";
import { branchesFor, formatDistance, type BranchOption, type BranchingState, type DeliveryDestination } from "@/shared/branching";
import type { CustomerAddress } from "@/shared/contract/models";
import { Sheet } from "@/components/motion/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FieldError, Input, Label } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { LocationPicker, type ResolvedLocation } from "@/components/storefront/location-picker";
import { setDestinationAction } from "@/app/r/[restaurantSlug]/(site)/menu/actions";
import { getProfileAction } from "@/app/r/[restaurantSlug]/(site)/account/actions";
import { useLocalCart } from "./local-cart";

/**
 * Multi-branch ordering in the browser (`features.BranchingFeature`).
 *
 * The server decides which branches serve a destination (services/branching.ts) and hands the result
 * to this provider on every page load; the provider turns it into one question every add control asks —
 * `canOrder(orderType)` — and owns the two sheets that answer it: where to deliver, and which branch.
 * The chosen branch is the tray's `locationId` (it always was), so cart, checkout and the order follow
 * it without any new plumbing.
 *
 * Feature off: `state` is null, `enabled` is false, `canOrder` is always true and nothing renders —
 * the single-location flow is untouched.
 */

/** Why ordering is blocked, so each surface can say the right thing. */
export type OrderGate = "ok" | "need-location" | "no-service" | "need-branch";

interface BranchingContextValue {
  enabled: boolean;
  destination: DeliveryDestination | null;
  /** branches the customer may order from for the tray's order type, nearest first */
  branches: BranchOption[];
  /** cities we deliver in (for "ordering isn't available here") */
  deliveryCities: string[];
  /** the tray's branch, when it is one of `branches` */
  selected: BranchOption | null;
  gate: (orderType?: string) => OrderGate;
  canOrder: (orderType?: string) => boolean;
  /** an item switched off at the selected branch */
  isOffHere: (menuItemId: string) => boolean;
  openLocation: () => void;
  openBranches: () => void;
  /**
   * Moves the order to one of `branches` (the same path as the branch sheet: confirms before dropping
   * cart items, writes the tray cookie, refreshes). Resolves false when declined or not allowed.
   */
  pickBranch: (branch: BranchOption) => Promise<boolean>;
  /** opens whichever sheet resolves the current gate */
  resolveGate: (orderType?: string) => void;
}

const OFF: BranchingContextValue = {
  enabled: false,
  destination: null,
  branches: [],
  deliveryCities: [],
  selected: null,
  gate: () => "ok",
  canOrder: () => true,
  isOffHere: () => false,
  openLocation: () => {},
  openBranches: () => {},
  pickBranch: async () => false,
  resolveGate: () => {},
};

const BranchingContext = createContext<BranchingContextValue>(OFF);

export function useBranching(): BranchingContextValue {
  return useContext(BranchingContext);
}

interface BranchingProviderProps {
  restaurantSlug: string;
  /** null = the restaurant has not switched the feature on */
  state: BranchingState | null;
  googleMapsApiKey: string | null;
  /** ISO country for address search (the restaurant's) */
  country: string;
  signedIn: boolean;
  children: React.ReactNode;
}

export function BranchingProvider({ restaurantSlug, state: initial, googleMapsApiKey, country, signedIn, children }: BranchingProviderProps) {
  if (!initial) return <>{children}</>;
  return (
    <EnabledProvider restaurantSlug={restaurantSlug} initial={initial} googleMapsApiKey={googleMapsApiKey} country={country} signedIn={signedIn}>
      {children}
    </EnabledProvider>
  );
}

function EnabledProvider({
  restaurantSlug,
  initial,
  googleMapsApiKey,
  country,
  signedIn,
  children,
}: Omit<BranchingProviderProps, "state"> & { initial: BranchingState }) {
  const router = useRouter();
  const { cart, setLocationId, removeLine } = useLocalCart();
  const { confirm, dialog } = useConfirm();
  // the server's reading, replaced at once by an action's answer so the UI never waits for the refresh
  const [state, setState] = useState(initial);
  useEffect(() => setState(initial), [initial]);
  const [locationOpen, setLocationOpen] = useState(false);
  const [branchesOpen, setBranchesOpen] = useState(false);

  const listFor = useCallback((orderType: string) => branchesFor(state, orderType), [state]);
  const branches = listFor(cart.orderType);
  const selected = branches.find((branch) => branch.id === cart.locationId) ?? null;

  const gate = useCallback(
    (orderType: string = cart.orderType): OrderGate => {
      const list = listFor(orderType);
      if (list.some((branch) => branch.id === cart.locationId)) return "ok";
      if (orderType === "delivery") {
        if (!state.destination) return "need-location";
        if (list.length === 0) return "no-service";
      }
      return "need-branch";
    },
    [cart.orderType, cart.locationId, listFor, state.destination],
  );

  /** Lines the cart would lose at a branch: items switched off there. */
  const conflictsAt = useCallback(
    (branchId: string) => {
      const off = new Set(state.unavailable[branchId] ?? []);
      return cart.lines.filter((line) => off.has(line.menuItemId));
    },
    [cart.lines, state.unavailable],
  );

  /** Moves the tray to a branch; asks first when that drops items. Resolves false when declined. */
  const switchBranch = useCallback(
    async (branch: BranchOption): Promise<boolean> => {
      if (branch.id === cart.locationId) return true;
      const conflicts = conflictsAt(branch.id);
      if (conflicts.length > 0) {
        const names = conflicts.map((line) => line.display.name);
        const listed = names.slice(0, 3).join(", ") + (names.length > 3 ? ` and ${names.length - 3} more` : "");
        const ok = await confirm({
          title: `Switch to ${branch.name}?`,
          description: `${listed} ${conflicts.length === 1 ? "is" : "are"} not available at this branch and will be removed from your cart.`,
          confirmLabel: "Switch branch",
          cancelLabel: "Keep my cart",
        });
        if (!ok) return false;
        for (const line of conflicts) removeLine(line.id);
      }
      setLocationId(branch.id); // writes the tray cookie synchronously (local-cart.tsx#commit)
      router.refresh(); // the server re-renders the menu and the cart for this branch
      return true;
    },
    [cart.locationId, conflictsAt, confirm, removeLine, router, setLocationId],
  );

  /** Remembers a destination and moves to its nearest serviceable branch. Returns an error to show, or null. */
  const chooseDestination = useCallback(
    async (destination: DeliveryDestination): Promise<{ error: string | null; served: boolean }> => {
      const result = await setDestinationAction(restaurantSlug, destination);
      if (!result.success) return { error: result.error.message, served: false };
      setState(result.data);
      const list = branchesFor(result.data, cart.orderType);
      if (list.length === 0) {
        router.refresh();
        return { error: null, served: false };
      }
      // The nearest branch, unless the cart's current branch also serves this address and moving
      // would cost the customer items: then they stay where they are and can switch deliberately.
      const nearest = list[0]!;
      const current = list.find((branch) => branch.id === cart.locationId);
      const off = new Set(result.data.unavailable[nearest.id] ?? []);
      const wouldLose = cart.lines.some((line) => off.has(line.menuItemId));
      const target = current && wouldLose ? current : nearest;
      if (target.id === cart.locationId) router.refresh();
      else await switchBranch(target);
      return { error: null, served: true };
    },
    [cart.lines, cart.locationId, cart.orderType, restaurantSlug, router, switchBranch],
  );

  // Ask WHERE up front, once — not at the first "Add". On the menu, with delivery and no location yet:
  // a signed-in customer's default saved address is applied (same path as choosing it in the sheet, so
  // branch ranking and the cart rules are identical); anyone else gets the location sheet, once per
  // browser session (closing it is respected; the bar keeps offering it).
  const pathname = usePathname();
  const askedWhere = useRef(false);
  useEffect(() => {
    if (askedWhere.current || state.destination || cart.orderType !== "delivery" || !pathname.endsWith("/menu")) return;
    askedWhere.current = true;
    const flag = `rp_where_asked_${restaurantSlug}`;
    const asked = (() => {
      try {
        return sessionStorage.getItem(flag) === "1";
      } catch {
        return false;
      }
    })();
    if (asked) return;
    try {
      sessionStorage.setItem(flag, "1");
    } catch {
      /* private mode: may ask again next visit, harmless */
    }
    void (async () => {
      if (signedIn) {
        const result = await getProfileAction(restaurantSlug).catch(() => null);
        const addresses = result?.success ? result.data.profile.addresses : [];
        const preferred = addresses.find((address) => address.isDefault && address.city) ?? addresses.find((address) => address.city);
        if (preferred) {
          await chooseDestination(toDestination(preferred));
          return;
        }
      }
      // only once the page has loaded and settled: a modal marks the rest of the page aria-hidden, and
      // doing that while streamed sections still hydrate is a hydration mismatch (seen in dev)
      const open = () => window.setTimeout(() => setLocationOpen(true), 400);
      if (document.readyState === "complete") open();
      else window.addEventListener("load", open, { once: true });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.destination, cart.orderType, pathname]);

  // A destination is known and a branch serves it, but the tray names none of them (first visit after
  // the cookie was set elsewhere, or the order type just changed): take the nearest without asking —
  // unless that would drop items, which always needs the customer's say-so.
  const autoKey = `${cart.orderType}:${branches.map((branch) => branch.id).join(",")}:${cart.locationId ?? ""}`;
  const lastAuto = useRef("");
  useEffect(() => {
    if (lastAuto.current === autoKey) return;
    lastAuto.current = autoKey;
    if (selected || branches.length === 0) return;
    if (cart.orderType !== "delivery" && !state.destination && branches.length > 1) return; // pickup: a deliberate choice
    const nearest = branches[0]!;
    if (conflictsAt(nearest.id).length > 0) return;
    setLocationId(nearest.id);
    router.refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoKey]);

  // The one way a customer picks a branch (sheet and header alike). Only a branch the current order type
  // may use is accepted, so no surface can select a branch the server would not offer.
  const pickBranch = useCallback(
    async (branch: BranchOption): Promise<boolean> => {
      if (!branches.some((option) => option.id === branch.id)) return false;
      if (branch.id === cart.locationId) return true;
      if (!(await switchBranch(branch))) return false;
      toast.success(`Ordering from ${branch.name}`);
      return true;
    },
    [branches, cart.locationId, switchBranch],
  );

  const value = useMemo<BranchingContextValue>(() => {
    const offHere = new Set(selected ? (state.unavailable[selected.id] ?? []) : []);
    const openLocation = () => setLocationOpen(true);
    const openBranches = () => setBranchesOpen(true);
    return {
      enabled: true,
      destination: state.destination,
      branches,
      deliveryCities: state.deliveryCities ?? [],
      selected,
      gate,
      canOrder: (orderType) => gate(orderType) === "ok",
      isOffHere: (menuItemId) => offHere.has(menuItemId),
      openLocation,
      openBranches,
      pickBranch,
      resolveGate: (orderType) => (gate(orderType) === "need-branch" ? openBranches() : openLocation()),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, autoKey, gate, pickBranch]);

  return (
    <BranchingContext.Provider value={value}>
      {children}
      {dialog}

      <Sheet
        open={locationOpen}
        onOpenChange={setLocationOpen}
        title={cart.orderType === "delivery" ? "Delivery location" : "Your location"}
        description="Choose where your order should go"
      >
        {locationOpen ? (
          <LocationChooser
            restaurantSlug={restaurantSlug}
            apiKey={googleMapsApiKey}
            country={country}
            signedIn={signedIn}
            current={state.destination}
            delivery={cart.orderType === "delivery"}
            onChoose={chooseDestination}
            onDone={() => setLocationOpen(false)}
          />
        ) : null}
      </Sheet>

      <Sheet open={branchesOpen} onOpenChange={setBranchesOpen} title="Choose a branch" description="Branches you can order from">
        <BranchList
          branches={branches}
          selectedId={selected?.id ?? null}
          destination={state.destination}
          delivery={cart.orderType === "delivery"}
          onPick={async (branch) => {
            if (await pickBranch(branch)) setBranchesOpen(false);
          }}
          onChangeLocation={() => {
            setBranchesOpen(false);
            setLocationOpen(true);
          }}
        />
      </Sheet>
    </BranchingContext.Provider>
  );
}

// ─── the location sheet ───────────────────────────────────────────────────────

function toDestination(address: CustomerAddress): DeliveryDestination {
  return {
    label: [address.area, address.city].filter(Boolean).join(", ") || address.label,
    line1: address.addressLine1,
    area: address.area ?? "",
    city: address.city ?? "",
    postalCode: address.postalCode ?? "",
    latitude: address.latitude,
    longitude: address.longitude,
    addressId: address.id,
  };
}

function LocationChooser({
  restaurantSlug,
  apiKey,
  country,
  signedIn,
  current,
  delivery,
  onChoose,
  onDone,
}: {
  restaurantSlug: string;
  apiKey: string | null;
  country: string;
  signedIn: boolean;
  current: DeliveryDestination | null;
  delivery: boolean;
  onChoose: (destination: DeliveryDestination) => Promise<{ error: string | null; served: boolean }>;
  onDone: () => void;
}) {
  const [addresses, setAddresses] = useState<CustomerAddress[] | null>(signedIn ? null : []);
  const [picked, setPicked] = useState<ResolvedLocation | null>(null);
  const [area, setArea] = useState(current?.area ?? "");
  const [city, setCity] = useState(current?.city ?? "");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** the label of a destination no branch delivers to: stay open and say so */
  const [unserved, setUnserved] = useState<string | null>(null);

  // saved addresses load when the sheet opens, never on a page view (the menu makes no database read)
  useEffect(() => {
    if (!signedIn) return;
    let cancelled = false;
    getProfileAction(restaurantSlug).then((result) => {
      if (!cancelled) setAddresses(result.success ? result.data.profile.addresses : []);
    });
    return () => {
      cancelled = true;
    };
  }, [restaurantSlug, signedIn]);

  async function submit(key: string, destination: DeliveryDestination) {
    if (busy) return;
    setBusy(key);
    setError(null);
    setUnserved(null);
    const outcome = await onChoose(destination);
    setBusy(null);
    if (outcome.error) return setError(outcome.error);
    if (!outcome.served && delivery) return setUnserved(destination.label);
    toast.success(delivery ? `Delivering to ${destination.label}` : "Location updated");
    onDone();
  }

  const manualReady = Boolean(area.trim() || city.trim());

  return (
    <div className="space-y-6 px-5 pb-8 md:px-7">
      {unserved ? (
        <div
          role="status"
          className="rounded-[var(--radius-card)] border border-[color-mix(in_srgb,var(--color-warning)_40%,transparent)] bg-[color-mix(in_srgb,var(--color-warning)_10%,transparent)] p-4"
        >
          <p className="text-sm font-semibold">We don&apos;t deliver to {unserved} yet</p>
          <p className="mt-1 text-[13px] leading-relaxed text-[var(--color-muted-ink)]">
            Try another address below, or keep browsing the menu. You can change the location any time.
          </p>
          <Button variant="outline" size="sm" className="mt-3" onClick={onDone}>
            Browse the menu
          </Button>
        </div>
      ) : null}

      {addresses === null ? (
        <div className="space-y-2" aria-busy="true" aria-label="Loading your saved addresses">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
      ) : addresses.length > 0 ? (
        <section aria-labelledby="saved-addresses">
          <h3 id="saved-addresses" className="font-[family-name:var(--font-sans)] text-[11.5px] font-semibold uppercase tracking-[0.16em] text-[var(--color-muted-ink)]">
            Saved addresses
          </h3>
          <ul className="mt-2.5 space-y-2">
            {addresses.map((address) => {
              const key = `saved:${address.id}`;
              const active = current?.addressId === address.id;
              return (
                <li key={address.id}>
                  <button
                    type="button"
                    onClick={() => submit(key, toDestination(address))}
                    disabled={Boolean(busy)}
                    className={cn(
                      "press flex w-full items-center gap-3 rounded-[var(--radius-card)] border px-3.5 py-3 text-left transition-colors duration-200",
                      active
                        ? "border-[var(--color-brand)] bg-[color-mix(in_srgb,var(--color-brand)_6%,transparent)]"
                        : "border-[var(--color-hairline)] hover:border-[color-mix(in_srgb,var(--color-ink)_30%,var(--color-hairline))]",
                    )}
                  >
                    <MapPin className="size-4 shrink-0 text-[var(--color-brand-accent)]" aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">{address.label}</span>
                      <span className="block truncate text-[12.5px] text-[var(--color-muted-ink)]">
                        {[address.addressLine1, address.area, address.city].filter(Boolean).join(", ")}
                      </span>
                    </span>
                    {busy === key ? (
                      <Loader2 className="size-4 animate-spin text-[var(--color-muted-ink)]" aria-hidden />
                    ) : active ? (
                      <Check className="size-4 text-[var(--color-brand)]" aria-hidden />
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {apiKey ? (
        <section aria-labelledby="find-address" className="space-y-3">
          <h3 id="find-address" className="font-[family-name:var(--font-sans)] text-[11.5px] font-semibold uppercase tracking-[0.16em] text-[var(--color-muted-ink)]">
            {addresses && addresses.length > 0 ? "Or find another address" : "Find your address"}
          </h3>
          <LocationPicker
            apiKey={apiKey}
            country={country}
            {...(current?.latitude != null && current.longitude != null
              ? { initialCenter: { latitude: current.latitude, longitude: current.longitude } }
              : {})}
            onResolve={(location) => {
              setPicked(location);
              setUnserved(null);
            }}
          />
          <Button
            className="w-full"
            disabled={!picked || Boolean(busy)}
            onClick={() =>
              picked &&
              submit("picked", {
                label: [picked.area, picked.city].filter(Boolean).join(", ") || picked.formattedAddress,
                line1: picked.addressLine1,
                area: picked.area,
                city: picked.city,
                postalCode: picked.postalCode,
                latitude: picked.latitude,
                longitude: picked.longitude,
                addressId: null,
              })
            }
          >
            {busy === "picked" ? <Loader2 className="animate-spin" aria-hidden /> : <Navigation aria-hidden />}
            {picked ? (delivery ? "Deliver here" : "Use this location") : "Pick a point to continue"}
          </Button>
        </section>
      ) : null}

      {/* Always offered: typing works without a Maps key, and when the map cannot resolve a point. */}
      <section aria-labelledby="type-address" className="space-y-3">
        <h3 id="type-address" className="font-[family-name:var(--font-sans)] text-[11.5px] font-semibold uppercase tracking-[0.16em] text-[var(--color-muted-ink)]">
          {apiKey ? "Or type your area" : "Your area"}
        </h3>
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (!manualReady) return;
            submit("manual", {
              label: [area.trim(), city.trim()].filter(Boolean).join(", "),
              line1: "",
              area: area.trim(),
              city: city.trim(),
              postalCode: "",
              latitude: null,
              longitude: null,
              addressId: null,
            });
          }}
        >
          <div className="grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="dest-area">Area</Label>
              <Input id="dest-area" value={area} onChange={(event) => setArea(event.target.value)} placeholder="e.g. DHA Phase 5" autoComplete="address-level2" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dest-city">City</Label>
              <Input id="dest-city" value={city} onChange={(event) => setCity(event.target.value)} placeholder="e.g. Lahore" autoComplete="address-level1" />
            </div>
          </div>
          <Button type="submit" className="w-full" disabled={!manualReady || Boolean(busy)}>
            {busy === "manual" ? <Loader2 className="animate-spin" aria-hidden /> : null}
            {delivery ? "Find branches that deliver here" : "Use this location"}
          </Button>
        </form>
      </section>

      <FieldError>{error}</FieldError>
    </div>
  );
}

// ─── the branch sheet ─────────────────────────────────────────────────────────

function BranchList({
  branches,
  selectedId,
  destination,
  delivery,
  onPick,
  onChangeLocation,
}: {
  branches: BranchOption[];
  selectedId: string | null;
  destination: DeliveryDestination | null;
  delivery: boolean;
  onPick: (branch: BranchOption) => void;
  onChangeLocation: () => void;
}) {
  // "nearest" only means something when it was measured
  const nearestId = branches[0]?.distanceKm != null ? branches[0].id : null;
  return (
    <div className="space-y-4 px-5 pb-8 md:px-7">
      <p className="text-[13px] leading-relaxed text-[var(--color-muted-ink)]">
        {delivery
          ? destination
            ? `Branches that deliver to ${destination.label}, nearest first.`
            : "Choose a delivery location to see the branches that deliver there."
          : destination
            ? `Our branches, nearest to ${destination.label} first.`
            : "Choose the branch you will order from."}
      </p>
      {branches.length === 0 ? (
        <div className="rounded-[var(--radius-card)] border border-[var(--color-hairline)] p-5 text-center">
          <Store className="mx-auto size-5 text-[var(--color-muted-ink)]" aria-hidden />
          <p className="mt-2 text-sm font-semibold">{destination ? "No branch delivers there yet" : "No location chosen"}</p>
        </div>
      ) : (
        <ul role="radiogroup" aria-label="Branch" className="space-y-2">
          {branches.map((branch) => {
            const on = branch.id === selectedId;
            return (
              <li key={branch.id}>
                <button
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => onPick(branch)}
                  className={cn(
                    "press flex w-full items-start gap-3 rounded-[var(--radius-card)] border px-3.5 py-3 text-left transition-colors duration-200",
                    on
                      ? "border-[var(--color-brand)] bg-[color-mix(in_srgb,var(--color-brand)_6%,transparent)]"
                      : "border-[var(--color-hairline)] hover:border-[color-mix(in_srgb,var(--color-ink)_30%,var(--color-hairline))]",
                  )}
                >
                  <span
                    aria-hidden
                    className={cn(
                      "mt-0.5 grid size-[18px] shrink-0 place-items-center rounded-full border",
                      on ? "border-[var(--color-brand)] bg-[var(--color-brand)] text-[var(--color-brand-foreground)]" : "border-[var(--rule-strong)]",
                    )}
                  >
                    {on ? <Check className="size-3" /> : null}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="text-sm font-semibold">{branch.name}</span>
                      {branch.id === nearestId ? <Badge variant="soft">Nearest</Badge> : null}
                    </span>
                    {branch.address ? <span className="mt-0.5 block text-[12.5px] text-[var(--color-muted-ink)]">{branch.address}</span> : null}
                  </span>
                  {branch.distanceKm !== null ? (
                    <span className="tabular shrink-0 pt-0.5 text-[12.5px] text-[var(--color-muted-ink)]">{formatDistance(branch.distanceKm)}</span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <button
        type="button"
        onClick={onChangeLocation}
        className="text-sm text-[var(--color-muted-ink)] underline underline-offset-2 transition-colors hover:text-[var(--color-ink)]"
      >
        {destination ? "Change location" : "Choose a location"}
      </button>
    </div>
  );
}
