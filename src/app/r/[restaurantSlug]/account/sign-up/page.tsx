import type { Metadata } from "next";
import { requireStorefront } from "@/web/storefront";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SignUpForm } from "@/components/storefront/sign-up-form";
import { googleAuthAvailable } from "@/server/services/customer-auth";

interface Props {
  params: Promise<{ restaurantSlug: string }>;
}

export const metadata: Metadata = { title: "Create account", robots: { index: false, follow: false } };

export default async function SignUpPage({ params }: Props) {
  const { restaurantSlug } = await params;
  await requireStorefront(restaurantSlug);

  return (
    <div className="container-page flex justify-center py-12 md:py-16">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-xl">Create your account</CardTitle>
        </CardHeader>
        <CardContent>
          <SignUpForm restaurantSlug={restaurantSlug} googleEnabled={googleAuthAvailable()} />
        </CardContent>
      </Card>
    </div>
  );
}
