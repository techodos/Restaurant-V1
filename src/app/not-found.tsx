import Link from "next/link";
import { headers } from "next/headers";
import { PATHNAME_HEADER } from "@/middleware";
import { getAdminRestaurant, getAdminTheme } from "@/web/admin";
import { fontStack, themeCssVariables } from "@/web/theme";
import { themeSchema, type RestaurantTheme } from "@/shared/contract/settings";
import type { Restaurant } from "@/shared/contract/models";

/** Platform look for a 404 that belongs to no restaurant (the schema defaults are one restaurant's red). */
const NEUTRAL_THEME: RestaurantTheme = themeSchema.parse({
  primary: "#1F2933",
  secondary: "#111827",
  accent: "#6B7280",
  background: "#FFFFFF",
  border: "#E5E7EB",
  font: "Inter",
});

/** The restaurant named by the URL (/r/<slug>/...), if it exists; its theme comes from the database. */
async function restaurantForRequest(): Promise<{ restaurant: Restaurant; theme: RestaurantTheme } | null> {
  const pathname = (await headers()).get(PATHNAME_HEADER) ?? "";
  const slug = /^\/r\/([^/]+)/.exec(pathname)?.[1];
  if (!slug) return null;
  try {
    const decoded = decodeURIComponent(slug);
    const [restaurant, theme] = await Promise.all([getAdminRestaurant(decoded), getAdminTheme(decoded)]);
    return { restaurant, theme };
  } catch {
    return null;
  }
}

/**
 * Every 404 under /r/<slug>/... wears that restaurant's theme and leads back to its site (unknown page, dish, order,
 * or a restaurant this instance does not serve); anything else gets a neutral platform page.
 */
export default async function NotFound() {
  const match = await restaurantForRequest();
  const theme = match?.theme ?? NEUTRAL_THEME;
  const home = match ? `/r/${match.restaurant.slug}` : "/";

  return (
    <div
      className="theme-root flex min-h-dvh bg-[var(--color-canvas)] text-[var(--color-ink)]"
      style={
        {
          ...themeCssVariables(theme),
          "--font-heading": fontStack(theme.font, "serif"),
          "--font-body": fontStack(theme.bodyFont, "sans"),
        } as React.CSSProperties
      }
    >
      <main className="container-page flex flex-1 flex-col items-center justify-center gap-4 py-16 text-center">
        {match ? <p className="eyebrow text-[var(--color-brand)]">{match.restaurant.name}</p> : null}
        <p className="tabular font-[family-name:var(--font-display)] text-7xl leading-none text-[var(--color-brand-accent)]">404</p>
        <h1 className="display-2">We could not find that page</h1>
        <p className="max-w-md text-[var(--color-muted-ink)]">
          {match
            ? "The link may be out of date, or the page has moved. Everything else is right where you left it."
            : "The link may be out of date, or the restaurant you are looking for is no longer on the platform."}
        </p>
        <div className="mt-2 flex flex-wrap justify-center gap-3">
          <Link
            href={home}
            className="inline-flex h-11 items-center rounded-[var(--radius-brand)] bg-[var(--color-brand)] px-5 text-sm font-medium text-[var(--color-brand-foreground)] transition-opacity hover:opacity-90"
          >
            {match ? `Back to ${match.restaurant.name}` : "Back to the restaurant"}
          </Link>
          {match ? (
            <Link
              href={`${home}/menu`}
              className="inline-flex h-11 items-center rounded-[var(--radius-brand)] border border-[var(--color-hairline)] px-5 text-sm font-medium transition-colors hover:bg-[var(--color-canvas-muted)]"
            >
              See the menu
            </Link>
          ) : null}
        </div>
      </main>
    </div>
  );
}
