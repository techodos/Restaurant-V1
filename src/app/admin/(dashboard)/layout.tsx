import type { Metadata } from "next";
import { requireStaffForAdmin } from "@/web/session";
import { getAdminRestaurant, getAdminTheme } from "@/web/admin";
import { themeCssVariables, fontStack } from "@/web/theme";
import { AdminHeader } from "@/components/admin/admin-header";
import { AdminSidebar } from "@/components/admin/admin-sidebar";

export const metadata: Metadata = { title: { default: "Admin", template: "%s · Admin" } };

export default async function AdminDashboardLayout({ children }: { children: React.ReactNode }) {
  const actor = await requireStaffForAdmin();
  const [restaurant, theme] = await Promise.all([getAdminRestaurant(), getAdminTheme()]);

  return (
    <div
      className="flex min-h-dvh bg-[var(--color-canvas)] text-[var(--color-ink)]"
      style={
        {
          ...themeCssVariables(theme),
          "--font-heading": fontStack(theme.font, "serif"),
          "--font-body": fontStack(theme.bodyFont, "sans"),
        } as React.CSSProperties
      }
    >
      <AdminSidebar permissions={actor.permissions} />
      <div className="flex min-w-0 flex-1 flex-col">
        <AdminHeader name={actor.name} role={actor.role} restaurantName={restaurant.name} />
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}
