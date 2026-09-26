import type { Metadata } from "next";
import { requireStorefront } from "@/web/storefront";
import { safeReturnTo } from "@/shared/return-to";
import { AuthShell } from "@/components/storefront/auth-shell";
import { SignInForm } from "@/components/storefront/sign-in-form";
import { googleAuthAvailable } from "@/server/services/customer-auth";

interface Props {
  params: Promise<{ restaurantSlug: string }>;
  /** where to go afterwards (only a path inside this storefront is honoured) */
  searchParams: Promise<{ returnTo?: string }>;
}

export const metadata: Metadata = { title: "Sign in", robots: { index: false, follow: false } };

export default async function SignInPage({ params, searchParams }: Props) {
  const { restaurantSlug } = await params;
  const context = await requireStorefront(restaurantSlug);
  const returnTo = safeReturnTo(restaurantSlug, (await searchParams).returnTo);
  const forCheckout = returnTo === `/r/${restaurantSlug}/checkout`;

  return (
    <AuthShell context={context} title="Sign in" description={forCheckout ? "Orders are placed from your account. Sign in and we will bring you straight back to checkout." : "Welcome back. Sign in to see your orders and check out faster."}>
      <SignInForm restaurantSlug={restaurantSlug} googleEnabled={googleAuthAvailable()} returnTo={returnTo} />
    </AuthShell>
  );
}
