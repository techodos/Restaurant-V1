"use client";

import { useEffect, useState, useTransition } from "react";
import * as Popover from "@radix-ui/react-popover";
import { Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { deleteMenuItemAction, toggleItemAvailabilityAction } from "@/app/r/[restaurantSlug]/admin/(dashboard)/menu/actions";
import { setItemLocationAvailabilityAction } from "@/app/r/[restaurantSlug]/admin/(dashboard)/menu/items/actions";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { AdminSwitch } from "@/components/admin/admin-switch";
import { useSyncedState } from "@/components/admin/use-synced-state";

interface BranchOption {
  id: string;
  name: string;
}

/**
 * A menu row's availability switch + delete. Switches are optimistic: the new state shows at once and is
 * put back if the server refuses. The switch actions do NOT revalidate /menu (re-rendering the whole page
 * into each answer was what made a click slow), so the row keeps its own state, and adopts new props when
 * the server sends different ones (header scope change, another action re-rendering the page). A failed save
 * undoes only its own change, so a later click that succeeded is kept.
 *
 * `branches` (restaurant-wide admin in the "All branches" view of a 2+ branch restaurant): the switch opens a
 * popover asking where — "All branches" (the item itself) or one branch (`menu_item_location_overrides`).
 */
export function ItemRowActions({
  itemId,
  isAvailable,
  itemName,
  branches,
  offAt = [],
}: {
  itemId: string;
  isAvailable: boolean;
  itemName?: string;
  branches?: BranchOption[];
  /** ids of the branches where the item is switched off */
  offAt?: string[];
}) {
  const [state, setState] = useSyncedState(`menu-item:${itemId}`, { on: isAvailable, off: [...offAt].sort() });
  const { on } = state;
  const off = new Set(state.off);
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [saving, startTransition] = useTransition();
  const { confirm, dialog } = useConfirm();
  const [container, setContainer] = useState<HTMLElement | null>(null);
  // portalled into `.theme-root` (like useConfirm) so the restaurant's tokens reach the popover
  useEffect(() => setContainer(document.querySelector<HTMLElement>(".theme-root")), []);

  const label = itemName ?? "Item";

  function apply(change: { branchId?: string; available: boolean }) {
    setState((current) =>
      change.branchId === undefined
        ? { ...current, on: change.available }
        : {
            ...current,
            off: current.off.filter((id) => id !== change.branchId).concat(change.available ? [] : [change.branchId]).sort(),
          },
    );
  }

  function save(change: { branchId?: string; available: boolean }) {
    setOpen(false); // the branch popover closes as soon as one of its switches is picked
    apply(change);
    startTransition(async () => {
      const result =
        change.branchId === undefined
          ? await toggleItemAvailabilityAction(itemId, { isAvailable: change.available })
          : await setItemLocationAvailabilityAction(itemId, change.branchId, change.available);
      if (!result.success) {
        apply({ ...change, available: !change.available }); // undo this change only
        toast.error(result.error.message);
      }
    });
  }

  async function handleDelete() {
    if (!(await confirm({ title: "Delete this item?", description: "This cannot be undone.", variant: "danger", confirmLabel: "Delete" }))) return;
    setDeleting(true);
    const result = await deleteMenuItemAction(itemId);
    setDeleting(false);
    if (!result.success) toast.error(result.error.message);
    else toast.success("Item deleted.");
  }

  const offBranches = branches?.filter((branch) => off.has(branch.id)) ?? [];
  const status = !on
    ? "Off"
    : offBranches.length === 0
      ? "Available"
      : offBranches.length === 1
        ? `Off at ${offBranches[0]!.name}`
        : `Off at ${offBranches.length} branches`;
  const partly = on && offBranches.length > 0;

  const control = (
    <span className="flex items-center gap-2">
      {saving ? <Loader2 className="size-3.5 animate-spin text-[var(--color-muted-ink)]" aria-hidden /> : null}
      <span className={on && !partly ? "text-xs text-[var(--color-muted-ink)]" : "text-xs font-medium text-[var(--color-ink)]"}>{status}</span>
      <AdminSwitch
        checked={on}
        onChange={branches ? () => setOpen(true) : (next) => save({ available: next })}
        aria-label={branches ? `${label} availability by branch` : `${label} available`}
      />
    </span>
  );

  return (
    <div className="flex items-center justify-end gap-3">
      {dialog}
      {branches ? (
        <Popover.Root open={open} onOpenChange={setOpen}>
          <Popover.Anchor asChild>{control}</Popover.Anchor>
          <Popover.Portal container={container}>
            <Popover.Content
              align="end"
              sideOffset={8}
              collisionPadding={12}
              className="animate-popover z-50 w-[min(20rem,calc(100vw-1.5rem))] overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-hairline)] bg-[var(--color-surface)] text-[var(--color-ink)] shadow-[var(--shadow-raised)] outline-none"
            >
              <p className="border-b border-[var(--color-hairline)] px-4 py-3 text-sm font-semibold">
                Where is {itemName ?? "this item"} available?
              </p>
              <div className="px-4 py-2">
                <label className="flex items-center justify-between gap-3 py-2 text-sm font-medium">
                  All branches
                  <AdminSwitch checked={on} onChange={(next) => save({ available: next })} aria-label={`${label} available at all branches`} />
                </label>
                <div className="border-t border-[var(--color-hairline)] pt-1">
                  {branches.map((branch) => (
                    <label key={branch.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                      {branch.name}
                      <AdminSwitch
                        checked={on && !off.has(branch.id)}
                        onChange={(next) => save({ branchId: branch.id, available: next })}
                        disabled={!on}
                        aria-label={`${label} available at ${branch.name}`}
                      />
                    </label>
                  ))}
                </div>
                {!on ? <p className="pb-2 text-xs text-[var(--color-muted-ink)]">Off everywhere. Turn on All branches to choose branches.</p> : null}
              </div>
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>
      ) : (
        control
      )}
      <Button size="icon" variant="ghost" className="size-9 text-[var(--color-muted-ink)] hover:text-[var(--color-danger)]" onClick={handleDelete} disabled={deleting} aria-label={`Delete ${itemName ?? "item"}`}>
        {deleting ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Trash2 className="size-4" aria-hidden />}
      </Button>
    </div>
  );
}
