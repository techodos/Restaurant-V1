import { cache } from "react";
import { notFound } from "next/navigation";
import { AppError } from "@/server/errors";
import { getRestaurantForPlatform } from "@/server/services/platform";
import type { Restaurant } from "@/shared/contract/models";
import { requireSuperAdminPage } from "./session";

/**
 * The restaurant a /super-admin/[slug] screen is about, for the signed-in super admin. React-cached so the shared
 * layout and the page below it make ONE read per request; an unknown slug is the 404 page.
 */
export const getPlatformRestaurant = cache(async (slug: string): Promise<Restaurant> => {
  const actor = await requireSuperAdminPage();
  try {
    return await getRestaurantForPlatform(actor, slug);
  } catch (error) {
    if (error instanceof AppError && error.code === "NOT_FOUND") notFound();
    throw error;
  }
});
