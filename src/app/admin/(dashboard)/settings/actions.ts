"use server";

import { revalidatePath } from "next/cache";
import { adminPath } from "@/shared/utils";
import type { ApiResult } from "@/shared/contract/api";
import type { Restaurant } from "@/shared/contract/models";
import { action } from "@/server/errors";
import { updateRestaurantFeatures, updateRestaurantSettingsSection, updateRestaurantWhatsApp } from "@/server/services/restaurants";
import { SETTINGS_SECTION_SCHEMAS, updateFeaturesSchema, updateWhatsAppNumberSchema, type SettingsSection } from "@/server/validation/settings";
import { requirePermission } from "@/web/session";

export async function updateSettingsAction(
  section: "features" | SettingsSection,
  payload: unknown,
): Promise<ApiResult<Restaurant>> {
  return action(async () => {
    const actor = await requirePermission("settings.manage");
    const ctx = { restaurantId: actor.restaurantId, userId: actor.userId, actor: actor.name };

    if (section === "features") {
      const patch = updateFeaturesSchema.parse(payload);
      const restaurant = await updateRestaurantFeatures(actor.restaurantId, patch, ctx);
      revalidatePath(adminPath("/settings"));
      return restaurant;
    }

    const schema = SETTINGS_SECTION_SCHEMAS[section];
    const patch = schema.parse(payload);
    const restaurant = await updateRestaurantSettingsSection(actor.restaurantId, section, patch, ctx);
    revalidatePath(adminPath("/settings"));
    return restaurant;
  });
}

/** Settings → WhatsApp ordering: the restaurant's WhatsApp number (owner/admin; the platform sets the checkout mode). */
export async function updateWhatsAppNumberAction(payload: unknown): Promise<ApiResult<Restaurant>> {
  return action(async () => {
    const actor = await requirePermission("settings.manage");
    const ctx = { restaurantId: actor.restaurantId, userId: actor.userId, actor: actor.name };
    const { whatsapp } = updateWhatsAppNumberSchema.parse(payload);
    const restaurant = await updateRestaurantWhatsApp(actor.restaurantId, whatsapp, ctx);
    revalidatePath(adminPath("/settings"));
    return restaurant;
  });
}

