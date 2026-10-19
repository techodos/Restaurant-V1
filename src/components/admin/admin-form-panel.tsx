"use client";

import { Check, Loader2, X, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AdminSwitch } from "@/components/admin/admin-switch";

/**
 * The inline create / edit form every admin manager opens in place (delivery zone, coupon, staff member,
 * location): a titled header with a close button, labelled sections (label column on desktop, stacked on
 * phones), and a footer pinned to the bottom of the screen while the form is taller than it — on/off
 * toggles on the left, Cancel + the primary action on the right. Presentation only: callers keep their state.
 */
export function AdminFormPanel({
  title,
  description,
  icon: Icon,
  onSubmit,
  onCancel,
  pending,
  submitLabel,
  toggles,
  children,
}: {
  title: string;
  description?: React.ReactNode;
  icon?: LucideIcon;
  onSubmit: (event: React.FormEvent) => void;
  onCancel: () => void;
  pending?: boolean;
  submitLabel: string;
  /** `FormToggle`s shown in the footer (Active, Primary, …) */
  toggles?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <form onSubmit={onSubmit} className="surface-card overflow-clip ring-1 ring-[color-mix(in_srgb,var(--color-brand)_18%,transparent)]">
      <header className="flex items-start gap-3.5 border-b border-[var(--admin-line,var(--color-hairline))] bg-[color-mix(in_srgb,var(--color-brand)_4%,var(--color-surface))] px-5 py-4 sm:px-6">
        {Icon ? (
          <span
            aria-hidden
            className="grid size-10 shrink-0 place-items-center rounded-xl bg-[color-mix(in_srgb,var(--color-brand)_12%,var(--color-surface))] text-[var(--color-brand)] ring-1 ring-inset ring-[color-mix(in_srgb,var(--color-brand)_20%,transparent)]"
          >
            <Icon className="size-5" />
          </span>
        ) : null}
        <div className="min-w-0 flex-1">
          <h2 className="font-[family-name:var(--font-heading)] text-[1.2rem] font-semibold leading-tight">{title}</h2>
          {description ? <p className="mt-0.5 text-[13px] leading-snug text-[var(--color-muted-ink)]">{description}</p> : null}
        </div>
        <button
          type="button"
          onClick={onCancel}
          aria-label="Close"
          className="-mr-1.5 grid size-10 shrink-0 place-items-center rounded-full text-[var(--color-muted-ink)] transition-colors hover:bg-[var(--tint-strong)] hover:text-[var(--color-ink)] focus-visible:outline-2 focus-visible:outline-[var(--color-brand)]"
        >
          <X className="size-[18px]" aria-hidden />
        </button>
      </header>

      <div className="divide-y divide-[var(--admin-line,var(--color-hairline))]">{children}</div>

      <footer className="sticky bottom-0 z-10 flex flex-col gap-3 border-t border-[var(--admin-line,var(--color-hairline))] bg-[color-mix(in_srgb,var(--color-surface)_94%,transparent)] px-5 py-3.5 backdrop-blur-md sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">{toggles}</div>
        <div className="flex gap-2 sm:shrink-0">
          <Button type="button" variant="ghost" onClick={onCancel} className="flex-1 sm:flex-none">
            Cancel
          </Button>
          <Button type="submit" disabled={pending} className="flex-1 sm:flex-none sm:min-w-[9rem]">
            {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Check className="size-4" aria-hidden />}
            {submitLabel}
          </Button>
        </div>
      </footer>
    </form>
  );
}

/** One labelled group of fields inside `AdminFormPanel`. */
export function AdminFormSection({ title, description, children }: { title: string; description?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="grid grid-cols-[minmax(0,1fr)] gap-4 px-5 py-5 sm:px-6 xl:grid-cols-[12rem_minmax(0,1fr)] xl:gap-8">
      <div>
        <h3 className="text-[14px] font-semibold">{title}</h3>
        {description ? <p className="mt-1 text-[13px] leading-snug text-[var(--color-muted-ink)]">{description}</p> : null}
      </div>
      <div className="min-w-0 space-y-4">{children}</div>
    </section>
  );
}

/** A labelled switch for the panel footer. */
export function FormToggle({ id, label, checked, onChange, disabled }: { id: string; label: string; checked: boolean; onChange: (checked: boolean) => void; disabled?: boolean }) {
  return (
    <span className="flex min-h-10 items-center gap-2.5">
      <AdminSwitch id={id} checked={checked} onChange={onChange} disabled={disabled} aria-labelledby={`${id}-label`} />
      <label id={`${id}-label`} htmlFor={id} className="cursor-pointer text-[14px] font-medium">
        {label}
      </label>
    </span>
  );
}
