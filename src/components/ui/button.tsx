import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "@/shared/utils";

const buttonVariants = cva(
  "inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-[var(--radius-brand)] text-sm font-semibold tracking-[-0.005em] transition-[background-color,border-color,color,box-shadow,transform,filter] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand)] [&_svg]:size-4 [&_svg]:shrink-0 active:scale-[0.98]",
  {
    variants: {
      variant: {
        primary:
          "bg-[var(--color-brand)] text-[var(--color-brand-foreground)] shadow-[var(--shadow-brand,var(--shadow-card))] hover:bg-[color-mix(in_srgb,var(--color-brand)_88%,black)] hover:-translate-y-px",
        secondary:
          "bg-[var(--color-brand-secondary)] text-white hover:bg-[color-mix(in_srgb,var(--color-brand-secondary)_86%,white)]",
        outline:
          "border border-[var(--color-hairline)] bg-[var(--color-surface)] text-[var(--color-ink)] shadow-[0_1px_2px_color-mix(in_srgb,var(--color-ink)_5%,transparent)] hover:border-[color-mix(in_srgb,var(--color-ink)_30%,var(--color-hairline))] hover:bg-[color-mix(in_srgb,var(--color-ink)_3%,var(--color-surface))]",
        ghost: "text-[var(--color-ink)] hover:bg-[color-mix(in_srgb,var(--color-ink)_6%,transparent)]",
        subtle:
          "bg-[color-mix(in_srgb,var(--color-brand)_10%,transparent)] text-[var(--color-brand)] hover:bg-[color-mix(in_srgb,var(--color-brand)_16%,transparent)]",
        danger: "bg-red-600 text-white hover:bg-red-700",
        /** on a brand-coloured panel: light button carrying the brand colour */
        inverse:
          "bg-[var(--color-surface)] text-[var(--color-brand)] shadow-[0_8px_20px_-10px_rgba(0,0,0,0.35)] hover:-translate-y-px hover:bg-white",
        /** for use over photography: frosted, always readable on dark images */
        glass:
          "border border-white/35 bg-white/12 text-white backdrop-blur-md shadow-[inset_0_1px_0_rgba(255,255,255,0.18)] hover:bg-white/22",
        link: "text-[var(--color-brand)] underline-offset-4 hover:underline p-0 h-auto",
      },
      size: {
        sm: "h-9 px-3 text-[13px]",
        md: "h-11 px-5",
        lg: "h-12 px-7 text-[15px]",
        icon: "size-10",
        none: "",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export function Button({ className, variant, size, asChild = false, type, ...props }: ButtonProps) {
  const Component = asChild ? Slot : "button";
  return (
    <Component
      className={cn(buttonVariants({ variant, size }), className)}
      {...(asChild ? {} : { type: type ?? "button" })}
      {...props}
    />
  );
}

export { buttonVariants };
