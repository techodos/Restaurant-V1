"use client";

import { useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Loader2, Store } from "lucide-react";
import { toast } from "sonner";
import { Select } from "@/components/ui/input";
import { selectBranchAction } from "@/app/r/[restaurantSlug]/admin/(dashboard)/actions";

const ALL_BRANCHES = "all"; // server/auth/branch-scope.ts#ALL_BRANCHES

/**
 * The admin's ONE branch control (owner/admin with 2+ branches). Every branch-scoped screen reads the
 * choice on the server; the action stores it and Next re-renders the open page for the new branch. A page
 * number or an open order belongs to the old branch, so those are dropped on the way.
 */
export function BranchSwitcher({
  restaurantSlug,
  branches,
  value,
}: {
  restaurantSlug: string;
  branches: { id: string; name: string; isPrimary: boolean }[];
  value: string;
}) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const pathname = usePathname();

  function change(next: string) {
    startTransition(async () => {
      const result = await selectBranchAction(restaurantSlug, next);
      if (!result.success) {
        toast.error(result.error.message);
        return;
      }
      const openOrder = pathname.match(/^(.*\/admin\/orders)\/[^/]+$/);
      const query = new URLSearchParams(window.location.search);
      if (openOrder?.[1] && !pathname.endsWith("/activity")) router.replace(openOrder[1]);
      else if (query.has("page")) {
        query.delete("page");
        router.replace(`${pathname}${query.size ? `?${query}` : ""}`);
      }
    });
  }

  return (
    <label className="flex min-w-0 items-center gap-2">
      {pending ? (
        <Loader2 className="size-4 shrink-0 animate-spin text-[var(--color-muted-ink)]" aria-hidden />
      ) : (
        <Store className="size-4 shrink-0 text-[var(--color-muted-ink)]" aria-hidden />
      )}
      <span className="hidden text-xs font-semibold uppercase tracking-[0.14em] text-[var(--color-muted-ink)] md:inline">Branch</span>
      <Select
        aria-label="Branch"
        value={value}
        onChange={(event) => change(event.target.value)}
        disabled={pending}
        className="h-9 w-auto min-w-0 max-w-[13rem] py-0 text-sm font-semibold"
      >
        {branches.map((branch) => (
          <option key={branch.id} value={branch.id}>
            {branch.name}
            {branch.isPrimary ? " (main)" : ""}
          </option>
        ))}
        <option value={ALL_BRANCHES}>All branches</option>
      </Select>
    </label>
  );
}

/** Branch-scoped staff: their branch, shown as context only — not a control. */
export function BranchLabel({ name }: { name: string }) {
  return (
    <span className="flex min-w-0 items-center gap-2 text-sm">
      <Store className="size-4 shrink-0 text-[var(--color-muted-ink)]" aria-hidden />
      <span className="hidden text-xs font-semibold uppercase tracking-[0.14em] text-[var(--color-muted-ink)] md:inline">Branch</span>
      <span className="truncate font-semibold">{name}</span>
    </span>
  );
}
