"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Banknote, Check, Eye, FileText, Image as ImageIcon, Leaf, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label, Select, Textarea } from "@/components/ui/input";
import { saveMenuItemAction } from "@/app/admin/(dashboard)/menu/items/actions";
import type { MenuCategory, MenuItem } from "@/shared/contract/models";
import { adminPath } from "@/shared/utils";
import { AdminSection } from "@/components/admin/admin-ui";
import { AdminSwitchRow } from "@/components/admin/admin-switch";
import { MenuImageField } from "@/components/admin/menu-image-field";

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-+|-+$)/g, "");
}

/** shown in an empty buffet description: the format shared/buffet-menu.ts turns into the buffet card */
const BUFFET_DESCRIPTION_EXAMPLE = [
  "Soup / Appetizer:",
  "Hot & Sour Soup",
  "Dahi Bhallay",
  "",
  "B.B.Q.: Chicken Seekh Kabab, Chicken Boti, Malai Boti",
  "",
  "Dessert Bar:",
  "Kulfi Falooda",
  "Gulab Jaman",
  "",
  "Note: Soft drinks and fresh juices on payment",
].join("\n");

export function MenuItemForm({ item, categories }: { item?: MenuItem; categories: MenuCategory[] }) {
  const [name, setName] = useState(item?.name ?? "");
  const [slug, setSlug] = useState(item?.slug ?? "");
  const [slugTouched, setSlugTouched] = useState(Boolean(item));
  const [categoryId, setCategoryId] = useState(item?.categoryId ?? categories[0]?.id ?? "");
  const [description, setDescription] = useState(item?.description ?? "");
  const [shortDescription, setShortDescription] = useState(item?.shortDescription ?? "");
  const [imageUrl, setImageUrl] = useState(item?.imageUrl ?? "");
  const [uploading, setUploading] = useState(false);
  const [basePrice, setBasePrice] = useState(item?.basePrice ?? "");
  const [compareAtPrice, setCompareAtPrice] = useState(item?.compareAtPrice ?? "");
  const [prepTimeMinutes, setPrepTimeMinutes] = useState(String(item?.prepTimeMinutes ?? 15));
  const [spiceLevel, setSpiceLevel] = useState(String(item?.spiceLevel ?? 0));
  const [isActive, setIsActive] = useState(item?.isActive ?? true);
  const [isAvailable, setIsAvailable] = useState(item?.isAvailable ?? true);
  const [isFeatured, setIsFeatured] = useState(item?.isFeatured ?? false);
  const [isBuffetPackage, setIsBuffetPackage] = useState(item?.isBuffetPackage ?? false);
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
      isBuffetPackage,
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
        if (!item) router.push(adminPath(`/menu/items/${result.data.id}`));
        else router.refresh();
      });
    });
  }

  const field = "space-y-1.5";

  return (
    <form onSubmit={submit} className="grid grid-cols-[minmax(0,1fr)] items-start gap-5 xl:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="space-y-5">
        <AdminSection title="Details" description="What guests see on the menu." icon={FileText}>
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className={field}>
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
              <div className={field}>
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
            </div>
            <div className={field}>
              <Label htmlFor="slug">Web address</Label>
              <div className="flex min-w-0 items-center overflow-hidden rounded-[var(--radius-brand)] border border-[var(--color-hairline)] bg-[var(--color-surface)] focus-within:border-[var(--color-brand)] focus-within:shadow-[0_0_0_4px_color-mix(in_srgb,var(--color-brand)_14%,transparent)]">
                <span className="shrink-0 self-stretch border-r border-[var(--color-hairline)] bg-[var(--tint)] px-3 py-2.5 text-[13px] text-[var(--color-muted-ink)]">/menu/</span>
                <Input
                  id="slug"
                  value={slug}
                  onChange={(event) => {
                    setSlug(event.target.value);
                    setSlugTouched(true);
                  }}
                  required
                  className="border-0! shadow-none!"
                />
              </div>
              <FieldError>{errors.slug}</FieldError>
            </div>
            <div className={field}>
              <Label htmlFor="shortDescription">Short description</Label>
              <Input
                id="shortDescription"
                value={shortDescription}
                onChange={(event) => setShortDescription(event.target.value)}
                maxLength={240}
                placeholder="One line under the name"
              />
              <p className="text-right text-xs tabular-nums text-[var(--color-muted-ink)]">{shortDescription.length}/240</p>
            </div>
            <div className={field}>
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                rows={isBuffetPackage ? 14 : 4}
                placeholder={isBuffetPackage ? BUFFET_DESCRIPTION_EXAMPLE : undefined}
              />
              {isBuffetPackage ? (
                <p className="text-xs text-[var(--color-muted-ink)]">
                  Buffet card: write a section heading ending in a colon (e.g. <strong>B.B.Q.:</strong>), then one dish per line — or
                  put the dishes after the colon separated by commas. A line starting with <strong>Note:</strong> appears under the
                  card. Add <strong>Adult</strong> / <strong>Children (3–10 years)</strong> as variants for per-head prices.
                </p>
              ) : null}
            </div>
          </div>
        </AdminSection>

        <AdminSection title="Pricing & kitchen" icon={Banknote}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className={field}>
              <Label htmlFor="basePrice">Base price</Label>
              <Input id="basePrice" inputMode="decimal" value={basePrice} onChange={(event) => setBasePrice(event.target.value)} placeholder="450" required />
              <FieldError>{errors.basePrice}</FieldError>
            </div>
            <div className={field}>
              <Label htmlFor="compareAtPrice">
                Compare-at price <span className="font-normal text-[var(--color-muted-ink)]">(optional, shown struck through)</span>
              </Label>
              <Input id="compareAtPrice" inputMode="decimal" value={compareAtPrice} onChange={(event) => setCompareAtPrice(event.target.value)} placeholder="550" />
              <FieldError>{errors.compareAtPrice}</FieldError>
            </div>
            <div className={field}>
              <Label htmlFor="prepTimeMinutes">Prep time (minutes)</Label>
              <Input id="prepTimeMinutes" type="number" min={0} value={prepTimeMinutes} onChange={(event) => setPrepTimeMinutes(event.target.value)} />
            </div>
            <div className={field}>
              <Label htmlFor="spiceLevel">Spice level</Label>
              <Select id="spiceLevel" value={spiceLevel} onChange={(event) => setSpiceLevel(event.target.value)}>
                <option value="0">None</option>
                <option value="1">Mild</option>
                <option value="2">Medium</option>
                <option value="3">Hot</option>
              </Select>
            </div>
          </div>
        </AdminSection>

        <AdminSection title="Dietary & allergens" description="Separate entries with commas." icon={Leaf}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className={field}>
              <Label htmlFor="dietaryTags">Dietary tags</Label>
              <Input id="dietaryTags" value={dietaryTags} onChange={(event) => setDietaryTags(event.target.value)} placeholder="vegetarian, halal" />
            </div>
            <div className={field}>
              <Label htmlFor="allergens">Allergens</Label>
              <Input id="allergens" value={allergens} onChange={(event) => setAllergens(event.target.value)} placeholder="nuts, dairy" />
            </div>
          </div>
        </AdminSection>
      </div>

      <aside className="space-y-5 xl:sticky xl:top-24">
        <AdminSection title="Photo" icon={ImageIcon}>
          <MenuImageField value={imageUrl} savedUrl={item?.imageUrl ?? null} onChange={setImageUrl} onBusyChange={setUploading} error={errors.imageUrl} />
        </AdminSection>

        <AdminSection title="Visibility" icon={Eye}>
          <div className="divide-y divide-[var(--admin-line,var(--color-hairline))]">
            <AdminSwitchRow id="isActive" title="Active" description="Shown on the menu." checked={isActive} onChange={setIsActive} />
            <AdminSwitchRow id="isAvailable" title="Available" description="In stock and orderable today." checked={isAvailable} onChange={setIsAvailable} />
            <AdminSwitchRow id="isFeatured" title="Featured" description="Marked as featured on the storefront." checked={isFeatured} onChange={setIsFeatured} />
            <AdminSwitchRow
              id="isBuffetPackage"
              title="Buffet package"
              description="Priced per head; also shows “Reserve a table”."
              checked={isBuffetPackage}
              onChange={setIsBuffetPackage}
            />
          </div>
        </AdminSection>

        <div className="sticky bottom-0 z-10 -mx-4 border-t border-[var(--admin-line,var(--color-hairline))] bg-[color-mix(in_srgb,var(--color-canvas-muted)_92%,transparent)] px-4 py-3 backdrop-blur-md sm:-mx-6 sm:px-6 xl:static xl:mx-0 xl:border-0 xl:bg-transparent xl:p-0 xl:backdrop-blur-none">
          <Button type="submit" size="lg" disabled={pending || uploading} className="w-full">
            {pending || uploading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Check className="size-4" aria-hidden />}
            {uploading ? "Uploading photo…" : item ? "Save changes" : "Create item"}
          </Button>
        </div>
      </aside>
    </form>
  );
}
