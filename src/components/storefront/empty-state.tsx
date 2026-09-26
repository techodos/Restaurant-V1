import type { LucideIcon } from "lucide-react";
import { cn } from "@/shared/utils";

/**
 * The one empty / blocked state for storefront pages: an outlined accent icon, a serif line, one
 * sentence and the next actions. Tone-aware (works on paper and on night grounds).
 */
export function EmptyState({
  icon: Icon,
  title,
  children,
  actions,
  className,
  titleAs: Title = "h2",
  ...rest
}: {
  icon: LucideIcon;
  title: string;
  children?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
  titleAs?: "h1" | "h2";
} & Omit<React.HTMLAttributes<HTMLDivElement>, "title" | "children" | "className">) {
  return (
    <div className={cn("mx-auto max-w-md py-10 text-center", className)} {...rest}>
      <span className="mx-auto grid size-16 place-items-center rounded-full border border-[var(--rule-strong)] text-[var(--color-brand-accent)]">
        <Icon className="size-6" aria-hidden />
      </span>
      <Title className="display-2 mt-5">{title}</Title>
      {children ? <p className="mt-3 text-[15px] leading-relaxed text-[var(--color-muted-ink)]">{children}</p> : null}
      {actions ? <div className="mt-6 flex flex-wrap justify-center gap-3">{actions}</div> : null}
    </div>
  );
}
