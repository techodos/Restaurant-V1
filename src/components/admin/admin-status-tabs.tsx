import Link from "next/link";
import { cn } from "@/shared/utils";

/**
 * The status filter shared by orders / payments / reservations / reviews: a segmented control (one tinted track, the
 * active segment raised on the surface), scrolling sideways on narrow screens. Plain links, so filters stay in the URL.
 */
export function AdminStatusTabs<K extends string>({
  options,
  active,
  linkFor,
  label = "Filter",
}: {
  options: { key: K; label: string; count?: number }[];
  active: K;
  linkFor: (key: K) => string;
  label?: string;
}) {
  return (
    <nav aria-label={label} className="scrollbar-none -mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <div className="inline-flex min-w-max gap-0.5 rounded-[var(--radius-card)] border border-[var(--color-hairline)] bg-[var(--tint)] p-[3px]">
        {options.map((option) => {
          const on = active === option.key;
          return (
            <Link
              key={option.key}
              href={linkFor(option.key)}
              // every tab is always in the viewport, so Next's default prefetch would eagerly re-render this
              // force-dynamic, DB-backed list for every tab on mount — up to 9 of them per page (orders alone).
              // That queued enough background RSC fetches behind the browser's 6-per-origin limit to stall a
              // real action request (e.g. a Payments row's Mark Paid) for tens of seconds with no feedback.
              prefetch={false}
              aria-current={on ? "page" : undefined}
              className={cn(
                "inline-flex min-h-10 items-center gap-1.5 whitespace-nowrap rounded-[calc(var(--radius-card)-3px)] px-3.5 py-1.5 text-[14px] sm:min-h-0 sm:px-3 sm:text-[13px] font-medium transition-[background-color,color,box-shadow] duration-150",
                on
                  ? "bg-[var(--color-surface)] font-semibold text-[var(--color-brand)] shadow-[0_1px_2px_rgb(0_0_0/0.08),inset_0_-2px_0_var(--color-brand-accent)]"
                  : "text-[var(--color-muted-ink)] hover:text-[var(--color-ink)]",
              )}
            >
              {option.label}
              {option.count !== undefined ? (
                <span
                  className={cn(
                    "tabular min-w-5 rounded-full px-1.5 text-center text-[11.5px] font-semibold leading-5",
                    on ? "bg-[var(--color-brand)] text-[var(--color-brand-foreground)]" : option.count > 0 ? "bg-[var(--tint-strong)] text-[var(--color-ink)]" : "opacity-60",
                  )}
                >
                  {option.count}
                </span>
              ) : null}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
