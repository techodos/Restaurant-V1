import Link from "next/link";
import { getAdminRestaurant, getAdminTheme } from "@/web/admin";
import { instanceRestaurantSlug } from "@/web/instance";
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

/** This deployment's restaurant and its theme (from the database); null when it cannot be read (then a neutral page). */
async function instanceRestaurant(): Promise<{ restaurant: Restaurant; theme: RestaurantTheme } | null> {
  try {
    const slug = instanceRestaurantSlug();
    const [restaurant, theme] = await Promise.all([getAdminRestaurant(slug), getAdminTheme(slug)]);
    return { restaurant, theme };
  } catch {
    return null;
  }
}

/**
 * Every 404 (an unknown page, dish or order) wears the restaurant's theme and leads back to its site; if the restaurant
 * itself cannot be read, a neutral platform page.
 */
export default async function NotFound() {
  const match = await instanceRestaurant();
  const theme = match?.theme ?? NEUTRAL_THEME;

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
            href="/"
            className="inline-flex h-11 items-center rounded-[var(--radius-brand)] bg-[var(--color-brand)] px-5 text-sm font-medium text-[var(--color-brand-foreground)] transition-opacity hover:opacity-90"
          >
            {match ? `Back to ${match.restaurant.name}` : "Back to the restaurant"}
          </Link>
          {match ? (
            <Link
              href="/menu"
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
