"use server";

import { config } from "@/server/config";
import { action, errors } from "@/server/errors";
import type { ApiResult } from "@/shared/contract/api";
import {
  addPage,
  removePage,
  saveEntitlements,
  savePage,
  saveWebsite,
  listWebsiteLibrary,
  uploadWebsiteImage,
} from "@/server/services/platform";
import type { LibraryImage } from "@/shared/contract/models";
import { entitlementsPatchSchema, newPageSchema, pageInputSchema, websiteInputSchema } from "@/server/validation/platform";
import { requireSuperAdmin, signOutStaffSession } from "@/web/session";

/** Every action re-checks the super admin (cookie + database role); the services check the role again. */

export async function saveEntitlementsAction(restaurantId: string, payload: unknown): Promise<ApiResult<null>> {
  return action(async () => {
    const actor = await requireSuperAdmin();
    await saveEntitlements(actor, restaurantId, entitlementsPatchSchema.parse(payload));
    return null;
  });
}

export async function saveWebsiteAction(restaurantId: string, payload: unknown): Promise<ApiResult<null>> {
  return action(async () => {
    const actor = await requireSuperAdmin();
    await saveWebsite(actor, restaurantId, websiteInputSchema.parse(payload));
    return null;
  });
}

export async function addPageAction(restaurantId: string, payload: unknown): Promise<ApiResult<{ id: string }>> {
  return action(async () => {
    const actor = await requireSuperAdmin();
    const page = await addPage(actor, restaurantId, newPageSchema.parse(payload));
    return { id: page.id };
  });
}

export async function savePageAction(restaurantId: string, pageId: string, payload: unknown): Promise<ApiResult<null>> {
  return action(async () => {
    const actor = await requireSuperAdmin();
    await savePage(actor, restaurantId, pageId, pageInputSchema.parse(payload));
    return null;
  });
}

export async function deletePageAction(restaurantId: string, pageId: string): Promise<ApiResult<null>> {
  return action(async () => {
    const actor = await requireSuperAdmin();
    await removePage(actor, restaurantId, pageId);
    return null;
  });
}

/** One image file (multipart `file`) for a website section; returns the URL the editor puts into the section. */
export async function uploadWebsiteImageAction(restaurantId: string, formData: FormData): Promise<ApiResult<{ url: string; fileName: string }>> {
  return action(async () => {
    const actor = await requireSuperAdmin();
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) throw errors.validation("Choose an image to upload.");
    const media = await uploadWebsiteImage(actor, restaurantId, file);
    return { url: media.url, fileName: media.fileName };
  });
}

/** The images the page editor's library offers (uploads + images already on the website). Loaded when the picker opens. */
export async function listWebsiteLibraryAction(restaurantId: string): Promise<ApiResult<LibraryImage[]>> {
  return action(async () => listWebsiteLibrary(await requireSuperAdmin(), restaurantId));
}

export async function signOutSuperAdminAction(): Promise<ApiResult<{ loginSlug: string }>> {
  return action(async () => {
    await signOutStaffSession(config.app.defaultRestaurantSlug);
    return { loginSlug: config.app.defaultRestaurantSlug };
  });
}
