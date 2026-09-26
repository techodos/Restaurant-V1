"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { cn } from "@/shared/utils";

/**
 * A horizontal, scroll-snapping strip with previous / next controls. Native scrolling (swipe, trackpad,
 * keyboard) does the work; the buttons only scroll by one viewport of the strip and grey out at the ends.
 * `controls="sides"` floats the buttons over the strip's edges on wide screens; `"inline"` renders them
 * wherever the caller places <RailControls> (via `renderControls`).
 */
export function Rail({
  children,
  label,
  className,
  itemClassName,
  controls = "sides",
}: {
  children: React.ReactNode[];
  label: string;
  className?: string;
  /** width of each item, e.g. "w-[78%] sm:w-[46%] lg:w-[calc((100%-4.5rem)/4)]" */
  itemClassName: string;
  controls?: "sides" | "none";
}) {
  const scroller = useRef<HTMLUListElement>(null);
  const [edges, setEdges] = useState({ start: true, end: false });

  const update = useCallback(() => {
    const element = scroller.current;
    if (!element) return;
    setEdges({
      start: element.scrollLeft <= 4,
      end: element.scrollLeft + element.clientWidth >= element.scrollWidth - 4,
    });
  }, []);

  useEffect(() => {
    update();
    const element = scroller.current;
    if (!element) return;
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, [update]);

  const scrollBy = (direction: 1 | -1) => {
    const element = scroller.current;
    if (!element) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    element.scrollBy({ left: direction * element.clientWidth * 0.9, behavior: reduce ? "auto" : "smooth" });
  };

  const button = (direction: 1 | -1) => {
    const disabled = direction === 1 ? edges.end : edges.start;
    const Icon = direction === 1 ? ArrowRight : ArrowLeft;
    return (
      <button
        type="button"
        onClick={() => scrollBy(direction)}
        disabled={disabled}
        aria-label={direction === 1 ? `Next ${label}` : `Previous ${label}`}
        className={cn(
          "press grid size-11 place-items-center rounded-full border border-[var(--rule-strong)] bg-[var(--color-canvas)] text-[var(--color-ink)] transition-[opacity,border-color,background-color] duration-200 hover:border-[var(--color-ink)] disabled:pointer-events-none disabled:opacity-0",
        )}
      >
        <Icon className="size-[18px]" aria-hidden />
      </button>
    );
  };

  return (
    <div className={cn("group/rail relative", className)}>
      <ul
        ref={scroller}
        onScroll={update}
        aria-label={label}
        className="scrollbar-none -mx-5 flex snap-x snap-mandatory scroll-px-5 gap-4 overflow-x-auto px-5 pb-2 md:-mx-10 md:scroll-px-10 md:gap-6 md:px-10 xl:mx-0 xl:scroll-px-0 xl:px-0"
      >
        {children.map((child, index) => (
          <li key={index} className={cn("shrink-0 snap-start", itemClassName)}>
            {child}
          </li>
        ))}
      </ul>
      {controls === "sides" ? (
        <>
          <div className="absolute left-0 top-[38%] hidden -translate-x-1/2 -translate-y-1/2 xl:block">{button(-1)}</div>
          <div className="absolute right-0 top-[38%] hidden -translate-y-1/2 translate-x-1/2 xl:block">{button(1)}</div>
          <div className="mt-6 flex justify-end gap-2 xl:hidden">
            {button(-1)}
            {button(1)}
          </div>
        </>
      ) : null}
    </div>
  );
}
