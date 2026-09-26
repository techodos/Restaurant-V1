import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "@/shared/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[11.5px] font-semibold leading-5 tracking-[0.01em]",
  {
    variants: {
      variant: {
        neutral: "border-[var(--color-hairline)] bg-[var(--color-surface)] text-[var(--color-muted-ink)]",
        brand: "border-transparent bg-[var(--color-brand)] text-[var(--color-brand-foreground)]",
        soft: "border-transparent bg-[color-mix(in_srgb,var(--color-brand)_12%,transparent)] text-[var(--color-brand)]",
        success: "border-transparent bg-[color-mix(in_srgb,var(--color-success)_12%,transparent)] text-[color-mix(in_srgb,var(--color-success)_80%,var(--color-ink))]",
        warning: "border-transparent bg-[color-mix(in_srgb,var(--color-warning)_15%,transparent)] text-[color-mix(in_srgb,var(--color-warning)_80%,var(--color-ink))]",
        danger: "border-transparent bg-[color-mix(in_srgb,var(--color-danger)_12%,transparent)] text-[color-mix(in_srgb,var(--color-danger)_80%,var(--color-ink))]",
        info: "border-transparent bg-[color-mix(in_srgb,var(--color-info)_12%,transparent)] text-[color-mix(in_srgb,var(--color-info)_80%,var(--color-ink))]",
      },
    },
    defaultVariants: { variant: "neutral" },
  },
);

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
