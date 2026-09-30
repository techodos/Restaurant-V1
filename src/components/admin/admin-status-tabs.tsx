import Link from "next/link";
import { cn } from "@/shared/utils";

/**
 * The status-filter pill row shared by orders / menu / payments / reservations / reviews. Was four
 * (five, counting menu's category rail, which reuses this too) copies of the same markup; now one place
 * to change the look of a filter tab everywhere at once.
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
    <nav aria-label={label} className="-mx-1 flex snap-x gap-2 overflow-x-auto pb-1">
      {options.map((option) => (
        <Link
          key={option.key}
          href={linkFor(option.key)}
          aria-current={active === option.key ? "page" : undefined}
          className={cn(
            "snap-start whitespace-nowrap rounded-full border px-3.5 py-1.5 text-sm transition-colors",
            active === option.key
              ? "border-[var(--color-brand)] bg-[var(--color-brand)] text-[var(--color-brand-foreground)]"
              : "border-[var(--color-hairline)] bg-[var(--color-surface)] hover:border-[var(--color-brand)]",
          )}
        >
          {option.label}
          {option.count !== undefined ? <span className="ml-1 text-xs opacity-75">{option.count}</span> : null}
        </Link>
      ))}
    </nav>
  );
}
