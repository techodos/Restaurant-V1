"use client";

import { useEffect, useRef, useState } from "react";
import { TRAY_LANDED_EVENT } from "@/components/motion/fly-to-tray";
import { cn } from "@/shared/utils";

/**
 * The tray's item count. Ticks when a dish lands (fly-to-tray event) and whenever the server-side count
 * grows (the layout re-renders with the new cookie hint after an add).
 */
export function TrayCount({ count, className }: { count: number; className?: string }) {
  const [pulse, setPulse] = useState(0);
  const previous = useRef(count);

  useEffect(() => {
    if (count > previous.current) setPulse((value) => value + 1);
    previous.current = count;
  }, [count]);

  useEffect(() => {
    const onLanded = () => setPulse((value) => value + 1);
    window.addEventListener(TRAY_LANDED_EVENT, onLanded);
    return () => window.removeEventListener(TRAY_LANDED_EVENT, onLanded);
  }, []);

  return (
    <span key={pulse} className={cn("tabular inline-block", pulse > 0 && "animate-tick", className)}>
      {count > 99 ? "99+" : count}
    </span>
  );
}
