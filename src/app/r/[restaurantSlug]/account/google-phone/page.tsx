import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireStorefront } from "@/web/storefront";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { GooglePhoneForm } from "@/components/storefront/google-phone-form";

interface Props {
  params: Promise<{ restaurantSlug: string }>;
  searchParams: Promise<{ token?: string; returnTo?: string }>;
}

export const metadata: Metadata = { title: "Finish signing in", robots: { index: false, follow: false } };

/** Only ever return into this restaurant's own storefront — never an absolute or cross-tenant URL. */
function sanitizeReturnTo(slug: string, returnTo: string | undefined): string | null {
  if (!returnTo) return null;
  if (returnTo.startsWith("//") || returnTo.includes("://")) return null;
  if (returnTo !== `/r/${slug}` && !returnTo.startsWith(`/r/${slug}/`)) return null;
  if (/^\/r\/[^/]+\/account\/(sign-in|sign-up|google-phone)\/?$/.test(returnTo)) return null;
  return returnTo;
}

export default async function GooglePhonePage({ params, searchParams }: Props) {
  const { restaurantSlug } = await params;
  const { token, returnTo } = await searchParams;
  await requireStorefront(restaurantSlug);
  if (!token) redirect(`/r/${restaurantSlug}/account/sign-in`);

  return (
    <div className="container-page flex justify-center py-12 md:py-16">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-xl">One more step</CardTitle>
          <CardDescription>We need a phone number to finish setting up your account.</CardDescription>
        </CardHeader>
        <CardContent>
          <GooglePhoneForm
            restaurantSlug={restaurantSlug}
            pendingToken={token}
            returnTo={sanitizeReturnTo(restaurantSlug, returnTo)}
          />
        </CardContent>
      </Card>
    </div>
  );
}
