import type { z } from "zod";
import { errors } from "@/server/errors";
import type { RequestContext } from "@/server/context";
import type { StaffActor } from "@/server/auth/auth-service";
import { isSuperAdmin } from "@/server/auth/permissions";
import { getStorefrontCache } from "@/server/cache";
import { listAllRestaurants, updateRestaurant } from "@/server/repositories/restaurants";
import { createPage, deletePage, getPageById, getWebsite, listPages, updatePage, updateWebsite } from "@/server/repositories/websites";
import { invalidateAdminRestaurants } from "@/server/services/restaurants";
import type { entitlementsPatchSchema, PageInput, WebsiteInput } from "@/server/validation/platform";
import { parseEntitlements } from "@/shared/feature-access";
import type { LibraryImage, MediaAsset, Restaurant, Website, WebsitePage } from "@/shared/contract/models";
import { createMedia, listMedia } from "@/server/repositories/media";
import { deleteStoredMedia, uploadMedia } from "@/server/integrations/storage";

/**
 * Super admin: which features/screens each restaurant gets (restaurants.entitlements) and its website
 * (websites + website_pages). Every function re-checks the role, so a page or action that forgets still cannot
 * reach another restaurant's data. Reads and writes are privileged (service role), hence the check here.
 */

function assertSuperAdmin(actor: StaffActor): void {
  if (!isSuperAdmin(actor.role)) throw errors.forbidden("Only a platform super admin can do that.");
}

const ctxFor = (actor: StaffActor, restaurantId?: string): RequestContext => ({ restaurantId, userId: actor.userId, actor: actor.name });

/** The storefront snapshot and the admin shell both hold restaurant/website data; drop both after any change. */
function invalidate(): void {
  getStorefrontCache().invalidate();
  invalidateAdminRestaurants();
}

export async function listRestaurantsForPlatform(actor: StaffActor): Promise<Restaurant[]> {
  assertSuperAdmin(actor);
  return listAllRestaurants(ctxFor(actor));
}

export async function getRestaurantForPlatform(actor: StaffActor, slug: string): Promise<Restaurant> {
  const restaurant = (await listRestaurantsForPlatform(actor)).find((r) => r.slug === slug);
  if (!restaurant) throw errors.notFound("Restaurant");
  return restaurant;
}

export async function saveEntitlements(
  actor: StaffActor,
  restaurantId: string,
  patch: z.infer<typeof entitlementsPatchSchema>,
): Promise<Restaurant> {
  assertSuperAdmin(actor);
  const ctx = ctxFor(actor, restaurantId);
  const current = (await listAllRestaurants(ctx)).find((r) => r.id === restaurantId);
  if (!current) throw errors.notFound("Restaurant");
  const defined = Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined));
  const entitlements = parseEntitlements({ ...current.entitlements, ...defined });
  const restaurant = await updateRestaurant(restaurantId, { entitlements }, ctx);
  invalidate();
  return restaurant;
}

export async function getWebsiteForPlatform(
  actor: StaffActor,
  restaurantId: string,
): Promise<{ website: Website | null; pages: WebsitePage[] }> {
  assertSuperAdmin(actor);
  const ctx = ctxFor(actor, restaurantId);
  const website = await getWebsite(restaurantId, ctx);
  return { website, pages: website ? await listPages(website.id, ctx) : [] };
}

async function requireWebsite(actor: StaffActor, restaurantId: string): Promise<Website> {
  assertSuperAdmin(actor);
  const website = await getWebsite(restaurantId, ctxFor(actor, restaurantId));
  if (!website) throw errors.notFound("Website");
  return website;
}

export async function saveWebsite(actor: StaffActor, restaurantId: string, input: WebsiteInput): Promise<Website> {
  const website = await requireWebsite(actor, restaurantId);
  const saved = await updateWebsite(
    website.id,
    { name: input.name, status: input.status, domain: input.domain || null, theme: input.theme, config: input.config, seo: input.seo },
    ctxFor(actor, restaurantId),
  );
  invalidate();
  return saved;
}

export async function addPage(actor: StaffActor, restaurantId: string, input: { slug: string; title: string }): Promise<WebsitePage> {
  const website = await requireWebsite(actor, restaurantId);
  const page = await createPage(
    { websiteId: website.id, restaurantId, slug: input.slug, title: input.title, isPublished: false },
    ctxFor(actor, restaurantId),
  );
  invalidate();
  return page;
}

