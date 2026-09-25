"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label, Select, Textarea } from "@/components/ui/input";
import { saveMenuItemAction } from "@/app/admin/(dashboard)/menu/items/actions";
import type { MenuCategory, MenuItem } from "@/shared/contract/models";

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-+|-+$)/g, "");
}

export function MenuItemForm({ item, categories }: { item?: MenuItem; categories: MenuCategory[] }) {
  const [name, setName] = useState(item?.name ?? "");
  const [slug, setSlug] = useState(item?.slug ?? "");
  const [slugTouched, setSlugTouched] = useState(Boolean(item));
  const [categoryId, setCategoryId] = useState(item?.categoryId ?? categories[0]?.id ?? "");
  const [description, setDescription] = useState(item?.description ?? "");
  const [shortDescription, setShortDescription] = useState(item?.shortDescription ?? "");
  const [imageUrl, setImageUrl] = useState(item?.imageUrl ?? "");
  const [basePrice, setBasePrice] = useState(item?.basePrice ?? "");
  const [compareAtPrice, setCompareAtPrice] = useState(item?.compareAtPrice ?? "");
  const [prepTimeMinutes, setPrepTimeMinutes] = useState(String(item?.prepTimeMinutes ?? 15));
  const [spiceLevel, setSpiceLevel] = useState(String(item?.spiceLevel ?? 0));
  const [isActive, setIsActive] = useState(item?.isActive ?? true);
  const [isAvailable, setIsAvailable] = useState(item?.isAvailable ?? true);
  const [isFeatured, setIsFeatured] = useState(item?.isFeatured ?? false);
  const [dietaryTags, setDietaryTags] = useState((item?.dietaryTags ?? []).join(", "));
  const [allergens, setAllergens] = useState((item?.allergens ?? []).join(", "));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setErrors({});
    const payload = {
      id: item?.id,
      categoryId,
      name,
      slug,
      description,
      shortDescription,
      imageUrl,
      basePrice,
      compareAtPrice,
      prepTimeMinutes: Number(prepTimeMinutes),
      spiceLevel: Number(spiceLevel),
      isActive,
      isAvailable,
      isFeatured,
      dietaryTags: dietaryTags.split(",").map((tag) => tag.trim()).filter(Boolean),
      allergens: allergens.split(",").map((tag) => tag.trim()).filter(Boolean),
    };
    startTransition(() => {
      saveMenuItemAction(payload).then((result) => {
        if (!result.success) {
          if (result.error.details) {
            setErrors(Object.fromEntries(Object.entries(result.error.details).map(([key, value]) => [key, String(value)])));
          }
          toast.error(result.error.message);
          return;
        }
        toast.success(item ? "Item updated." : "Item created.");
        if (!item) router.push(`/admin/menu/items/${result.data.id}`);
        else router.refresh();
      });
    });
  }

  return (
    <form
      onSubmit={submit}
      className="space-y-5 surface-flat p-6"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="name">Name</Label>
          <Input
            id="name"
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              if (!slugTouched) setSlug(slugify(event.target.value));
            }}
            required
          />
          <FieldError>{errors.name}</FieldError>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="slug">Slug</Label>
          <Input
            id="slug"
            value={slug}
            onChange={(event) => {
              setSlug(event.target.value);
              setSlugTouched(true);
            }}
            required
          />
          <FieldError>{errors.slug}</FieldError>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="categoryId">Category</Label>
        <Select id="categoryId" value={categoryId} onChange={(event) => setCategoryId(event.target.value)} required>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </Select>
        <FieldError>{errors.categoryId}</FieldError>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="shortDescription">Short description</Label>
        <Input id="shortDescription" value={shortDescription} onChange={(event) => setShortDescription(event.target.value)} maxLength={240} />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="description">Description</Label>
        <Textarea id="description" value={description} onChange={(event) => setDescription(event.target.value)} />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="imageUrl">Image URL</Label>
        <Input id="imageUrl" value={imageUrl} onChange={(event) => setImageUrl(event.target.value)} placeholder="https://..." />
        <FieldError>{errors.imageUrl}</FieldError>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="basePrice">Base price</Label>
          <Input id="basePrice" value={basePrice} onChange={(event) => setBasePrice(event.target.value)} placeholder="450" required />
          <FieldError>{errors.basePrice}</FieldError>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="compareAtPrice">Compare-at price (optional)</Label>
          <Input id="compareAtPrice" value={compareAtPrice} onChange={(event) => setCompareAtPrice(event.target.value)} placeholder="550" />
          <FieldError>{errors.compareAtPrice}</FieldError>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="prepTimeMinutes">Prep time (minutes)</Label>
          <Input
            id="prepTimeMinutes"
            type="number"
            min={0}
            value={prepTimeMinutes}
            onChange={(event) => setPrepTimeMinutes(event.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="spiceLevel">Spice level</Label>
          <Select id="spiceLevel" value={spiceLevel} onChange={(event) => setSpiceLevel(event.target.value)}>
            <option value="0">None</option>
            <option value="1">Mild</option>
            <option value="2">Medium</option>
            <option value="3">Hot</option>
          </Select>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="dietaryTags">Dietary tags (comma separated)</Label>
          <Input id="dietaryTags" value={dietaryTags} onChange={(event) => setDietaryTags(event.target.value)} placeholder="vegetarian, halal" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="allergens">Allergens (comma separated)</Label>
          <Input id="allergens" value={allergens} onChange={(event) => setAllergens(event.target.value)} placeholder="nuts, dairy" />
        </div>
      </div>

      <div className="flex flex-wrap gap-5">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={isActive} onChange={(event) => setIsActive(event.target.checked)} /> Active (visible in menu)
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={isAvailable} onChange={(event) => setIsAvailable(event.target.checked)} /> Available (in stock)
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={isFeatured} onChange={(event) => setIsFeatured(event.target.checked)} /> Featured
        </label>
      </div>

      <Button type="submit" disabled={pending}>
        {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
        {item ? "Save changes" : "Create item"}
      </Button>
    </form>
  );
}
