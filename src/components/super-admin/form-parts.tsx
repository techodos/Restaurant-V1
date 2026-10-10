"use client";

import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/shared/utils";

/** Form building blocks shared by the super-admin website and page editors (styled by the `.sa-root` tokens). */

/** A labelled field. The <label> wraps the control, so the association needs no ids. */
export function Field({ label, hint, children, className }: { label: string; hint?: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={cn("block min-w-0", className)}>
      <span className="mb-1.5 block text-[13px] font-medium text-[var(--color-ink)]">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-xs text-[var(--color-muted-ink)]">{hint}</span> : null}
    </label>
  );
}

export function Check({ label, checked, onChange, description }: { label: string; checked: boolean; onChange: (value: boolean) => void; description?: string }) {
  return (
    <label className="flex cursor-pointer items-start gap-2.5 text-sm text-[var(--color-ink)]">
      <input type="checkbox" className="mt-0.5 shrink-0 cursor-pointer rounded" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span>
        {label}
        {description ? <span className="block text-xs text-[var(--color-muted-ink)]">{description}</span> : null}
      </span>
    </label>
  );
}

/** Colour name, a swatch that opens the native picker, and the hex value. */
export function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const valid = /^#[0-9a-fA-F]{6}$/.test(value);
  return (
    <div className="flex items-center gap-3 rounded-lg border border-[var(--color-hairline)] bg-[var(--color-surface)] p-2 pl-3">
      <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-[var(--color-ink)]">{label}</span>
      <span className="relative size-8 shrink-0 overflow-hidden rounded-md ring-1 ring-inset ring-black/10" style={{ background: valid ? value : "transparent" }}>
        <input
          type="color"
          value={valid ? value : "#000000"}
          onChange={(event) => onChange(event.target.value)}
          className="absolute inset-0 size-full cursor-pointer opacity-0"
          aria-label={`${label} colour picker`}
        />
      </span>
      <Input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        maxLength={7}
        aria-label={`${label} hex value`}
        aria-invalid={!valid}
        className="w-[6.5rem] shrink-0 font-mono text-[13px] uppercase"
      />
    </div>
  );
}

const iconButton = "grid size-8 place-items-center rounded-md text-[var(--color-muted-ink)] transition-colors hover:bg-[var(--sa-subtle)] hover:text-[var(--color-ink)] disabled:pointer-events-none disabled:opacity-30";

/** Compact repeatable rows with move up / move down / remove; `render` draws one row's fields. */
export function RowList<T>({
  rows,
  onChange,
  blank,
  addLabel,
  render,
}: {
  rows: T[];
  onChange: (rows: T[]) => void;
  blank: () => T;
  addLabel: string;
  render: (row: T, set: (patch: Partial<T>) => void) => React.ReactNode;
}) {
  const move = (from: number, to: number) => {
    if (to < 0 || to >= rows.length) return;
    const next = [...rows];
    next.splice(to, 0, next.splice(from, 1)[0] as T);
    onChange(next);
  };
  return (
    <div className="space-y-2">
      {rows.length ? (
        <ol className="space-y-2">
          {rows.map((row, index) => (
            <li key={index} className="flex items-start gap-2 rounded-lg border border-[var(--color-hairline)] bg-[var(--color-surface)] p-2.5 sm:gap-3">
              <span aria-hidden className="mt-7 hidden w-5 shrink-0 text-center text-xs font-medium tabular-nums text-[var(--sa-faint-ink)] sm:block">
                {index + 1}
              </span>
              <div className="grid min-w-0 flex-1 gap-2.5 sm:grid-cols-2">
                {render(row, (patch) => onChange(rows.map((r, i) => (i === index ? { ...r, ...patch } : r))))}
              </div>
              <div className="mt-6 flex shrink-0 flex-col gap-0.5 sm:flex-row">
                <button type="button" className={iconButton} onClick={() => move(index, index - 1)} disabled={index === 0} aria-label={`Move item ${index + 1} up`}>
                  <ArrowUp className="size-4" aria-hidden />
                </button>
                <button type="button" className={iconButton} onClick={() => move(index, index + 1)} disabled={index === rows.length - 1} aria-label={`Move item ${index + 1} down`}>
                  <ArrowDown className="size-4" aria-hidden />
                </button>
                <button
                  type="button"
                  className={cn(iconButton, "hover:bg-[color-mix(in_srgb,var(--color-danger)_8%,white)] hover:text-[var(--color-danger)]")}
                  onClick={() => onChange(rows.filter((_, i) => i !== index))}
                  aria-label={`Remove item ${index + 1}`}
                >
                  <Trash2 className="size-4" aria-hidden />
                </button>
              </div>
            </li>
          ))}
        </ol>
      ) : null}
      <Button type="button" variant="outline" size="sm" onClick={() => onChange([...rows, blank()])}>
        <Plus className="size-4" aria-hidden /> {addLabel}
      </Button>
    </div>
  );
}
