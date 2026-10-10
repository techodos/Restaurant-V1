import type { StorefrontContext } from "@/shared/contract/models";
import { enabledOrderTypes } from "@/shared/ordering";
import { getStorefrontCustomer } from "@/web/session";
import { signInHref } from "@/shared/return-to";
import { resolveImage } from "@/web/media";
import { branchClosedLabel } from "@/server/services/cart";
import { LocalCartPanel } from "./local-cart-panel";

/**
 * The tray, shared by the full /cart page and the tray drawer (@modal/(.)cart). Only server-known,
 * per-request data is resolved here (sign-in state, restaurant display info); the cart's own contents
 * live in the browser (see `local-cart.tsx`) and are rendered by the client `LocalCartPanel`.
 */
export async function CartView({ context, variant }: { context: StorefrontContext; variant: "page" | "drawer" }) {
  const { restaurant } = context;
  const customer = await getStorefrontCustomer(restaurant.id).catch(() => null);
  // which branches are closed right now (the cart's own branch decides; without one, the primary branch)
  const active = context.locations.filter((location) => location.isActive);
  const closedBranches = Object.fromEntries(
    active.flatMap((location) => {
      const label = branchClosedLabel(restaurant, location, active.length > 1);
      return label ? [[location.id, label]] : [];
    }),
  );

  return (
    <LocalCartPanel
      variant={variant}
      restaurantSlug={restaurant.slug}
      restaurantName={restaurant.name}
      coverUrl={resolveImage(restaurant.coverUrl)}
      currencySymbol={restaurant.currencySymbol}
      locale={restaurant.locale}
      featureCoupons={restaurant.features.coupons}
      featureReservations={restaurant.features.reservations}
      minimumOrderAmount={restaurant.settings.ordering.minimumOrderAmount.toFixed(2)}
      availableOrderTypes={enabledOrderTypes(restaurant.features)}
      isSignedIn={Boolean(customer)}
      signInHref={signInHref(restaurant.slug, `/r/${restaurant.slug}/checkout`)}
      closedBranches={closedBranches}
      primaryLocationId={context.primaryLocation?.id ?? null}
    />
  );
}
