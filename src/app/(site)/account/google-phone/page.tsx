import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { safeReturnTo } from "@/shared/return-to";
import { requireStorefront } from "@/web/storefront";
import { AuthShell } from "@/components/storefront/auth-shell";
import { GooglePhoneForm } from "@/components/storefront/google-phone-form";
import { instanceRestaurantSlug } from "@/web/instance";

interface Props {
  searchParams: Promise<{ token?: string; returnTo?: string }>;
}

export const metadata: Metadata = { title: "Finish signing in", robots: { index: false, follow: false } };

export default async function GooglePhonePage({ searchParams }: Props) {
  const restaurantSlug = instanceRestaurantSlug();
  const { token, returnTo } = await searchParams;
  const context = await requireStorefront(restaurantSlug);
  if (!token) redirect(`/account/sign-in`);

  return (
    <AuthShell restaurant={context.restaurant} title="One more step" description="We need a phone number to finish setting up your account.">
      <GooglePhoneForm
        restaurantSlug={restaurantSlug}
        pendingToken={token}
        returnTo={safeReturnTo(returnTo)}
      />
    </AuthShell>
  );
}
