import { cn } from "@/shared/utils";

interface SectionHeadingProps {
  eyebrow?: string | undefined;
  title: string;
  subtitle?: string | undefined;
  align?: "left" | "center";
  /** "lg" for page and section titles, "md" for sub-sections */
  size?: "lg" | "md";
  /** a link or control set to the right of the heading on wide screens (e.g. "View full menu") */
  action?: React.ReactNode;
  as?: "h1" | "h2";
  className?: string;
}

/** Eyebrow, serif title, one line of lede, and an optional action aligned to the title's baseline. */
export function SectionHeading({
  eyebrow,
  title,
  subtitle,
  align = "left",
  size = "lg",
  action,
  as: Tag = "h2",
  className,
}: SectionHeadingProps) {
  const centered = align === "center";
  return (
    <div
      className={cn(
        "flex flex-col gap-4",
        action && !centered && "md:flex-row md:items-end md:justify-between md:gap-8",
        className,
      )}
    >
      <div className={cn("max-w-2xl", centered && "mx-auto text-center")}>
        {eyebrow ? <p className={cn("eyebrow mb-3", centered && "justify-center")}>{eyebrow}</p> : null}
        <Tag className={size === "lg" ? "display-1" : "display-2"}>{title}</Tag>
        {subtitle ? <p className={cn("lede mt-3", centered && "mx-auto")}>{subtitle}</p> : null}
      </div>
      {action ? <div className={cn("shrink-0", centered && "mx-auto")}>{action}</div> : null}
    </div>
  );
}
