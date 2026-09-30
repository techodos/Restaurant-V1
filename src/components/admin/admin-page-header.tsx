import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/shared/utils";

/**
 * One page header for every admin screen: a back link (detail pages), the title, an optional badge next
 * to it, a description line, and right-aligned actions. Replaces the ad hoc `<h1 className="text-[1.75rem]
 * ...">` + `<p>` pairs every page used to repeat on its own (and the two pages — menu/items/new,
 * menu/items/[itemId] — that had drifted to a different size). One step quieter than before (1.75rem ->
 * 1.375rem): a dense back-office screen reads better with a title that doesn't out-weigh the data below it.
 */
export function AdminPageHeader({
  title,
  description,
  badge,
  backHref,
  backLabel = "Back",
  actions,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  /** rendered right after the title, e.g. a status Badge */
  badge?: React.ReactNode;
  backHref?: string;
  backLabel?: string;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-start justify-between gap-x-4 gap-y-3", className)}>
      <div className="min-w-0">
        {backHref ? (
          <Link
            href={backHref}
            className="mb-2 inline-flex items-center gap-1.5 text-sm text-[var(--color-muted-ink)] transition-colors hover:text-[var(--color-ink)]"
          >
            <ArrowLeft className="size-4" aria-hidden /> {backLabel}
          </Link>
        ) : null}
        <div className="flex flex-wrap items-center gap-2.5">
          <h1 className="truncate text-[1.375rem] font-semibold leading-tight tracking-[-0.015em]">{title}</h1>
          {badge}
        </div>
        {description ? <p className="mt-1 text-sm text-[var(--color-muted-ink)]">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
