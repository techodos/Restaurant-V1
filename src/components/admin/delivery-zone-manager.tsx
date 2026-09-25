"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FieldError, Input, Label, Select } from "@/components/ui/input";
import { deleteDeliveryZoneAction, saveDeliveryZoneAction } from "@/app/admin/(dashboard)/delivery-zones/actions";
import type { DeliveryZone, RestaurantLocation } from "@/shared/contract/models";

function splitList(value: string): string[] {
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function ZoneEditForm({
  zone,
  locations,
  onCancel,
}: {
  zone?: DeliveryZone;
  locations: RestaurantLocation[];
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

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="areas">Areas (comma separated)</Label>
          <Input id="areas" value={areas} onChange={(event) => setAreas(event.target.value)} placeholder="Gulberg, DHA" />
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

export function DeliveryZoneManager({ zones, locations }: { zones: DeliveryZone[]; locations: RestaurantLocation[] }) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const router = useRouter();

  function handleDelete(zone: DeliveryZone) {
    if (!confirm(`Delete zone "${zone.name}"?`)) return;
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

  const locationName = (id: string) => locations.find((location) => location.id === id)?.name ?? "—";

  return (
    <div className="space-y-2">
      {zones.map((zone) =>
        editingId === zone.id ? (
          <ZoneEditForm key={zone.id} zone={zone} locations={locations} onCancel={() => setEditingId(null)} />
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
                Fee {zone.deliveryFee} · ETA {zone.etaMinMinutes}-{zone.etaMaxMinutes}m
                {zone.areas.length ? ` · ${zone.areas.join(", ")}` : ""}
              </p>
            </div>
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
          </div>
        ),
      )}

      {locations.length === 0 ? (
        <p className="text-sm text-[var(--color-muted-ink)]">Add a location first.</p>
      ) : adding ? (
        <ZoneEditForm locations={locations} onCancel={() => setAdding(false)} />
      ) : (
        <Button variant="outline" size="sm" onClick={() => setAdding(true)}>
          <Plus className="size-4" aria-hidden /> Add zone
        </Button>
      )}
    </div>
  );
}
