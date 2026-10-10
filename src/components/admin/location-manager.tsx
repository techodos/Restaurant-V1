"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label } from "@/components/ui/input";
import { deleteLocationAction, saveLocationAction } from "@/app/r/[restaurantSlug]/admin/(dashboard)/locations/actions";
import { useConfirm } from "@/components/ui/confirm-dialog";
import type { RestaurantLocation } from "@/shared/contract/models";
import { LocationPicker, type ResolvedLocation } from "@/components/storefront/location-picker";
import { StatusPill } from "@/components/admin/admin-ui";
import { OpeningHoursEditor } from "@/components/admin/opening-hours-editor";
import type { OpeningHours } from "@/shared/contract/models";

/** Google Maps for the branch pin; null = no key configured (the pin is then simply not editable here). */
export type AdminMaps = { apiKey: string; country: string } | null;

function LocationEditForm({ location, maps, onCancel }: { location?: RestaurantLocation; maps: AdminMaps; onCancel: () => void }) {
  const [name, setName] = useState(location?.name ?? "");
  const [addressLine1, setAddressLine1] = useState(location?.addressLine1 ?? "");
  const [area, setArea] = useState(location?.area ?? "");
  const [city, setCity] = useState(location?.city ?? "");
  const [phone, setPhone] = useState(location?.phone ?? "");
  const [email, setEmail] = useState(location?.email ?? "");
  const [isActive, setIsActive] = useState(location?.isActive ?? true);
  const [isPrimary, setIsPrimary] = useState(location?.isPrimary ?? false);
  const [hours, setHours] = useState<OpeningHours>(location?.hours ?? {});
  const [pin, setPin] = useState<{ latitude: number; longitude: number } | null>(
    location?.latitude != null && location.longitude != null ? { latitude: location.latitude, longitude: location.longitude } : null,
  );
  function handlePin(resolved: ResolvedLocation) {
    setPin({ latitude: resolved.latitude, longitude: resolved.longitude });
    // fill only what is still empty: never overwrite what staff typed
    if (!addressLine1.trim() && resolved.addressLine1) setAddressLine1(resolved.addressLine1);
    if (!area.trim() && resolved.area) setArea(resolved.area);
    if (!city.trim() && resolved.city) setCity(resolved.city);
  }
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setErrors({});
    const payload = { id: location?.id, name, addressLine1, area, city, phone, email, isActive, isPrimary, hours, ...(pin ?? {}) };
    startTransition(() => {
      saveLocationAction(payload).then((result) => {
        if (!result.success) {
          if (result.error.details) {
            setErrors(Object.fromEntries(Object.entries(result.error.details).map(([key, value]) => [key, String(value)])));
          }
          toast.error(result.error.message);
          return;
        }
        toast.success(location ? "Location updated." : "Location created.");
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
          <Label htmlFor="locName">Name</Label>
          <Input id="locName" value={name} onChange={(event) => setName(event.target.value)} required />
          <FieldError>{errors.name}</FieldError>
        </div>
        <div>
          <Label htmlFor="locAddress">Address</Label>
          <Input id="locAddress" value={addressLine1} onChange={(event) => setAddressLine1(event.target.value)} />
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="locArea">Area</Label>
          <Input id="locArea" value={area} onChange={(event) => setArea(event.target.value)} />
        </div>
        <div>
          <Label htmlFor="locCity">City</Label>
          <Input id="locCity" value={city} onChange={(event) => setCity(event.target.value)} required />
          <FieldError>{errors.city}</FieldError>
        </div>
      </div>
      {maps ? (
        <div>
          <Label>Location on the map</Label>
          <p className="mb-2 text-xs text-[var(--color-muted-ink)]">
            {pin
              ? `Pinned at ${pin.latitude.toFixed(5)}, ${pin.longitude.toFixed(5)}. Customers see their distance from here; a delivery radius is measured from it.`
              : "Not pinned yet: search the address or drag the pin. Needed for distances and for a delivery radius."}
          </p>
          <LocationPicker apiKey={maps.apiKey} country={maps.country} initialCenter={pin ?? undefined} onResolve={handlePin} />
        </div>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="locPhone">Phone</Label>
          <Input id="locPhone" value={phone} onChange={(event) => setPhone(event.target.value)} />
        </div>
        <div>
          <Label htmlFor="locEmail">Email</Label>
          <Input id="locEmail" type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
          <FieldError>{errors.email}</FieldError>
        </div>
      </div>

      <div>
        <Label>Opening hours</Label>
        <p className="mb-2 text-xs text-[var(--color-muted-ink)]">
          Orders are only taken while this branch is open, and reservation times are built from these hours.
        </p>
        <OpeningHoursEditor value={hours} onChange={setHours} error={errors.hours} />
      </div>

      <div className="flex items-center justify-between">
        <div className="flex gap-5">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={isActive} onChange={(event) => setIsActive(event.target.checked)} /> Active
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={isPrimary} onChange={(event) => setIsPrimary(event.target.checked)} /> Primary
          </label>
        </div>
        <div className="flex gap-2">
          <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
            <X className="size-4" aria-hidden />
          </Button>
          <Button type="submit" size="sm" disabled={pending}>
            {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
            {location ? "Save" : "Create"}
          </Button>
        </div>
      </div>
    </form>
  );
}

/** One line for the branch list: whether hours are set, and the common case. */
function hoursSummary(hours: OpeningHours): string {
  const days = Object.values(hours).filter((windows) => windows && windows.length > 0);
  if (days.length === 0) return "Hours not set (takes orders any time)";
  const allDay = days.length === 7 && days.every((windows) => windows!.length === 1 && windows![0]!.open === windows![0]!.close);
  if (allDay) return "Open 24 hours, every day";
  return `Open ${days.length} day${days.length === 1 ? "" : "s"} a week`;
}

export function LocationManager({ locations, canManage, maps = null }: { locations: RestaurantLocation[]; canManage: boolean; maps?: AdminMaps }) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const router = useRouter();
  const { confirm, dialog } = useConfirm();

  async function handleDelete(location: RestaurantLocation) {
    if (!(await confirm({ title: `Delete "${location.name}"?`, variant: "danger", confirmLabel: "Delete" }))) return;
    setDeletingId(location.id);
    startTransition(() => {
      deleteLocationAction(location.id).then((result) => {
        setDeletingId(null);
        if (!result.success) {
          toast.error(result.error.message);
          return;
        }
        toast.success("Location deleted.");
        router.refresh();
      });
    });
  }

  return (
    <div className="space-y-2">
      {dialog}
      {locations.map((location) =>
        canManage && editingId === location.id ? (
          <LocationEditForm key={location.id} location={location} maps={maps} onCancel={() => setEditingId(null)} />
        ) : (
          <div
            key={location.id}
            className="flex flex-wrap items-center justify-between gap-3 surface-flat px-3.5 py-2.5"
          >
            <div>
              <div className="flex items-center gap-2">
                <span className="font-medium">{location.name}</span>
                {location.isPrimary ? <StatusPill tone="brand" dot={false}>Primary</StatusPill> : null}
                {!location.isActive ? <StatusPill tone="neutral">Inactive</StatusPill> : null}
              </div>
              <p className="mt-1 text-xs text-[var(--color-muted-ink)]">
                {[location.addressLine1, location.area, location.city].filter(Boolean).join(", ") || "No address on file"}
              </p>
              <p className="mt-0.5 text-xs text-[var(--color-muted-ink)]">{hoursSummary(location.hours)}</p>
            </div>
            {canManage ? (
              <div className="flex items-center gap-1">
                <Button size="icon" variant="ghost" onClick={() => setEditingId(location.id)} aria-label="Edit location">
                  <Pencil className="size-4" aria-hidden />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => handleDelete(location)}
                  disabled={deletingId === location.id}
                  aria-label="Delete location"
                >
                  {deletingId === location.id ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                  ) : (
                    <Trash2 className="size-4" aria-hidden />
                  )}
                </Button>
              </div>
            ) : null}
          </div>
        ),
      )}

      {canManage ? (
        adding ? (
          <LocationEditForm maps={maps} onCancel={() => setAdding(false)} />
        ) : (
          <Button variant="outline" size="sm" onClick={() => setAdding(true)}>
            <Plus className="size-4" aria-hidden /> Add location
          </Button>
        )
      ) : null}
    </div>
  );
}
