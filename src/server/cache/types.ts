import type {
  DeliveryZone,
  MenuCategory,
  MenuItem,
  MenuItemSummary,
  RatingBreakdown,
  RestaurantLocation,
  Review,
  StorefrontContext,
  WebsitePage,
} from "@/shared/contract/models";

/**
 * The in-memory storefront read model. One application instance serves exactly
 * one restaurant from one database, so there is exactly one snapshot — no
 * per-restaurant map, no tenant-aware keys.
 *
 * Contents are domain/contract models (never database rows), deep-frozen when the
 * snapshot is built, and replaced wholesale on refresh: readers holding an old
 * snapshot keep a consistent view until they drop it.
 *
 * Only public, read-mostly data lives here. Carts, orders, payments,
 * reservations, customers, sessions and coupons stay in PostgreSQL.
 */

/** A menu item in both shapes the storefront renders. */
export interface StorefrontMenuEntry {
  /** full item (variants + add-on groups) for the item page; never carries cost price */
  readonly item: MenuItem;
  /** card projection for lists, computed by the same SQL the database path uses */
  readonly summary: MenuItemSummary;
  readonly popularity: number;
}

export interface StorefrontSnapshot {
  readonly loadedAt: string;
  readonly loadDurationMs: number;

  /** restaurant, website, theme, config and active locations, as `requireStorefront` returns them */
  readonly context: StorefrontContext;
  /** every location, active or not, in display order */
  readonly locations: readonly RestaurantLocation[];
  readonly deliveryZones: readonly DeliveryZone[];

  /** published pages, home page first */
  readonly pages: readonly WebsitePage[];
  readonly homePage: WebsitePage | null;

  /** active categories in display order, without item counts */
  readonly categories: readonly MenuCategory[];
  /** the same categories with `itemCount` = active items in the category */
  readonly categoriesWithCounts: readonly MenuCategory[];
  /** active items in menu order (category order, then item order, then name) */
  readonly menu: readonly StorefrontMenuEntry[];

  readonly reviews: {
    readonly summary: RatingBreakdown;
    /** approved reviews, featured first then newest, capped at the storefront limit */
    readonly recent: readonly Review[];
  };

  /** lookups the storefront performs on every request */
  readonly index: {
    readonly itemsBySlug: ReadonlyMap<string, StorefrontMenuEntry>;
    readonly categoriesBySlug: ReadonlyMap<string, MenuCategory>;
  };
}

/** Storefront menu search. Admin-only options (inactive items) are deliberately absent. */
export interface MenuSearchFilters {
  categoryId?: string;
  categorySlug?: string;
  search?: string;
  featuredOnly?: boolean;
  availableOnly?: boolean;
  ids?: string[];
  slugs?: string[];
  excludeIds?: string[];
  dietaryTags?: string[];
  limit?: number;
  offset?: number;
  orderBy?: "menu" | "price_asc" | "price_desc" | "name" | "popularity";
}

export type SnapshotLoader = () => Promise<StorefrontSnapshot>;

/** Counts logged with every load. */
export interface SnapshotStats {
  items: number;
  categories: number;
  locations: number;
  deliveryZones: number;
  pages: number;
  reviews: number;
}
