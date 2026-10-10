"use client";

import { useRef, useState } from "react";
import { ArrowDown, ArrowUp, ChevronDown, EyeOff, Layers, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Input, Select, Textarea } from "@/components/ui/input";
import { Check, Field, RowList } from "@/components/super-admin/form-parts";
import { EmptyState, StatusBadge, Switch } from "@/components/super-admin/ui";
import { ImageUploadTile } from "@/components/super-admin/image-upload";
import { ORDER_TYPES, ORDER_TYPE_LABELS, type OrderType } from "@/shared/contract/enums";
import { SECTION_LABELS, SECTION_TYPES, defaultSection, type SectionType } from "@/shared/contract/sections";
import { cn } from "@/shared/utils";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- JSONB edited field by field; the server validates against sectionSchema on save
type Obj = Record<string, any>;

/**
 * Schema-driven form for website_pages.sections. Each section type is a list of field specs (below) instead of its own
 * component, so a new section type or field is one line here, next to `shared/contract/sections.ts`. Edits are merged over the
 * stored object, so keys this editor does not show survive a save, and the server re-validates everything.
 */

type Spec = { k: string; label: string; wide?: boolean; hint?: string };
type Field =
  | (Spec & { t: "text" | "textarea" | "bool" })
  | (Spec & { t: "number"; min?: number; max?: number; step?: number })
  | (Spec & { t: "select"; options: readonly string[] })
  | (Spec & { t: "image" })
  | (Spec & { t: "upload" })
  | (Spec & { t: "cta" })
  | (Spec & { t: "strings"; add: string })
  | (Spec & { t: "rows"; add: string; fields: Field[]; blank: Obj })
  | (Spec & { t: "orderTypes" });

const title = (label = "Title"): Field => ({
  k: "title",
  label,
  t: "text",
  wide: true,
});
const subtitle: Field = {
  k: "subtitle",
  label: "Subtitle",
  t: "textarea",
  wide: true,
};

