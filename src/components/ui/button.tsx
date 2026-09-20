import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "@/shared/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[var(--radius-brand)] text-sm font-medium transition-[background-color,border-color,color,box-shadow,transform] duration-150 disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand)] [&_svg]:size-4 [&_svg]:shrink-0 active:translate-y-px",
  {
    variants: {
      variant: {
        primary:
          "bg-[var(--color-brand)] text-[var(--color-brand-foreground)] shadow-[var(--shadow-card)] hover:bg-[color-mix(in_srgb,var(--color-brand)_88%,black)]",
        secondary:
          "bg-[var(--color-brand-secondary)] text-white hover:bg-[color-mix(in_srgb,var(--color-brand-secondary)_88%,black)]",
        outline:
          "border border-[var(--color-hairline)] bg-[var(--color-surface)] text-[var(--color-ink)] hover:border-[var(--color-brand)] hover:text-[var(--color-brand)]",
        ghost: "text-[var(--color-ink)] hover:bg-[color-mix(in_srgb,var(--color-ink)_6%,transparent)]",
        subtle:
          "bg-[color-mix(in_srgb,var(--color-brand)_10%,transparent)] text-[var(--color-brand)] hover:bg-[color-mix(in_srgb,var(--color-brand)_16%,transparent)]",
        danger: "bg-red-600 text-white hover:bg-red-700",
        link: "text-[var(--color-brand)] underline-offset-4 hover:underline p-0 h-auto",
      },
      size: {
        sm: "h-9 px-3 text-[13px]",
        md: "h-11 px-5",
        lg: "h-12 px-7 text-base",
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
