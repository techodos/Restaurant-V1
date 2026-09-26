import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { safeReturnTo } from "@/shared/return-to";
import { requireStorefront } from "@/web/storefront";
import { AuthShell } from "@/components/storefront/auth-shell";
import { GooglePhoneForm } from "@/components/storefront/google-phone-form";

interface Props {
  params: Promise<{ restaurantSlug: string }>;
  searchParams: Promise<{ token?: string; returnTo?: string }>;
}

export const metadata: Metadata = { title: "Finish signing in", robots: { index: false, follow: false } };

export default async function GooglePhonePage({ params, searchParams }: Props) {
  const { restaurantSlug } = await params;
  const { token, returnTo } = await searchParams;
  const context = await requireStorefront(restaurantSlug);
  if (!token) redirect(`/r/${restaurantSlug}/account/sign-in`);

  return (
    <AuthShell context={context} title="One more step" description="We need a phone number to finish setting up your account.">
      <GooglePhoneForm
        restaurantSlug={restaurantSlug}
        pendingToken={token}
        returnTo={safeReturnTo(restaurantSlug, returnTo)}
      />
    </AuthShell>
  );
}
