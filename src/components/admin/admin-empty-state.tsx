import type { LucideIcon } from "lucide-react";
import { cn } from "@/shared/utils";

/**
 * The "no rows" state for an admin table or list — denser and quieter than the storefront's EmptyState
 * (no serif display heading, no accent-coloured ring: this is a back-office screen, not a moment to sell
 * something). Every admin list used to render its own one-line `<p>`; this adds a small icon so an empty
 * table doesn't read as a broken one, without becoming a decorative moment.
 */
export function AdminEmptyState({
  icon: Icon,
  title,
  action,
  className,
}: {
  icon?: LucideIcon;
  title: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center gap-3 px-6 py-14 text-center", className)}>
      {Icon ? (
        <span className="grid size-10 place-items-center rounded-full bg-[var(--tint-strong)] text-[var(--color-muted-ink)]">
          <Icon className="size-[18px]" aria-hidden />
        </span>
      ) : null}
      <p className="text-sm text-[var(--color-muted-ink)]">{title}</p>
      {action}
    </div>
  );
}
