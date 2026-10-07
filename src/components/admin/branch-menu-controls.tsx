"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { setItemLocationAvailabilityAction } from "@/app/r/[restaurantSlug]/admin/(dashboard)/menu/items/actions";

/**
 * Menu Management in branch view (restaurants with 2+ branches). The menu itself — categories, items,
 * prices — is shared by every branch; with a branch in scope (the header's branch selector, or a manager's own branch)
 * the item list shows that branch's availability, so staff can stop selling a dish at one branch
 * without touching the others.
 */

/** One item's availability at the selected branch (a row of the menu list in branch view). */
export function BranchItemToggle({
  menuItemId,
  locationId,
  branchName,
  available,
  disabled = false,
}: {
  menuItemId: string;
  locationId: string;
  branchName: string;
  available: boolean;
  /** the item is off for the whole restaurant: a branch cannot switch it back on */
  disabled?: boolean;
}) {
  const [on, setOn] = useState(available);
  const [pending, startTransition] = useTransition();

  function toggle() {
    const next = !on;
    setOn(next); // optimistic; put back if the server refuses
    startTransition(() => {
      setItemLocationAvailabilityAction(menuItemId, locationId, next).then((result) => {
        if (!result.success) {
          setOn(!next);
          toast.error(result.error.message);
        }
        // no router.refresh(): the action revalidates /menu, so Next already answers with the page re-rendered
      });
    });
  }

  return (
    <label className="flex items-center justify-end gap-1.5 text-xs text-[var(--color-muted-ink)]">
      {pending ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : null}
      <input type="checkbox" checked={on && !disabled} onChange={toggle} disabled={pending || disabled} aria-label={`Available at ${branchName}`} />
      {disabled ? "Off everywhere" : `Available at ${branchName}`}
    </label>
  );
}
