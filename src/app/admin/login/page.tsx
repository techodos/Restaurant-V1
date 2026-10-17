import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getAdminRestaurant } from "@/web/admin";
import { getCurrentStaff } from "@/web/session";
import { adminPath } from "@/shared/utils";
import { AuthShell } from "@/components/storefront/auth-shell";
import { AdminLoginForm } from "@/components/admin/admin-login-form";

export const metadata: Metadata = { title: "Staff sign in" };

interface AdminLoginPageProps {
  params: Promise<{ restaurantSlug: string }>;
}

/** The restaurant's own staff sign-in: its cover photo, name and theme (from the admin layout), like its customer sign-in. */
export default async function AdminLoginPage({ params }: AdminLoginPageProps) {
  const { restaurantSlug } = await params;
  const restaurant = await getAdminRestaurant(restaurantSlug);
  // already signed in to this restaurant's admin -> straight to the dashboard
  if (await getCurrentStaff(restaurantSlug)) redirect(adminPath(restaurantSlug));

  return (
    // no storefront header here: the shell fills the viewport. `grid` stretches AuthShell to the full height —
    // its own lg:min-h caps at 46rem for the storefront pages (header + footer around it), which left a blank strip here.
    <div className="grid min-h-dvh [--header-h:0px]">
      <AuthShell
        restaurant={restaurant}
        title="Staff sign in"
        description={`Sign in with your ${restaurant.name} staff account to manage orders, the menu and the restaurant.`}
      >
        <AdminLoginForm restaurantSlug={restaurant.slug} />
        <Link
          href={`/r/${restaurant.slug}`}
          className="mt-6 inline-flex items-center gap-1.5 text-sm text-[var(--color-muted-ink)] transition-colors hover:text-[var(--color-ink)]"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Back to {restaurant.name}
        </Link>
      </AuthShell>
    </div>
  );
}
