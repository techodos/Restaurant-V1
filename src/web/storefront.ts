import { cache } from "react";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import type { Restaurant, StorefrontContext } from "@/shared/contract/models";
import { decodeTray, trayCookieName, type InitialTray, type Tray } from "@/shared/tray";
import {
  DESTINATION_COOKIE_MAX_AGE,
  decodeDestination,
  destinationCookieName,
  encodeDestination,
  type BranchingState,
  type DeliveryDestination,
} from "@/shared/branching";
import { AppError } from "@/server/errors";
import { previewCoupon, viewTray, type TrayView } from "@/server/services/cart";
import { resolveBranching } from "@/server/services/branching";
import { loadStorefrontContext } from "@/server/services/storefront";
import { resolveImage } from "./media";

/**
 * Next.js glue for the storefront: request-scoped caching, `notFound()`, and the tray cookie.
 * The logic itself lives in server/services.
 */

/** Cached per request so layout, page and sections share one lookup. */
export const getStorefrontContext = cache(loadStorefrontContext);

/**
 * Renders a 404 only when the restaurant genuinely does not exist. Infrastructure
 * failures (database down) propagate to the error boundary instead of masquerading
 * as "not found".
 */
export async function requireStorefront(slug: string): Promise<StorefrontContext> {
  try {
    return await getStorefrontContext(slug);
  } catch (error) {
    if (error instanceof AppError && error.code === "NOT_FOUND") notFound();
    throw error;
  }
}

/**
 * The storefront's restaurant for a Server Action or Route Handler — from the in-memory snapshot, not a
 * database read. Enough to gate and route a request; anything that decides money or writes an order
 * re-reads the restaurant inside its own transaction (`createOrder`). Throws the app's NOT_FOUND
 * (not Next's `notFound()`, which only means something to a page render).
 */
export async function requireStorefrontRestaurant(slug: string): Promise<Restaurant> {
  return (await getStorefrontContext(slug)).restaurant;
}

// ─── tray (cart) cookie ───────────────────────────────────────────────────────

async function rawTrayCookie(slug: string): Promise<string | null> {
  const store = await cookies();
  return store.get(trayCookieName(slug))?.value ?? null;
}

/** The visitor's tray, straight from its cookie (no database). */
export const readTray = cache(async (context: StorefrontContext): Promise<Tray> => {
  return decodeTray(await rawTrayCookie(context.restaurant.slug), context.config.ordering.defaultOrderType);
});

/** The tray priced against the current in-memory menu (no database). Cached per request. */
export const readTrayView = cache(async (context: StorefrontContext): Promise<{ tray: Tray; view: TrayView }> => {
  const tray = await readTray(context);
  return { tray, view: await viewTray(context.restaurant, tray) };
});

/** What the layout hands the browser's tray provider on a full page load. */
export async function getInitialTray(context: StorefrontContext): Promise<InitialTray> {
  const encoded = (await rawTrayCookie(context.restaurant.slug)) ?? "";
  const { tray, view } = await readTrayView(context);
  const couponDiscount = tray.couponCode
    ? await previewCoupon(context.restaurant, tray.couponCode, tray.orderType, view.subtotal)
        .then((preview) => preview.discount)
        .catch(() => null)
    : null;
  return {
    encoded,
    tray,
    couponDiscount,
    displays: view.lines.map((line) => ({
      name: line.name,
      slug: line.slug,
      imageUrl: resolveImage(line.imageUrl),
      variantName: line.variantName,
      addonNames: line.addons.map((addon) => addon.name),
      unitPrice: line.unitPrice,
      addonsTotal: line.addonsTotal,
      problem: line.problem,
    })),
  };
}

/** Empties the tray once an order consumed it. Only valid in Server Actions and Route Handlers. */
export async function clearTray(slug: string): Promise<void> {
  const store = await cookies();
  store.delete(trayCookieName(slug));
}

// ─── multi-branch ordering (features.BranchingFeature) ─────────────────────────

/**
 * The branching state for this request: the remembered delivery destination (its own cookie) and the
 * branches that serve it, from the snapshot — no database. `null` when the restaurant has not switched
 * the feature on, so every caller's "feature off" path is one null check and the single-location flow
 * stays exactly as it was.
 */
export const getBranching = cache(async (context: StorefrontContext): Promise<BranchingState | null> => {
  if (!context.restaurant.features.BranchingFeature) return null;
  const store = await cookies();
  const destination = decodeDestination(store.get(destinationCookieName(context.restaurant.slug))?.value);
  return resolveBranching(context.restaurant.id, destination);
});

/** Remembers the delivery destination. Only valid in Server Actions and Route Handlers. */
export async function writeDestination(slug: string, destination: DeliveryDestination): Promise<void> {
  const store = await cookies();
  store.set(destinationCookieName(slug), encodeDestination(destination), {
    path: "/",
    maxAge: DESTINATION_COOKIE_MAX_AGE,
    sameSite: "lax",
  });
}
