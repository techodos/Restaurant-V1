"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ROLE_LABELS } from "@/server/auth/permissions";
import { signOutAction } from "@/app/admin/(dashboard)/actions";
import type { TeamRole } from "@/shared/contract/enums";

export function AdminHeader({
  name,
  role,
  restaurantName,
  mobileNav,
}: {
  name: string;
  role: TeamRole;
  restaurantName: string;
  /** menu button for screens without the sidebar */
  mobileNav?: React.ReactNode;
}) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function handleSignOut() {
    startTransition(() => {
      signOutAction().then(() => {
        router.push("/admin/login");
        router.refresh();
      });
    });
  }

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-4 border-b border-[var(--color-hairline)] bg-[color-mix(in_srgb,var(--color-surface)_85%,transparent)] px-4 backdrop-blur-xl sm:px-6">
      <div className="flex min-w-0 items-center gap-3">
        {mobileNav}
        <p className="truncate text-sm font-medium text-[var(--color-muted-ink)] lg:hidden">{restaurantName}</p>
      </div>
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-3">
          <span
            aria-hidden
            className="hidden size-9 place-items-center rounded-full bg-[color-mix(in_srgb,var(--color-brand)_12%,transparent)] text-sm font-semibold text-[var(--color-brand)] sm:grid"
          >
            {name.slice(0, 1)}
          </span>
          <div className="hidden text-left sm:block">
            <p className="text-sm font-semibold leading-tight">{name}</p>
            <p className="text-xs text-[var(--color-muted-ink)]">{ROLE_LABELS[role]}</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={handleSignOut} disabled={pending}>
          <LogOut className="size-4" aria-hidden />
          <span className="hidden sm:inline">Sign out</span>
        </Button>
      </div>
    </header>
  );
}
