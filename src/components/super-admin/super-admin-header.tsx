"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, LogOut, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { signOutSuperAdminAction } from "@/app/super-admin/actions";
import { adminPath } from "@/shared/utils";

/** Compact white app bar: product mark on the left, the signed-in platform admin and sign-out on the right. */
export function SuperAdminHeader({ name, email }: { name: string; email: string }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const initials = name
    .split(/\s+/)
    .map((part) => part.charAt(0))
    .join("")
    .slice(0, 2)
    .toUpperCase();

  function signOut() {
    startTransition(() => {
      signOutSuperAdminAction().then((result) => {
        router.push(result.success ? adminPath(result.data.loginSlug, "/login") : "/");
        router.refresh();
      });
    });
  }

  return (
    <header className="sticky top-0 z-30 border-b border-[var(--color-hairline)] bg-[var(--color-surface)]/90 backdrop-blur supports-[backdrop-filter]:bg-[var(--color-surface)]/80">
      <div className="mx-auto flex h-14 max-w-[var(--sa-container)] items-center justify-between gap-4 px-4 sm:px-6">
        <Link href="/super-admin" className="-ml-1 flex items-center gap-2.5 rounded-lg px-1 py-1">
          <span className="grid size-7 place-items-center rounded-lg bg-[var(--color-brand)] text-white shadow-[var(--shadow-brand)]">
            <ShieldCheck className="size-4" aria-hidden />
          </span>
          <span className="text-sm font-semibold tracking-tight text-[var(--color-ink)]">Platform Admin</span>
        </Link>
        <div className="flex items-center gap-3">
          <div className="hidden items-center gap-2.5 sm:flex">
            <span aria-hidden className="grid size-8 place-items-center rounded-full bg-[var(--sa-primary-soft)] text-xs font-semibold text-[var(--sa-primary-soft-ink)]">
              {initials || "SA"}
            </span>
            <div className="leading-tight">
              <p className="text-[13px] font-medium text-[var(--color-ink)]">{name}</p>
              <p className="text-xs text-[var(--color-muted-ink)]" title={email}>Super admin</p>
            </div>
          </div>
          <span aria-hidden className="hidden h-6 w-px bg-[var(--color-hairline)] sm:block" />
          <Button variant="ghost" size="sm" onClick={signOut} disabled={pending} className="px-3 text-[var(--color-muted-ink)] hover:text-[var(--color-ink)]">
            {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <LogOut className="size-4" aria-hidden />}
            Sign out
          </Button>
        </div>
      </div>
    </header>
  );
}
