"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FieldError, Input, Label, Select } from "@/components/ui/input";
import { deleteDeliveryZoneAction, saveDeliveryZoneAction } from "@/app/r/[restaurantSlug]/admin/(dashboard)/delivery-zones/actions";
import { useConfirm } from "@/components/ui/confirm-dialog";
import type { DeliveryZone, RestaurantLocation } from "@/shared/contract/models";
import type { Polygon } from "@/shared/geo";
import { cn } from "@/shared/utils";
import { ZoneCoverageMap } from "@/components/admin/zone-coverage-map";

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
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();
  const router = useRouter();

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
    startTransition(() => {
      saveDeliveryZoneAction(payload).then((result) => {
        if (!result.success) {
          if (result.error.details) {
            setErrors(Object.fromEntries(Object.entries(result.error.details).map(([key, value]) => [key, String(value)])));
          }
          toast.error(result.error.message);
          return;
        }
        toast.success(zone ? "Zone updated." : "Zone created.");
        router.refresh();
        onCancel();
      });
    });
  }

  return (
    <form
      onSubmit={submit}
      className="space-y-4 surface-flat p-4"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="zoneName">Name</Label>
          <Input id="zoneName" value={name} onChange={(event) => setName(event.target.value)} required />
          <FieldError>{errors.name}</FieldError>
        </div>
        <div>
          <Label htmlFor="zoneLocation">Location</Label>
          <Select id="zoneLocation" value={locationId} onChange={(event) => setLocationId(event.target.value)} required>
            {locations.map((location) => (
              <option key={location.id} value={location.id}>
                {location.name}
              </option>
            ))}
          </Select>
          <FieldError>{errors.locationId}</FieldError>
        </div>
      </div>

      <div>
        <Label>Where this zone delivers</Label>
        <div role="radiogroup" aria-label="Coverage" className="mt-1.5 inline-flex rounded-[var(--radius-control)] border border-[var(--rule)] p-0.5">
          {(Object.keys(COVERAGE_LABELS) as Coverage[]).map((option) => (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={coverage === option}
              disabled={option !== "areas" && !mapsKey}
              onClick={() => setCoverage(option)}
              className={cn(
                "rounded-[calc(var(--radius-control)-2px)] px-3 py-1.5 text-[13px] font-medium transition-colors disabled:opacity-40",
                coverage === option ? "bg-[var(--color-brand)] text-[var(--color-brand-foreground)]" : "text-[var(--color-muted-ink)] hover:text-[var(--color-ink)]",
              )}
            >
              {COVERAGE_LABELS[option]}
            </button>
          ))}
        </div>
        <p className="mt-1.5 text-xs text-[var(--color-muted-ink)]">
          {coverage === "areas"
            ? "Matches the area / postal code customers type. Simple, but names repeat across cities and areas have no exact edge."
            : coverage === "radius"
              ? "Delivers to every map pin within this distance of the branch (straight line), in the branch's city."
              : "Delivers to every map pin inside the area you draw, in the branch's city. The most accurate option."}
        </p>
        {coverage === "radius" ? (
          <div className="mt-3 max-w-[12rem]">
            <Label htmlFor="radiusKm">Radius (km)</Label>
            <Input id="radiusKm" type="number" min={0.2} max={100} step={0.1} value={radiusKm} onChange={(event) => setRadiusKm(event.target.value)} required />
            <FieldError>{errors.radiusKm}</FieldError>
          </div>
        ) : null}
        {coverage !== "areas" && mapsKey ? (
          <div className="mt-3">
            <ZoneCoverageMap
              key={`${coverage}:${locationId}`}
              apiKey={mapsKey}
              mode={coverage}
              branch={branchPin}
              radiusKm={Number(radiusKm) || 0}
              initialPolygon={coverage === "polygon" && polygon.length ? polygon : null}
              onPolygonChange={setPolygon}
            />
            <FieldError>{errors.polygon}</FieldError>
          </div>
        ) : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="areas">{coverage === "areas" ? "Areas (comma separated)" : "Areas (only for a typed address without a map pin)"}</Label>
          <Input id="areas" value={areas} onChange={(event) => setAreas(event.target.value)} placeholder="Gulberg, DHA" />
          <FieldError>{errors.areas}</FieldError>
        </div>
        <div>
          <Label htmlFor="postalCodes">Postal codes (comma separated)</Label>
          <Input id="postalCodes" value={postalCodes} onChange={(event) => setPostalCodes(event.target.value)} placeholder="54000, 54600" />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <div>
          <Label htmlFor="deliveryFee">Delivery fee</Label>
          <Input id="deliveryFee" value={deliveryFee} onChange={(event) => setDeliveryFee(event.target.value)} required />
          <FieldError>{errors.deliveryFee}</FieldError>
        </div>
        <div>
          <Label htmlFor="minOrderAmount">Min. order</Label>
          <Input id="minOrderAmount" value={minOrderAmount} onChange={(event) => setMinOrderAmount(event.target.value)} />
        </div>
        <div>
          <Label htmlFor="freeDeliveryOver">Free over (optional)</Label>
          <Input id="freeDeliveryOver" value={freeDeliveryOver} onChange={(event) => setFreeDeliveryOver(event.target.value)} />
        </div>
        <div className="flex gap-2">
          <div className="flex-1">
            <Label htmlFor="etaMinMinutes">ETA min</Label>
            <Input id="etaMinMinutes" type="number" min={1} value={etaMinMinutes} onChange={(event) => setEtaMinMinutes(event.target.value)} />
          </div>
          <div className="flex-1">
            <Label htmlFor="etaMaxMinutes">ETA max</Label>
            <Input id="etaMaxMinutes" type="number" min={1} value={etaMaxMinutes} onChange={(event) => setEtaMaxMinutes(event.target.value)} />
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={isActive} onChange={(event) => setIsActive(event.target.checked)} /> Active
        </label>
        <div className="flex gap-2">
          <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
            <X className="size-4" aria-hidden />
          </Button>
          <Button type="submit" size="sm" disabled={pending}>
            {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
            {zone ? "Save" : "Create"}
          </Button>
        </div>
      </div>
    </form>
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
    <div className="space-y-2">
      {dialog}
      {zones.map((zone) =>
        editingId === zone.id ? (
          <ZoneEditForm key={zone.id} zone={zone} locations={locations} mapsKey={mapsKey} onCancel={() => setEditingId(null)} />
        ) : (
          <div
            key={zone.id}
            className="flex flex-wrap items-center justify-between gap-3 surface-flat px-3.5 py-2.5"
          >
            <div>
              <div className="flex items-center gap-2">
                <span className="font-medium">{zone.name}</span>
                <Badge variant="soft">{locationName(zone.locationId)}</Badge>
                {!zone.isActive ? <Badge variant="neutral">Inactive</Badge> : null}
              </div>
              <p className="mt-1 text-xs text-[var(--color-muted-ink)]">
                {zone.polygon ? "Drawn area · " : zone.radiusKm != null ? `Within ${zone.radiusKm} km · ` : ""}
                Fee {zone.deliveryFee} · ETA {zone.etaMinMinutes}-{zone.etaMaxMinutes}m
                {zone.areas.length ? ` · ${zone.areas.join(", ")}` : ""}
              </p>
            </div>
            {canManage ? (
            <div className="flex items-center gap-1">
              <Button size="icon" variant="ghost" onClick={() => setEditingId(zone.id)} aria-label="Edit zone">
                <Pencil className="size-4" aria-hidden />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                onClick={() => handleDelete(zone)}
                disabled={deletingId === zone.id}
                aria-label="Delete zone"
              >
                {deletingId === zone.id ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Trash2 className="size-4" aria-hidden />}
              </Button>
            </div>
            ) : null}
          </div>
        ),
      )}

      {!canManage ? null : locations.length === 0 ? (
        <p className="text-sm text-[var(--color-muted-ink)]">Add a location first.</p>
      ) : adding ? (
        <ZoneEditForm locations={locations} mapsKey={mapsKey} onCancel={() => setAdding(false)} />
      ) : (
        <Button variant="outline" size="sm" onClick={() => setAdding(true)}>
          <Plus className="size-4" aria-hidden /> Add zone
        </Button>
      )}
    </div>
  );
}
