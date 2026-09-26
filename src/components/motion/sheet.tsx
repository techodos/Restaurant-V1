"use client";

import { useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { AnimatePresence, motion, useReducedMotion, type PanInfo } from "motion/react";
import { X } from "lucide-react";
import { cn } from "@/shared/utils";

/** iOS-style drawer curve from the motion tokens (--ease-drawer). */
const DRAWER_EASE = [0.32, 0.72, 0, 1] as const;

function useIsDesktop(): boolean {
  const [desktop, setDesktop] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(min-width: 768px)");
    const update = () => setDesktop(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return desktop;
}

export interface SheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** accessible name; shown as the sheet heading unless `hideTitle` */
  title: string;
  hideTitle?: boolean;
  description?: string;
  /** runs after the exit animation finishes (route sheets navigate back here) */
  onExitComplete?: () => void;
  /** desktop panel width */
  size?: "md" | "lg";
  children: React.ReactNode;
  /** pinned under the scrolling body (primary actions) */
  footer?: React.ReactNode;
  /** ground of the panel: the page's paper (default) or the dark night surface */
  tone?: "paper" | "night";
}

/**
 * The one overlay of the product. Phones: a bottom sheet that can be dragged down to dismiss.
 * Tablet/desktop: a panel that slides in from the right. Radix Dialog supplies focus trap, Escape,
 * scroll lock and ARIA; motion supplies the enter / exit and the drag. The portal is mounted inside
 * `.theme-root` so the restaurant's theme variables apply.
 */
export function Sheet({
  open,
  onOpenChange,
  title,
  hideTitle,
  description,
  onExitComplete,
  size = "md",
  children,
  footer,
  tone = "paper",
}: SheetProps) {
  const desktop = useIsDesktop();
  const reduce = useReducedMotion();
  const [container, setContainer] = useState<HTMLElement | null>(null);
  useEffect(() => setContainer(document.querySelector<HTMLElement>(".theme-root") ?? document.body), []);

  const hidden = reduce
    ? { opacity: 0 }
    : desktop
      ? { x: "100%" }
      : { y: "100%" };
  const shown = reduce ? { opacity: 1 } : { x: 0, y: 0 };

  function onDragEnd(_: unknown, info: PanInfo) {
    // flick down fast, or drag past a quarter of the viewport
    if (info.velocity.y > 500 || info.offset.y > window.innerHeight * 0.25) onOpenChange(false);
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence onExitComplete={onExitComplete}>
        {open && container ? (
          <Dialog.Portal forceMount container={container}>
            <Dialog.Overlay asChild forceMount>
              <motion.div
                className="fixed inset-0 z-50 bg-[rgb(0_0_0/0.5)] backdrop-blur-[2px]"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.24, ease: "easeOut" }}
              />
            </Dialog.Overlay>
            <Dialog.Content asChild forceMount aria-describedby={description ? undefined : undefined}>
              <motion.div
                className={cn(
                  `tone-${tone}`,
                  "fixed z-50 flex flex-col bg-[var(--color-canvas)] text-[var(--color-ink)] shadow-[var(--shadow-raised)] outline-none",
                  "inset-x-0 bottom-0 max-h-[92dvh] rounded-t-[var(--radius-panel)]",
                  "md:inset-y-0 md:left-auto md:right-0 md:h-dvh md:max-h-none md:rounded-none md:rounded-l-[var(--radius-panel)]",
                  size === "lg" ? "md:w-[min(40rem,94vw)]" : "md:w-[min(30rem,94vw)]",
                )}
                initial={hidden}
                animate={shown}
                exit={hidden}
                transition={{ duration: reduce ? 0.15 : 0.42, ease: DRAWER_EASE }}
                drag={!desktop && !reduce ? "y" : false}
                dragConstraints={{ top: 0, bottom: 0 }}
                dragElastic={{ top: 0, bottom: 0.6 }}
                onDragEnd={onDragEnd}
              >
                {!desktop ? (
                  <span aria-hidden className="mx-auto mt-2.5 h-1 w-10 shrink-0 rounded-full bg-[var(--rule-strong)]" />
                ) : null}
                <header className={cn("flex shrink-0 items-start justify-between gap-4 px-5 pb-3 pt-4 md:px-7 md:pt-6", hideTitle && "absolute right-0 top-0 z-10")}>
                  <Dialog.Title className={cn("display-3", hideTitle && "sr-only")}>{title}</Dialog.Title>
                  {description ? <Dialog.Description className="sr-only">{description}</Dialog.Description> : null}
                  <Dialog.Close
                    aria-label="Close"
                    className="press grid size-10 shrink-0 place-items-center rounded-full bg-[color-mix(in_srgb,var(--color-canvas)_88%,transparent)] text-[var(--color-ink)] shadow-[0_1px_3px_color-mix(in_srgb,var(--color-ink)_18%,transparent)] backdrop-blur"
                  >
                    <X className="size-[18px]" aria-hidden />
                  </Dialog.Close>
                </header>
                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{children}</div>
                {footer ? <div className="shrink-0">{footer}</div> : null}
              </motion.div>
            </Dialog.Content>
          </Dialog.Portal>
        ) : null}
      </AnimatePresence>
    </Dialog.Root>
  );
}
