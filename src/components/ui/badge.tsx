import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "@/shared/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium leading-5",
  {
    variants: {
      variant: {
        neutral: "border-[var(--color-hairline)] bg-[var(--color-surface)] text-[var(--color-muted-ink)]",
        brand: "border-transparent bg-[var(--color-brand)] text-[var(--color-brand-foreground)]",
        soft: "border-transparent bg-[color-mix(in_srgb,var(--color-brand)_12%,transparent)] text-[var(--color-brand)]",
        success: "border-transparent bg-emerald-600/12 text-emerald-700",
        warning: "border-transparent bg-amber-500/15 text-amber-700",
        danger: "border-transparent bg-red-600/12 text-red-700",
        info: "border-transparent bg-sky-600/12 text-sky-700",
      },
    },
    defaultVariants: { variant: "neutral" },
  },
);

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
