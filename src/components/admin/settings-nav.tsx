"use client";

import { useEffect, useRef, useState } from "react";
import {
  Bike,
  CalendarCheck,
  Coins,
  CreditCard,
  Gift,
  MessageCircle,
  Percent,
  ReceiptText,
  ShoppingBag,
  ToggleRight,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/shared/utils";

const ICONS: Record<string, LucideIcon> = {
  features: ToggleRight,
  tax: Percent,
  serviceFee: Coins,
  payments: CreditCard,
  ordering: ShoppingBag,
  whatsapp: MessageCircle,
  reservations: CalendarCheck,
  delivery: Bike,
  loyalty: Gift,
  receipt: ReceiptText,
};

/**
 * Jump links to each settings section (`SectionForm` renders `id="settings-<id>"`), with the section in view
 * highlighted. Desktop: a sticky card list. Phones: a pill row that keeps the active pill scrolled into view.
 */
export function SettingsNav({ sections }: { sections: readonly { id: string; label: string }[] }) {
  const [active, setActive] = useState<string>(sections[0]?.id ?? "");
  const list = useRef<HTMLUListElement>(null);

  useEffect(() => {
    const targets = sections.map((section) => document.getElementById(`settings-${section.id}`)).filter((node): node is HTMLElement => Boolean(node));
    if (!targets.length) return;
    // the section whose top has most recently crossed the upper third of the screen is the one being read
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id.replace("settings-", ""));
      },
      { rootMargin: "-20% 0px -65% 0px" },
    );
    targets.forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, [sections]);

  // phones: keep the active pill visible in the sideways row
  useEffect(() => {
    const node = list.current?.querySelector<HTMLElement>(`[data-section="${active}"]`);
    if (node && list.current && list.current.scrollWidth > list.current.clientWidth) {
      list.current.scrollTo({ left: node.offsetLeft - 16, behavior: "smooth" });
    }
  }, [active]);

  return (
    <nav aria-label="Settings sections" className="lg:sticky lg:top-24">
      <ul
        ref={list}
        className="scrollbar-none -mx-4 flex gap-1.5 overflow-x-auto px-4 sm:-mx-6 sm:px-6 lg:mx-0 lg:flex-col lg:gap-0.5 lg:overflow-visible lg:px-0 lg:surface-card lg:p-1.5"
      >
        {sections.map((section) => {
          const Icon = ICONS[section.id] ?? ToggleRight;
          const on = section.id === active;
          return (
            <li key={section.id}>
              <a
                href={`#settings-${section.id}`}
                data-section={section.id}
                aria-current={on ? "location" : undefined}
                onClick={() => setActive(section.id)}
                className={cn(
                  "flex min-h-10 items-center gap-2.5 whitespace-nowrap rounded-full px-3.5 text-[13.5px] font-medium transition-colors lg:rounded-[calc(var(--radius-card)-6px)] lg:px-3",
                  on
                    ? "bg-[var(--color-brand)] text-[var(--color-brand-foreground)] lg:bg-[color-mix(in_srgb,var(--color-brand)_10%,var(--color-surface))] lg:text-[var(--color-brand)]"
                    : "bg-[var(--color-surface)] text-[var(--color-muted-ink)] ring-1 ring-inset ring-[var(--admin-line,var(--color-hairline))] hover:text-[var(--color-ink)] lg:bg-transparent lg:ring-0 lg:hover:bg-[var(--tint)]",
                )}
              >
                <Icon className="size-4 shrink-0" aria-hidden />
                {section.label}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