/** The page, only if it belongs to `restaurantId` (the URL's restaurant) - never trust a page id on its own. */
export async function getPageForPlatform(actor: StaffActor, restaurantId: string, pageId: string): Promise<WebsitePage> {
  assertSuperAdmin(actor);
  const page = await getPageById(pageId, ctxFor(actor, restaurantId));
  if (!page || page.restaurantId !== restaurantId) throw errors.notFound("Page");
  return page;
}

export async function savePage(actor: StaffActor, restaurantId: string, pageId: string, input: PageInput): Promise<WebsitePage> {
  const page = await getPageForPlatform(actor, restaurantId, pageId);
  // unsetting or unpublishing the home page would leave the storefront with no landing page
  if (page.isHome && !input.isHome) throw errors.validation("Make another page the home page instead of unsetting this one.");
  if (page.isHome && !input.isPublished) throw errors.validation("The home page must stay published.");
  const saved = await updatePage(
    pageId,
    {
      title: input.title,
      description: input.description ?? null,
      isHome: input.isHome,
      isPublished: input.isPublished,
      sortOrder: input.sortOrder,
      sections: input.sections,
    },
    ctxFor(actor, restaurantId),
  );
  invalidate();
  return saved;
}

/**
 * Uploads one image for a section of this restaurant's website: the file goes to storage (Supabase Storage, or `.uploads/`
 * locally; `integrations/storage.ts` checks type and size) and a `media` row records it, so the library knows the file.
 * Returns the public URL for the section's `image.url`; the page itself is saved by the editor's own Save.
 */
export async function uploadWebsiteImage(
  actor: StaffActor,
  restaurantId: string,
  file: { name: string; type: string; size: number; arrayBuffer: () => Promise<ArrayBuffer> },
): Promise<MediaAsset> {
  assertSuperAdmin(actor);
  const ctx = ctxFor(actor, restaurantId);
  if (!(await listAllRestaurants(ctx)).some((r) => r.id === restaurantId)) throw errors.notFound("Restaurant");
  const stored = await uploadMedia(restaurantId, file);
  try {
    return await createMedia(restaurantId, { ...stored, purpose: "website" }, ctx);
  } catch (error) {
    // no orphaned file when the row cannot be written
    await deleteStoredMedia(stored.bucket, stored.path);
    throw error;
  }
}

/** Every `{ url, alt }` image object inside the section JSON (hero/about/cta images, gallery photos, ...). */
export function sectionImages(value: unknown, found: { url: string; alt: string | null }[] = []): { url: string; alt: string | null }[] {
  if (Array.isArray(value)) for (const entry of value) sectionImages(entry, found);
  else if (value && typeof value === "object") {
    const object = value as Record<string, unknown>;
    if (typeof object.url === "string" && object.url.trim()) found.push({ url: object.url, alt: typeof object.alt === "string" && object.alt ? object.alt : null });
    for (const entry of Object.values(object)) if (entry && typeof entry === "object") sectionImages(entry, found);
  }
  return found;
}

/**
 * The images the page editor's library offers for this restaurant: uploads recorded in `media` (newest first), then
 * images already used on its website pages that have no media row (seeded demo photos), each address once.
 */
export async function listWebsiteLibrary(actor: StaffActor, restaurantId: string): Promise<LibraryImage[]> {
  assertSuperAdmin(actor);
  const ctx = ctxFor(actor, restaurantId);
  const [media, website] = await Promise.all([listMedia(restaurantId, { limit: 300 }, ctx), getWebsite(restaurantId, ctx)]);
  const pages = website ? await listPages(website.id, ctx) : [];
  const seen = new Set<string>();
  const library: LibraryImage[] = [];
  for (const item of media) {
    if (!item.mimeType.startsWith("image/") || seen.has(item.url)) continue;
    seen.add(item.url);
    library.push({ url: item.url, name: item.fileName, alt: item.altText, source: "upload", createdAt: item.createdAt });
  }
  for (const image of sectionImages(pages.map((page) => page.sections))) {
    if (seen.has(image.url)) continue;
    seen.add(image.url);
    library.push({ url: image.url, name: image.url.split("/").pop() || image.url, alt: image.alt, source: "website", createdAt: null });
  }
  return library;
}

export async function removePage(actor: StaffActor, restaurantId: string, pageId: string): Promise<void> {
  const page = await getPageForPlatform(actor, restaurantId, pageId);
  if (page.isHome) throw errors.validation("The home page cannot be deleted. Make another page the home page first.");
  await deletePage(pageId, ctxFor(actor, restaurantId));
  invalidate();
}
