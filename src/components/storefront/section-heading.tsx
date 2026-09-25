import { cn } from "@/shared/utils";

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
      {eyebrow ? <p className="eyebrow mb-3">{eyebrow}</p> : null}
      <h2 className="text-balance text-[2rem] font-semibold leading-[1.08] md:text-[2.6rem]">{title}</h2>
      {subtitle ? (
        <p className={cn("mt-4 max-w-[60ch] text-pretty text-[15px] leading-relaxed text-[var(--color-muted-ink)] md:text-base", align === "center" && "mx-auto")}>
          {subtitle}
        </p>
      ) : null}
    </div>
  );
}
