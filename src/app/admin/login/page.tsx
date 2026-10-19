import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getAdminRestaurant } from "@/web/admin";
import { getCurrentStaff } from "@/web/session";
import { adminPath } from "@/shared/utils";
import { StaffAuthShell } from "@/components/storefront/auth-shell";
import { AdminLoginForm } from "@/components/admin/admin-login-form";
import { instanceRestaurantSlug } from "@/web/instance";

export const metadata: Metadata = { title: "Staff sign in" };

/** The restaurant's own staff sign-in, in its theme (from the admin layout): the customer sign-in's look, staff copy. */
export default async function AdminLoginPage() {
  const restaurantSlug = instanceRestaurantSlug();
  const restaurant = await getAdminRestaurant(restaurantSlug);
  // already signed in to this restaurant's admin -> straight to the dashboard
  if (await getCurrentStaff(restaurantSlug)) redirect(adminPath());

  return (
    <StaffAuthShell
      restaurantName={restaurant.name}
      back={
        <Link
          href="/"
          className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-[14px] text-[var(--color-muted-ink)] transition-colors hover:text-[var(--color-ink)] focus-visible:outline-2 focus-visible:outline-[var(--color-brand)]"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Back to {restaurant.name}
        </Link>
      }
    >
      <AdminLoginForm restaurantSlug={restaurant.slug} />
    </StaffAuthShell>
  );
}
