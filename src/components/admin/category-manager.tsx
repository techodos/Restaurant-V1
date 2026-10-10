"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { FieldError, Input } from "@/components/ui/input";
import { deleteCategoryAction, saveCategoryAction } from "@/app/r/[restaurantSlug]/admin/(dashboard)/menu/actions";
import { useConfirm } from "@/components/ui/confirm-dialog";
import type { MenuCategory } from "@/shared/contract/models";
import { cn } from "@/shared/utils";
import { StatusPill } from "@/components/admin/admin-ui";

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
        onCancel();
      });
    });
  }

  return (
    <form
      onSubmit={submit}
      className="flex flex-col gap-2 surface-flat p-3"
    >
      <div>
        <Input
          value={name}
          onChange={(event) => {
            setName(event.target.value);
            if (!slugTouched) setSlug(slugify(event.target.value));
          }}
          placeholder="Category name"
          aria-label="Category name"
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
          aria-label="Category address (slug)"
          required
        />
        <FieldError>{errors.slug}</FieldError>
      </div>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
          {category ? "Save" : "Add"}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel} aria-label="Cancel">
          <X className="size-4" aria-hidden />
        </Button>
      </div>
    </form>
  );
}

/** A category row: a filter link (name + item count) with edit / delete for owner/admin. */
const rowLink = (active: boolean) =>
  cn(
    "flex min-w-0 flex-1 items-center gap-2 rounded-[var(--radius-brand)] px-2.5 py-2 text-sm transition-colors",
    active ? "bg-[color-mix(in_srgb,var(--color-brand)_10%,var(--color-surface))] font-semibold text-[var(--color-brand)]" : "hover:bg-[var(--tint)]",
  );

export function CategoryManager({
  categories,
  activeId = null,
  baseHref,
  totalItems,
  canManage = true,
}: {
  categories: MenuCategory[];
  /** the category the item list is filtered by; null = all */
  activeId?: string | null;
  /** the menu page; a category filters it with `?category=<id>` (a string: this is a client component) */
  baseHref: string;
  totalItems?: number;
  /** owner/admin edit categories; others only filter by them */
  canManage?: boolean;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const { confirm, dialog } = useConfirm();

  async function handleDelete(category: MenuCategory) {
    if (!(await confirm({ title: `Delete "${category.name}"?`, description: "Items in it are not deleted.", variant: "danger", confirmLabel: "Delete" })))
      return;
    setDeletingId(category.id);
    startTransition(() => {
      deleteCategoryAction(category.id).then((result) => {
        setDeletingId(null);
        if (!result.success) {
          toast.error(result.error.message);
          return;
        }
        toast.success("Category deleted.");
      });
    });
  }

  return (
    <div className="space-y-1">
      {dialog}
      <Link href={baseHref} aria-current={activeId === null ? "page" : undefined} className={rowLink(activeId === null)}>
        <span className="flex-1">All items</span>
        {totalItems !== undefined ? <span className="tabular text-xs opacity-70">{totalItems}</span> : null}
      </Link>
      <ul className="space-y-0.5">
        {categories.map((category) =>
          editingId === category.id ? (
            <li key={category.id}>
              <CategoryEditForm category={category} onCancel={() => setEditingId(null)} />
            </li>
          ) : (
            <li key={category.id} className="group flex items-center gap-1">
              <Link href={`${baseHref}?category=${category.id}`} aria-current={activeId === category.id ? "page" : undefined} className={rowLink(activeId === category.id)}>
                <span className="min-w-0 flex-1 truncate">{category.name}</span>
                {!category.isActive ? <StatusPill tone="neutral">Hidden</StatusPill> : null}
                {category.itemCount !== undefined ? <span className="tabular text-xs opacity-70">{category.itemCount}</span> : null}
              </Link>
              {canManage ? (
                <span className="flex shrink-0 items-center opacity-100 transition-opacity lg:opacity-0 lg:group-hover:opacity-100 lg:group-focus-within:opacity-100">
                  <Button size="icon" variant="ghost" className="size-8" onClick={() => setEditingId(category.id)} aria-label={`Edit ${category.name}`}>
                    <Pencil className="size-3.5" aria-hidden />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-8 hover:text-[var(--color-danger)]"
                    onClick={() => handleDelete(category)}
                    disabled={deletingId === category.id}
                    aria-label={`Delete ${category.name}`}
                  >
                    {deletingId === category.id ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Trash2 className="size-3.5" aria-hidden />}
                  </Button>
                </span>
              ) : null}
            </li>
          ),
        )}
      </ul>

      {canManage ? (
        adding ? (
          <div className="pt-2">
            <CategoryEditForm onCancel={() => setAdding(false)} />
          </div>
        ) : (
          <Button variant="ghost" size="sm" className="mt-1 w-full justify-start text-[var(--color-muted-ink)]" onClick={() => setAdding(true)}>
            <Plus className="size-4" aria-hidden /> Add category
          </Button>
        )
      ) : null}
    </div>
  );
}
