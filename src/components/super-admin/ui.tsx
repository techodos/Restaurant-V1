"use client";

import Link from "next/link";
import { ChevronDown, ChevronRight, Loader2, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/shared/utils";
import type { StatusTone } from "./status";

/**
 * Super-admin design primitives. Colours come from the `.sa-root` tokens (globals.css), never hard-coded here, so the
 * whole portal shares one palette, radius and depth scale.
 */

export function PageHeader({
  title,
  description,
  actions,
  breadcrumbs,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  breadcrumbs?: { label: string; href?: string }[];
}) {
  return (
    <div className="space-y-3">
      {breadcrumbs ? <Breadcrumbs items={breadcrumbs} /> : null}
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="min-w-0 space-y-1">
          <h1 className="truncate text-2xl tracking-tight text-[var(--color-ink)]">{title}</h1>
          {description ? <p className="text-sm text-[var(--color-muted-ink)]">{description}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
    </div>
  );
}

export function Breadcrumbs({ items }: { items: { label: string; href?: string }[] }) {
  return (
    <nav aria-label="Breadcrumb">
      <ol className="flex min-w-0 flex-wrap items-center gap-1 text-[13px] text-[var(--color-muted-ink)]">
        {items.map((item, index) => {
          const last = index === items.length - 1;
          return (
            <li key={`${item.label}-${index}`} className="flex min-w-0 items-center gap-1">
              {item.href && !last ? (
                <Link href={item.href} className="truncate rounded px-1 py-0.5 transition-colors hover:bg-[var(--sa-subtle)] hover:text-[var(--color-ink)]">
                  {item.label}
                </Link>
              ) : (
                <span aria-current={last ? "page" : undefined} className={cn("truncate px-1", last && "font-medium text-[var(--color-ink)]")}>
                  {item.label}
                </span>
              )}
              {!last ? <ChevronRight className="size-3.5 shrink-0 text-[var(--sa-faint-ink)]" aria-hidden /> : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/**
 * A titled card. `collapsible` renders a native <details> (keyboard and screen-reader support for free); the chevron
 * turns, the body is not animated (frequent action, see the design-engineering skill: no motion on repeated toggles).
 */
export function Panel({
  title,
  description,
  icon: Icon,
  meta,
  children,
  footer,
  collapsible = false,
  defaultOpen = true,
  className,
  bodyClassName,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  icon?: LucideIcon;
  /** right side of the header: a count, a badge */
  meta?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  collapsible?: boolean;
  defaultOpen?: boolean;
  className?: string;
  bodyClassName?: string;
}) {
  const header = (
    <div className="flex items-start gap-3">
      {Icon ? (
        <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-[var(--sa-subtle)] text-[var(--color-muted-ink)]">
          <Icon className="size-4" aria-hidden />
        </span>
      ) : null}
      <div className="min-w-0 flex-1">
        <h2 className="text-[15px] leading-6 text-[var(--color-ink)]">{title}</h2>
        {description ? <p className="mt-0.5 text-[13px] leading-5 text-[var(--color-muted-ink)]">{description}</p> : null}
      </div>
      {meta ? <div className="shrink-0 pt-0.5">{meta}</div> : null}
      {collapsible ? (
        <ChevronDown className="sa-chevron mt-1.5 size-4 shrink-0 text-[var(--sa-faint-ink)] transition-transform duration-200 ease-[var(--ease-out)]" aria-hidden />
      ) : null}
    </div>
  );
  const body = <div className={cn("border-t border-[var(--color-hairline)] px-5 py-5 sm:px-6", bodyClassName)}>{children}</div>;
  const foot = footer ? (
    <div className="flex flex-wrap items-center justify-end gap-2 border-t border-[var(--color-hairline)] bg-[var(--sa-subtle)]/50 px-5 py-3 sm:px-6">{footer}</div>
  ) : null;

  if (collapsible) {
    return (
      <details open={defaultOpen} className={cn("surface-card group/panel overflow-hidden [&[open]_.sa-chevron]:rotate-180", className)}>
        <summary className="cursor-pointer list-none px-5 py-4 transition-colors hover:bg-[var(--sa-subtle)]/60 sm:px-6 [&::-webkit-details-marker]:hidden">
          {header}
        </summary>
        {body}
        {foot}
      </details>
    );
  }
  return (
    <section className={cn("surface-card overflow-hidden", className)}>
      <div className="px-5 py-4 sm:px-6">{header}</div>
      {body}
      {foot}
    </section>
  );
}

/** An accessible on/off switch (role="switch"). Pair it with a visible label through `id` / `aria-labelledby`. */
export function Switch({
  checked,
  onChange,
  id,
  disabled,
  "aria-labelledby": labelledBy,
  "aria-describedby": describedBy,
  "aria-label": ariaLabel,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  id?: string;
  disabled?: boolean;
  "aria-labelledby"?: string;
  "aria-describedby"?: string;
  "aria-label"?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      id={id}
      aria-checked={checked}
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border border-transparent transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-50",
        checked ? "bg-[var(--color-brand)]" : "bg-[var(--sa-border-strong)]",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "inline-block size-5 rounded-full bg-white shadow-[0_1px_2px_rgb(15_23_42/0.25)] transition-transform duration-200 ease-[var(--ease-out)]",
          checked ? "translate-x-5" : "translate-x-0.5",
        )}
      />
    </button>
  );
}

/** One setting: title + description on the left, switch on the right. The whole text block toggles too. */
export function SettingRow({
  id,
  title,
  description,
  checked,
  onChange,
  disabled,
}: {
  id: string;
  title: string;
  description?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-3.5 first:pt-0 last:pb-0">
      <div className="min-w-0">
        <label htmlFor={id} id={`${id}-label`} className="cursor-pointer text-sm font-medium text-[var(--color-ink)]">
          {title}
        </label>
        {description ? (
          <p id={`${id}-desc`} className="mt-0.5 text-[13px] leading-5 text-[var(--color-muted-ink)]">
            {description}
          </p>
        ) : null}
      </div>
      <Switch
        id={id}
        checked={checked}
        onChange={onChange}
        disabled={disabled}
        aria-labelledby={`${id}-label`}
        aria-describedby={description ? `${id}-desc` : undefined}
      />
    </div>
  );
}

const TONES: Record<StatusTone, string> = {
  success: "bg-[color-mix(in_srgb,var(--color-success)_10%,white)] text-[color-mix(in_srgb,var(--color-success)_75%,black)] ring-[color-mix(in_srgb,var(--color-success)_22%,transparent)]",
  neutral: "bg-[var(--sa-subtle)] text-[var(--color-muted-ink)] ring-[var(--color-hairline)]",
  warning: "bg-[color-mix(in_srgb,var(--color-warning)_10%,white)] text-[color-mix(in_srgb,var(--color-warning)_70%,black)] ring-[color-mix(in_srgb,var(--color-warning)_25%,transparent)]",
  danger: "bg-[color-mix(in_srgb,var(--color-danger)_9%,white)] text-[color-mix(in_srgb,var(--color-danger)_80%,black)] ring-[color-mix(in_srgb,var(--color-danger)_22%,transparent)]",
  info: "bg-[color-mix(in_srgb,var(--color-info)_9%,white)] text-[color-mix(in_srgb,var(--color-info)_80%,black)] ring-[color-mix(in_srgb,var(--color-info)_22%,transparent)]",
  brand: "bg-[var(--sa-primary-soft)] text-[var(--sa-primary-soft-ink)] ring-[color-mix(in_srgb,var(--color-brand)_20%,transparent)]",
};
const DOTS: Record<StatusTone, string> = {
  success: "bg-[var(--color-success)]",
  neutral: "bg-[var(--sa-faint-ink)]",
  warning: "bg-[var(--color-warning)]",
  danger: "bg-[var(--color-danger)]",
  info: "bg-[var(--color-info)]",
  brand: "bg-[var(--color-brand)]",
};

/** Compact status pill: a dot plus the word, so the meaning never rests on colour alone. */
export function StatusBadge({ tone, children, dot = true, className }: { tone: StatusTone; children: React.ReactNode; dot?: boolean; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset", TONES[tone], className)}>
      {dot ? <span aria-hidden className={cn("size-1.5 rounded-full", DOTS[tone])} /> : null}
      {children}
    </span>
  );
}

/**
 * The page-level save action, pinned to the bottom of the viewport while the form has unsaved changes (it sits in the
 * normal flow otherwise, so it never covers content). Submits the surrounding <form>; behaviour stays in the form.
 */
export function SaveBar({ dirty, pending, onDiscard, label = "Save changes" }: { dirty: boolean; pending: boolean; onDiscard?: () => void; label?: string }) {
  return (
    <div className={cn("z-20 -mx-4 mt-2 px-4 pb-4 pt-2 sm:-mx-6 sm:px-6", dirty && "sticky bottom-0")}>
      <div
        className={cn(
          "flex flex-col gap-3 rounded-xl border bg-[var(--color-surface)] px-4 py-3 transition-[box-shadow,border-color] duration-200 sm:flex-row sm:items-center sm:justify-between",
          dirty ? "border-[color-mix(in_srgb,var(--color-brand)_30%,var(--color-hairline))] shadow-[var(--sa-shadow-md)]" : "border-[var(--color-hairline)] shadow-[var(--sa-shadow-xs)]",
        )}
      >
        <p role="status" className="flex items-center gap-2 text-[13px] text-[var(--color-muted-ink)]">
          <span aria-hidden className={cn("size-2 rounded-full", dirty ? "bg-[var(--color-warning)]" : "bg-[var(--color-success)]")} />
          {pending ? "Saving…" : dirty ? "You have unsaved changes" : "All changes saved"}
        </p>
        <div className="flex gap-2">
          {onDiscard ? (
            <Button type="button" variant="ghost" size="sm" onClick={onDiscard} disabled={!dirty || pending} className="flex-1 sm:flex-none">
              Discard
            </Button>
          ) : null}
          <Button type="submit" size="sm" disabled={!dirty || pending} className="min-w-32 flex-1 sm:flex-none">
            {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
            {pending ? "Saving" : label}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function EmptyState({ icon: Icon, title, description, action }: { icon: LucideIcon; title: string; description?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[var(--sa-border-strong)] bg-[var(--color-surface)] px-6 py-12 text-center">
      <span className="grid size-10 place-items-center rounded-full bg-[var(--sa-subtle)] text-[var(--color-muted-ink)]">
        <Icon className="size-5" aria-hidden />
      </span>
      <p className="mt-3 text-sm font-medium text-[var(--color-ink)]">{title}</p>
      {description ? <p className="mt-1 max-w-sm text-[13px] text-[var(--color-muted-ink)]">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
