import { ImageResponse } from "next/og";
import { requireStorefront } from "@/web/storefront";

/**
 * The Home Screen icon iOS uses once a customer adds the storefront to their Home Screen (Share →
 * Add to Home Screen). This is not cosmetic: iOS only delivers Web Push to a site running in
 * standalone mode (see push-opt-in.tsx), so a usable icon here is part of making push work on iOS,
 * not a design nicety. Generated per restaurant (brand colour + initial), so it works even for a
 * restaurant with no logo image, the same fallback the header uses.
 *
 * A plain route handler at a fixed path, not Next's `apple-icon.tsx` file convention: that convention
 * appends a content hash to the served URL (e.g. `/apple-icon-1sjdum`), but `layout.tsx#generateMetadata`
 * needs to link a stable, predictable URL — same reasoning as `manifest.webmanifest/route.ts`.
 */

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ restaurantSlug: string }> }): Promise<Response> {
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
    { width: 180, height: 180 },
  );
}
