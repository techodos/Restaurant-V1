"use client";

import * as Popover from "@radix-ui/react-popover";
import { ChevronDown } from "lucide-react";
import { cn } from "@/shared/utils";
import { ICON_NAMES, SectionIcon } from "@/components/storefront/icon";

/** A grid of every icon a category/section can be set to, instead of a plain <select> of names. */
export function IconPicker({
  value,
  onChange,
  label = "Icon",
}: {
  value: string;
  onChange: (value: string) => void;
  label?: string;
}) {
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label={label}
          className="flex h-10 w-full items-center gap-2.5 rounded-[var(--radius-control)] border border-[var(--color-hairline)] bg-[var(--color-surface)] px-3 text-left text-sm transition-colors hover:border-[var(--color-ink)]"
        >
          <span className="grid size-7 shrink-0 place-items-center rounded-[var(--radius-brand)] bg-[var(--tint)]">
            <SectionIcon name={value} className="size-4" />
          </span>
          <span className="min-w-0 flex-1 truncate capitalize text-[var(--color-ink)]">{value ? value.replace(/-/g, " ") : "No icon"}</span>
          <ChevronDown aria-hidden className="size-4 shrink-0 text-[var(--color-muted-ink)]" />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={6}
          className="animate-dialog z-50 w-[min(22rem,calc(100vw-2rem))] rounded-[var(--radius-panel)] border border-[var(--color-hairline)] bg-[var(--color-surface)] p-3 shadow-[var(--shadow-raised)]"
        >
          <div className="grid max-h-64 grid-cols-6 gap-1 overflow-y-auto pr-1">
            <Popover.Close asChild>
              <button
                type="button"
                onClick={() => onChange("")}
                aria-label="No icon"
                title="No icon"
                className={cn(
                  "grid aspect-square place-items-center rounded-[var(--radius-brand)] text-[11px] text-[var(--color-muted-ink)] transition-colors hover:bg-[var(--tint)]",
                  !value && "bg-[color-mix(in_srgb,var(--color-brand)_12%,transparent)] text-[var(--color-brand)]",
                )}
              >
                None
              </button>
            </Popover.Close>
            {ICON_NAMES.map((name) => (
              <Popover.Close asChild key={name}>
                <button
                  type="button"
                  onClick={() => onChange(name)}
                  aria-label={name.replace(/-/g, " ")}
                  title={name.replace(/-/g, " ")}
                  className={cn(
                    "grid aspect-square place-items-center rounded-[var(--radius-brand)] transition-colors hover:bg-[var(--tint)]",
                    value === name && "bg-[color-mix(in_srgb,var(--color-brand)_12%,transparent)] text-[var(--color-brand)]",
                  )}
                >
                  <SectionIcon name={name} className="size-[18px]" />
                </button>
              </Popover.Close>
            ))}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
