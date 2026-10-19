import type { Metadata } from "next";
import { requireStorefront } from "@/web/storefront";
import { safeReturnTo } from "@/shared/return-to";
import { AuthShell } from "@/components/storefront/auth-shell";
import { SignInForm } from "@/components/storefront/sign-in-form";
import { googleAuthAvailable } from "@/server/services/customer-auth";
import { instanceRestaurantSlug } from "@/web/instance";

interface Props {
  /** where to go after signing in (only a path inside this storefront is honoured) */
  searchParams: Promise<{ returnTo?: string }>;
}

export const metadata: Metadata = { title: "Sign in", robots: { index: false, follow: false } };

export default async function SignInPage({ searchParams }: Props) {
  const restaurantSlug = instanceRestaurantSlug();
  const context = await requireStorefront(restaurantSlug);
  const returnTo = safeReturnTo((await searchParams).returnTo);
  const forCheckout = returnTo === `/checkout`;

  return (
    <AuthShell
      eyebrow={context.restaurant.name}
      title="Sign in"
      mobileTitle="Welcome back"
      description={
        forCheckout
          ? "Orders are placed from your account. Sign in and we will bring you straight back to checkout."
          : "Sign in to reorder your favourites and check out faster."
      }
      panelTitle={
        <>
          Welcome back
          <br />
          to the table.
        </>
      }
    >
      <SignInForm restaurantSlug={restaurantSlug} restaurantName={context.restaurant.name} googleEnabled={googleAuthAvailable()} returnTo={returnTo} />
    </AuthShell>
  );
}
