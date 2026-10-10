"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

/**
 * A thin bar along the top of the admin while the next screen is being rendered on the server. App Router
 * keeps the old page on screen until the new one is ready, so without it a click looked like nothing happened.
 * Next has no global "navigation started" event: it starts on a click on an internal link, a GET filter form,
 * or back/forward, and finishes when the URL changes (or after a timeout, e.g. a link to the same page).
 * Reduced motion: shown without the sliding animation.
 */
export function NavigationProgress() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [state, setState] = useState<"idle" | "loading" | "done">("idle");
  const timers = useRef<number[]>([]);

  const clearTimers = () => {
    for (const id of timers.current) window.clearTimeout(id);
    timers.current = [];
  };

  // the URL changed: the new screen is in, finish the bar
  useEffect(() => {
    setState((current) => (current === "loading" ? "done" : current));
    clearTimers();
    timers.current.push(window.setTimeout(() => setState("idle"), 300));
  }, [pathname, searchParams]);

  useEffect(() => {
    const start = () => {
      clearTimers();
      setState("loading");
      // never leave it running (the target was the current page, or the navigation failed)
      timers.current.push(window.setTimeout(() => setState("done"), 15_000));
    };
    const isOtherPage = (url: URL) =>
      url.origin === window.location.origin &&
      (url.pathname !== window.location.pathname || url.search !== window.location.search);

    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as Element | null)?.closest?.("a[href]");
      if (!(anchor instanceof HTMLAnchorElement) || anchor.target === "_blank" || anchor.hasAttribute("download")) return;
      if (isOtherPage(new URL(anchor.href, window.location.href))) start();
    };
    const onSubmit = (event: SubmitEvent) => {
      const form = event.target as HTMLFormElement | null;
      // a GET form (report range, search) is a navigation; forms React handles (onSubmit preventDefault, server/
      // client actions with a javascript: action) are not
      if (!(form instanceof HTMLFormElement) || event.defaultPrevented || form.method.toLowerCase() !== "get") return;
      if ((form.getAttribute("action") ?? "").startsWith("javascript:")) return;
      start();
    };
    const onPopState = () => start();

    document.addEventListener("click", onClick);
    document.addEventListener("submit", onSubmit);
    window.addEventListener("popstate", onPopState);
    return () => {
      document.removeEventListener("click", onClick);
      document.removeEventListener("submit", onSubmit);
      window.removeEventListener("popstate", onPopState);
      clearTimers();
    };
  }, []);

  return (
    <div
      role="progressbar"
      aria-label="Loading page"
      aria-hidden={state === "idle"}
      className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-[3px]"
    >
      <div
        className="h-full origin-left bg-[var(--color-brand-accent,var(--color-brand))] shadow-[0_0_8px_var(--color-brand-accent,var(--color-brand))] motion-reduce:transition-none"
        style={{
          width: state === "idle" ? "0%" : state === "loading" ? "85%" : "100%",
          opacity: state === "idle" ? 0 : 1,
          // a long ease towards 85% (it never claims to be finished), then a quick completion and fade
          transition:
            state === "loading"
              ? "width 8s cubic-bezier(0.1, 0.7, 0.2, 1), opacity 120ms"
              : state === "done"
                ? "width 200ms ease-out, opacity 250ms 150ms"
                : "none",
        }}
      />
    </div>
  );
}
