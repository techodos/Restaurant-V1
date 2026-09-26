import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "@/shared/utils";

/**
 * One button for the whole product. Colours are semantic tokens, so a button inside a night or brand
 * section (globals.css `.tone-*`) re-colours itself; the radius is the theme's control radius.
 */
const buttonVariants = cva(
  "inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-[var(--radius-control,9999px)] text-sm font-semibold tracking-[0.005em] transition-[background-color,border-color,color,box-shadow,transform,opacity] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand)] [&_svg]:size-4 [&_svg]:shrink-0 active:scale-[0.97]",
  {
    variants: {
      variant: {
        primary:
          "bg-[var(--color-brand)] text-[var(--color-brand-foreground)] hover:bg-[color-mix(in_srgb,var(--color-brand)_86%,black)] hover:shadow-[var(--shadow-brand)]",
        secondary:
          "bg-[var(--color-ink)] text-[var(--color-canvas)] hover:bg-[color-mix(in_srgb,var(--color-ink)_86%,var(--color-canvas))]",
        outline:
          "border border-[color-mix(in_srgb,var(--color-ink)_26%,transparent)] bg-transparent text-[var(--color-ink)] hover:border-[var(--color-ink)] hover:bg-[color-mix(in_srgb,var(--color-ink)_5%,transparent)]",
        ghost: "text-[var(--color-ink)] hover:bg-[color-mix(in_srgb,var(--color-ink)_7%,transparent)]",
        subtle:
          "bg-[color-mix(in_srgb,var(--color-brand)_11%,transparent)] text-[var(--color-brand)] hover:bg-[color-mix(in_srgb,var(--color-brand)_17%,transparent)]",
        danger: "bg-[var(--color-danger,#b42318)] text-white hover:bg-[color-mix(in_srgb,var(--color-danger,#b42318)_86%,black)]",
        /** on a brand-coloured panel: light button carrying the brand colour */
        inverse: "bg-[var(--color-surface)] text-[var(--brand-primary,var(--color-brand))] hover:bg-white",
        /** over photography: a quiet light outline, always readable on dark images */
        glass:
          "border border-white/45 bg-white/[0.06] text-white backdrop-blur-sm hover:border-white hover:bg-white/15",
        link: "rounded-none p-0 h-auto text-[var(--color-ink)] underline decoration-1 underline-offset-[6px] hover:decoration-2",
      },
      size: {
        sm: "h-9 px-4 text-[13px]",
        md: "h-11 px-6",
        lg: "h-[3.25rem] px-8 text-[15px]",
        icon: "size-11",
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
