import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CheckCircle2, CircleAlert } from "lucide-react";
import { requireStorefront } from "@/web/storefront";
import { getStorefrontCustomer } from "@/web/session";
import { getCustomerUser as getUserById, isEmailVerified } from "@/server/services/customer-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SignOutButton } from "@/components/storefront/sign-out-button";
import { VerifyEmailForm } from "@/components/storefront/verify-email-form";

interface Props {
  params: Promise<{ restaurantSlug: string }>;
}

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Your account", robots: { index: false, follow: false } };

export default async function AccountPage({ params }: Props) {
  const { restaurantSlug } = await params;
  const { restaurant } = await requireStorefront(restaurantSlug);
  const customer = await getStorefrontCustomer(restaurant.id);
  if (!customer) redirect(`/r/${restaurantSlug}/account/sign-in`);

  const user = await getUserById(customer.userId);
  const verified = await isEmailVerified(customer.userId);

  return (
    <div className="container-page flex justify-center py-12 md:py-16">
      <div className="w-full max-w-md space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Hi, {customer.name}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-[var(--color-muted-ink)]">{user?.email}</p>
            <div className="flex items-center gap-2 text-sm">
              {verified ? (
                <>
                  <CheckCircle2 className="size-4 text-[var(--color-success)]" aria-hidden />
                  Email verified
                </>
              ) : (
                <>
                  <CircleAlert className="size-4 text-[var(--color-warning)]" aria-hidden />
                  Email not verified — you will need to verify it before placing an order.
                </>
              )}
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button asChild variant="outline" className="flex-1">
                <Link href={`/r/${restaurantSlug}/orders`}>My orders</Link>
              </Button>
              <SignOutButton restaurantSlug={restaurantSlug} />
            </div>
          </CardContent>
        </Card>

        {!verified ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Verify your email</CardTitle>
            </CardHeader>
            <CardContent>
              <VerifyEmailForm restaurantSlug={restaurantSlug} />
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
