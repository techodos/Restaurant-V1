import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AppError } from "@/server/errors";
import { getAdminRestaurant, getAdminTheme } from "@/web/admin";
import { resolveImage } from "@/web/media";
import { fontStack, themeCssVariables } from "@/web/theme";

interface AdminLayoutProps {
  children: React.ReactNode;
  params: Promise<{ restaurantSlug: string }>;
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

export async function generateMetadata({ params }: AdminLayoutProps): Promise<Metadata> {
  const { restaurantSlug } = await params;
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
export default async function AdminLayout({ children, params }: AdminLayoutProps) {
  const { restaurantSlug } = await params;
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
