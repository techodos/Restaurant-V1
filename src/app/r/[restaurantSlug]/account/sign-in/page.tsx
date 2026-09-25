import type { Metadata } from "next";
import { requireStorefront } from "@/web/storefront";
import { AuthShell } from "@/components/storefront/auth-shell";
import { SignInForm } from "@/components/storefront/sign-in-form";
import { googleAuthAvailable } from "@/server/services/customer-auth";

interface Props {
  params: Promise<{ restaurantSlug: string }>;
}

export const metadata: Metadata = { title: "Sign in", robots: { index: false, follow: false } };

export default async function SignInPage({ params }: Props) {
  const { restaurantSlug } = await params;
  const context = await requireStorefront(restaurantSlug);

  return (
    <AuthShell context={context} title="Sign in" description="Welcome back. Sign in to see your orders and check out faster.">
      <SignInForm restaurantSlug={restaurantSlug} googleEnabled={googleAuthAvailable()} />
    </AuthShell>
  );
}
