"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ExternalLink,
  FileText,
  Globe,
  Home,
  Layers,
  Megaphone,
  Menu,
  Palette,
  PanelBottom,
  Pencil,
  Plus,
  Search,
  Share2,
  ShoppingBag,
  Trash2,
  Type,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Input, Select, Textarea } from "@/components/ui/input";
import { addPageAction, deletePageAction, listWebsiteLibraryAction, savePageAction, saveWebsiteAction, uploadWebsiteImageAction } from "@/app/super-admin/actions";
import { Check, ColorField, Field, RowList } from "@/components/super-admin/form-parts";
import { SectionsEditor } from "@/components/super-admin/section-editor";
import { ImageUploadProvider } from "@/components/super-admin/image-upload";
import { EmptyState, Panel, SaveBar, SettingRow, StatusBadge } from "@/components/super-admin/ui";
import { websiteStatusTone } from "@/components/super-admin/status";
import { ORDER_TYPES, ORDER_TYPE_LABELS, WEBSITE_STATUSES } from "@/shared/contract/enums";
import { themeSchema, type RestaurantTheme } from "@/shared/contract/settings";
import type { Website, WebsitePage } from "@/shared/contract/models";
import { fontStack } from "@/web/theme";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- JSONB edited field by field, validated server-side on save
type Obj = Record<string, any>;

const FONTS = ["Playfair Display", "DM Serif Display", "Cormorant Garamond", "Libre Baskerville", "Merriweather", "Lora", "Inter", "DM Sans", "Manrope", "Poppins", "Source Sans 3", "Georgia", "System"];
const RADII: { value: RestaurantTheme["radius"]; label: string }[] = [
  { value: "none", label: "Square" },
  { value: "sm", label: "Subtle" },
  { value: "md", label: "Medium" },
  { value: "lg", label: "Rounded" },
  { value: "xl", label: "Extra rounded" },
  { value: "full", label: "Pill" },
];
const RADIUS_PX: Record<string, number> = { none: 0, sm: 4, md: 8, lg: 14, xl: 22, full: 9999 };
const COLOR_GROUPS: { title: string; colors: { key: keyof RestaurantTheme; label: string }[] }[] = [
  {
    title: "Brand",
    colors: [
      { key: "primary", label: "Primary" },
      { key: "primaryForeground", label: "Text on primary" },
      { key: "secondary", label: "Secondary" },
      { key: "accent", label: "Accent" },
    ],
  },
  {
    title: "Surfaces & text",
    colors: [
      { key: "background", label: "Page background" },
      { key: "surface", label: "Cards" },
      { key: "foreground", label: "Text" },
      { key: "muted", label: "Muted text" },
      { key: "border", label: "Borders" },
    ],
  },
];

const statusLabel = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);
const slugify = (text: string) =>
  text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);

/* ------------------------------------------------------------------------------------------------------------------ */
/* Pages                                                                                                               */
/* ------------------------------------------------------------------------------------------------------------------ */

