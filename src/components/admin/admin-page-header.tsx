import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/shared/utils";
import { AdminBreadcrumb } from "@/components/admin/admin-sidebar";

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
    <div className={cn("flex flex-wrap items-end justify-between gap-x-6 gap-y-4", className)}>
      <div className="min-w-0">
        {backHref ? (
          <Link
            href={backHref}
            prefetch={false}
            className="group mb-3 inline-flex min-h-9 items-center gap-1.5 rounded-full bg-[var(--color-surface)] py-1 pl-2 pr-3.5 text-[13px] font-medium text-[var(--color-muted-ink)] shadow-[0_1px_2px_color-mix(in_srgb,var(--color-ink)_8%,transparent)] ring-1 ring-[var(--admin-line,var(--color-hairline))] transition-colors hover:text-[var(--color-ink)]"
          >
            <ArrowLeft className="size-4 transition-transform group-hover:-translate-x-0.5" aria-hidden /> {backLabel}
          </Link>
        ) : (
          <p className="mb-2 flex items-center gap-2.5 text-[11.5px] font-semibold uppercase tracking-[0.2em] text-[color-mix(in_srgb,var(--color-brand-accent)_55%,var(--color-ink))]">
            <span aria-hidden className="h-px w-6 bg-[var(--color-brand-accent)]" />
            <AdminBreadcrumb restaurantSlug="" group />
          </p>
        )}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <h1 className="text-balance font-[family-name:var(--font-heading)] text-[1.75rem] font-semibold leading-[1.1] tracking-[-0.01em] [overflow-wrap:anywhere] sm:text-[2rem]">
            {title}
          </h1>
          {badge}
        </div>
        {description ? <p className="mt-1.5 text-[14px] leading-relaxed text-[var(--color-muted-ink)]">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
