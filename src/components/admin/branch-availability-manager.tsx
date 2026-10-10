"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { setItemLocationAvailabilityAction } from "@/app/r/[restaurantSlug]/admin/(dashboard)/menu/items/actions";
import { useSyncedState } from "@/components/admin/use-synced-state";
import type { RestaurantLocation } from "@/shared/contract/models";

export function BranchAvailabilityManager({
  menuItemId,
  locations,
  overrides,
}: {
  menuItemId: string;
  locations: RestaurantLocation[];
  overrides: Record<string, boolean>;
}) {
  const [available, setAvailable] = useSyncedState<Record<string, boolean>>(`menu-item-overrides:${menuItemId}`, overrides);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function toggle(locationId: string, current: boolean) {
    const next = !current;
    setPendingId(locationId);
    startTransition(() => {
      setItemLocationAvailabilityAction(menuItemId, locationId, next).then((result) => {
        setPendingId(null);
        if (!result.success) {
          toast.error(result.error.message);
          return;
        }
        setAvailable((prev) => ({ ...prev, [locationId]: next }));
      });
    });
  }

  return (
    <div className="space-y-2">
      {locations.map((location) => {
        const isAvailable = available[location.id] ?? true;
        return (
          <div key={location.id} className="flex items-center justify-between gap-3 surface-flat px-3.5 py-2.5">
            <span className="text-sm font-medium">{location.name}</span>
            <label className="flex items-center gap-1.5 text-xs text-[var(--color-muted-ink)]">
              {pendingId === location.id && <Loader2 className="size-4 animate-spin" aria-hidden />}
              <input
                type="checkbox"
                checked={isAvailable}
                onChange={() => toggle(location.id, isAvailable)}
                disabled={pendingId === location.id}
              />
              Available
            </label>
          </div>
        );
      })}
    </div>
  );
}
