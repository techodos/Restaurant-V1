import { cn } from "@/shared/utils";

export type SectionTone = "paper" | "muted" | "night" | "brand";

/** Legacy tone names still used by some callers. */
const ALIASES: Record<string, SectionTone> = { default: "paper", surface: "muted" };

/**
 * A full-width section of the page. `tone` sets the ground and re-scopes the semantic colour tokens
 * (globals.css `.tone-*`), so everything inside a night section reads light-on-dark by itself.
 */
export function SectionShell({
  children,
  className,
  innerClassName,
  id,
  tone = "paper",
  bleed = false,
  ...rest
}: {
  children: React.ReactNode;
  className?: string;
  innerClassName?: string;
  id?: string;
  tone?: SectionTone | "default" | "surface";
  /** skip the page container (full-bleed layouts manage their own gutters) */
  bleed?: boolean;
} & Omit<React.HTMLAttributes<HTMLElement>, "className" | "id" | "children">) {
  const resolved = ALIASES[tone] ?? (tone as SectionTone);
  return (
    <section id={id} className={cn(`tone-${resolved}`, !bleed && "section-y", className)} {...rest}>
      {bleed ? children : <div className={cn("container-page", innerClassName)}>{children}</div>}
    </section>
  );
}
