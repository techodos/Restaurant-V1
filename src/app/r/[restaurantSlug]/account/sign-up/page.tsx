import type { Metadata } from "next";
import { requireStorefront } from "@/web/storefront";
import { AuthShell } from "@/components/storefront/auth-shell";
import { SignUpForm } from "@/components/storefront/sign-up-form";
import { googleAuthAvailable } from "@/server/services/customer-auth";

interface Props {
  params: Promise<{ restaurantSlug: string }>;
}

export const metadata: Metadata = { title: "Create account", robots: { index: false, follow: false } };

export default async function SignUpPage({ params }: Props) {
  const { restaurantSlug } = await params;
  const context = await requireStorefront(restaurantSlug);

  return (
    <AuthShell context={context} title="Create your account" description="Save your details, follow your orders and reorder in a tap.">
      <SignUpForm restaurantSlug={restaurantSlug} googleEnabled={googleAuthAvailable()} />
    </AuthShell>
  );
}
