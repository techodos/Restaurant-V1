"use client";

import { cn } from "@/shared/utils";

/**
 * On/off switch for the restaurant admin, in the restaurant's brand colour (role="switch", Space/Enter toggle it like
 * any button). Give it a visible label through `aria-labelledby`, or an `aria-label`.
 */
export function AdminSwitch({
  checked,
  onChange,
  disabled,
  id,
  "aria-label": ariaLabel,
  "aria-labelledby": labelledBy,
  "aria-describedby": describedBy,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  id?: string;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  "aria-describedby"?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      id={id}
      aria-checked={checked}
      aria-label={ariaLabel}
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-50",
        checked ? "bg-[var(--color-brand)]" : "bg-[color-mix(in_srgb,var(--color-ink)_20%,var(--color-surface))]",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "inline-block size-5 rounded-full bg-white shadow-[0_1px_2px_rgb(0_0_0/0.25)] transition-transform duration-200 ease-[var(--ease-out)]",
          checked ? "translate-x-[22px]" : "translate-x-0.5",
        )}
      />
    </button>
  );
}

/** A settings row: title + description on the left, the switch on the right; the label toggles it too. */
export function AdminSwitchRow({
  id,
  title,
  description,
  checked,
  onChange,
  disabled,
}: {
  id: string;
  title: React.ReactNode;
  description?: React.ReactNode;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-3 first:pt-0 last:pb-0">
      <div className="min-w-0">
        <label htmlFor={id} id={`${id}-label`} className="cursor-pointer text-sm font-medium">
          {title}
        </label>
        {description ? (
          <p id={`${id}-desc`} className="mt-0.5 text-[13px] leading-5 text-[var(--color-muted-ink)]">
            {description}
          </p>
        ) : null}
      </div>
      <AdminSwitch id={id} checked={checked} onChange={onChange} disabled={disabled} aria-labelledby={`${id}-label`} aria-describedby={description ? `${id}-desc` : undefined} />
    </div>
  );
}
