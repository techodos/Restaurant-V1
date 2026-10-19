"use client";

import { AdminFormPanel, AdminFormSection, FormToggle } from "@/components/admin/admin-form-panel";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Clock, Loader2, MapPin, Pencil, Plus, Store, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label } from "@/components/ui/input";
import { deleteLocationAction, saveLocationAction } from "@/app/admin/(dashboard)/locations/actions";
import { useConfirm } from "@/components/ui/confirm-dialog";
import type { RestaurantLocation } from "@/shared/contract/models";
import { LocationPicker, type ResolvedLocation } from "@/components/storefront/location-picker";
import { StatusPill, addTileClass } from "@/components/admin/admin-ui";
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
  const [whatsapp, setWhatsapp] = useState(location?.whatsapp ?? "");
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
    const payload = { id: location?.id, name, addressLine1, area, city, phone, whatsapp, email, isActive, isPrimary, hours, ...(pin ?? {}) };
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
    <AdminFormPanel
      title={location ? `Edit ${location.name}` : "New location"}
      description="A branch customers order from or visit."
      icon={Store}
      onSubmit={submit}
      onCancel={onCancel}
      pending={pending}
      submitLabel={location ? "Save location" : "Create location"}
      toggles={
        <>
          <FormToggle id="locActive" label="Active" checked={isActive} onChange={setIsActive} />
          <FormToggle id="locPrimary" label="Primary branch" checked={isPrimary} onChange={setIsPrimary} />
        </>
      }
    >
      <AdminFormSection title="Branch" description="Its name and street address.">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="locName">Name</Label>
            <Input id="locName" value={name} onChange={(event) => setName(event.target.value)} required />
            <FieldError>{errors.name}</FieldError>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="locAddress">Address</Label>
            <Input id="locAddress" value={addressLine1} onChange={(event) => setAddressLine1(event.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="locArea">Area</Label>
            <Input id="locArea" value={area} onChange={(event) => setArea(event.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="locCity">City</Label>
            <Input id="locCity" value={city} onChange={(event) => setCity(event.target.value)} required />
            <FieldError>{errors.city}</FieldError>
          </div>
        </div>
      </AdminFormSection>

      {maps ? (
        <AdminFormSection
          title="Map pin"
          description={
            pin
              ? `Pinned at ${pin.latitude.toFixed(5)}, ${pin.longitude.toFixed(5)}. Distances and delivery radius are measured from here.`
              : "Not pinned yet: search the address or drag the pin. Needed for distances and a delivery radius."
          }
        >
          <div className="overflow-hidden rounded-xl ring-1 ring-[var(--admin-line,var(--color-hairline))]">
            <LocationPicker apiKey={maps.apiKey} country={maps.country} initialCenter={pin ?? undefined} onResolve={handlePin} />
          </div>
        </AdminFormSection>
      ) : null}

      <AdminFormSection title="Contact" description="How customers and WhatsApp orders reach this branch.">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="locPhone">Phone</Label>
            <Input id="locPhone" inputMode="tel" value={phone} onChange={(event) => setPhone(event.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="locEmail">Email</Label>
            <Input id="locEmail" type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
            <FieldError>{errors.email}</FieldError>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="locWhatsapp">WhatsApp</Label>
            <Input id="locWhatsapp" inputMode="tel" placeholder="Uses the restaurant's number" value={whatsapp} onChange={(event) => setWhatsapp(event.target.value)} />
            <p className="text-xs text-[var(--color-muted-ink)]">WhatsApp checkout sends this branch&apos;s orders here. Leave empty to use the restaurant&apos;s number.</p>
            <FieldError>{errors.whatsapp}</FieldError>
          </div>
        </div>
      </AdminFormSection>

      <AdminFormSection title="Opening hours" description="Orders are only taken while the branch is open; reservation times come from these hours.">
        <OpeningHoursEditor value={hours} onChange={setHours} error={errors.hours} />
      </AdminFormSection>
    </AdminFormPanel>
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
    <div className="grid grid-cols-[minmax(0,1fr)] gap-3 md:grid-cols-2">
      {dialog}
      {locations.map((location) =>
        canManage && editingId === location.id ? (
          <div key={location.id} className="col-span-full">
            <LocationEditForm location={location} maps={maps} onCancel={() => setEditingId(null)} />
          </div>
        ) : (
          <article key={location.id} className={`surface-card flex min-w-0 gap-4 p-4 sm:p-5 ${location.isActive ? "" : "opacity-70"}`}>
            <span
              aria-hidden
              className="grid size-11 shrink-0 place-items-center rounded-xl bg-[color-mix(in_srgb,var(--color-brand)_10%,var(--color-surface))] text-[var(--color-brand)] ring-1 ring-inset ring-[color-mix(in_srgb,var(--color-brand)_18%,transparent)]"
            >
              <Store className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <h3 className="truncate font-[family-name:var(--font-heading)] text-[1.1rem] font-semibold leading-tight">{location.name}</h3>
                  {location.isPrimary ? <StatusPill tone="brand" dot={false}>Primary</StatusPill> : null}
                  {!location.isActive ? <StatusPill tone="neutral">Inactive</StatusPill> : null}
                </div>
                {canManage ? (
                  <div className="-mr-2 -mt-2 flex shrink-0 items-center">
                    <Button size="icon" variant="ghost" onClick={() => setEditingId(location.id)} aria-label={`Edit ${location.name}`}>
                      <Pencil className="size-4" aria-hidden />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => handleDelete(location)}
                      disabled={deletingId === location.id}
                      aria-label={`Delete ${location.name}`}
                    >
                      {deletingId === location.id ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Trash2 className="size-4" aria-hidden />}
                    </Button>
                  </div>
                ) : null}
              </div>
              <p className="mt-2 flex items-start gap-2 text-[13px] leading-snug text-[var(--color-muted-ink)]">
                <MapPin className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                {[location.addressLine1, location.area, location.city].filter(Boolean).join(", ") || "No address on file"}
              </p>
              <p className="mt-1.5 flex items-start gap-2 text-[13px] leading-snug text-[var(--color-ink)]">
                <Clock className="mt-0.5 size-3.5 shrink-0 text-[var(--color-muted-ink)]" aria-hidden />
                {hoursSummary(location.hours)}
              </p>
            </div>
          </article>
        ),
      )}

      {canManage ? (
        adding ? (
          <div className="col-span-full">
            <LocationEditForm maps={maps} onCancel={() => setAdding(false)} />
          </div>
        ) : editingId ? null : (
          <button type="button" onClick={() => setAdding(true)} className={`${addTileClass} md:min-h-[7.5rem]`}>
            <Plus className="size-4" aria-hidden /> Add location
          </button>
        )
      ) : null}
    </div>
  );
}
