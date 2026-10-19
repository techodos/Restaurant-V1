import type { Metadata } from "next";
import { isSupportedCountry } from "libphonenumber-js";
import { requireStorefront } from "@/web/storefront";
import { safeReturnTo } from "@/shared/return-to";
import { AuthShell } from "@/components/storefront/auth-shell";
import { SignUpForm } from "@/components/storefront/sign-up-form";
import { googleAuthAvailable } from "@/server/services/customer-auth";
import { instanceRestaurantSlug } from "@/web/instance";

interface Props {
  /** where to go afterwards (only a path inside this storefront is honoured) */
  searchParams: Promise<{ returnTo?: string }>;
}

export const metadata: Metadata = { title: "Create account", robots: { index: false, follow: false } };

export default async function SignUpPage({ searchParams }: Props) {
  const restaurantSlug = instanceRestaurantSlug();
  const context = await requireStorefront(restaurantSlug);
  const returnTo = safeReturnTo((await searchParams).returnTo);
  const forCheckout = returnTo === `/checkout`;
  const country = context.restaurant.country;

  return (
    <AuthShell
      eyebrow={context.restaurant.name}
      title="Create your account"
      mobileTitle="Join us"
      description={
        forCheckout
          ? "Orders are placed from a verified account. Create yours and we will bring you straight back to checkout."
          : "Save your details, follow your orders and reorder in a tap."
      }
      panelTitle={
        <>
          A seat saved
          <br />
          at our table.
        </>
      }
    >
      <SignUpForm
        restaurantSlug={restaurantSlug}
        googleEnabled={googleAuthAvailable()}
        returnTo={returnTo}
        defaultCountry={isSupportedCountry(country) ? country : "PK"}
      />
    </AuthShell>
  );
}
