"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FieldError, Input, Label } from "@/components/ui/input";
import { deleteLocationAction, saveLocationAction } from "@/app/admin/(dashboard)/locations/actions";
import type { RestaurantLocation } from "@/shared/contract/models";

function LocationEditForm({ location, onCancel }: { location?: RestaurantLocation; onCancel: () => void }) {
  const [name, setName] = useState(location?.name ?? "");
  const [addressLine1, setAddressLine1] = useState(location?.addressLine1 ?? "");
  const [area, setArea] = useState(location?.area ?? "");
  const [city, setCity] = useState(location?.city ?? "");
  const [phone, setPhone] = useState(location?.phone ?? "");
  const [email, setEmail] = useState(location?.email ?? "");
  const [isActive, setIsActive] = useState(location?.isActive ?? true);
  const [isPrimary, setIsPrimary] = useState(location?.isPrimary ?? false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setErrors({});
    const payload = { id: location?.id, name, addressLine1, area, city, phone, email, isActive, isPrimary };
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
      className="space-y-4 rounded-[var(--radius-brand)] border border-[var(--color-hairline)] bg-[var(--color-surface)] p-4"
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
          <Input id="locCity" value={city} onChange={(event) => setCity(event.target.value)} />
        </div>
      </div>
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

export function LocationManager({ locations, canManage }: { locations: RestaurantLocation[]; canManage: boolean }) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const router = useRouter();

  function handleDelete(location: RestaurantLocation) {
    if (!confirm(`Delete "${location.name}"?`)) return;
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
      {locations.map((location) =>
        canManage && editingId === location.id ? (
          <LocationEditForm key={location.id} location={location} onCancel={() => setEditingId(null)} />
        ) : (
          <div
            key={location.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-brand)] border border-[var(--color-hairline)] bg-[var(--color-surface)] px-3.5 py-2.5"
          >
            <div>
              <div className="flex items-center gap-2">
                <span className="font-medium">{location.name}</span>
                {location.isPrimary ? <Badge variant="soft">Primary</Badge> : null}
                {!location.isActive ? <Badge variant="neutral">Inactive</Badge> : null}
              </div>
              <p className="mt-1 text-xs text-[var(--color-muted-ink)]">
                {[location.addressLine1, location.area, location.city].filter(Boolean).join(", ") || "No address on file"}
              </p>
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
          <LocationEditForm onCancel={() => setAdding(false)} />
        ) : (
          <Button variant="outline" size="sm" onClick={() => setAdding(true)}>
            <Plus className="size-4" aria-hidden /> Add location
          </Button>
        )
      ) : null}
    </div>
  );
}
