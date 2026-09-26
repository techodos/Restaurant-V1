import type { Metadata } from "next";
import { requireStorefront } from "@/web/storefront";
import { safeReturnTo } from "@/shared/return-to";
import { AuthShell } from "@/components/storefront/auth-shell";
import { SignUpForm } from "@/components/storefront/sign-up-form";
import { googleAuthAvailable } from "@/server/services/customer-auth";

interface Props {
  params: Promise<{ restaurantSlug: string }>;
  /** where to go afterwards (only a path inside this storefront is honoured) */
  searchParams: Promise<{ returnTo?: string }>;
}

export const metadata: Metadata = { title: "Create account", robots: { index: false, follow: false } };

export default async function SignUpPage({ params, searchParams }: Props) {
  const { restaurantSlug } = await params;
  const context = await requireStorefront(restaurantSlug);
  const returnTo = safeReturnTo(restaurantSlug, (await searchParams).returnTo);
  const forCheckout = returnTo === `/r/${restaurantSlug}/checkout`;

  return (
    <AuthShell context={context} title="Create your account" description={forCheckout ? "Orders are placed from a verified account. Create yours and we will bring you straight back to checkout." : "Save your details, follow your orders and reorder in a tap."}>
      <SignUpForm restaurantSlug={restaurantSlug} googleEnabled={googleAuthAvailable()} returnTo={returnTo} />
    </AuthShell>
  );
}
