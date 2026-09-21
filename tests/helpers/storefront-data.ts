import type { StorefrontData } from "@/server/repositories/storefront";
import type { StorefrontMenuRecord } from "@/server/repositories/menu";
import type {
  DeliveryZone,
  MenuCategory,
  MenuItem,
  MenuItemSummary,
  Restaurant,
  RestaurantLocation,
  Review,
  WebsitePage,
} from "@/shared/contract/models";
import { restaurantFeaturesSchema, restaurantSettingsSchema, websiteConfigSchema } from "@/shared/contract/settings";

/** Database-free fixtures for the storefront read model. */

export const RESTAURANT_ID = "00000000-0000-4000-8000-000000000001";

export function restaurant(overrides: Partial<Restaurant> = {}): Restaurant {
  return {
    id: RESTAURANT_ID,
    name: "Bella Napoli",
    slug: "bella-napoli",
    legalName: null,
    description: null,
    shortDescription: null,
    cuisines: ["Italian"],
    phone: null,
    whatsapp: null,
    email: null,
    websiteUrl: null,
    logoUrl: null,
    coverUrl: null,
    primaryColor: "#b91c1c",
    currency: "PKR",
    currencySymbol: "Rs",
    locale: "en",
    timezone: "Asia/Karachi",
    country: "PK",
    status: "active",
    plan: "standard",
    planStatus: "active",
    features: restaurantFeaturesSchema.parse({}),
    settings: restaurantSettingsSchema.parse({}),
    social: {},
    seo: {},
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

export function location(id: string, overrides: Partial<RestaurantLocation> = {}): RestaurantLocation {
  return {
    id,
    restaurantId: RESTAURANT_ID,
    name: `Location ${id}`,
    slug: `location-${id}`,
    isPrimary: false,
    isActive: true,
    addressLine1: null,
    addressLine2: null,
    area: null,
    city: null,
    state: null,
    postalCode: null,
    country: "PK",
    phone: null,
    email: null,
    latitude: null,
    longitude: null,
    hours: {},
    settings: {},
    sortOrder: 0,
    ...overrides,
  };
}

export function zone(id: string, locationId: string, overrides: Partial<DeliveryZone> = {}): DeliveryZone {
  return {
    id,
    restaurantId: RESTAURANT_ID,
    locationId,
    name: `Zone ${id}`,
    description: null,
    areas: [],
    postalCodes: [],
    deliveryFee: "150.00",
    minOrderAmount: "500.00",
    freeDeliveryOver: null,
    etaMinMinutes: 30,
    etaMaxMinutes: 45,
    isActive: true,
    sortOrder: 0,
    ...overrides,
  };
}

export function category(id: string, slug: string, overrides: Partial<MenuCategory> = {}): MenuCategory {
  return {
    id,
    restaurantId: RESTAURANT_ID,
    locationId: null,
    name: slug.toUpperCase(),
    slug,
    description: null,
    imageUrl: null,
    icon: null,
    sortOrder: 0,
    isActive: true,
    isFeatured: false,
    availability: {},
    itemCount: undefined,
    ...overrides,
  };
}

export function page(id: string, slug: string, overrides: Partial<WebsitePage> = {}): WebsitePage {
  return {
    id,
    websiteId: "site-1",
    restaurantId: RESTAURANT_ID,
    slug,
    title: slug,
    description: null,
    isHome: false,
    isPublished: true,
    sortOrder: 0,
    seo: {},
    sections: [],
    config: {},
    ...overrides,
  };
}

export function review(id: string, overrides: Partial<Review> = {}): Review {
  return {
    id,
    restaurantId: RESTAURANT_ID,
    customerId: null,
    orderId: null,
    menuItemId: null,
    itemName: null,
    authorName: "Guest",
    rating: 5,
    title: null,
    comment: "Great",
    status: "approved",
    isFeatured: false,
    response: null,
    respondedAt: null,
    createdAt: "2026-02-01T00:00:00.000Z",
    ...overrides,
  };
}

export interface ItemOptions {
  categoryId?: string;
  categorySlug?: string;
  categoryName?: string;
  price?: string;
  sortOrder?: number;
  featured?: boolean;
  available?: boolean;
  description?: string | null;
  dietaryTags?: string[];
  popularity?: number;
}

export function menuRecord(id: string, name: string, options: ItemOptions = {}): StorefrontMenuRecord {
  const price = options.price ?? "1000.00";
  const item: MenuItem = {
    id,
    restaurantId: RESTAURANT_ID,
    categoryId: options.categoryId ?? "cat-pizza",
    categoryName: options.categoryName ?? "PIZZA",
    categorySlug: options.categorySlug ?? "pizza",
    name,
    slug: name.toLowerCase().replace(/\s+/g, "-"),
    description: options.description ?? null,
    shortDescription: null,
    imageUrl: null,
    basePrice: price,
    compareAtPrice: null,
    calories: null,
    spiceLevel: 0,
    prepTimeMinutes: 15,
    isActive: true,
    isAvailable: options.available ?? true,
    isFeatured: options.featured ?? false,
    dietaryTags: options.dietaryTags ?? [],
    allergens: [],
    sortOrder: options.sortOrder ?? 0,
    availability: {},
    variants: [],
    addonGroups: [],
  };
  const summary: MenuItemSummary = {
    id,
    name,
    slug: item.slug,
    description: item.description,
    imageUrl: null,
    basePrice: price,
    compareAtPrice: null,
    isAvailable: item.isAvailable,
    isFeatured: item.isFeatured,
    hasVariants: false,
    hasAddons: false,
    requiresSelection: false,
    priceFrom: price,
    prepTimeMinutes: 15,
    dietaryTags: item.dietaryTags,
    spiceLevel: 0,
    categoryId: item.categoryId,
    categorySlug: item.categorySlug,
    categoryName: item.categoryName,
  };
  return { item, summary, popularity: options.popularity ?? 0 };
}

/** A small but complete storefront: 2 categories, 4 items, 2 locations, 2 zones, 2 pages, 3 reviews. */
export function storefrontData(overrides: Partial<StorefrontData> = {}): StorefrontData {
  const base = restaurant();
  return {
    restaurant: base,
    website: {
      id: "site-1",
      restaurantId: RESTAURANT_ID,
      name: "Bella Napoli",
      domain: null,
      subdomain: null,
      status: "published",
      isPrimary: true,
      theme: {} as never,
      config: websiteConfigSchema.parse({}),
      seo: {},
      publishedAt: null,
    },
    pages: [page("p-home", "home", { isHome: true }), page("p-about", "about")],
    locations: [
      location("loc-1", { isPrimary: true }),
      location("loc-2", { isActive: false }),
    ],
    deliveryZones: [zone("z-1", "loc-1"), zone("z-2", "loc-1", { isActive: false })],
    categories: [category("cat-pizza", "pizza"), category("cat-drinks", "drinks", { sortOrder: 1 })],
    menu: [
      menuRecord("i-margherita", "Margherita", { sortOrder: 1, price: "900.00", featured: true, popularity: 5, description: "Tomato and basil" }),
      menuRecord("i-diavola", "Diavola", { sortOrder: 2, price: "1200.00", popularity: 9, dietaryTags: ["spicy"] }),
      menuRecord("i-cola", "Cola", {
        categoryId: "cat-drinks",
        categorySlug: "drinks",
        categoryName: "DRINKS",
        sortOrder: 1,
        price: "200.00",
        popularity: 1,
      }),
      menuRecord("i-fanta", "Fanta", {
        categoryId: "cat-drinks",
        categorySlug: "drinks",
        categoryName: "DRINKS",
        sortOrder: 2,
        price: "180.00",
        available: false,
      }),
    ],
    reviews: {
      summary: { average: 4.5, count: 2, distribution: { 1: 0, 2: 0, 3: 0, 4: 1, 5: 1 } },
      recent: [review("r-1", { isFeatured: true }), review("r-2"), review("r-3")],
    },
    ...overrides,
  };
}
