"use client";

import { AdminFormPanel, AdminFormSection, FormToggle } from "@/components/admin/admin-form-panel";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CircleDot, Loader2, MapPinned, PenTool, Pencil, Plus, TextCursorInput, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label, Select } from "@/components/ui/input";
import {
  deleteDeliveryZoneAction,
  saveDeliveryPricingAction,
  saveDeliveryZoneAction,
} from "@/app/admin/(dashboard)/delivery-zones/actions";
import { useConfirm } from "@/components/ui/confirm-dialog";
import type { DeliveryZone, RestaurantLocation } from "@/shared/contract/models";
import type { Polygon } from "@/shared/geo";
import { cn } from "@/shared/utils";
import { ZoneCoverageMap } from "@/components/admin/zone-coverage-map";
import { StatusPill, addTileClass } from "@/components/admin/admin-ui";
import { DeliveryPricingEditor } from "@/components/admin/delivery-pricing-editor";
import { parseDeliveryPricing, type DeliverySlab } from "@/shared/delivery-pricing";

type Coverage = "areas" | "radius" | "polygon";
const COVERAGE_LABELS: Record<Coverage, string> = { areas: "Area names", radius: "Radius", polygon: "Draw on map" };

/** How a zone decides coverage, from its stored geometry (one mode per zone). */
function coverageOf(zone: DeliveryZone | undefined): Coverage {
  if (zone?.polygon) return "polygon";
  if (zone?.radiusKm != null) return "radius";
  return "areas";
}

