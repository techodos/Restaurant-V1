"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, SlidersHorizontal } from "lucide-react";
import { cn } from "@/shared/utils";
import { Sheet } from "@/components/motion/sheet";

export interface SortOption {
  value: string;
  label: string;
  /** the menu URL with this sort and every other filter kept */
  href: string;
  active: boolean;
}

/** Phones only: the square sort button and its bottom sheet (the desktop card has a select instead). */
export function MenuSortButton({ options }: { options: SortOption[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        aria-label="Sort and filter"
        onClick={() => setOpen(true)}
        className="press grid size-12 shrink-0 place-items-center rounded-xl bg-[var(--color-brand)] text-[var(--color-brand-foreground)] shadow-[0_2px_8px_-2px_rgb(18_36_28/0.12)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand)] md:hidden"
      >
        <SlidersHorizontal className="size-5" aria-hidden />
      </button>
      <Sheet open={open} onOpenChange={setOpen} title="Sort">
        <ul className="px-3 pb-6">
          {options.map((option) => (
            <li key={option.value}>
              <Link
                href={option.href}
                onClick={() => setOpen(false)}
                aria-current={option.active || undefined}
                className={cn(
                  "flex items-center justify-between rounded-[var(--radius-card)] px-3 py-3.5 text-[16px]",
                  option.active ? "bg-[var(--brand-tint)] font-semibold" : "hover:bg-[var(--tint)]",
                )}
              >
                {option.label}
                {option.active ? <Check className="size-4 text-[var(--color-brand)]" aria-hidden /> : null}
              </Link>
            </li>
          ))}
        </ul>
      </Sheet>
    </>
  );
}
