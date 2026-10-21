"use client";

import Form from "next/form";
import Link from "next/link";
import { Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";

const fieldLabel = "text-xs font-medium text-[var(--color-muted-ink)]";

/**
 * Search + filters for the admin Orders list. A plain GET form (works without JS); with JS, a select applies on change and a
 * date when its field is left. `status` is the tab the search runs in: the page passes "all" from the default Active tab,
 * so an old completed or cancelled order is found by its number.
 */
export function OrderFilterBar({
  action,
  status,
  q,
  type,
  pay,
  from,
  to,
  typeOptions,
  payOptions,
  clearHref,
}: {
  action: string;
  status: string;
  q?: string;
  type?: string;
  pay?: string;
  from?: string;
  to?: string;
  typeOptions: { value: string; label: string }[];
  payOptions: { value: string; label: string }[];
  /** set when a search or filter is active */
  clearHref?: string;
}) {
  const apply = (event: React.ChangeEvent<HTMLSelectElement>) => event.currentTarget.form?.requestSubmit();
  // a date applies when the field is left, not on every change: typing "2026" digit by digit fires a change per digit
  const applyDate = (event: React.FocusEvent<HTMLInputElement>) => {
    if (event.currentTarget.value !== event.currentTarget.defaultValue) event.currentTarget.form?.requestSubmit();
  };

  return (
    <Form action={action} role="search" className="space-y-2.5">
      <input type="hidden" name="status" value={status} />
      <div className="flex w-full gap-2 sm:max-w-md">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--color-muted-ink)]" aria-hidden />
          <Input name="q" type="search" defaultValue={q ?? ""} aria-label="Search orders" placeholder="Order #, name, phone or email" className="h-10 pl-9" />
        </div>
        <Button type="submit" className="h-10 shrink-0">
          Search
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-end">
        <label className="flex min-w-0 flex-col gap-1">
          <span className={fieldLabel}>Type</span>
          <Select name="type" defaultValue={type ?? ""} onChange={apply} className="h-10 w-full sm:w-40">
            <option value="">All types</option>
            {typeOptions.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </Select>
        </label>
        <label className="flex min-w-0 flex-col gap-1">
          <span className={fieldLabel}>Payment</span>
          <Select name="pay" defaultValue={pay ?? ""} onChange={apply} className="h-10 w-full sm:w-44">
            <option value="">Any payment</option>
            {payOptions.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </Select>
        </label>
        <label className="flex min-w-0 flex-col gap-1">
          <span className={fieldLabel}>From</span>
          <Input name="from" type="date" defaultValue={from ?? ""} max={to || undefined} onBlur={applyDate} className="h-10 w-full sm:w-40" />
        </label>
        <label className="flex min-w-0 flex-col gap-1">
          <span className={fieldLabel}>To</span>
          <Input name="to" type="date" defaultValue={to ?? ""} min={from || undefined} onBlur={applyDate} className="h-10 w-full sm:w-40" />
        </label>
        {clearHref ? (
          <Link
            href={clearHref}
            prefetch={false}
            className="col-span-2 inline-flex h-10 items-center justify-center gap-1.5 rounded-[var(--radius-control,9999px)] px-3 text-[13px] font-medium text-[var(--color-muted-ink)] hover:bg-[color-mix(in_srgb,var(--color-ink)_7%,transparent)] hover:text-[var(--color-ink)] sm:justify-start"
          >
            <X className="size-4" aria-hidden /> Clear search &amp; filters
          </Link>
        ) : null}
      </div>
    </Form>
  );
}