export const FIELDS: Record<SectionType, Field[]> = {
  hero: [
    { k: "eyebrow", label: "Small line above the title", t: "text" },
    title(),
    { k: "subtitle", label: "Subtitle", t: "textarea", wide: true },
    { k: "image", label: "Background photo", t: "image", wide: true },
    {
      k: "alignment",
      label: "Text alignment",
      t: "select",
      options: ["left", "center"],
    },
    {
      k: "height",
      label: "Height",
      t: "select",
      options: ["sm", "md", "lg", "full"],
    },
    {
      k: "overlay",
      label: "Photo darkening (0 - 1)",
      t: "number",
      min: 0,
      max: 1,
      step: 0.05,
    },
    { k: "primaryCta", label: "Main button", t: "cta" },
    { k: "secondaryCta", label: "Second button", t: "cta" },
    {
      k: "highlights",
      label: "Highlights (short badges)",
      t: "strings",
      add: "Add highlight",
      wide: true,
    },
  ],
  announcement: [
    { k: "text", label: "Text", t: "text", wide: true },
    { k: "linkLabel", label: "Link label", t: "text" },
    { k: "linkHref", label: "Link address", t: "text" },
    {
      k: "tone",
      label: "Colour",
      t: "select",
      options: ["primary", "neutral", "accent"],
    },
  ],
  featured_items: [
    title(),
    subtitle,
    { k: "limit", label: "How many dishes", t: "number", min: 1, max: 12 },
    {
      k: "layout",
      label: "Layout",
      t: "select",
      options: ["grid", "carousel"],
    },
    {
      k: "itemSlugs",
      label: "Pick dishes by slug (empty = the ones marked featured)",
      t: "strings",
      add: "Add dish",
      wide: true,
    },
    { k: "cta", label: "Button", t: "cta" },
  ],
  menu_categories: [
    title(),
    subtitle,
    { k: "limit", label: "How many categories", t: "number", min: 1, max: 24 },
    { k: "showImages", label: "Show category photos", t: "bool" },
  ],
  menu_preview: [
    title(),
    subtitle,
    { k: "categorySlug", label: "Category slug (optional)", t: "text" },
    { k: "limit", label: "How many dishes", t: "number", min: 1, max: 12 },
    {
      k: "itemSlugs",
      label: "Pick dishes by slug",
      t: "strings",
      add: "Add dish",
      wide: true,
    },
  ],
  about: [
    { k: "eyebrow", label: "Small line above the title", t: "text" },
    title(),
    { k: "body", label: "Story", t: "textarea", wide: true },
    { k: "image", label: "Photo", t: "image", wide: true },
    {
      k: "imagePosition",
      label: "Photo side",
      t: "select",
      options: ["left", "right"],
    },
    {
      k: "stats",
      label: "Numbers (up to 4)",
      t: "rows",
      add: "Add number",
      blank: { value: "", label: "" },
      wide: true,
      fields: [
        { k: "value", label: "Value (e.g. 12+)", t: "text" },
        { k: "label", label: "Label", t: "text" },
      ],
    },
    { k: "cta", label: "Button", t: "cta" },
  ],
  gallery: [
    title(),
    subtitle,
    { k: "columns", label: "Columns", t: "number", min: 2, max: 4 },
    {
      k: "images",
      label: "Photos",
      t: "rows",
      add: "Add photo",
      blank: { url: "", alt: "" },
      wide: true,
      fields: [
        { k: "url", label: "Photo", t: "upload", wide: true },
        { k: "alt", label: "Description (for screen readers)", t: "text" },
        { k: "caption", label: "Caption", t: "text" },
      ],
    },
  ],
  why_choose_us: [
    title(),
    subtitle,
    {
      k: "items",
      label: "Reasons (up to 8)",
      t: "rows",
      add: "Add reason",
      blank: { icon: "sparkles", title: "", description: "" },
      wide: true,
      fields: [
        { k: "title", label: "Title", t: "text" },
        { k: "icon", label: "Icon name", t: "text" },
        { k: "description", label: "Description", t: "textarea", wide: true },
      ],
    },
  ],
  reviews: [
    title(),
    subtitle,
    { k: "limit", label: "How many reviews", t: "number", min: 1, max: 12 },
    {
      k: "layout",
      label: "Layout",
      t: "select",
      options: ["grid", "carousel"],
    },
    { k: "showCta", label: "Show the 'write a review' button", t: "bool" },
  ],
  reservation_cta: [
    title(),
    subtitle,
    { k: "phoneLabel", label: "Phone line", t: "text" },
    { k: "image", label: "Photo", t: "image", wide: true },
    { k: "cta", label: "Button", t: "cta" },
  ],
  locations: [
    title(),
    subtitle,
    { k: "limit", label: "How many branches", t: "number", min: 1, max: 20 },
    { k: "showMap", label: "Show the map", t: "bool" },
  ],
  contact: [
    title(),
    subtitle,
    { k: "email", label: "Email", t: "text" },
    { k: "phone", label: "Phone", t: "text" },
    { k: "showForm", label: "Show a contact form", t: "bool" },
  ],
  cta: [
    title(),
    subtitle,
    {
      k: "tone",
      label: "Style",
      t: "select",
      options: ["primary", "neutral", "image"],
    },
    { k: "image", label: "Background photo", t: "image", wide: true },
    { k: "cta", label: "Main button", t: "cta" },
    { k: "secondaryCta", label: "Second button", t: "cta" },
  ],
  rich_text: [
    title(),
    { k: "body", label: "Text", t: "textarea", wide: true },
    { k: "width", label: "Width", t: "select", options: ["narrow", "wide"] },
  ],
  order_type_switch: [
    title(),
    subtitle,
    {
      k: "orderTypes",
      label: "Order types to offer",
      t: "orderTypes",
      wide: true,
    },
  ],
  page_content: [
    { k: "title", label: "Heading override (optional)", t: "text" },
    { k: "subtitle", label: "Subtitle override (optional)", t: "text" },
    { k: "image", label: "Top background photo (optional, else the cover photo)", t: "image", wide: true },
  ],
};

const HINTS: Record<SectionType, string> = {
  hero: "Big opening banner with a photo and buttons",
  announcement: "A thin strip for offers or notices",
  featured_items: "Showcase chosen dishes",
  menu_categories: "Tiles that lead into the menu",
  menu_preview: "A few dishes from one category",
  about: "Your story, photo and key numbers",
  gallery: "A grid of photos",
  why_choose_us: "Icons with short reasons",
  reviews: "Recent guest reviews",
  reservation_cta: "Invite guests to book a table",
  locations: "Branches, hours and map",
  contact: "Email, phone and optional form",
  cta: "Banner with one or two buttons",
  rich_text: "Free text block",
  order_type_switch: "Delivery / pickup / dine-in chooser",
  page_content: "Where the page's built-in body appears",
};