function splitList(value: string): string[] {
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function ZoneEditForm({
  zone,
  locations,
  mapsKey,
  onCancel,
}: {
  zone?: DeliveryZone;
  locations: RestaurantLocation[];
  /** Google Maps key; without one only area names can be used */
  mapsKey: string | null;
  onCancel: () => void;
}) {
  const [locationId, setLocationId] = useState(zone?.locationId ?? locations[0]?.id ?? "");
  const [name, setName] = useState(zone?.name ?? "");
  const [areas, setAreas] = useState((zone?.areas ?? []).join(", "));
  const [postalCodes, setPostalCodes] = useState((zone?.postalCodes ?? []).join(", "));
  const [deliveryFee, setDeliveryFee] = useState(zone?.deliveryFee ?? "");
  const [minOrderAmount, setMinOrderAmount] = useState(zone?.minOrderAmount ?? "");
  const [freeDeliveryOver, setFreeDeliveryOver] = useState(zone?.freeDeliveryOver ?? "");
  const [etaMinMinutes, setEtaMinMinutes] = useState(String(zone?.etaMinMinutes ?? 30));
  const [etaMaxMinutes, setEtaMaxMinutes] = useState(String(zone?.etaMaxMinutes ?? 45));
  const [isActive, setIsActive] = useState(zone?.isActive ?? true);
  const [coverage, setCoverage] = useState<Coverage>(coverageOf(zone));
  const [radiusKm, setRadiusKm] = useState(zone?.radiusKm != null ? String(zone.radiusKm) : "3");
  const [polygon, setPolygon] = useState<Polygon>(zone?.polygon ?? []);
  const branch = locations.find((location) => location.id === locationId);
  const branchPin = branch?.latitude != null && branch.longitude != null ? { latitude: branch.latitude, longitude: branch.longitude } : null;
  // Distance pricing belongs to the BRANCH, not this zone — editing it here is a convenience (the admin is
  // already looking at this branch's delivery setup). Re-seeded whenever the chosen branch changes, so it
  // always reflects that branch's own saved ranges, not leftover edits from a different one.
  const [deliverySlabs, setDeliverySlabs] = useState<DeliverySlab[]>(() => parseDeliveryPricing(branch?.settings?.deliveryPricing)?.slabs ?? []);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function changeBranch(nextLocationId: string) {
    setLocationId(nextLocationId);
    const nextBranch = locations.find((location) => location.id === nextLocationId);
    setDeliverySlabs(parseDeliveryPricing(nextBranch?.settings?.deliveryPricing)?.slabs ?? []);
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setErrors({});
    const payload = {
      id: zone?.id,
      locationId,
      name,
      areas: splitList(areas),
      postalCodes: splitList(postalCodes),
      deliveryFee,
      minOrderAmount,
      freeDeliveryOver,
      etaMinMinutes: Number(etaMinMinutes),
      etaMaxMinutes: Number(etaMaxMinutes),
      isActive,
      coverage,
      ...(coverage === "radius" ? { radiusKm: Number(radiusKm) } : {}),
      ...(coverage === "polygon" ? { polygon } : {}),
    };
    startTransition(async () => {
      const result = await saveDeliveryZoneAction(payload);
      if (!result.success) {
        if (result.error.details) {
          setErrors(Object.fromEntries(Object.entries(result.error.details).map(([key, value]) => [key, String(value)])));
        }
        toast.error(result.error.message);
        return;
      }
      // the branch's distance pricing, saved alongside the zone (same submit, one Save button)
      const pricing = await saveDeliveryPricingAction(locationId, deliverySlabs.length ? deliverySlabs : null);
      if (!pricing.success) {
        toast.error(pricing.error.message, { description: "The zone itself was saved; its branch's distance pricing was not." });
        return;
      }
      toast.success(zone ? "Zone updated." : "Zone created.");
      router.refresh();
      onCancel();
    });
  }

  return (
    <AdminFormPanel
      title={zone ? `Edit ${zone.name || "zone"}` : "New delivery zone"}
      description={branch ? `Delivers from ${branch.name}` : "Where a branch delivers, and what it charges."}
      icon={MapPinned}
      onSubmit={submit}
      onCancel={onCancel}
      pending={pending}
      submitLabel={zone ? "Save zone" : "Create zone"}
      toggles={<FormToggle id="zoneActive" label="Active" checked={isActive} onChange={setIsActive} />}
    >
      <AdminFormSection title="Zone" description="A name staff recognise, and the branch that delivers it.">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="zoneName">Name</Label>
            <Input id="zoneName" value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Walton 8 km" required />
            <FieldError>{errors.name}</FieldError>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="zoneLocation">Branch</Label>
            <Select id="zoneLocation" value={locationId} onChange={(event) => changeBranch(event.target.value)} required>
              {locations.map((location) => (
                <option key={location.id} value={location.id}>
                  {location.name}
                </option>
              ))}
            </Select>
            <FieldError>{errors.locationId}</FieldError>
          </div>
        </div>
      </AdminFormSection>

      <AdminFormSection title="Coverage" description="How the zone decides whether an address is inside it.">
        <div role="radiogroup" aria-label="Coverage" className="grid grid-cols-3 gap-2">
          {(Object.keys(COVERAGE_LABELS) as Coverage[]).map((option) => {
            const Icon = option === "areas" ? TextCursorInput : option === "radius" ? CircleDot : PenTool;
            const on = coverage === option;
            return (
              <button
                key={option}
                type="button"
                role="radio"
                aria-checked={on}
                disabled={option !== "areas" && !mapsKey}
                onClick={() => setCoverage(option)}
                className={cn(
                  "flex min-h-[4.25rem] flex-col items-center justify-center gap-1.5 rounded-xl px-2 py-2.5 text-center text-[13px] font-semibold ring-1 ring-inset transition-colors disabled:cursor-not-allowed disabled:opacity-40",
                  on
                    ? "bg-[color-mix(in_srgb,var(--color-brand)_9%,var(--color-surface))] text-[var(--color-brand)] ring-2 ring-[var(--color-brand)]"
                    : "bg-[var(--color-surface)] text-[var(--color-muted-ink)] ring-[var(--admin-line,var(--color-hairline))] hover:text-[var(--color-ink)] hover:ring-[color-mix(in_srgb,var(--color-ink)_25%,transparent)]",
                )}
              >
                <Icon className="size-[18px]" aria-hidden />
                {COVERAGE_LABELS[option]}
              </button>
            );
          })}
        </div>
        <p className="text-[13px] leading-snug text-[var(--color-muted-ink)]">
          {coverage === "areas"
            ? "Matches the area / postal code customers type. Simple, but names repeat across cities and areas have no exact edge."
            : coverage === "radius"
              ? "Delivers to every map pin within this distance of the branch (straight line), in the branch's city."
              : "Delivers to every map pin inside the area you draw, in the branch's city. The most accurate option."}
          {!mapsKey ? " Radius and drawing need a Google Maps key." : ""}
        </p>
        {coverage === "radius" ? (
          <div className="max-w-[12rem] space-y-1.5">
            <Label htmlFor="radiusKm">Radius</Label>
            <div className="relative">
              <Input id="radiusKm" type="number" min={0.2} max={100} step={0.1} value={radiusKm} onChange={(event) => setRadiusKm(event.target.value)} required className="pr-12" />
              <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-[13px] text-[var(--color-muted-ink)]">km</span>
            </div>
            <FieldError>{errors.radiusKm}</FieldError>
          </div>
        ) : null}
        {coverage !== "areas" && mapsKey ? (
          <div className="overflow-hidden rounded-xl ring-1 ring-[var(--admin-line,var(--color-hairline))]">
            <ZoneCoverageMap
              key={`${coverage}:${locationId}`}
              apiKey={mapsKey}
              mode={coverage}
              branch={branchPin}
              radiusKm={Number(radiusKm) || 0}
              initialPolygon={coverage === "polygon" && polygon.length ? polygon : null}
              onPolygonChange={setPolygon}
            />
          </div>
        ) : null}
        <FieldError>{errors.polygon}</FieldError>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="areas">{coverage === "areas" ? "Areas" : "Areas (typed address without a pin)"}</Label>
            <Input id="areas" value={areas} onChange={(event) => setAreas(event.target.value)} placeholder="Gulberg, DHA" />
            <p className="text-xs text-[var(--color-muted-ink)]">Comma separated.</p>
            <FieldError>{errors.areas}</FieldError>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="postalCodes">Postal codes</Label>
            <Input id="postalCodes" value={postalCodes} onChange={(event) => setPostalCodes(event.target.value)} placeholder="54000, 54600" />
            <p className="text-xs text-[var(--color-muted-ink)]">Comma separated.</p>
          </div>
        </div>
      </AdminFormSection>

      <AdminFormSection title="Fees & timing" description="What delivery costs here and how long it takes.">
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="deliveryFee">{deliverySlabs.length > 0 ? "Default fee" : "Delivery fee"}</Label>
            <Input id="deliveryFee" inputMode="decimal" value={deliveryFee} onChange={(event) => setDeliveryFee(event.target.value)} required />
            {deliverySlabs.length > 0 ? (
              <p className="text-xs leading-snug text-[var(--color-muted-ink)]">Used when distance pricing can&apos;t apply (no pin).</p>
            ) : null}
            <FieldError>{errors.deliveryFee}</FieldError>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="minOrderAmount">Minimum order</Label>
            <Input id="minOrderAmount" inputMode="decimal" value={minOrderAmount} onChange={(event) => setMinOrderAmount(event.target.value)} placeholder="0" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="freeDeliveryOver">
              Free delivery over <span className="font-normal text-[var(--color-muted-ink)]">(optional)</span>
            </Label>
            <Input id="freeDeliveryOver" inputMode="decimal" value={freeDeliveryOver} onChange={(event) => setFreeDeliveryOver(event.target.value)} />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="etaMinMinutes">Delivery time</Label>
          <div className="flex max-w-[18rem] items-center gap-2">
            <Input id="etaMinMinutes" aria-label="Fastest, minutes" type="number" min={1} value={etaMinMinutes} onChange={(event) => setEtaMinMinutes(event.target.value)} />
            <span className="text-[var(--color-muted-ink)]">to</span>
            <Input id="etaMaxMinutes" aria-label="Slowest, minutes" type="number" min={1} value={etaMaxMinutes} onChange={(event) => setEtaMaxMinutes(event.target.value)} />
            <span className="shrink-0 text-[13px] text-[var(--color-muted-ink)]">min</span>
          </div>
        </div>
      </AdminFormSection>

      <AdminFormSection
        title="Distance pricing"
        description={
          <>
            Optional, for {branch?.name ?? "this branch"}: fixed fees by straight-line distance from its pin, used instead of the flat fee
            when the customer drops a pin at checkout.
          </>
        }
      >
        {!branchPin ? (
          <p className="rounded-xl bg-[color-mix(in_srgb,var(--color-warning)_10%,var(--color-surface))] px-3.5 py-2.5 text-[13px] text-[color-mix(in_srgb,var(--color-warning)_80%,var(--color-ink))] ring-1 ring-inset ring-[color-mix(in_srgb,var(--color-warning)_24%,transparent)]">
            This branch has no map pin yet. Set one on the Locations page first.
          </p>
        ) : null}
        <DeliveryPricingEditor slabs={deliverySlabs} onChange={setDeliverySlabs} />
      </AdminFormSection>
    </AdminFormPanel>
  );
}

/**
 * `locations` = the branches the signed-in member may put zones in (a manager: only their own), `allLocations`
 * names every zone's branch in the list. `canManage` false = read-only.
 */
export function DeliveryZoneManager({
  zones,
  locations,
  allLocations = locations,
  canManage = true,
  mapsKey = null,
}: {
  zones: DeliveryZone[];
  locations: RestaurantLocation[];
  allLocations?: RestaurantLocation[];
  canManage?: boolean;
  mapsKey?: string | null;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const router = useRouter();
  const { confirm, dialog } = useConfirm();

  async function handleDelete(zone: DeliveryZone) {
    if (!(await confirm({ title: `Delete zone "${zone.name}"?`, variant: "danger", confirmLabel: "Delete" }))) return;
    setDeletingId(zone.id);
    startTransition(() => {
      deleteDeliveryZoneAction(zone.id).then((result) => {
        setDeletingId(null);
        if (!result.success) {
          toast.error(result.error.message);
          return;
        }
        toast.success("Zone deleted.");
        router.refresh();
      });
    });
  }

  const locationName = (id: string) => allLocations.find((location) => location.id === id)?.name ?? "—";

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-3 md:grid-cols-2">
      {dialog}
      {zones.map((zone) =>
        editingId === zone.id ? (
          <div key={zone.id} className="col-span-full">
            <ZoneEditForm zone={zone} locations={locations} mapsKey={mapsKey} onCancel={() => setEditingId(null)} />
          </div>
        ) : (
          <article key={zone.id} className={cn("surface-card flex min-w-0 flex-col gap-4 p-4 sm:p-5", !zone.isActive && "opacity-70")}>
            <div className="flex items-start gap-3.5">
              <span
                aria-hidden
                className="grid size-11 shrink-0 place-items-center rounded-xl bg-[color-mix(in_srgb,var(--color-brand)_10%,var(--color-surface))] text-[var(--color-brand)] ring-1 ring-inset ring-[color-mix(in_srgb,var(--color-brand)_18%,transparent)]"
              >
                <MapPinned className="size-5" />
              </span>
              <div className="min-w-0 flex-1">
                <h3 className="font-[family-name:var(--font-heading)] text-[1.1rem] font-semibold leading-tight">{zone.name}</h3>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  <StatusPill tone="brand" dot={false}>{locationName(zone.locationId)}</StatusPill>
                  {!zone.isActive ? <StatusPill tone="neutral">Inactive</StatusPill> : null}
                </div>
              </div>
              {canManage ? (
                <div className="-mr-2 -mt-2 flex shrink-0 items-center">
                  <Button size="icon" variant="ghost" onClick={() => setEditingId(zone.id)} aria-label={`Edit ${zone.name}`}>
                    <Pencil className="size-4" aria-hidden />
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => handleDelete(zone)} disabled={deletingId === zone.id} aria-label={`Delete ${zone.name}`}>
                    {deletingId === zone.id ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Trash2 className="size-4" aria-hidden />}
                  </Button>
                </div>
              ) : null}
            </div>
            <dl className="grid grid-cols-3 gap-px overflow-hidden rounded-xl bg-[var(--admin-line,var(--color-hairline))] ring-1 ring-[var(--admin-line,var(--color-hairline))]">
              {[
                ["Coverage", zone.polygon ? "Drawn area" : zone.radiusKm != null ? `${zone.radiusKm} km` : "Areas"],
                ["Fee", zone.deliveryFee],
                ["ETA", `${zone.etaMinMinutes}–${zone.etaMaxMinutes} min`],
              ].map(([label, value]) => (
                <div key={label} className="min-w-0 bg-[var(--color-surface)] px-3 py-2.5">
                  <dt className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--color-muted-ink)]">{label}</dt>
                  <dd className="tabular mt-0.5 text-[14px] font-semibold leading-snug [overflow-wrap:anywhere]">{value}</dd>
                </div>
              ))}
            </dl>
            {zone.areas.length ? <p className="text-[13px] leading-snug text-[var(--color-muted-ink)]">Areas: {zone.areas.join(", ")}</p> : null}
          </article>
        ),
      )}

      {!canManage ? null : locations.length === 0 ? (
        <p className="col-span-full text-sm text-[var(--color-muted-ink)]">Add a location first.</p>
      ) : adding ? (
        <div className="col-span-full">
          <ZoneEditForm locations={locations} mapsKey={mapsKey} onCancel={() => setAdding(false)} />
        </div>
      ) : editingId ? null : (
        <button type="button" onClick={() => setAdding(true)} className={cn(addTileClass, "md:min-h-[9rem]")}>
          <Plus className="size-4" aria-hidden /> Add delivery zone
        </button>
      )}
    </div>
  );
}
