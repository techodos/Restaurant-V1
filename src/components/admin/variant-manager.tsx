"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { deleteVariantAction, saveVariantAction } from "@/app/admin/(dashboard)/menu/items/actions";
import type { MenuItem } from "@/shared/contract/models";

type Variant = MenuItem["variants"][number];

function VariantRow({ menuItemId, variant, onSaved }: { menuItemId: string; variant?: Variant; onSaved: () => void }) {
  const [name, setName] = useState(variant?.name ?? "");
  const [price, setPrice] = useState(variant?.price ?? "");
  const [pending, startTransition] = useTransition();

  function submit(event: React.FormEvent) {
    event.preventDefault();
    startTransition(() => {
      saveVariantAction(menuItemId, { id: variant?.id, name, price, priceMode: variant?.priceMode ?? "absolute" }).then((result) => {
        if (!result.success) {
          toast.error(result.error.message);
          return;
        }
        toast.success("Variant saved.");
        if (!variant) {
          setName("");
          setPrice("");
        }
        onSaved();
      });
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-1 items-center gap-2">
      <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Variant name (e.g. Large)" className="w-48" required />
      <Input value={price} onChange={(event) => setPrice(event.target.value)} placeholder="Price" className="w-28" required />
      <Button type="submit" size="sm" variant={variant ? "outline" : "primary"} disabled={pending}>
        {pending ? (
          <Loader2 className="size-4 animate-spin" aria-hidden />
        ) : variant ? (
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

export function VariantManager({ menuItemId, variants }: { menuItemId: string; variants: Variant[] }) {
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const router = useRouter();

  function handleDelete(id: string) {
    if (!confirm("Delete this variant?")) return;
    setDeletingId(id);
    startTransition(() => {
      deleteVariantAction(menuItemId, id).then((result) => {
        setDeletingId(null);
        if (!result.success) {
          toast.error(result.error.message);
          return;
        }
        toast.success("Variant deleted.");
        router.refresh();
      });
    });
  }

  return (
    <div className="space-y-2">
      {variants.map((variant) => (
        <div
          key={variant.id}
          className="flex items-center justify-between gap-3 surface-flat px-3.5 py-2.5"
        >
          <VariantRow menuItemId={menuItemId} variant={variant} onSaved={() => router.refresh()} />
          <Button
            size="icon"
            variant="ghost"
            onClick={() => handleDelete(variant.id)}
            disabled={deletingId === variant.id}
            aria-label="Delete variant"
          >
            {deletingId === variant.id ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Trash2 className="size-4" aria-hidden />}
          </Button>
        </div>
      ))}
      <div className="rounded-[var(--radius-brand)] border border-dashed border-[var(--color-hairline)] p-3">
        <VariantRow menuItemId={menuItemId} onSaved={() => router.refresh()} />
      </div>
    </div>
  );
}
