import { cn } from "@/lib/utils";

export function SectionShell({
  children,
  className,
  id,
  tone = "default",
}: {
  children: React.ReactNode;
  className?: string;
  id?: string;
  tone?: "default" | "surface" | "brand";
}) {
  const tones = {
    default: "",
    surface: "bg-[var(--color-surface)] border-y border-[var(--color-hairline)]",
    brand: "bg-[var(--color-brand)] text-[var(--color-brand-foreground)]",
  } as const;
  return (
    <section id={id} className={cn("py-14 md:py-20", tones[tone], className)}>
      <div className="container-page">{children}</div>
    </section>
  );
}
