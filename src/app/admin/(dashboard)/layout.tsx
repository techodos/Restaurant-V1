import type { Metadata } from "next";
import { requireStaffForAdmin } from "@/web/session";
import { getAdminRestaurant, getAdminTheme } from "@/web/admin";
import { themeCssVariables, fontStack } from "@/web/theme";
import { AdminHeader } from "@/components/admin/admin-header";
import { AdminMobileNav, AdminSidebar } from "@/components/admin/admin-sidebar";

export const metadata: Metadata = { title: { default: "Admin", template: "%s · Admin" } };

export default async function AdminDashboardLayout({ children }: { children: React.ReactNode }) {
  const actor = await requireStaffForAdmin();
  const [restaurant, theme] = await Promise.all([getAdminRestaurant(), getAdminTheme()]);

  return (
    <div
      className="theme-root flex min-h-dvh bg-[var(--color-canvas)] text-[var(--color-ink)]"
      style={
        {
          ...themeCssVariables(theme),
          "--font-heading": fontStack(theme.font, "serif"),
          "--font-body": fontStack(theme.bodyFont, "sans"),
          // a working tool: headings use the body sans, not the storefront display face
          "--font-display": fontStack(theme.bodyFont, "sans"),
        } as React.CSSProperties
      }
    >
      <AdminSidebar permissions={actor.permissions} restaurantName={restaurant.name} />
      <div className="flex min-w-0 flex-1 flex-col">
        <AdminHeader
          name={actor.name}
          role={actor.role}
          restaurantName={restaurant.name}
          mobileNav={<AdminMobileNav key="mobile-nav" permissions={actor.permissions} restaurantName={restaurant.name} />}
        />
        <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-6 sm:px-6 lg:px-10 lg:py-8">{children}</main>
      </div>
    </div>
  );
}
