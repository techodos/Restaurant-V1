"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** No SSE for a multi-order staff feed yet (section 8's stream is scoped to one order); poll instead. */
export function KitchenAutoRefresh({ intervalMs = 20000 }: { intervalMs?: number }) {
  const router = useRouter();

  useEffect(() => {
    const timer = setInterval(() => router.refresh(), intervalMs);
    return () => clearInterval(timer);
  }, [router, intervalMs]);

  return null;
}
