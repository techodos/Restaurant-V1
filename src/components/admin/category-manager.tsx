"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FieldError, Input } from "@/components/ui/input";
import { deleteCategoryAction, saveCategoryAction } from "@/app/admin/(dashboard)/menu/actions";
import type { MenuCategory } from "@/shared/contract/models";

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-+|-+$)/g, "");
}

function CategoryEditForm({ category, onCancel }: { category?: MenuCategory; onCancel: () => void }) {
  const [name, setName] = useState(category?.name ?? "");
  const [slug, setSlug] = useState(category?.slug ?? "");
  const [slugTouched, setSlugTouched] = useState(Boolean(category));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setErrors({});
    startTransition(() => {
      saveCategoryAction({ id: category?.id, name, slug, isActive: category?.isActive ?? true }).then((result) => {
        if (!result.success) {
          if (result.error.details) {
            setErrors(Object.fromEntries(Object.entries(result.error.details).map(([key, value]) => [key, String(value)])));
          }
          toast.error(result.error.message);
          return;
        }
        toast.success(category ? "Category updated." : "Category added.");
        router.refresh();
        onCancel();
      });
    });
  }

  return (
    <form
      onSubmit={submit}
      className="flex flex-wrap items-start gap-2 rounded-[var(--radius-brand)] border border-[var(--color-hairline)] bg-[var(--color-surface)] p-3"
    >
      <div>
        <Input
          value={name}
          onChange={(event) => {
            setName(event.target.value);
            if (!slugTouched) setSlug(slugify(event.target.value));
          }}
          placeholder="Category name"
          className="w-48"
          required
        />
        <FieldError>{errors.name}</FieldError>
      </div>
      <div>
        <Input
          value={slug}
          onChange={(event) => {
            setSlug(event.target.value);
            setSlugTouched(true);
          }}
          placeholder="slug"
          className="w-40"
          required
        />
        <FieldError>{errors.slug}</FieldError>
      </div>
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
        {category ? "Save" : "Add"}
      </Button>
      <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
        <X className="size-4" aria-hidden />
      </Button>
    </form>
  );
}

export function CategoryManager({ categories }: { categories: MenuCategory[] }) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const router = useRouter();

  function handleDelete(category: MenuCategory) {
    if (!confirm(`Delete "${category.name}"? Items in it are not deleted.`)) return;
    setDeletingId(category.id);
    startTransition(() => {
      deleteCategoryAction(category.id).then((result) => {
        setDeletingId(null);
        if (!result.success) {
          toast.error(result.error.message);
          return;
        }
        toast.success("Category deleted.");
        router.refresh();
      });
    });
  }

  return (
    <div className="space-y-2">
      {categories.map((category) =>
        editingId === category.id ? (
          <CategoryEditForm key={category.id} category={category} onCancel={() => setEditingId(null)} />
        ) : (
          <div
            key={category.id}
            className="flex items-center justify-between gap-3 rounded-[var(--radius-brand)] border border-[var(--color-hairline)] bg-[var(--color-surface)] px-3.5 py-2.5"
          >
            <div className="flex items-center gap-2">
              <span className="font-medium">{category.name}</span>
              <span className="text-xs text-[var(--color-muted-ink)]">/{category.slug}</span>
              {!category.isActive ? <Badge variant="neutral">Hidden</Badge> : null}
              {category.itemCount !== undefined ? (
                <span className="text-xs text-[var(--color-muted-ink)]">{category.itemCount} items</span>
              ) : null}
            </div>
            <div className="flex items-center gap-1">
              <Button size="icon" variant="ghost" onClick={() => setEditingId(category.id)} aria-label="Edit category">
                <Pencil className="size-4" aria-hidden />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                onClick={() => handleDelete(category)}
                disabled={deletingId === category.id}
                aria-label="Delete category"
              >
                {deletingId === category.id ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                ) : (
                  <Trash2 className="size-4" aria-hidden />
                )}
              </Button>
            </div>
          </div>
        ),
      )}

      {adding ? (
        <CategoryEditForm onCancel={() => setAdding(false)} />
      ) : (
        <Button variant="outline" size="sm" onClick={() => setAdding(true)}>
          <Plus className="size-4" aria-hidden /> Add category
        </Button>
      )}
    </div>
  );
}
