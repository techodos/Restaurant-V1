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
              aria-current={on ? "page" : undefined}
              className={cn(
                "inline-flex items-center gap-1.5 whitespace-nowrap rounded-[calc(var(--radius-card)-3px)] px-3 py-1.5 text-[13px] font-medium transition-[background-color,color,box-shadow] duration-150",
                on
                  ? "bg-[var(--color-surface)] text-[var(--color-ink)] shadow-[0_1px_2px_rgb(0_0_0/0.08)]"
                  : "text-[var(--color-muted-ink)] hover:text-[var(--color-ink)]",
              )}
            >
              {option.label}
              {option.count !== undefined ? (
                <span className={cn("tabular text-[11px]", on ? "text-[var(--color-brand)]" : "opacity-70")}>{option.count}</span>
              ) : null}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
