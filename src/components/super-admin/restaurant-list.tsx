"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, ExternalLink, Globe, Search, SlidersHorizontal, Store } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { EmptyState, StatusBadge } from "@/components/super-admin/ui";
import { restaurantStatusTone } from "@/components/super-admin/status";
import { cn } from "@/shared/utils";

export interface RestaurantSummary {
  id: string;
  name: string;
  slug: string;
  status: string;
  cuisines: string[];
  createdAt: string;
  /** labels of the entitlements the platform has switched off */
  disabled: string[];
  adminHref: string;
}

type Sort = "newest" | "name" | "restricted";

/** Client-side search / filter / sort over the list the server already sent (no extra requests). */
export function RestaurantList({ restaurants }: { restaurants: RestaurantSummary[] }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [sort, setSort] = useState<Sort>("newest");
  const statuses = useMemo(() => [...new Set(restaurants.map((r) => r.status))].sort(), [restaurants]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = restaurants.filter(
      (r) => (status === "all" || r.status === status) && (!q || r.name.toLowerCase().includes(q) || r.slug.includes(q) || r.cuisines.some((c) => c.toLowerCase().includes(q))),
    );
    return [...list].sort((a, b) =>
      sort === "name" ? a.name.localeCompare(b.name) : sort === "restricted" ? b.disabled.length - a.disabled.length : b.createdAt.localeCompare(a.createdAt),
    );
  }, [restaurants, query, status, sort]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--sa-faint-ink)]" aria-hidden />
          <Input
            type="search"
            aria-label="Search restaurants"
            placeholder="Search by name, slug or cuisine"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="pl-9"
          />
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex">
          <Select aria-label="Filter by status" value={status} onChange={(event) => setStatus(event.target.value)} className="sm:w-40">
            <option value="all">All statuses</option>
            {statuses.map((value) => (
              <option key={value} value={value}>{restaurantStatusTone(value).label}</option>
            ))}
          </Select>
          <Select aria-label="Sort" value={sort} onChange={(event) => setSort(event.target.value as Sort)} className="sm:w-44">
            <option value="newest">Newest first</option>
            <option value="name">Name A-Z</option>
            <option value="restricted">Most restricted</option>
          </Select>
        </div>
      </div>

      <p className="text-[13px] text-[var(--color-muted-ink)]" aria-live="polite">
        {shown.length === restaurants.length ? `${restaurants.length} restaurants` : `${shown.length} of ${restaurants.length} restaurants`}
      </p>

      {shown.length === 0 ? (
        <EmptyState
          icon={Store}
          title="No restaurants match"
          description="Try another name or clear the filters."
          action={
            <Button variant="outline" size="sm" onClick={() => { setQuery(""); setStatus("all"); }}>
              Clear filters
            </Button>
          }
        />
      ) : (
        <ul className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {shown.map((restaurant) => (
            <li key={restaurant.id} className="min-w-0">
              <RestaurantCard restaurant={restaurant} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function RestaurantCard({ restaurant }: { restaurant: RestaurantSummary }) {
  const status = restaurantStatusTone(restaurant.status);
  const off = restaurant.disabled.length;
  const manage = `/super-admin/${restaurant.slug}`;
  return (
    <article className="surface-card group flex h-full flex-col transition-[border-color,box-shadow] duration-200 hover:border-[var(--sa-border-strong)] hover:shadow-[var(--sa-shadow-sm)]">
      <div className="flex items-start gap-3 p-5">
        <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-lg bg-[var(--sa-subtle)] text-sm font-semibold text-[var(--color-muted-ink)]">
          {restaurant.name.charAt(0).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <h2 className="truncate text-[15px] leading-6">
              <Link href={manage} className="rounded hover:text-[var(--color-brand)]">{restaurant.name}</Link>
            </h2>
            <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
          </div>
          <p className="truncate font-mono text-xs text-[var(--color-muted-ink)]">/r/{restaurant.slug}</p>
          {restaurant.cuisines.length ? <p className="mt-1 truncate text-[13px] text-[var(--color-muted-ink)]">{restaurant.cuisines.join(" · ")}</p> : null}
        </div>
      </div>

      <div className="mx-5 flex items-start gap-2 rounded-lg bg-[var(--sa-subtle)] px-3 py-2 text-[13px]">
        <SlidersHorizontal className="mt-0.5 size-3.5 shrink-0 text-[var(--sa-faint-ink)]" aria-hidden />
        {off === 0 ? (
          <span className="text-[var(--color-muted-ink)]">All features and screens enabled</span>
        ) : (
          <span className="min-w-0 text-[var(--color-muted-ink)]">
            <span className="font-medium text-[var(--color-ink)]">{off} switched off</span>
            <span className="block truncate" title={restaurant.disabled.join(", ")}>{restaurant.disabled.join(", ")}</span>
          </span>
        )}
      </div>

      <div className="mt-auto flex flex-wrap items-center gap-2 p-5 pt-4">
        <Button asChild size="sm">
          <Link href={manage}>
            Manage <ArrowRight className="size-4" aria-hidden />
          </Link>
        </Button>
        <Button asChild size="sm" variant="outline">
          <Link href={`${manage}/website`}>
            <Globe className="size-4" aria-hidden /> Website
          </Link>
        </Button>
        <Link
          href={restaurant.adminHref}
          className={cn("ml-auto inline-flex items-center gap-1 rounded px-1 text-[13px] font-medium text-[var(--color-muted-ink)] transition-colors hover:text-[var(--color-brand)]")}
        >
          Open admin <ExternalLink className="size-3.5" aria-hidden />
        </Link>
      </div>
    </article>
  );
}
