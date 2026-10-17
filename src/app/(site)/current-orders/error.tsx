"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

/** My Orders could not be loaded: say so and offer a retry (the order itself is not affected). */
export default function CurrentOrdersError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error.message);
  }, [error]);

  return (
    <div className="container-page py-16">
      <div role="alert" className="mx-auto max-w-lg surface-flat p-8 text-center">
        <span className="mx-auto grid size-12 place-items-center rounded-full bg-[color-mix(in_srgb,var(--color-warning)_15%,transparent)] text-[color-mix(in_srgb,var(--color-warning)_80%,var(--color-ink))]">
          <AlertTriangle className="size-6" aria-hidden />
        </span>
        <h1 className="mt-5 text-2xl font-semibold">We could not load your current orders</h1>
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
