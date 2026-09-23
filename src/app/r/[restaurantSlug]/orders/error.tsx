"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

/** My Orders could not be loaded: say so and offer a retry (the order itself is not affected). */
export default function MyOrdersError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error.message);
  }, [error]);

  return (
    <div className="container-page py-24">
      <div role="alert" className="mx-auto max-w-lg rounded-[var(--radius-brand)] border border-[var(--color-hairline)] bg-[var(--color-surface)] p-8 text-center">
        <span className="mx-auto grid size-12 place-items-center rounded-full bg-amber-500/15 text-amber-700">
          <AlertTriangle className="size-6" aria-hidden />
        </span>
        <h1 className="mt-5 text-2xl font-semibold">We could not load your orders</h1>
        <p className="mt-3 text-[var(--color-muted-ink)]">
          Your orders are safe; this is a temporary problem on our side. Please try again in a moment.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Button onClick={reset}>Try again</Button>
          <Button asChild variant="outline">
            <Link href="../menu">Back to the menu</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