export function PagesManager({ slug, restaurantId, pages }: { slug: string; restaurantId: string; pages: WebsitePage[] }) {
  const [title, setTitle] = useState("");
  const [address, setAddress] = useState("");
  const [addressTouched, setAddressTouched] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const { confirm, dialog } = useConfirm();
  const published = pages.filter((page) => page.isPublished).length;

  function create(event: React.FormEvent) {
    event.preventDefault();
    startTransition(() => {
      addPageAction(restaurantId, { slug: address, title }).then((result) => {
        if (!result.success) return void toast.error(result.error.message);
        toast.success("Page created as a draft.");
        router.push(`/super-admin/${slug}/website/${result.data.id}`);
      });
    });
  }

  async function remove(page: WebsitePage) {
    const ok = await confirm({
      title: `Delete "${page.title}"?`,
      description: "The page and all of its sections are removed from the storefront. This cannot be undone.",
      variant: "danger",
      confirmLabel: "Delete page",
    });
    if (!ok) return;
    startTransition(() => {
      deletePageAction(restaurantId, page.id).then((result) => {
        if (!result.success) return void toast.error(result.error.message);
        toast.success("Page deleted.");
        router.refresh();
      });
    });
  }

  return (
    <Panel
      title="Pages"
      description="Storefront pages and the sections they are built from."
      icon={Layers}
      meta={<span className="text-[13px] text-[var(--color-muted-ink)]">{published} of {pages.length} published</span>}
      bodyClassName="p-0 sm:p-0"
      footer={
        <form onSubmit={create} className="grid w-full gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <Field label="New page title">
            <Input
              value={title}
              required
              placeholder="Catering"
              onChange={(event) => {
                setTitle(event.target.value);
                if (!addressTouched) setAddress(slugify(event.target.value));
              }}
            />
          </Field>
          <Field label="Address">
            <div className="flex items-center rounded-[var(--radius-control)] border border-[var(--color-hairline)] bg-[var(--color-surface)] pl-3 shadow-[var(--sa-shadow-xs)] focus-within:border-[var(--color-brand)] focus-within:shadow-[0_0_0_3px_var(--sa-focus)]">
              <span className="font-mono text-[13px] text-[var(--sa-faint-ink)]">/</span>
              <input
                value={address}
                required
                placeholder="catering"
                onChange={(event) => {
                  setAddressTouched(true);
                  setAddress(event.target.value);
                }}
                className="!h-[38px] min-w-0 flex-1 !border-0 bg-transparent px-1 font-mono text-[13px] !shadow-none outline-none"
              />
            </div>
          </Field>
          <Button type="submit" size="sm" disabled={pending} className="h-10">
            <Plus className="size-4" aria-hidden /> Add page
          </Button>
        </form>
      }
    >
      {dialog}
      {pages.length === 0 ? (
        <div className="p-5">
          <EmptyState icon={FileText} title="No pages yet" description="Add the first page below." />
        </div>
      ) : (
        <ul className="divide-y divide-[var(--color-hairline)]">
          {pages.map((page) => {
            const href = `/super-admin/${slug}/website/${page.id}`;
            return (
              <li key={page.id} className="group flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3.5 transition-colors hover:bg-[var(--sa-subtle)]/50 sm:px-6">
                <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-lg bg-[var(--sa-subtle)] text-[var(--color-muted-ink)]">
                  {page.isHome ? <Home className="size-4" /> : <FileText className="size-4" />}
                </span>
                <div className="min-w-0 flex-1">
                  <Link href={href} className="block truncate text-sm font-medium text-[var(--color-ink)] hover:text-[var(--color-brand)]">
                    {page.title}
                  </Link>
                  <p className="truncate text-xs text-[var(--color-muted-ink)]">
                    <span className="font-mono">/{page.isHome ? "" : page.slug}</span> · {page.sections.length} {page.sections.length === 1 ? "section" : "sections"}
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  {page.isHome ? <StatusBadge tone="brand" dot={false}>Home</StatusBadge> : null}
                  <StatusBadge tone={page.isPublished ? "success" : "neutral"}>{page.isPublished ? "Published" : "Draft"}</StatusBadge>
                </div>
                <div className="flex items-center gap-1">
                  <Button asChild variant="outline" size="sm">
                    <Link href={href}>
                      <Pencil className="size-3.5" aria-hidden /> Edit
                    </Link>
                  </Button>
                  {!page.isHome ? (
                    <Button
                      variant="ghost"
                      size="none"
                      className="size-9 text-[var(--color-muted-ink)] hover:bg-[color-mix(in_srgb,var(--color-danger)_8%,white)] hover:text-[var(--color-danger)]"
                      onClick={() => remove(page)}
                      disabled={pending}
                      aria-label={`Delete ${page.title}`}
                    >
                      <Trash2 className="size-4" aria-hidden />
                    </Button>
                  ) : (
                    <span className="size-9" aria-hidden />
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Website configuration                                                                                               */
/* ------------------------------------------------------------------------------------------------------------------ */

interface WebsiteState {
  name: string;
  status: string;
  domain: string;
  theme: Obj;
  config: Obj;
  seo: Obj;
}

function initialWebsiteState(website: Website): WebsiteState {
  return {
    name: website.name,
    status: website.status,
    domain: website.domain ?? "",
    // edited over the stored object, so keys this form does not show (surfaceDark, status colours…) are kept
    theme: { ...themeSchema.parse(website.theme), ...website.theme },
    config: website.config,
    seo: website.seo as Obj,
  };
}

export function WebsiteForm({ restaurantId, website }: { restaurantId: string; website: Website }) {
  const [saved, setSaved] = useState(() => initialWebsiteState(website));
  const [form, setForm] = useState(saved);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const dirty = useMemo(() => JSON.stringify(form) !== JSON.stringify(saved), [form, saved]);

  const { theme, config, seo } = form;
  const { navigation: nav, announcement: ann, footer: foot, contact, social, ordering } = config;
  const set = (patch: Partial<WebsiteState>) => setForm((current) => ({ ...current, ...patch }));
  const setT = (patch: Obj) => setForm((current) => ({ ...current, theme: { ...current.theme, ...patch } }));
  const setC = (group: string, patch: Obj) =>
    setForm((current) => ({ ...current, config: { ...current.config, [group]: { ...current.config[group], ...patch } } }));
  const setS = (patch: Obj) => setForm((current) => ({ ...current, seo: { ...current.seo, ...patch } }));

  function submit(event: React.FormEvent) {
    event.preventDefault();
    startTransition(() => {
      saveWebsiteAction(restaurantId, { name: form.name, status: form.status, domain: form.domain || null, theme, config, seo }).then((result) => {
        if (!result.success) return void toast.error(result.error.message);
        setSaved(form);
        toast.success("Website saved.");
        router.refresh();
      });
    });
  }

  const status = websiteStatusTone(form.status);

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <h2 className="text-lg text-[var(--color-ink)]">Website settings</h2>
        <p className="text-[13px] text-[var(--color-muted-ink)]">Brand, header, footer and search appearance of the storefront. Saved changes go live immediately.</p>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <fieldset disabled={pending} className="min-w-0 space-y-4">
          <legend className="sr-only">Website settings</legend>

          <Panel title="Website basics" description="Name, visibility and domain." icon={Globe} meta={<StatusBadge tone={status.tone}>{status.label}</StatusBadge>} collapsible>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Website name">
                <Input value={form.name} onChange={(event) => set({ name: event.target.value })} />
              </Field>
              <Field label="Status" hint="Only published websites are visible to customers.">
                <Select value={form.status} onChange={(event) => set({ status: event.target.value })}>
                  {WEBSITE_STATUSES.map((value) => (
                    <option key={value} value={value}>{statusLabel(value)}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Custom domain" hint="Leave empty to use the platform address." className="sm:col-span-2">
                <Input value={form.domain} onChange={(event) => set({ domain: event.target.value })} placeholder="www.example.com" />
              </Field>
            </div>
          </Panel>

          <Panel title="Colours" description="The palette used across the whole storefront." icon={Palette} collapsible>
            <div className="space-y-5">
              {COLOR_GROUPS.map((group) => (
                <div key={group.title} className="space-y-2">
                  <p className="text-xs font-medium uppercase tracking-wide text-[var(--color-muted-ink)]">{group.title}</p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {group.colors.map(({ key, label }) => (
                      <ColorField key={key} label={label} value={String(theme[key] ?? "")} onChange={(value) => setT({ [key]: value })} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </Panel>

          <Panel title="Typography & shape" description="Fonts, corner style and dark mode." icon={Type} collapsible defaultOpen={false}>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Heading font">
                <Select value={theme.font} onChange={(event) => setT({ font: event.target.value })}>
                  {[...new Set([theme.font, ...FONTS])].map((font) => (
                    <option key={font} value={font}>{font}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Body font">
                <Select value={theme.bodyFont} onChange={(event) => setT({ bodyFont: event.target.value })}>
                  {[...new Set([theme.bodyFont, ...FONTS])].map((font) => (
                    <option key={font} value={font}>{font}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Corners">
                <Select value={theme.radius} onChange={(event) => setT({ radius: event.target.value })}>
                  {RADII.map((radius) => (
                    <option key={radius.value} value={radius.value}>{radius.label}</option>
                  ))}
                </Select>
              </Field>
            </div>
            <div className="mt-4 border-t border-[var(--color-hairline)] pt-4">
              <SettingRow id="theme-dark" title="Dark mode" description="Use a dark page background across the storefront." checked={Boolean(theme.dark)} onChange={(value) => setT({ dark: value })} />
            </div>
          </Panel>

          <Panel title="Announcement bar" description="A strip above the header for offers or notices." icon={Megaphone} collapsible defaultOpen={false}
            meta={<StatusBadge tone={ann.enabled ? "success" : "neutral"}>{ann.enabled ? "Shown" : "Hidden"}</StatusBadge>}>
            <div className="space-y-4">
              <SettingRow id="ann-enabled" title="Show the announcement" checked={Boolean(ann.enabled)} onChange={(value) => setC("announcement", { enabled: value })} />
              <Field label="Message" hint={`${(ann.text ?? "").length}/160`}>
                <Input value={ann.text ?? ""} maxLength={160} onChange={(event) => setC("announcement", { text: event.target.value })} />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Link label">
                  <Input value={ann.linkLabel ?? ""} placeholder="Order now" onChange={(event) => setC("announcement", { linkLabel: event.target.value })} />
                </Field>
                <Field label="Link address">
                  <Input value={ann.linkHref ?? ""} onChange={(event) => setC("announcement", { linkHref: event.target.value })} placeholder="/r/slug/menu" />
                </Field>
              </div>
            </div>
          </Panel>

          <Panel title="Header & navigation" description="Links in the storefront header, in order." icon={Menu} collapsible defaultOpen={false}
            meta={<span className="text-[13px] text-[var(--color-muted-ink)]">{nav.items.length} links</span>}>
            <div className="space-y-5">
              <RowList<Obj>
                rows={nav.items}
                onChange={(items) => setC("navigation", { items })}
                blank={() => ({ label: "", href: "", enabled: true })}
                addLabel="Add link"
                render={(row, setRow) => (
                  <>
                    <Field label="Label">
                      <Input value={row.label} onChange={(event) => setRow({ label: event.target.value })} />
                    </Field>
                    <Field label="Address">
                      <Input value={row.href} className="font-mono text-[13px]" onChange={(event) => setRow({ href: event.target.value })} />
                    </Field>
                    <div className="sm:col-span-2">
                      <Check label="Show in the header" checked={row.enabled !== false} onChange={(value) => setRow({ enabled: value })} />
                    </div>
                  </>
                )}
              />
              <div className="grid gap-4 border-t border-[var(--color-hairline)] pt-4 sm:grid-cols-[1fr_12rem]">
                <div className="divide-y divide-[var(--color-hairline)]">
                  <SettingRow id="nav-cart" title="Cart button" description="Show the cart in the header." checked={Boolean(nav.showCart)} onChange={(value) => setC("navigation", { showCart: value })} />
                  <SettingRow id="nav-sticky" title="Sticky header" description="Keep the header visible while scrolling." checked={Boolean(nav.sticky)} onChange={(value) => setC("navigation", { sticky: value })} />
                </div>
                <Field label="Header tone" hint="Ground once the header leaves the hero photo.">
                  <Select value={nav.tone} onChange={(event) => setC("navigation", { tone: event.target.value })}>
                    <option value="dark">Dark</option>
                    <option value="light">Light</option>
                  </Select>
                </Field>
              </div>
            </div>
          </Panel>

          <Panel title="Footer" description="Tagline, link columns and legal note." icon={PanelBottom} collapsible defaultOpen={false}>
            <div className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Tagline">
                  <Input value={foot.tagline ?? ""} maxLength={200} onChange={(event) => setC("footer", { tagline: event.target.value })} />
                </Field>
                <Field label="Legal note">
                  <Input value={foot.legalNote ?? ""} maxLength={200} onChange={(event) => setC("footer", { legalNote: event.target.value })} />
                </Field>
              </div>
              <div className="space-y-2">
                <p className="text-[13px] font-medium text-[var(--color-ink)]">Link columns</p>
                <RowList<Obj>
                  rows={foot.columns}
                  onChange={(columns) => setC("footer", { columns })}
                  blank={() => ({ title: "", links: [] })}
                  addLabel="Add column"
                  render={(column, setColumn) => (
                    <>
                      <Field label="Column title" className="sm:col-span-2">
                        <Input value={column.title} onChange={(event) => setColumn({ title: event.target.value })} />
                      </Field>
                      <div className="sm:col-span-2">
                        <RowList<Obj>
                          rows={column.links}
                          onChange={(links) => setColumn({ links })}
                          blank={() => ({ label: "", href: "" })}
                          addLabel="Add link"
                          render={(link, setLink) => (
                            <>
                              <Field label="Label">
                                <Input value={link.label} onChange={(event) => setLink({ label: event.target.value })} />
                              </Field>
                              <Field label="Address">
                                <Input value={link.href} className="font-mono text-[13px]" onChange={(event) => setLink({ href: event.target.value })} />
                              </Field>
                            </>
                          )}
                        />
                      </div>
                    </>
                  )}
                />
              </div>
            </div>
          </Panel>

          <Panel title="Ordering & contact" description="Order button, default order type and contact details." icon={ShoppingBag} collapsible defaultOpen={false}>
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Order button text">
                  <Input value={ordering.ctaLabel ?? ""} maxLength={40} onChange={(event) => setC("ordering", { ctaLabel: event.target.value })} />
                </Field>
                <Field label="Default order type">
                  <Select value={ordering.defaultOrderType} onChange={(event) => setC("ordering", { defaultOrderType: event.target.value })}>
                    {ORDER_TYPES.map((type) => (
                      <option key={type} value={type}>{ORDER_TYPE_LABELS[type]}</option>
                    ))}
                  </Select>
                </Field>
                <Field label="Contact email">
                  <Input type="email" value={contact.email ?? ""} onChange={(event) => setC("contact", { email: event.target.value })} />
                </Field>
                <Field label="Map embed URL">
                  <Input value={contact.mapEmbedUrl ?? ""} placeholder="https://www.google.com/maps/embed?…" onChange={(event) => setC("contact", { mapEmbedUrl: event.target.value })} />
                </Field>
              </div>
              <div className="divide-y divide-[var(--color-hairline)] border-t border-[var(--color-hairline)] pt-4">
                <SettingRow id="ord-prep" title="Preparation time" description="Show the estimated preparation time." checked={Boolean(ordering.showPrepTime)} onChange={(value) => setC("ordering", { showPrepTime: value })} />
                <SettingRow id="contact-wa" title="WhatsApp" description="Show the WhatsApp contact button." checked={Boolean(contact.showWhatsapp)} onChange={(value) => setC("contact", { showWhatsapp: value })} />
              </div>
            </div>
          </Panel>

          <Panel title="Social links" description="Profiles linked from the storefront." icon={Share2} collapsible defaultOpen={false}>
            <div className="grid gap-4 sm:grid-cols-2">
              {(["instagram", "facebook", "tiktok", "x"] as const).map((key) => (
                <Field key={key} label={key === "x" ? "X (Twitter)" : key === "tiktok" ? "TikTok" : statusLabel(key)}>
                  <Input value={social[key] ?? ""} onChange={(event) => setC("social", { [key]: event.target.value })} placeholder="https://" />
                </Field>
              ))}
            </div>
          </Panel>

          <Panel title="Search & sharing" description="How the storefront appears in search results." icon={Search} collapsible defaultOpen={false}>
            <div className="space-y-4">
              <Field label="Title" hint={`${(seo.title ?? "").length}/60 recommended`}>
                <Input value={seo.title ?? ""} onChange={(event) => setS({ title: event.target.value })} />
              </Field>
              <Field label="Description" hint={`${(seo.description ?? "").length}/160 recommended`}>
                <Textarea className="min-h-20" value={seo.description ?? ""} onChange={(event) => setS({ description: event.target.value })} />
              </Field>
              <div className="rounded-lg border border-[var(--color-hairline)] bg-[var(--sa-subtle)]/50 p-4" aria-label="Search result preview">
                <p className="text-xs text-[var(--color-muted-ink)]">{form.domain || "yourplatform.com/r/…"}</p>
                <p className="mt-0.5 truncate text-[15px] font-medium text-[#1a0dab]">{seo.title || form.name}</p>
                <p className="mt-0.5 line-clamp-2 text-[13px] text-[var(--color-muted-ink)]">{seo.description || "Add a description to control the text under the title."}</p>
              </div>
            </div>
          </Panel>
        </fieldset>

        <aside className="lg:sticky lg:top-20" aria-label="Live preview">
          <StorefrontPreview name={form.name} theme={theme} config={config} />
        </aside>
      </div>

      <SaveBar dirty={dirty} pending={pending} onDiscard={() => setForm(saved)} />
    </form>
  );
}

/** A miniature of the storefront drawn only from the values being edited (no sample data beyond placeholder copy). */
function StorefrontPreview({ name, theme, config }: { name: string; theme: Obj; config: Obj }) {
  const radius = RADIUS_PX[theme.radius as string] ?? 8;
  const headerDark = config.navigation.tone !== "light";
  const headerBg = headerDark ? theme.surfaceDark ?? theme.secondary : theme.background;
  const headerInk = headerDark ? theme.foregroundOnDark ?? "#ffffff" : theme.foreground;
  const links = (config.navigation.items as Obj[]).filter((item) => item.enabled !== false && item.label).slice(0, 4);
  const heading = fontStack(theme.font, "serif");
  const body = fontStack(theme.bodyFont, "sans");

  return (
    <div className="surface-card overflow-hidden">
      <div className="flex items-center justify-between border-b border-[var(--color-hairline)] px-4 py-2.5">
        <p className="text-[13px] font-medium text-[var(--color-ink)]">Live preview</p>
        <span className="flex gap-1" aria-hidden>
          <span className="size-2 rounded-full bg-[var(--sa-subtle-strong)]" />
          <span className="size-2 rounded-full bg-[var(--sa-subtle-strong)]" />
          <span className="size-2 rounded-full bg-[var(--sa-subtle-strong)]" />
        </span>
      </div>
      <div style={{ background: theme.background, color: theme.foreground, fontFamily: body }} className="text-left">
        {config.announcement.enabled && config.announcement.text ? (
          <p className="truncate px-3 py-1.5 text-center text-[10px]" style={{ background: theme.primary, color: theme.primaryForeground }}>
            {config.announcement.text}
          </p>
        ) : null}
        <div className="flex items-center justify-between gap-2 px-3 py-2.5" style={{ background: headerBg, color: headerInk }}>
          <span className="truncate text-[13px]" style={{ fontFamily: heading }}>{name || "Restaurant"}</span>
          <span className="flex items-center gap-2 text-[9px] opacity-80">
            {links.map((link, index) => (
              <span key={index} className="hidden whitespace-nowrap sm:inline lg:hidden xl:inline">{link.label}</span>
            ))}
            <span className="px-2 py-1 text-[9px] font-semibold" style={{ background: theme.primary, color: theme.primaryForeground, borderRadius: radius }}>
              {config.ordering.ctaLabel || "Order now"}
            </span>
          </span>
        </div>
        <div className="space-y-3 px-4 py-5">
          <p className="text-[19px] leading-tight" style={{ fontFamily: heading }}>{name || "Restaurant"}</p>
          <p className="text-[11px]" style={{ color: theme.muted }}>{config.footer.tagline || "Your tagline appears here."}</p>
          <div className="flex gap-2">
            <span className="px-3 py-1.5 text-[11px] font-semibold" style={{ background: theme.primary, color: theme.primaryForeground, borderRadius: radius }}>
              {config.ordering.ctaLabel || "Order now"}
            </span>
            <span className="px-3 py-1.5 text-[11px] font-medium" style={{ border: `1px solid ${theme.border}`, borderRadius: radius }}>Menu</span>
          </div>
          <div className="grid grid-cols-2 gap-2 pt-1">
            {[0, 1].map((index) => (
              <div key={index} className="p-2.5" style={{ background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: Math.min(radius, 14) }}>
                <span className="block h-10 rounded" style={{ background: `color-mix(in srgb, ${theme.secondary} 18%, ${theme.surface})` }} />
                <span className="mt-2 block text-[10px] font-medium">Dish name</span>
                <span className="text-[10px]" style={{ color: theme.accent }}>Rs 1,250</span>
              </div>
            ))}
          </div>
        </div>
        {foot(config.footer.legalNote) ? (
          <p className="truncate border-t px-4 py-2 text-[9px]" style={{ borderColor: theme.border, color: theme.muted }}>{config.footer.legalNote}</p>
        ) : null}
      </div>
    </div>
  );
}

const foot = (value: unknown) => typeof value === "string" && value.trim().length > 0;

/* ------------------------------------------------------------------------------------------------------------------ */
/* Page editor                                                                                                         */
/* ------------------------------------------------------------------------------------------------------------------ */

interface PageState {
  title: string;
  description: string;
  sortOrder: string;
  isHome: boolean;
  isPublished: boolean;
  sections: Record<string, unknown>[];
}

export function PageEditor({ restaurantId, slug, page }: { restaurantId: string; slug: string; page: WebsitePage }) {
  const initial: PageState = {
    title: page.title,
    description: page.description ?? "",
    sortOrder: String(page.sortOrder),
    isHome: page.isHome,
    isPublished: page.isPublished,
    sections: page.sections as Record<string, unknown>[],
  };
  const [saved, setSaved] = useState(initial);
  const [form, setForm] = useState(initial);
  // bumping this remounts the sections editor after a discard so it re-reads the saved list
  const [revision, setRevision] = useState(0);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const dirty = useMemo(() => JSON.stringify(form) !== JSON.stringify(saved), [form, saved]);
  const set = (patch: Partial<PageState>) => setForm((current) => ({ ...current, ...patch }));
  const storefrontHref = `/r/${slug}${page.isHome ? "" : `/${page.slug}`}`;

  // stores the file + its media row now; the URL lands in the section and is saved with the page
  async function uploadImage(file: File): Promise<string | null> {
    const data = new FormData();
    data.append("file", file);
    const result = await uploadWebsiteImageAction(restaurantId, data);
    if (!result.success) {
      toast.error(result.error.message);
      return null;
    }
    return result.data.url;
  }

  async function browseLibrary() {
    const result = await listWebsiteLibraryAction(restaurantId);
    if (!result.success) {
      toast.error(result.error.message);
      return null;
    }
    return result.data;
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    startTransition(() => {
      savePageAction(restaurantId, page.id, {
        title: form.title,
        description: form.description || null,
        isHome: form.isHome,
        isPublished: form.isPublished,
        sortOrder: form.sortOrder,
        sections: JSON.stringify(form.sections),
      }).then((result) => {
        if (!result.success) return void toast.error(result.error.message);
        setSaved(form);
        toast.success("Page saved.");
        router.refresh();
      });
    });
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1.5">
          <Link href={`/super-admin/${slug}/website`} className="inline-flex items-center gap-1.5 rounded text-[13px] text-[var(--color-muted-ink)] transition-colors hover:text-[var(--color-ink)]">
            <ArrowLeft className="size-3.5" aria-hidden /> All pages
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="truncate text-lg text-[var(--color-ink)]">{form.title || "Untitled page"}</h2>
            {page.isHome ? <StatusBadge tone="brand" dot={false}>Home</StatusBadge> : null}
            <StatusBadge tone={saved.isPublished ? "success" : "neutral"}>{saved.isPublished ? "Published" : "Draft"}</StatusBadge>
            <span className="font-mono text-xs text-[var(--color-muted-ink)]">/{page.isHome ? "" : page.slug}</span>
          </div>
        </div>
        <Button asChild variant="outline" size="sm">
          <a href={storefrontHref} target="_blank" rel="noreferrer">
            View on storefront <ExternalLink className="size-3.5" aria-hidden />
          </a>
        </Button>
      </div>

      <fieldset disabled={pending} className="grid items-start gap-5 lg:grid-cols-[18rem_minmax(0,1fr)]">
        <legend className="sr-only">Page</legend>
        <Panel title="Page details" icon={FileText} className="lg:sticky lg:top-20">
          <div className="space-y-4">
            <Field label="Title">
              <Input value={form.title} onChange={(event) => set({ title: event.target.value })} />
            </Field>
            <Field label="Description" hint="Used by search engines.">
              <Textarea className="min-h-20" value={form.description} onChange={(event) => set({ description: event.target.value })} />
            </Field>
            <Field label="Order in menus">
              <Input type="number" min={0} value={form.sortOrder} onChange={(event) => set({ sortOrder: event.target.value })} />
            </Field>
            <div className="divide-y divide-[var(--color-hairline)] border-t border-[var(--color-hairline)] pt-4">
              <SettingRow id="page-published" title="Published" description="Visible on the storefront." checked={form.isPublished} onChange={(value) => set({ isPublished: value })} />
              <SettingRow id="page-home" title="Home page" description="The storefront's landing page." checked={form.isHome} onChange={(value) => set({ isHome: value })} />
            </div>
          </div>
        </Panel>

        <Panel
          title="Sections"
          description="Shown top to bottom. Open a section to edit it; use the arrows to reorder."
          icon={Layers}
          meta={<span className="text-[13px] text-[var(--color-muted-ink)]">{form.sections.length}</span>}
        >
          <ImageUploadProvider upload={uploadImage} browse={browseLibrary}>
            <SectionsEditor key={revision} initial={form.sections} onChange={(sections) => set({ sections })} />
          </ImageUploadProvider>
        </Panel>
      </fieldset>

      <SaveBar
        dirty={dirty}
        pending={pending}
        label="Save page"
        onDiscard={() => {
          setForm(saved);
          setRevision((value) => value + 1);
        }}
      />
    </form>
  );
}
