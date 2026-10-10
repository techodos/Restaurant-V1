"use client";

import { useEffect, useRef, useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";

/**
 * Instant search over a server-rendered list: hides the rows (any element with `data-filter-text`) inside the element
 * with id `targetId` whose text does not contain the query. No request, no re-render of the rows themselves.
 */
export function ListFilter({ targetId, placeholder, label }: { targetId: string; placeholder: string; label: string }) {
  const [query, setQuery] = useState("");
  const [hidden, setHidden] = useState(0);
  const total = useRef(0);

  useEffect(() => {
    const target = document.getElementById(targetId);
    if (!target) return;
    const apply = () => {
      const rows = target.querySelectorAll<HTMLElement>("[data-filter-text]");
      const q = query.trim().toLowerCase();
      let count = 0;
      rows.forEach((row) => {
        const match = !q || (row.dataset.filterText ?? "").toLowerCase().includes(q);
        if (row.hidden === match) row.hidden = !match;
        if (!match) count += 1;
      });
      total.current = rows.length;
      setHidden(count);
    };
    apply();
    // a server refresh (toggle, delete) re-renders the rows: filter the new ones too
    const observer = new MutationObserver(apply);
    observer.observe(target, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [query, targetId]);

  return (
    <div className="flex flex-col gap-1">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--color-muted-ink)]" aria-hidden />
        <Input type="search" value={query} onChange={(event) => setQuery(event.target.value)} aria-label={label} placeholder={placeholder} className="h-10 pl-9" />
      </div>
      <p className="sr-only" aria-live="polite">
        {query ? `${total.current - hidden} of ${total.current} shown` : ""}
      </p>
      {query && hidden === total.current ? <p className="text-xs text-[var(--color-muted-ink)]">No items match “{query}”.</p> : null}
    </div>
  );
}
