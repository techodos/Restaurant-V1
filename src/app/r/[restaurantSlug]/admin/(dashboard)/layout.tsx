import { requireStaffForAdmin } from "@/web/session";
import { getAdminRestaurant } from "@/web/admin";
import { AdminHeader } from "@/components/admin/admin-header";
import { AdminMobileNav, AdminSidebar } from "@/components/admin/admin-sidebar";

interface AdminDashboardLayoutProps {
  children: React.ReactNode;
  params: Promise<{ restaurantSlug: string }>;
}

/** Signed-in shell. The brand theme is applied by the parent admin layout (shared with the login page). */
export default async function AdminDashboardLayout({ children, params }: AdminDashboardLayoutProps) {
  const { restaurantSlug } = await params;
  const actor = await requireStaffForAdmin(restaurantSlug);
  const restaurant = await getAdminRestaurant(restaurantSlug);
  const nav = { permissions: actor.permissions, restaurantName: restaurant.name, restaurantSlug: restaurant.slug };

  return (
    <div className="flex min-h-dvh">
      <AdminSidebar {...nav} />
      <div className="flex min-w-0 flex-1 flex-col">
        <AdminHeader
          name={actor.name}
          role={actor.role}
          restaurantName={restaurant.name}
          restaurantSlug={restaurant.slug}
          mobileNav={<AdminMobileNav key="mobile-nav" {...nav} />}
        />
        <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-6 sm:px-6 lg:px-10 lg:py-8">{children}</main>
      </div>
    </div>
  );
}
