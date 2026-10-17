import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AppError } from "@/server/errors";
import { getAdminRestaurant, getAdminTheme } from "@/web/admin";
import { resolveImage } from "@/web/media";
import { fontStack, themeCssVariables } from "@/web/theme";
import { instanceRestaurantSlug } from "@/web/instance";

/**
 * Every page below renders per request. They used to be dynamic implicitly (the /r/[restaurantSlug] segment); at the
 * root they would otherwise be prerendered at build time, which reads the database during `next build` and freezes
 * the restaurant's menu, hours and theme into the build.
 */
export const dynamic = "force-dynamic";

interface AdminLayoutProps {
  children: React.ReactNode;
}

/** Unknown slug -> the (restaurant-themed) 404, instead of an error page. */
async function loadAdmin(restaurantSlug: string) {
  try {
    const [restaurant, theme] = await Promise.all([getAdminRestaurant(restaurantSlug), getAdminTheme(restaurantSlug)]);
    return { restaurant, theme };
  } catch (error) {
    if (error instanceof AppError && error.code === "NOT_FOUND") notFound();
    throw error;
  }
}

export async function generateMetadata(): Promise<Metadata> {
  const restaurantSlug = instanceRestaurantSlug();
  try {
    const restaurant = await getAdminRestaurant(restaurantSlug);
    const logo = resolveImage(restaurant.logoUrl);
    return {
      title: { default: `Admin · ${restaurant.name}`, template: `%s · ${restaurant.name} Admin` },
      robots: { index: false, follow: false },
      ...(logo ? { icons: { icon: logo } } : {}),
    };
  } catch {
    return { title: "Admin" };
  }
}

/**
 * Every restaurant's admin (login included) wears that restaurant's own brand theme, resolved from the database
 * like the storefront's, minus the "is the site public" gate.
 */
export default async function AdminLayout({ children }: AdminLayoutProps) {
  const restaurantSlug = instanceRestaurantSlug();
  const { restaurant, theme } = await loadAdmin(restaurantSlug);

  return (
    <div
      data-restaurant={restaurant.slug}
      className="theme-root min-h-dvh bg-[var(--color-canvas)] text-[var(--color-ink)]"
      style={
        {
          ...themeCssVariables(theme),
          "--font-heading": fontStack(theme.font, "serif"),
          "--font-body": fontStack(theme.bodyFont, "sans"),
          // a working tool: headings use the body sans, not the storefront display face
          "--font-display": fontStack(theme.bodyFont, "sans"),
        } as React.CSSProperties
      }
    >
      {children}
    </div>
  );
}
