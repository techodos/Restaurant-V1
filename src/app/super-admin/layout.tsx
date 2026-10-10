import type { Metadata } from "next";
import { requireSuperAdminPage } from "@/web/session";
import { SuperAdminHeader } from "@/components/super-admin/super-admin-header";

export const metadata: Metadata = {
  title: { default: "Platform admin", template: "%s · Platform admin" },
  robots: { index: false, follow: false },
};

/**
 * Platform developers only (role super_admin). Everyone else is sent to sign in. `sa-root` switches the shared tokens to
 * the portal's neutral SaaS palette (globals.css); `theme-root` keeps the shared primitives' derived tokens and lets
 * dialogs mount inside it.
 */
export default async function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  const actor = await requireSuperAdminPage();
  return (
    <div className="theme-root sa-root min-h-dvh bg-[var(--color-canvas)] text-[var(--color-ink)] antialiased">
      <SuperAdminHeader name={actor.name} email={actor.email} />
      <main className="mx-auto w-full max-w-[var(--sa-container)] px-4 py-6 sm:px-6 sm:py-8">{children}</main>
    </div>
  );
}
