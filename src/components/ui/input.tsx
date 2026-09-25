import * as React from "react";
import { cn } from "@/shared/utils";

export const inputStyles =
  "flex h-11 w-full surface-flat px-3.5 py-2 text-[15px] text-[var(--color-ink)] shadow-[0_1px_2px_color-mix(in_srgb,var(--color-ink)_4%,transparent)] transition-[border-color,box-shadow] duration-200 placeholder:text-[color-mix(in_srgb,var(--color-muted-ink)_85%,transparent)] hover:border-[color-mix(in_srgb,var(--color-ink)_22%,var(--color-hairline))] focus:border-[var(--color-brand)] focus:shadow-[0_0_0_4px_color-mix(in_srgb,var(--color-brand)_14%,transparent)] focus:outline-none disabled:cursor-not-allowed disabled:opacity-60 aria-[invalid=true]:border-red-500 aria-[invalid=true]:shadow-[0_0_0_4px_rgb(239_68_68/0.12)] sm:text-sm";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return <input ref={ref} className={cn(inputStyles, className)} {...props} />;
  },
);

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, ...props }, ref) {
    return <textarea ref={ref} className={cn(inputStyles, "min-h-24 resize-y py-2.5", className)} {...props} />;
  },
);

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className, ...props }, ref) {
    return (
      <select
        ref={ref}
        className={cn(inputStyles, "cursor-pointer appearance-none bg-[length:16px] pr-9", className)}
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")",
          backgroundRepeat: "no-repeat",
          backgroundPosition: "right 0.75rem center",
        }}
        {...props}
      />
    );
  },
);

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("text-sm font-medium text-[var(--color-ink)]", className)} {...props} />;
}

export function FieldError({ children }: { children?: React.ReactNode }) {
  if (!children) return null;
  return (
    <p role="alert" className="text-[13px] font-medium text-red-600">
      {children}
    </p>
  );
}

export function FieldHint({ children }: { children?: React.ReactNode }) {
  if (!children) return null;
  return <p className="text-xs text-[var(--color-muted-ink)]">{children}</p>;
}
