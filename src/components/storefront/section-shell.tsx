import { cn } from "@/shared/utils";

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
    surface: "bg-[var(--color-surface)]",
    brand: "bg-[var(--color-brand)] text-[var(--color-brand-foreground)]",
  } as const;
  return (
    <section id={id} className={cn("py-16 md:py-24", tones[tone], className)}>
      <div className="container-page">{children}</div>
    </section>
  );
}
