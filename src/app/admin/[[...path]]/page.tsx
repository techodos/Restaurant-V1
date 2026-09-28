import { redirect } from "next/navigation";
import { config } from "@/server/config";
import { adminPath } from "@/shared/utils";

/**
 * The admin moved to /r/<slug>/admin (one admin per restaurant). Old /admin links and bookmarks land on the
 * instance's default restaurant's admin, same sub-page.
 */
export default async function LegacyAdminRedirect({ params }: { params: Promise<{ path?: string[] }> }) {
  const { path = [] } = await params;
  const sub = path.map(encodeURIComponent).join("/");
  redirect(adminPath(config.app.defaultRestaurantSlug, sub ? `/${sub}` : ""));
}
