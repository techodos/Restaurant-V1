"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { cn } from "@/shared/utils";

export interface Station {
  slug: string;
  name: string;
  count: number;
}

/**
 * Category ("station") navigation with scroll-spy. The station whose section sits under the sticky
 * header is marked in the brand colour with one sliding mark; tapping a station scrolls to it.
 * `index` = vertical list for the desktop side column, `rail` = sticky horizontal strip on phones.
 */
export function StationNav({ stations, variant }: { stations: Station[]; variant: "index" | "rail" }) {
  const [active, setActive] = useState(stations[0]?.slug ?? "");
  const railRef = useRef<HTMLDivElement>(null);
  const clickedAt = useRef(0);

  useEffect(() => {
    const sections = stations
      .map((station) => document.getElementById(station.slug))
      .filter((element): element is HTMLElement => Boolean(element));
    if (!sections.length) return;
    const offset = Number.parseInt(getComputedStyle(document.documentElement).getPropertyValue("--header-h")) || 72;
    const observer = new IntersectionObserver(
      (entries) => {
        // while a click-scroll is travelling, keep the tapped station
        if (Date.now() - clickedAt.current < 900) return;
        const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: `-${offset + 64}px 0px -55% 0px` },
    );
    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, [stations]);

  // keep the active chip in view inside the horizontal rail (horizontal scroll only, never the page)
  useEffect(() => {
    if (variant !== "rail") return;
    const rail = railRef.current;
    const chip = rail?.querySelector<HTMLElement>(`[data-station="${active}"]`);
    if (!rail || !chip) return;
    rail.scrollTo({ left: chip.offsetLeft - rail.clientWidth / 2 + chip.clientWidth / 2, behavior: "smooth" });
  }, [active, variant]);

  const go = (slug: string) => (event: React.MouseEvent) => {
    const target = document.getElementById(slug);
    if (!target) return;
    event.preventDefault();
    clickedAt.current = Date.now();
    setActive(slug);
    target.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    history.replaceState(null, "", `#${slug}`);
  };

  if (variant === "index") {
    return (
      <nav aria-label="Menu stations">
        <ul className="space-y-0.5">
          {stations.map((station) => {
            const current = station.slug === active;
            return (
              <li key={station.slug}>
                <a
                  href={`#${station.slug}`}
                  onClick={go(station.slug)}
                  aria-current={current ? "location" : undefined}
                  className={cn(
                    "relative flex items-baseline justify-between gap-3 py-2 pl-4 pr-1 text-[15px] transition-colors duration-200",
                    current ? "font-semibold text-[var(--color-ink)]" : "text-[var(--color-muted-ink)] hover:text-[var(--color-ink)]",
                  )}
                >
                  {current ? (
                    <motion.span
                      layoutId="station-mark-index"
                      className="absolute left-0 top-2 bottom-2 w-[2px] rounded-full bg-[var(--color-brand)]"
                      transition={{ type: "spring", duration: 0.35, bounce: 0.12 }}
                    />
                  ) : null}
                  <span>{station.name}</span>
                  <span className="tabular text-xs opacity-60">{station.count}</span>
                </a>
              </li>
            );
          })}
        </ul>
      </nav>
    );
  }

  return (
    <nav aria-label="Menu stations">
      <div ref={railRef} className="scrollbar-none flex gap-1 overflow-x-auto">
        {stations.map((station) => {
          const current = station.slug === active;
          return (
            <a
              key={station.slug}
              data-station={station.slug}
              href={`#${station.slug}`}
              onClick={go(station.slug)}
              aria-current={current ? "location" : undefined}
              className={cn(
                "relative shrink-0 whitespace-nowrap px-3 py-3 text-sm transition-colors duration-200",
                current ? "font-semibold text-[var(--color-ink)]" : "text-[var(--color-muted-ink)]",
              )}
            >
              {station.name}
              {current ? (
                <motion.span
                  layoutId="station-mark-rail"
                  className="absolute inset-x-3 bottom-0 h-[2px] rounded-full bg-[var(--color-brand)]"
                  transition={{ type: "spring", duration: 0.35, bounce: 0.12 }}
                />
              ) : null}
            </a>
          );
        })}
      </div>
    </nav>
  );
}
