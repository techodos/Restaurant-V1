import type { MenuItem, Restaurant, RestaurantLocation, Review } from "./contract/models";

/**
 * Structured data for the storefront. Kept in one place so every page emits the
 * same, valid schema.org payload and the shapes stay testable.
 */

const DAY_MAP: Record<string, string> = {
  mon: "Monday",
  tue: "Tuesday",
  wed: "Wednesday",
  thu: "Thursday",
  fri: "Friday",
  sat: "Saturday",
  sun: "Sunday",
};

function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

export function restaurantJsonLd(
  restaurant: Restaurant,
  location: RestaurantLocation | null,
  reviewSummary?: { average: number; count: number },
): Record<string, unknown> {
  const address = location
    ? {
        "@type": "PostalAddress",
        streetAddress: [location.addressLine1, location.addressLine2].filter(Boolean).join(", "),
        addressLocality: location.city ?? restaurant.country,
        addressRegion: location.state ?? undefined,
        postalCode: location.postalCode ?? undefined,
        addressCountry: location.country,
      }
    : undefined;

  const openingHours = location
    ? Object.entries(location.hours).flatMap(([day, windows]) =>
        (windows ?? []).map((window) => ({
          "@type": "OpeningHoursSpecification",
          dayOfWeek: `https://schema.org/${DAY_MAP[day] ?? day}`,
          opens: window.open,
          closes: window.close,
        })),
      )
    : [];

  return {
    "@context": "https://schema.org",
    "@type": "Restaurant",
    name: restaurant.name,
    description: restaurant.shortDescription ?? restaurant.description ?? undefined,
    url: `${siteUrl()}/r/${restaurant.slug}`,
    image: restaurant.coverUrl ? `${siteUrl()}${restaurant.coverUrl}` : undefined,
    servesCuisine: restaurant.cuisines.length ? restaurant.cuisines : undefined,
    priceRange: "$$",
    telephone: location?.phone ?? restaurant.phone ?? undefined,
    email: restaurant.email ?? undefined,
    address,
    geo: location?.latitude && location.longitude
      ? { "@type": "GeoCoordinates", latitude: location.latitude, longitude: location.longitude }
      : undefined,
    openingHoursSpecification: openingHours.length ? openingHours : undefined,
    acceptsReservations: restaurant.features.reservations ? "True" : "False",
    ...(reviewSummary && reviewSummary.count > 0
      ? {
          aggregateRating: {
            "@type": "AggregateRating",
            ratingValue: reviewSummary.average.toFixed(1),
            reviewCount: reviewSummary.count,
            bestRating: 5,
            worstRating: 1,
          },
        }
      : {}),
  };
}

export function menuItemJsonLd(item: MenuItem, restaurant: Restaurant): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "MenuItem",
    name: item.name,
    description: item.description ?? undefined,
    image: item.imageUrl ? `${siteUrl()}${item.imageUrl}` : undefined,
    url: `${siteUrl()}/r/${restaurant.slug}/menu/${item.slug}`,
    offers: {
      "@type": "Offer",
      price: item.basePrice,
      priceCurrency: restaurant.currency,
      availability: item.isAvailable ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
    },
    ...(item.calories ? { nutrition: { "@type": "NutritionInformation", calories: `${item.calories} kcal` } } : {}),
  };
}

export function reviewsJsonLd(reviews: Review[], restaurant: Restaurant): Record<string, unknown> | null {
  if (!reviews.length) return null;
  return {
    "@context": "https://schema.org",
    "@type": "Restaurant",
    name: restaurant.name,
    url: `${siteUrl()}/r/${restaurant.slug}/reviews`,
    review: reviews.slice(0, 10).map((review) => ({
      "@type": "Review",
      author: { "@type": "Person", name: review.authorName },
      datePublished: review.createdAt,
      reviewBody: review.comment ?? undefined,
      name: review.title ?? undefined,
      reviewRating: { "@type": "Rating", ratingValue: review.rating, bestRating: 5, worstRating: 1 },
    })),
  };
}

export function breadcrumbJsonLd(trail: { name: string; path: string }[]): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: trail.map((entry, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: entry.name,
      item: `${siteUrl()}${entry.path}`,
    })),
  };
}