const CTA_STYLES = ["primary", "outline", "ghost"] as const;

function setKey(object: Obj, key: string, value: unknown): Obj {
  const next = { ...object };
  if (value === undefined) delete next[key];
  else next[key] = value;
  return next;
}

function FieldInput({ field, value, onChange }: { field: Field; value: unknown; onChange: (value: unknown) => void }) {
  const wide = field.wide ? "sm:col-span-2" : undefined;
  switch (field.t) {
    case "text":
      return (
        <Field label={field.label} className={wide}>
          <Input value={(value as string) ?? ""} onChange={(event) => onChange(event.target.value || undefined)} />
        </Field>
      );
    case "textarea":
      return (
        <Field label={field.label} className={wide}>
          <Textarea className="min-h-24" value={(value as string) ?? ""} onChange={(event) => onChange(event.target.value || undefined)} />
        </Field>
      );
    case "number":
      return (
        <Field label={field.label} className={wide}>
          <Input
            type="number"
            min={field.min}
            max={field.max}
            step={field.step}
            value={value === undefined ? "" : String(value)}
            placeholder="default"
            onChange={(event) => onChange(event.target.value === "" ? undefined : Number(event.target.value))}
          />
        </Field>
      );
    case "bool":
      return (
        <div
          className={cn(
            "flex items-center justify-between gap-3 self-end rounded-lg border border-[var(--color-hairline)] bg-[var(--color-surface)] px-3 py-2",
            wide,
          )}
        >
          <span className="text-[13px] font-medium text-[var(--color-ink)]">{field.label}</span>
          <Switch checked={value !== false && Boolean(value ?? true)} onChange={onChange} aria-label={field.label} />
        </div>
      );
    case "select":
      return (
        <Field label={field.label} className={wide}>
          <Select value={(value as string) ?? field.options[0]} onChange={(event) => onChange(event.target.value)}>
            {field.options.map((option) => (
              <option key={option} value={option}>
                {option.charAt(0).toUpperCase() + option.slice(1)}
              </option>
            ))}
          </Select>
        </Field>
      );
    case "upload": {
      const url = (value as string) ?? "";
      return (
        <div role="group" aria-label={field.label} className={cn("flex flex-col gap-2 sm:flex-row sm:items-end", wide)}>
          <ImageUploadTile className="w-36 shrink-0" label={field.label} url={url} onChange={(next) => onChange(next?.url ?? "")} />
          <Field label="Address" className="flex-1">
            <Input value={url} placeholder="https://…" onChange={(event) => onChange(event.target.value)} />
          </Field>
        </div>
      );
    }
    case "image": {
      const image = (value as Obj | undefined) ?? {};
      const url = (image.url as string) ?? "";
      return (
        <div role="group" aria-label={field.label} className={cn("space-y-2", wide)}>
          <span className="block text-[13px] font-medium text-[var(--color-ink)]">{field.label}</span>
          <div className="flex flex-col gap-3 rounded-lg border border-[var(--color-hairline)] bg-[var(--color-surface)] p-3 sm:flex-row sm:items-start">
            <ImageUploadTile
              className="w-36 shrink-0 sm:w-44"
              label={field.label}
              url={url}
              // a new image keeps the alt text and caption already typed; a library pick fills an empty alt from the library
              onChange={(next) => onChange(next ? { ...image, url: next.url, ...(next.alt && !image.alt ? { alt: next.alt } : {}) } : undefined)}
            />
            <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-2">
              <Input
                className="sm:col-span-2"
                aria-label={`${field.label} address`}
                placeholder="…or paste an image address (https://…)"
                value={url}
                // no address = no image (an image needs one)
                onChange={(event) => onChange(event.target.value ? { ...image, url: event.target.value } : undefined)}
              />
              <Input
                aria-label="Alt text"
                placeholder="Description (alt text)"
                value={(image.alt as string) ?? ""}
                disabled={!url}
                onChange={(event) => onChange({ ...image, alt: event.target.value })}
              />
              <Input
                aria-label="Caption"
                placeholder="Caption"
                value={(image.caption as string) ?? ""}
                disabled={!url}
                onChange={(event) =>
                  onChange({
                    ...image,
                    caption: event.target.value || undefined,
                  })
                }
              />
            </div>
          </div>
        </div>
      );
    }
    case "cta": {
      const cta = value as Obj | undefined;
      return (
        <div
          className={cn(
            "overflow-hidden rounded-lg border border-[var(--color-hairline)] bg-[var(--color-surface)]",
            wide ?? "sm:col-span-2",
          )}
        >
          <div className="flex items-center justify-between gap-3 px-3 py-2">
            <span className="text-[13px] font-medium text-[var(--color-ink)]">{field.label}</span>
            <Switch
              checked={Boolean(cta)}
              onChange={(on) => onChange(on ? { label: "Order now", href: "#menu", style: "primary" } : undefined)}
              aria-label={`Show ${field.label.toLowerCase()}`}
            />
          </div>
          {cta ? (
            <div className="grid gap-3 border-t border-[var(--color-hairline)] p-3 sm:grid-cols-3">
              <Field label="Label">
                <Input value={cta.label ?? ""} maxLength={40} onChange={(event) => onChange({ ...cta, label: event.target.value })} />
              </Field>
              <Field label="Address">
                <Input value={cta.href ?? ""} onChange={(event) => onChange({ ...cta, href: event.target.value })} />
              </Field>
              <Field label="Style">
                <Select value={cta.style ?? "primary"} onChange={(event) => onChange({ ...cta, style: event.target.value })}>
                  {CTA_STYLES.map((style) => (
                    <option key={style} value={style}>
                      {style.charAt(0).toUpperCase() + style.slice(1)}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
          ) : null}
        </div>
      );
    }
    case "strings": {
      const list = (value as string[] | undefined) ?? [];
      return (
        <div role="group" aria-label={field.label} className={cn("space-y-2", wide)}>
          <span className="block text-[13px] font-medium text-[var(--color-ink)]">{field.label}</span>
          <div className="flex flex-wrap gap-2">
            {list.map((text, index) => (
              <span
                key={index}
                className="flex items-center gap-1 rounded-full border border-[var(--color-hairline)] bg-[var(--color-surface)] py-0.5 pl-3 pr-1 focus-within:border-[var(--color-brand)]"
              >
                <input
                  aria-label={`${field.label} ${index + 1}`}
                  className="!h-7 w-32 !border-0 bg-transparent !p-0 text-sm !shadow-none outline-none"
                  value={text}
                  onChange={(event) => onChange(list.map((entry, i) => (i === index ? event.target.value : entry)))}
                />
                <button
                  type="button"
                  aria-label={`Remove ${text || "entry"}`}
                  className="rounded-full p-1 text-[var(--color-muted-ink)] hover:bg-[var(--sa-subtle)] hover:text-[var(--color-ink)]"
                  onClick={() => onChange(list.filter((_, i) => i !== index))}
                >
                  <X className="size-3.5" aria-hidden />
                </button>
              </span>
            ))}
            <Button type="button" variant="outline" size="sm" onClick={() => onChange([...list, ""])}>
              <Plus className="size-4" aria-hidden /> {field.add}
            </Button>
          </div>
        </div>
      );
    }
    case "rows": {
      const rows = (value as Obj[] | undefined) ?? [];
      return (
        <div role="group" aria-label={field.label} className={cn("space-y-2", wide)}>
          <span className="block text-[13px] font-medium text-[var(--color-ink)]">{field.label}</span>
          <RowList<Obj>
            rows={rows}
            onChange={onChange}
            blank={() => ({ ...field.blank })}
            addLabel={field.add}
            render={(row, set) =>
              field.fields.map((sub) => (
                <FieldInput key={sub.k} field={sub} value={row[sub.k]} onChange={(next) => set({ [sub.k]: next })} />
              ))
            }
          />
        </div>
      );
    }
    case "orderTypes": {
      const selected = (value as OrderType[] | undefined) ?? ["delivery", "pickup"];
      return (
        <div role="group" aria-label={field.label} className={cn("space-y-2", wide)}>
          <span className="block text-[13px] font-medium text-[var(--color-ink)]">{field.label}</span>
          <div className="flex flex-wrap gap-4">
            {ORDER_TYPES.map((type) => (
              <Check
                key={type}
                label={ORDER_TYPE_LABELS[type]}
                checked={selected.includes(type)}
                onChange={(on) => {
                  const next = on ? [...selected, type] : selected.filter((entry) => entry !== type);
                  if (next.length > 0) onChange(next); // the schema needs at least one
                }}
              />
            ))}
          </div>
        </div>
      );
    }
  }
}

function summary(section: Obj): string {
  const text = section.title || section.text || section.body || section.eyebrow || "";
  return String(text).replace(/\s+/g, " ").slice(0, 70);
}

type Item = { id: number; data: Obj };

const iconButton =
  "grid size-8 place-items-center rounded-md text-[var(--color-muted-ink)] transition-colors hover:bg-[var(--sa-subtle)] hover:text-[var(--color-ink)] disabled:pointer-events-none disabled:opacity-30";

export function SectionsEditor({ initial, onChange }: { initial: Obj[]; onChange: (sections: Obj[]) => void }) {
  const nextId = useRef(initial.length);
  const [items, setItems] = useState<Item[]>(() => initial.map((data, id) => ({ id, data })));
  const [open, setOpen] = useState<Set<number>>(() => new Set(initial.length <= 2 ? initial.map((_, id) => id) : []));
  const [picking, setPicking] = useState(false);
  const { confirm, dialog } = useConfirm();

  const commit = (next: Item[]) => {
    setItems(next);
    onChange(next.map((item) => item.data));
  };
  const update = (id: number, change: (data: Obj) => Obj) =>
    commit(items.map((entry) => (entry.id === id ? { ...entry, data: change(entry.data) } : entry)));
  const toggle = (id: number) =>
    setOpen((current) => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  const move = (from: number, to: number) => {
    if (to < 0 || to >= items.length) return;
    const next = [...items];
    next.splice(to, 0, next.splice(from, 1)[0] as Item);
    commit(next);
  };
  const add = (type: SectionType) => {
    const id = nextId.current++;
    commit([...items, { id, data: defaultSection(type) as Obj }]);
    setOpen((current) => new Set(current).add(id));
    setPicking(false);
  };
  const remove = async (item: Item) => {
    const label = SECTION_LABELS[item.data.type as SectionType] ?? "this";
    if (
      !(await confirm({
        title: `Delete the ${label} section?`,
        description: "It is removed from the page when you save.",
        variant: "danger",
        confirmLabel: "Delete section",
      }))
    )
      return;
    commit(items.filter((entry) => entry.id !== item.id));
  };

  return (
    <div className="space-y-2.5">
      {dialog}
      {items.length === 0 ? (
        <EmptyState
          icon={Layers}
          title="No sections yet"
          description="Sections are the building blocks of the page. Add the first one below."
        />
      ) : null}

      <ol className="space-y-2.5">
        {items.map((item, index) => {
          const type = item.data.type as SectionType;
          const fields = FIELDS[type] ?? [];
          const isOpen = open.has(item.id);
          const hidden = item.data.enabled === false;
          const bodyId = `section-body-${item.id}`;
          return (
            <li
              key={item.id}
              className={cn(
                "overflow-hidden rounded-xl border bg-[var(--color-surface)] transition-[border-color,box-shadow] duration-150",
                isOpen ? "border-[var(--sa-border-strong)] shadow-[var(--sa-shadow-sm)]" : "border-[var(--color-hairline)]",
              )}
            >
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 py-2 pl-2 pr-2 sm:flex-nowrap sm:pl-3">
                <button
                  type="button"
                  onClick={() => toggle(item.id)}
                  aria-expanded={isOpen}
                  aria-controls={bodyId}
                  className="flex min-w-0 basis-full items-center gap-3 rounded-lg px-1 py-1 text-left sm:basis-auto sm:flex-1"
                >
                  <span className="grid size-7 shrink-0 place-items-center rounded-md bg-[var(--sa-subtle)] text-xs font-semibold tabular-nums text-[var(--color-muted-ink)]">
                    {index + 1}
                  </span>
                  <span className={cn("min-w-0", hidden && "opacity-60")}>
                    <span className="flex items-center gap-2 text-sm font-medium text-[var(--color-ink)]">
                      <span className="truncate">{SECTION_LABELS[type]?.split(" (")[0] ?? type}</span>
                      {hidden ? (
                        <StatusBadge tone="neutral" dot={false} className="gap-1">
                          <EyeOff className="size-3" aria-hidden /> Hidden
                        </StatusBadge>
                      ) : null}
                    </span>
                    <span className="block truncate text-xs text-[var(--color-muted-ink)]">{summary(item.data) || HINTS[type]}</span>
                  </span>
                  <ChevronDown
                    className={cn(
                      "ml-auto size-4 shrink-0 text-[var(--sa-faint-ink)] transition-transform duration-200 ease-[var(--ease-out)]",
                      isOpen && "rotate-180",
                    )}
                    aria-hidden
                  />
                </button>
                <span aria-hidden className="mx-1 hidden h-5 w-px bg-[var(--color-hairline)] sm:block" />
                <span className="ml-auto flex items-center gap-2 pl-9 sm:ml-0 sm:pl-0">
                  <Switch
                    checked={!hidden}
                    onChange={(on) => update(item.id, (data) => ({ ...data, enabled: on }))}
                    aria-label={`Show the ${SECTION_LABELS[type] ?? type} section`}
                  />
                  <div className="flex shrink-0 items-center">
                    <button
                      type="button"
                      className={iconButton}
                      onClick={() => move(index, index - 1)}
                      disabled={index === 0}
                      aria-label={`Move section ${index + 1} up`}
                    >
                      <ArrowUp className="size-4" aria-hidden />
                    </button>
                    <button
                      type="button"
                      className={iconButton}
                      onClick={() => move(index, index + 1)}
                      disabled={index === items.length - 1}
                      aria-label={`Move section ${index + 1} down`}
                    >
                      <ArrowDown className="size-4" aria-hidden />
                    </button>
                    <button
                      type="button"
                      className={cn(
                        iconButton,
                        "hover:bg-[color-mix(in_srgb,var(--color-danger)_8%,white)] hover:text-[var(--color-danger)]",
                      )}
                      onClick={() => remove(item)}
                      aria-label={`Delete section ${index + 1}`}
                    >
                      <Trash2 className="size-4" aria-hidden />
                    </button>
                  </div>
                </span>
              </div>
              {isOpen ? (
                <div
                  id={bodyId}
                  className="border-t border-[var(--color-hairline)] bg-[color-mix(in_srgb,var(--sa-subtle)_45%,white)] p-4 sm:p-5"
                >
                  <div className="grid gap-4 sm:grid-cols-2">
                    {fields.map((field) => (
                      <FieldInput
                        key={field.k}
                        field={field}
                        value={item.data[field.k]}
                        onChange={(value) => update(item.id, (data) => setKey(data, field.k, value))}
                      />
                    ))}
                  </div>
                </div>
              ) : null}
            </li>
          );
        })}
      </ol>

      {picking ? (
        <div className="rounded-xl border border-[var(--color-hairline)] bg-[var(--color-surface)] p-3 shadow-[var(--sa-shadow-sm)]">
          <div className="mb-3 flex items-center justify-between px-1">
            <p className="text-sm font-medium text-[var(--color-ink)]">Add a section</p>
            <button type="button" className={iconButton} onClick={() => setPicking(false)} aria-label="Close">
              <X className="size-4" aria-hidden />
            </button>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {SECTION_TYPES.map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => add(type)}
                className="press rounded-lg border border-[var(--color-hairline)] p-3 text-left transition-colors hover:border-[color-mix(in_srgb,var(--color-brand)_45%,var(--color-hairline))] hover:bg-[var(--sa-primary-soft)]/40"
              >
                <span className="block text-sm font-medium text-[var(--color-ink)]">{SECTION_LABELS[type].split(" (")[0]}</span>
                <span className="mt-0.5 block text-xs text-[var(--color-muted-ink)]">{HINTS[type]}</span>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setPicking(true)}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-[var(--sa-border-strong)] py-3 text-sm font-medium text-[var(--color-muted-ink)] transition-colors hover:border-[var(--color-brand)] hover:text-[var(--color-brand)]"
        >
          <Plus className="size-4" aria-hidden /> Add section
        </button>
      )}
    </div>
  );
}
