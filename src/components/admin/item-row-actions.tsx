"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { deleteMenuItemAction, toggleItemAvailabilityAction } from "@/app/admin/(dashboard)/menu/actions";

export function ItemRowActions({ itemId, isAvailable }: { itemId: string; isAvailable: boolean }) {
  const [pending, startTransition] = useTransition();
  const [deleting, setDeleting] = useState(false);
  const router = useRouter();

  function toggleAvailable() {
    startTransition(() => {
      toggleItemAvailabilityAction(itemId, { isAvailable: !isAvailable }).then((result) => {
        if (!result.success) {
          toast.error(result.error.message);
          return;
        }
        router.refresh();
      });
    });
  }

  function handleDelete() {
    if (!confirm("Delete this item? This cannot be undone.")) return;
    setDeleting(true);
    startTransition(() => {
      deleteMenuItemAction(itemId).then((result) => {
        setDeleting(false);
        if (!result.success) {
          toast.error(result.error.message);
          return;
        }
        toast.success("Item deleted.");
        router.refresh();
      });
    });
  }

  return (
    <div className="flex items-center justify-end gap-3">
      <label className="flex items-center gap-1.5 text-xs text-[var(--color-muted-ink)]">
        <input type="checkbox" checked={isAvailable} onChange={toggleAvailable} disabled={pending} />
        Available
      </label>
      <Button size="icon" variant="ghost" onClick={handleDelete} disabled={pending || deleting} aria-label="Delete item">
        {deleting ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Trash2 className="size-4" aria-hidden />}
      </Button>
    </div>
  );
}
