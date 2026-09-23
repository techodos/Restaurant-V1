import { ImageResponse } from "next/og";
import { requireStorefront } from "@/web/storefront";

/**
 * The Home Screen icon iOS uses once a customer adds the storefront to their Home Screen (Share →
 * Add to Home Screen). This is not cosmetic: iOS only delivers Web Push to a site running in
 * standalone mode (see push-opt-in.tsx), so a usable icon here is part of making push work on iOS,
 * not a design nicety. Generated per restaurant (brand colour + initial), so it works even for a
 * restaurant with no logo image, the same fallback the header uses.
 */

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default async function AppleIcon({ params }: { params: Promise<{ restaurantSlug: string }> }) {
  const { restaurantSlug } = await params;
  const { restaurant, theme } = await requireStorefront(restaurantSlug);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: theme.primary,
          fontSize: 96,
          fontWeight: 700,
          fontFamily: "sans-serif",
          color: theme.primaryForeground,
        }}
      >
        {restaurant.name.trim().slice(0, 1).toUpperCase() || "R"}
      </div>
    ),
    size,
  );
}
