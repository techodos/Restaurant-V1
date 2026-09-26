"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Sheet, type SheetProps } from "./sheet";

/** Anything inside a route sheet can ask it to close (e.g. after "add to tray"). */
export const CLOSE_ROUTE_SHEET_EVENT = "rp:close-route-sheet";

/**
 * A Sheet driven by an intercepted route (`@modal/(.)…`): open on mount, and closing it plays the
 * exit animation first, then navigates back to the page underneath (which never re-rendered).
 */
export function RouteSheet(props: Omit<SheetProps, "open" | "onOpenChange" | "onExitComplete">) {
  const router = useRouter();
  const [open, setOpen] = useState(true);

  useEffect(() => {
    const close = () => setOpen(false);
    window.addEventListener(CLOSE_ROUTE_SHEET_EVENT, close);
    return () => window.removeEventListener(CLOSE_ROUTE_SHEET_EVENT, close);
  }, []);

  return <Sheet {...props} open={open} onOpenChange={setOpen} onExitComplete={() => router.back()} />;
}
