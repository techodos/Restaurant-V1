"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  deleteAddonAction,
  deleteAddonGroupAction,
  saveAddonAction,
  saveAddonGroupAction,
} from "@/app/admin/(dashboard)/menu/items/actions";
import type { MenuAddonGroup } from "@/shared/contract/models";

type Addon = MenuAddonGroup["addons"][number];

function AddonRow({
  menuItemId,
  addonGroupId,
  addon,
  onSaved,
}: {
  menuItemId: string;
  addonGroupId: string;
  addon?: Addon;
  onSaved: () => void;
}) {
  const [name, setName] = useState(addon?.name ?? "");
  const [price, setPrice] = useState(addon?.price ?? "0");
  const [pending, startTransition] = useTransition();

  function submit(event: React.FormEvent) {
    event.preventDefault();
    startTransition(() => {
      saveAddonAction(menuItemId, addonGroupId, { id: addon?.id, name, price }).then((result) => {
        if (!result.success) {
          toast.error(result.error.message);
          return;
        }
        toast.success("Add-on saved.");
        if (!addon) {
          setName("");
          setPrice("0");
        }
        onSaved();
      });
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-1 items-center gap-2">
      <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Add-on name" className="h-9 w-40 text-sm" required />
      <Input value={price} onChange={(event) => setPrice(event.target.value)} placeholder="Price" className="h-9 w-24 text-sm" required />
      <Button type="submit" size="sm" variant={addon ? "outline" : "primary"} disabled={pending}>
        {pending ? (
          <Loader2 className="size-4 animate-spin" aria-hidden />
        ) : addon ? (
          "Save"
        ) : (
          <>
            <Plus className="size-4" aria-hidden /> Add
          </>
        )}
      </Button>
    </form>
  );
}

function AddonGroupCard({ menuItemId, group, onChanged }: { menuItemId: string; group: MenuAddonGroup; onChanged: () => void }) {
  const [deletingAddonId, setDeletingAddonId] = useState<string | null>(null);
  const [deletingGroup, setDeletingGroup] = useState(false);
  const [, startTransition] = useTransition();

  function handleDeleteAddon(addonId: string) {
    if (!confirm("Delete this add-on?")) return;
    setDeletingAddonId(addonId);
    startTransition(() => {
      deleteAddonAction(menuItemId, addonId).then((result) => {
        setDeletingAddonId(null);
        if (!result.success) {
          toast.error(result.error.message);
          return;
        }
        onChanged();
      });
    });
  }

  function handleDeleteGroup() {
    if (!confirm(`Delete "${group.name}" and all its add-ons?`)) return;
    setDeletingGroup(true);
    startTransition(() => {
      deleteAddonGroupAction(menuItemId, group.id).then((result) => {
        setDeletingGroup(false);
        if (!result.success) {
          toast.error(result.error.message);
          return;
        }
        onChanged();
      });
    });
  }

  return (
    <div className="surface-flat p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-medium">{group.name}</p>
          <p className="text-xs text-[var(--color-muted-ink)]">
            {group.isRequired ? `Required · choose ${group.minSelect}-${group.maxSelect}` : `Optional · up to ${group.maxSelect}`}
          </p>
        </div>
        <Button size="icon" variant="ghost" onClick={handleDeleteGroup} disabled={deletingGroup} aria-label="Delete group">
          {deletingGroup ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Trash2 className="size-4" aria-hidden />}
        </Button>
      </div>

      <div className="mt-3 space-y-2">
        {group.addons.map((addon) => (
          <div key={addon.id} className="flex items-center justify-between gap-2">
            <AddonRow menuItemId={menuItemId} addonGroupId={group.id} addon={addon} onSaved={onChanged} />
            <Button
              size="icon"
              variant="ghost"
              onClick={() => handleDeleteAddon(addon.id)}
              disabled={deletingAddonId === addon.id}
              aria-label="Delete add-on"
            >
              {deletingAddonId === addon.id ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Trash2 className="size-4" aria-hidden />}
            </Button>
          </div>
        ))}
        <AddonRow menuItemId={menuItemId} addonGroupId={group.id} onSaved={onChanged} />
      </div>
    </div>
  );
}

function NewGroupForm({ menuItemId, onSaved }: { menuItemId: string; onSaved: () => void }) {
  const [name, setName] = useState("");
  const [isRequired, setIsRequired] = useState(false);
  const [pending, startTransition] = useTransition();

  function submit(event: React.FormEvent) {
    event.preventDefault();
    startTransition(() => {
      saveAddonGroupAction(menuItemId, { name, isRequired, minSelect: isRequired ? 1 : 0, maxSelect: 1 }).then((result) => {
        if (!result.success) {
          toast.error(result.error.message);
          return;
        }
        toast.success("Group added.");
        setName("");
        setIsRequired(false);
        onSaved();
      });
    });
  }

  return (
    <form
      onSubmit={submit}
      className="flex flex-wrap items-center gap-2 rounded-[var(--radius-brand)] border border-dashed border-[var(--color-hairline)] p-3"
    >
      <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Group name (e.g. Extras)" className="w-52" required />
      <label className="flex items-center gap-1.5 text-sm">
        <input type="checkbox" checked={isRequired} onChange={(event) => setIsRequired(event.target.checked)} /> Required
      </label>
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? (
          <Loader2 className="size-4 animate-spin" aria-hidden />
        ) : (
          <>
            <Plus className="size-4" aria-hidden /> Add group
          </>
        )}
      </Button>
    </form>
  );
}

export function AddonGroupManager({ menuItemId, groups }: { menuItemId: string; groups: MenuAddonGroup[] }) {
  const router = useRouter();
  const refresh = () => router.refresh();

  return (
    <div className="space-y-3">
      {groups.map((group) => (
        <AddonGroupCard key={group.id} menuItemId={menuItemId} group={group} onChanged={refresh} />
      ))}
      <NewGroupForm menuItemId={menuItemId} onSaved={refresh} />
    </div>
  );
}
