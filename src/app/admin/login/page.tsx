import type { Metadata } from "next";
import { AdminLoginForm } from "@/components/admin/admin-login-form";

export const metadata: Metadata = { title: "Admin sign in" };

export default function AdminLoginPage() {
  return (
    <div className="theme-root flex min-h-dvh items-center justify-center bg-[radial-gradient(ellipse_at_top,color-mix(in_srgb,var(--color-brand)_10%,transparent),transparent_60%)] px-4 py-16">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-[1.75rem] font-semibold leading-tight tracking-[-0.02em]">Admin sign in</h1>
          <p className="mt-2 text-sm text-[var(--color-muted-ink)]">
            Sign in with your staff account to manage orders and the menu.
          </p>
        </div>
        <AdminLoginForm />
      </div>
    </div>
  );
}
