"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { resyncCartCountAction } from "@/app/r/[restaurantSlug]/cart/actions";

/** Invisible: resyncs the header's cart-count cookie hint to the real count this page just loaded. */
export function CartCountSync({ count }: { count: number }) {
  const router = useRouter();
  const done = useRef(false);

  useEffect(() => {
    if (done.current) return;
    done.current = true;
    resyncCartCountAction(count).then(() => router.refresh());
  }, [count, router]);

  return null;
}
