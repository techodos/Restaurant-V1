import { cn } from "@/lib/utils";

interface SectionHeadingProps {
  eyebrow?: string | undefined;
  title: string;
  subtitle?: string | undefined;
  align?: "left" | "center";
  className?: string;
}

export function SectionHeading({ eyebrow, title, subtitle, align = "left", className }: SectionHeadingProps) {
  return (
    <div className={cn("max-w-2xl", align === "center" && "mx-auto text-center", className)}>
      {eyebrow ? (
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-brand)]">{eyebrow}</p>
      ) : null}
      <h2 className="text-balance text-3xl font-semibold leading-tight md:text-4xl">{title}</h2>
      {subtitle ? <p className="mt-3 text-pretty text-[var(--color-muted-ink)]">{subtitle}</p> : null}
    </div>
  );
}
