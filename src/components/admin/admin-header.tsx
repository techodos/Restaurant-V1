"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ROLE_LABELS } from "@/server/auth/permissions";
import { signOutAction } from "@/app/admin/(dashboard)/actions";
import type { TeamRole } from "@/shared/contract/enums";

export function AdminHeader({
  name,
  role,
  restaurantName,
}: {
  name: string;
  role: TeamRole;
  restaurantName: string;
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
    <header className="flex items-center justify-between border-b border-[var(--color-hairline)] bg-[var(--color-surface)] px-6 py-4">
      <p className="text-sm text-[var(--color-muted-ink)]">{restaurantName}</p>
      <div className="flex items-center gap-3">
        <div className="text-right">
          <p className="text-sm font-medium leading-tight">{name}</p>
          <Badge variant="soft">{ROLE_LABELS[role]}</Badge>
        </div>
        <Button variant="outline" size="sm" onClick={handleSignOut} disabled={pending}>
          <LogOut className="size-4" aria-hidden />
          Sign out
        </Button>
      </div>
    </header>
  );
}
