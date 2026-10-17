import { Suspense } from "react";
import { requireStaffForAdmin } from "@/web/session";
import { getAdminBranchScope, getAdminRestaurant } from "@/web/admin";
import { BranchLabel, BranchSwitcher } from "@/components/admin/branch-switcher";
import { hasAnyPermission } from "@/server/auth/permissions";
import { getOrderStatusCounts } from "@/server/services/orders";
import { entitlementForPermission, isEntitled } from "@/shared/feature-access";
import { AdminHeader } from "@/components/admin/admin-header";
import { AdminMobileNav, AdminSidebar } from "@/components/admin/admin-sidebar";
import { OrderActivityBanner, OrderActivityWatcher } from "@/components/admin/order-sound-notifications";
import { NavigationProgress } from "@/components/admin/navigation-progress";

interface AdminDashboardLayoutProps {
  children: React.ReactNode;
  params: Promise<{ restaurantSlug: string }>;
}

/** Signed-in shell. The brand theme is applied by the parent admin layout (shared with the login page). */
export default async function AdminDashboardLayout({ children, params }: AdminDashboardLayoutProps) {
  const { restaurantSlug } = await params;
  const actor = await requireStaffForAdmin(restaurantSlug);
  const [restaurant, scope] = await Promise.all([getAdminRestaurant(restaurantSlug), getAdminBranchScope(restaurantSlug)]);
  // owner/admin with 2+ branches choose here (the admin's one branch control); branch staff only see theirs
  const branch =
    scope.choices.length > 1 ? (
      <BranchSwitcher
        restaurantSlug={restaurant.slug}
        branches={scope.choices.map(({ id, name, isPrimary }) => ({ id, name, isPrimary }))}
        value={scope.locationId ?? "all"}
      />
    ) : scope.locked && scope.current ? (
      <BranchLabel name={scope.current.name} />
    ) : null;
  // screens the platform has switched off for this restaurant leave the sidebar (a super admin still sees them all)
  const navPermissions =
    actor.role === "super_admin"
      ? actor.permissions
      : actor.permissions.filter((permission) => isEntitled(restaurant.entitlements, entitlementForPermission(permission)));
  const canOrders = hasAnyPermission(actor.permissions, ["orders.view"]);
  // orders on the pass in the branch in scope, for the sidebar's Orders count (one statement; the dashboard's own)
  const counts = canOrders
    ? await getOrderStatusCounts(actor.restaurantId, { restaurantId: actor.restaurantId, userId: actor.userId, actor: actor.name }, scope.locationId)
    : null;
  const activeOrders = counts ? counts.pending + counts.confirmed + counts.preparing + counts.ready + counts.out_for_delivery : 0;
  const nav = {
    permissions: navPermissions,
    restaurantName: restaurant.name,
    restaurantSlug: restaurant.slug,
    user: { name: actor.name, email: actor.email, role: actor.role },
    activeOrders,
  };

  return (
    <div className="flex min-h-dvh">
      <Suspense fallback={null}>
        <NavigationProgress />
      </Suspense>
      {canOrders ? <OrderActivityWatcher restaurantSlug={restaurant.slug} /> : null}
      <AdminSidebar {...nav} />
      <div className="flex min-w-0 flex-1 flex-col">
        <AdminHeader
          restaurantSlug={restaurant.slug}
          mobileNav={<AdminMobileNav key="mobile-nav" {...nav} />}
          branch={branch}
          showSoundToggle={canOrders}
        />
        <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-6 sm:px-6 lg:px-10 lg:py-8">
          {canOrders ? <OrderActivityBanner /> : null}
          {children}
        </main>
      </div>
    </div>
  );
}
